import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env, sessionSecret } from './env';
import { one, query } from './db';
import { log } from './log';
import { normalizeEmail } from './util';

export const COOKIE_NAME = 'cg_session';
const SESSION_DAYS = 14;

export interface SessionUser { id: number; email: string }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: SessionUser }
  }
}

export function setSessionCookie(res: Response, user: SessionUser) {
  const token = jwt.sign({ sub: user.id, email: user.email }, sessionSecret(), { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: SESSION_DAYS * 86400 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function readSession(req: Request): SessionUser | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const p = jwt.verify(token, sessionSecret()) as any;
    return { id: Number(p.sub), email: String(p.email) };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.user = user;
  next();
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** On every boot: make sure the owner account exists (and optionally reset its password). */
export async function ensureAdmin() {
  const email = normalizeEmail(env.adminEmail);
  if (!email) {
    log.warn('auth', 'ADMIN_EMAIL is not set, so no owner account was created.');
    return;
  }
  const existing = await one<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
  if (!existing) {
    if (!env.adminPassword) {
      log.warn('auth', `ADMIN_PASSWORD is not set, so the account for ${email} could not be created.`);
      return;
    }
    await query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [email, await hashPassword(env.adminPassword), 'Owner']);
    log.info('auth', `Created owner account ${email}`);
    return;
  }
  if (env.adminPasswordReset) {
    if (!env.adminPassword) {
      log.warn('auth', 'ADMIN_PASSWORD_RESET is true but ADMIN_PASSWORD is empty, so nothing was changed.');
      return;
    }
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [existing.id, await hashPassword(env.adminPassword)]);
    log.warn('auth', `Password for ${email} was reset from ADMIN_PASSWORD. Set ADMIN_PASSWORD_RESET back to false.`);
  }
}

// Simple in-memory brake on password guessing.
const attempts = new Map<string, { count: number; first: number }>();
export function tooManyAttempts(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > 15 * 60 * 1000) { attempts.delete(key); return false; }
  return a.count >= 10;
}
export function recordFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > 15 * 60 * 1000) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
}
export function clearFailures(key: string) { attempts.delete(key); }
