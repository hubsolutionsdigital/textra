import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

/**
 * Sends mail over SMTP when configured (SMTP_URL, or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS).
 * Without SMTP, messages are written to DATA_DIR/outbox as .eml files so nothing is lost
 * and the flow can be tried locally.
 */
export function createMailer(env = process.env) {
  const from = env.MAIL_FROM || 'Design Review Portal <no-reply@localhost>';
  let transport;
  let mode;
  if (env.SMTP_URL) {
    transport = nodemailer.createTransport(env.SMTP_URL);
    mode = 'smtp';
  } else if (env.SMTP_HOST) {
    const port = Number(env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    mode = 'smtp';
  } else {
    transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    mode = 'outbox';
  }

  return {
    mode,
    async send(message) {
      const info = await transport.sendMail({ from, ...message });
      if (mode === 'outbox') {
        const dir = path.join(DATA_DIR, 'outbox');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${Date.now()}-${message.to.split(',')[0].replace(/[^\w.@-]/g, '')}.eml`);
        fs.writeFileSync(file, info.message);
        console.log(`[mail] SMTP not configured, saved email to ${file}`);
      }
      return info;
    },
  };
}
