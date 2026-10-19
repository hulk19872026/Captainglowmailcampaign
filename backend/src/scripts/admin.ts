// Account recovery from the command line:
//   npm run admin -- list
//   npm run admin -- set-password <email> <new password>
import { many, one, query, migrate, getPool } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { normalizeEmail } from '../lib/util';

async function main() {
  const [cmd, emailArg, pw] = process.argv.slice(2);
  await migrate();
  if (cmd === 'list') {
    const users = await many('SELECT id, email, created_at, last_login_at FROM users ORDER BY id');
    if (!users.length) console.log('No accounts yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart the app.');
    for (const u of users) console.log(`#${u.id}  ${u.email}  created ${u.created_at.toISOString()}  last sign-in ${u.last_login_at ? u.last_login_at.toISOString() : 'never'}`);
  } else if (cmd === 'set-password') {
    const email = normalizeEmail(emailArg);
    if (!email || !pw) throw new Error('Usage: npm run admin -- set-password <email> <new password>');
    if (pw.length < 10) throw new Error('Please use at least 10 characters.');
    const hash = await hashPassword(pw);
    const existing = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      await query('UPDATE users SET password_hash = $2 WHERE id = $1', [existing.id, hash]);
      console.log(`Password updated for ${email}.`);
    } else {
      await query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [email, hash, 'Owner']);
      console.log(`Created a new account for ${email}.`);
    }
    await query(`INSERT INTO audit_logs (user_email, action) VALUES ($1, 'auth.password_set_from_cli')`, [email]);
  } else {
    console.log('Commands:\n  list\n  set-password <email> <new password>');
  }
  await getPool().end();
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
