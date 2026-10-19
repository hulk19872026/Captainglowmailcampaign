import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { ah, bad } from '../lib/http';
import { many } from '../lib/db';
import { env } from '../lib/env';
import { audit } from '../lib/audit';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/settings';
import { randomToken } from '../lib/util';

export const settingsRouter = Router();
export const uploadsRouter = Router();
export const notificationsRouter = Router();

settingsRouter.get('/', ah(async (_req, res) => {
  res.json({ settings: await getSettings(true), env: { appUrl: env.appUrl, waveConnected: !!env.waveToken } });
}));

settingsRouter.put('/', ah(async (req, res) => {
  const patch: any = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  const before = await getSettings(true);
  const saved = await saveSettings(patch);
  const changed = Object.keys(patch).filter((k) => JSON.stringify((before as any)[k]) !== JSON.stringify((saved as any)[k]));
  // Tell the owner when we had to adjust a value to keep it safe.
  const adjusted = Object.keys(patch).filter((k) => typeof patch[k] !== 'object' && String(patch[k]) !== String((saved as any)[k]));
  if (changed.length) await audit(req.user!.email, 'settings.updated', { changed });
  res.json({ settings: saved, adjusted });
}));

settingsRouter.get('/activity', ah(async (req, res) => {
  const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 100));
  res.json({ logs: await many('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]) });
}));

// ---------- uploads (logo, images, flyers) ----------

export function uploadDir() {
  const dir = path.resolve(env.uploadDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const ALLOWED = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' } as Record<string, string>;
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try { cb(null, uploadDir()); } catch (e: any) { cb(e, ''); }
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomToken(6)}${ALLOWED[file.mimetype] || '.bin'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, !!ALLOWED[file.mimetype]),
});

uploadsRouter.post('/', upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw bad('Please choose a PNG, JPG, GIF or WebP image (up to 10 MB).');
  const url = `${env.appUrl}/uploads/${req.file.filename}`;
  await audit(req.user!.email, 'upload', { file: req.file.filename, purpose: req.body?.purpose || 'image' });
  if (req.body?.purpose === 'logo') {
    await saveSettings({ logo_url: url });
  }
  res.json({ url, settings: req.body?.purpose === 'logo' ? await getSettings(true) : undefined });
}));

// ---------- notifications ----------

notificationsRouter.get('/', ah(async (_req, res) => {
  res.json({
    notifications: await many('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50'),
    unread: (await many('SELECT count(*)::int AS c FROM notifications WHERE read_at IS NULL'))[0]?.c ?? 0,
  });
}));

notificationsRouter.post('/read-all', ah(async (_req, res) => {
  await many('UPDATE notifications SET read_at = now() WHERE read_at IS NULL RETURNING id');
  res.json({ ok: true });
}));
