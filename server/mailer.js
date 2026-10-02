import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

/** Zoho data centres. Pick the one matching the address you sign in at (mail.zoho.com, mail.zoho.eu, …). */
export const ZOHO_REGIONS = {
  com: { label: 'United States (zoho.com)', domain: 'zoho.com' },
  eu: { label: 'Europe (zoho.eu)', domain: 'zoho.eu' },
  in: { label: 'India (zoho.in)', domain: 'zoho.in' },
  'com.au': { label: 'Australia (zoho.com.au)', domain: 'zoho.com.au' },
  jp: { label: 'Japan (zoho.jp)', domain: 'zoho.jp' },
  ca: { label: 'Canada (zohocloud.ca)', domain: 'zohocloud.ca' },
  sa: { label: 'Saudi Arabia (zoho.sa)', domain: 'zoho.sa' },
};

/** ZeptoMail (Zoho's transactional email service) API hosts per data centre. */
const ZEPTO_HOSTS = {
  com: 'api.zeptomail.com',
  eu: 'api.zeptomail.eu',
  in: 'api.zeptomail.in',
  'com.au': 'api.zeptomail.com.au',
  jp: 'api.zeptomail.jp',
  ca: 'api.zeptomail.ca',
  sa: 'api.zeptomail.sa',
};

/** Providers that send over HTTPS (port 443) instead of SMTP. Hosts like Railway block SMTP on lower plans. */
export const API_PROVIDERS = ['zeptomail', 'resend'];

const splitRecipients = (to) =>
  String(to)
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

class MailApiError extends Error {
  constructor(provider, status, message) {
    super(message);
    this.code = 'EAPI';
    this.provider = provider;
    this.status = status;
  }
}

async function postJson(provider, url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      data?.error?.details?.map((d) => d.message).filter(Boolean).join('; ') || // ZeptoMail
      data?.error?.message ||
      data?.message || // Resend
      `HTTP ${res.status}`;
    throw new MailApiError(provider, res.status, detail);
  }
  return data;
}

