// Resets an agency account password from the command line.
//   npm run reset-password -- you@studio.com            (generates a new password)
//   npm run reset-password -- you@studio.com NewPass123 (sets this password)
import crypto from 'node:crypto';
import { openDb } from './db.js';
import { hashPassword } from './app.js';

const [emailArg, passwordArg] = process.argv.slice(2);
const db = openDb();
const users = db.prepare('SELECT id, email, name FROM users ORDER BY id').all();

const listAccounts = () => {
  if (!users.length) {
    console.log('There are no accounts yet. Open the portal and click "Create an account".');
  } else {
    console.log('Accounts on this portal:');
    for (const u of users) console.log(`  ${u.email}  (${u.name})`);
  }
};

if (!emailArg) {
  console.log('Usage: npm run reset-password -- you@studio.com [new-password]\n');
  listAccounts();
  process.exit(1);
}

const user = users.find((u) => u.email.toLowerCase() === emailArg.trim().toLowerCase());
if (!user) {
  console.log(`No account found for ${emailArg}.\n`);
  listAccounts();
  process.exit(1);
}

const password = passwordArg ?? crypto.randomBytes(9).toString('base64url');
if (password.length < 8) {
  console.log('The password must be at least 8 characters.');
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // sign out everywhere
console.log(`Password reset for ${user.email}.`);
if (!passwordArg) console.log(`New password: ${password}`);
console.log('You can sign in now and use the new password.');
