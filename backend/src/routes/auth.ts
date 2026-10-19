import { Router } from 'express';
import { ah, bad } from '../lib/http';
import { one, query } from '../lib/db';
import { log } from '../lib/log';
import { audit } from '../lib/audit';
import { normalizeEmail } from '../lib/util';
import {
  checkPassword, hashPassword, setSessionCookie, clearSessionCookie, readSession, requireAuth,
  tooManyAttempts, recordFailure, clearFailures,
} from '../lib/auth';

const r = Router();
const VAGUE = 'That email and password combination didn\'t work. Please try again.';

r.post('/login', ah(async (req, res) => {
  const email = normalizeEmail(req.body?.email) || '';
  const password = String(req.body?.password || '');
  const key = `${req.ip}|${email}`;
  if (tooManyAttempts(key)) {
    log.warn('auth', `Login blocked for ${email} from ${req.ip}: too many failed attempts`);
    return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });
  }
  if (!email || !password) {
    log.warn('auth', `Failed login from ${req.ip}: email or password left blank`);
    return res.status(401).json({ error: VAGUE });
  }
  const user = await one<{ id: number; email: string; password_hash: string }>('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
  if (!user) {
    recordFailure(key);
    log.warn('auth', `Failed login for ${email} from ${req.ip}: no account with that email`);
    return res.status(401).json({ error: VAGUE });
  }
  if (!(await checkPassword(password, user.password_hash))) {
    recordFailure(key);
    log.warn('auth', `Failed login for ${email} from ${req.ip}: wrong password`);
    return res.status(401).json({ error: VAGUE });
  }
  clearFailures(key);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  setSessionCookie(res, { id: user.id, email: user.email });
  await audit(user.email, 'auth.login', { ip: req.ip });
  res.json({ user: { id: user.id, email: user.email } });
}));

r.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

r.get('/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user });
});

r.post('/change-password', requireAuth, ah(async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 10) throw bad('Please choose a new password with at least 10 characters.');
  const user = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!user || !(await checkPassword(current, user.password_hash))) throw bad('Your current password isn\'t right.');
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user!.id, await hashPassword(next)]);
  await audit(req.user!.email, 'auth.password_changed');
  res.json({ ok: true });
}));

export default r;