/** Sends one message through an HTTPS email API. */
async function sendViaApi(s, message) {
  const from = fromAddress(s);
  const to = splitRecipients(message.to);
  if (s.provider === 'zeptomail') {
    const host = ZEPTO_HOSTS[s.region] ?? ZEPTO_HOSTS.com;
    // ZeptoMail shows the token as "Zoho-enczapikey <token>"; accept it with or without the prefix.
    const token = /^zoho-enczapikey\s/i.test(s.password) ? s.password : `Zoho-enczapikey ${s.password}`;
    return postJson('zeptomail', `https://${host}/v1.1/email`, { Authorization: token }, {
      from: { address: from.address, name: from.name },
      to: to.map((address) => ({ email_address: { address } })),
      subject: message.subject,
      htmlbody: message.html,
      textbody: message.text,
    });
  }
  return postJson('resend', 'https://api.resend.com/emails', { Authorization: `Bearer ${s.password}` }, {
    from: `${from.name} <${from.address}>`,
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

/**
 * Turns saved settings into SMTP options. Zoho uses smtppro.* for accounts on your own
 * domain (you@yourstudio.com) and smtp.* for personal @zoho addresses.
 */
export function smtpOptions(s) {
  if (s.provider === 'zeptomail') return { host: ZEPTO_HOSTS[s.region] ?? ZEPTO_HOSTS.com, port: 443, secure: true };
  if (s.provider === 'resend') return { host: 'api.resend.com', port: 443, secure: true };
  if (s.provider === 'gmail') {
    return { host: 'smtp.gmail.com', port: 465, secure: true };
  }
  if (s.provider === 'zoho') {
    const region = ZOHO_REGIONS[s.region] ?? ZOHO_REGIONS.com;
    const prefix = s.zoho_account === 'personal' ? 'smtp' : 'smtppro';
    return { host: `${prefix}.${region.domain}`, port: 465, secure: true };
  }
  const port = Number(s.port) || 587;
  return { host: s.host, port, secure: s.secure ?? port === 465 };
}

function transportFromSettings(s) {
  return nodemailer.createTransport({
    ...smtpOptions(s),
    auth: { user: s.username, pass: s.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
}

/** Sender used with saved settings. Zoho and Gmail only allow sending as the signed-in account. */
export const fromAddress = (s) => ({ name: s.from_name || 'Design Review Portal', address: s.username });

/**
 * Sends mail with, in order of preference: the agency's saved email settings (Email settings page),
 * server-wide SMTP env vars (SMTP_URL or SMTP_HOST/…), or the outbox folder (DATA_DIR/outbox/*.eml)
 * when nothing is configured, so no email is ever silently lost.
 */
export function createMailer(env = process.env) {
  let envTransport = null;
  if (env.SMTP_URL) envTransport = nodemailer.createTransport(env.SMTP_URL);
  else if (env.SMTP_HOST) {
    const port = Number(env.SMTP_PORT) || 587;
    envTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  const envFrom = env.MAIL_FROM || 'Design Review Portal <no-reply@localhost>';
  const outbox = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });

  return {
    envConfigured: !!envTransport,

    /** @param settings saved per-agency settings with a decrypted `password`, or null */
    async send(message, { settings } = {}) {
      if (settings) {
        if (API_PROVIDERS.includes(settings.provider)) return sendViaApi(settings, message);
        return transportFromSettings(settings).sendMail({ from: fromAddress(settings), ...message });
      }
      if (envTransport) return envTransport.sendMail({ from: envFrom, ...message });
      const info = await outbox.sendMail({ from: envFrom, ...message });
      const dir = path.join(DATA_DIR, 'outbox');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${String(message.to).split(',')[0].replace(/[^\w.@-]/g, '')}.eml`);
      fs.writeFileSync(file, info.message);
      console.log(`[mail] no email account configured, saved email to ${file}`);
      return { ...info, outbox: file };
    },

    /** Connects and logs in without sending, to give a clear error for bad settings. */
    async verify(settings) {
      // Email APIs have no login step; the test email that follows is the check.
      if (API_PROVIDERS.includes(settings.provider)) return;
      await transportFromSettings(settings).verify();
    },
  };
}

// ---------- password encryption at rest ----------

let cachedKey;
function secretKey() {
  if (cachedKey) return cachedKey;
  if (process.env.SECRET_KEY) {
    cachedKey = crypto.createHash('sha256').update(process.env.SECRET_KEY).digest();
    return cachedKey;
  }
  const file = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  return cachedKey;
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(stored) {
  const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Maps common SMTP failures to advice a non-technical person can act on. */
export function explainMailError(err, provider) {
  const msg = String(err?.response || err?.message || err);
  if (err?.code === 'EAPI') {
    const name = err.provider === 'zeptomail' ? 'ZeptoMail' : 'Resend';
    if (err.status === 401 || err.status === 403) {
      return `${name} rejected the key (${msg}). Check you pasted the full ${err.provider === 'zeptomail' ? 'Send Mail token' : 'API key'}, the data centre, and that your domain is verified there.`;
    }
    return `${name} couldn’t send: ${msg}. The “send from” address must be on a domain you’ve verified in ${name}.`;
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return 'The email service didn’t answer in time. Please try again.';
  }
  if (err?.code === 'EAUTH' || /535|534|authentication|username and password/i.test(msg)) {
    if (provider === 'gmail') {
      return 'Gmail rejected the login. Use a 16-character App Password (not your normal password). 2-Step Verification must be on.';
    }
    if (provider === 'zoho') {
      return 'Zoho rejected the login. Check the email and password. If two-factor authentication is on, use an Application-Specific Password. Also check that the data centre and account type match your Zoho account.';
    }
    return 'The mail server rejected the username or password.';
  }
  if (/553|relaying|sender address|not allowed to send/i.test(msg)) {
    return 'The mail server refused the sender address. Send as the same address you log in with.';
  }
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ENOTFOUND', 'ECONNREFUSED'].includes(err?.code)) {
    return `Couldn’t reach the mail server (${err.code}). Your host is probably blocking email ports. Railway does this on Trial and Hobby plans. Choose ZeptoMail (by Zoho) or Resend instead: they send over HTTPS, which is never blocked.`;
  }
  return msg;
}
