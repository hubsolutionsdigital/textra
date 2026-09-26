import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SMTPServer } from 'smtp-server';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-mail-test-'));
process.env.DATA_DIR = dir;
const { openDb } = await import('./db.js');
const { createApp } = await import('./app.js');
const { createMailer, smtpOptions } = await import('./mailer.js');

// A local SMTP server standing in for Zoho/Gmail: accepts one account, records messages.
const received = [];
const smtp = new SMTPServer({
  secure: false,
  authOptional: false,
  allowInsecureAuth: true,
  disabledCommands: ['STARTTLS'],
  onAuth(auth, session, cb) {
    if (auth.username === 'studio@example.com' && auth.password === 'app-pass') return cb(null, { user: auth.username });
    cb(Object.assign(new Error('535 Authentication failed'), { responseCode: 535 }));
  },
  onData(stream, session, cb) {
    let raw = '';
    stream.on('data', (d) => (raw += d));
    stream.on('end', () => {
      received.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address), raw });
      cb();
    });
  },
});

let server;
let base;
let smtpPort;
let cookie = '';

before(async () => {
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  smtpPort = smtp.server.address().port;
  const app = createApp(openDb(path.join(dir, 'test.db')), { mailer: createMailer({}) });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  smtp.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function api(method, url, body, { agency = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (agency && cookie) headers.cookie = cookie;
  const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('Zoho and Gmail presets resolve to the right SMTP servers', () => {
  assert.deepEqual(smtpOptions({ provider: 'gmail' }), { host: 'smtp.gmail.com', port: 465, secure: true });
  assert.equal(smtpOptions({ provider: 'zoho', region: 'com', zoho_account: 'business' }).host, 'smtppro.zoho.com');
  assert.equal(smtpOptions({ provider: 'zoho', region: 'in', zoho_account: 'business' }).host, 'smtppro.zoho.in');
  assert.equal(smtpOptions({ provider: 'zoho', region: 'eu', zoho_account: 'personal' }).host, 'smtp.zoho.eu');
  assert.equal(smtpOptions({ provider: 'zoho', region: 'ca', zoho_account: 'business' }).host, 'smtppro.zohocloud.ca');
});

test('agency saves an email account, gets a test email, and round emails go out from it', async () => {
  await api('POST', '/api/auth/register', { email: 'owner@studio.test', name: 'Studio', password: 'password1' });
  const form = { provider: 'smtp', host: '127.0.0.1', port: smtpPort, username: 'studio@example.com', from_name: 'Pixel Studio' };

  let r = await api('PUT', '/api/mail-settings', { ...form, password: 'wrong' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /rejected the username or password/);

  r = await api('PUT', '/api/mail-settings', { ...form, password: 'app-pass' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.settings.username, 'studio@example.com');
  assert.equal(r.data.settings.password, undefined, 'password never returned');
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].to, ['owner@studio.test']);

  // Saving again with a blank password keeps the stored one.
  r = await api('PUT', '/api/mail-settings', { ...form, from_name: 'Pixel', password: '' });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const stored = fs.readFileSync(path.join(dir, 'test.db')).toString('latin1');
  assert.ok(!stored.includes('app-pass'), 'password is encrypted at rest');

  r = await api('POST', '/api/projects', { name: 'Acme', notify_emails: 'pm@studio.test' });
  const project = r.data.project;
  const fd = new FormData();
  fd.append('title', 'Home');
  fd.append('file', new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }), 'home.pdf');
  r = await fetch(`${base}/api/projects/${project.id}/screens`, { method: 'POST', headers: { cookie }, body: fd });
  const screen = (await r.json()).screens[0];
  const token = project.share_token;
  await api('POST', `/api/share/${token}/screens/${screen.id}/reviewed`, { author_name: 'Jane' }, { agency: false });
  await api('POST', `/api/share/${token}/submit`, { author_name: 'Jane' }, { agency: false });

  for (let i = 0; i < 50 && received.length < 3; i++) await new Promise((res) => setTimeout(res, 50));
  const roundMail = received.at(-1);
  assert.equal(roundMail.from, 'studio@example.com');
  assert.deepEqual(roundMail.to, ['pm@studio.test']);
  assert.match(roundMail.raw, /submitted round 1/);

  r = await api('GET', `/api/projects/${project.id}`);
  assert.ok(r.data.events.some((e) => e.type === 'email_sent' && e.message.includes('from studio@example.com')));
});
