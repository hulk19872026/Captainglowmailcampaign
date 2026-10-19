import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { env } from './lib/env';
import { log } from './lib/log';
import { migrate, pingDb, dbStatus, one, isReady } from './lib/db';
import { ensureAdmin, requireAuth } from './lib/auth';
import { errorHandler } from './lib/http';
import { seedStarterTemplates } from './email/starters';
import { recoverStuck, startScheduler, schedulerHealthy } from './services/engine';
import { startSyncJob } from './services/sync';
import publicRoutes from './routes/public';
import authRoutes from './routes/auth';
import customerRoutes from './routes/customers';
import groupRoutes from './routes/groups';
import templateRoutes from './routes/templates';
import campaignRoutes from './routes/campaigns';
import { dashboard, schedule } from './routes/dashboard';
import analyticsRoutes from './routes/analytics';
import leadRoutes from './routes/leads';
import integrationRoutes from './routes/integrations';
import { settingsRouter, uploadsRouter, notificationsRouter, uploadDir } from './routes/settings';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Health check for Railway: database state, deployed commit and account count.
app.get('/healthz', async (_req, res) => {
  const ok = await pingDb();
  let accounts: number | null = null;
  if (ok) {
    try { accounts = (await one<{ c: number }>('SELECT count(*)::int AS c FROM users'))?.c ?? 0; } catch { accounts = null; }
  }
  const db = dbStatus();
  res.status(200).json({
    status: ok && db.migrated ? 'ok' : 'degraded',
    database: ok ? (db.migrated ? 'ok' : 'migrating') : 'down',
    databaseError: ok ? undefined : db.lastError || 'not connected',
    scheduler: schedulerHealthy() ? 'ok' : 'stopped',
    commit: env.gitCommit,
    accounts,
    time: new Date().toISOString(),
  });
});

// Public routes (webhooks need the raw body, so they come before the JSON parser).
app.use(publicRoutes);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Uploaded images (logo, flyers) are public so they show in emails.
app.use('/uploads', express.static(uploadDirSafe(), { maxAge: '30d', fallthrough: false }));

app.use('/api/auth', authRoutes);
app.use('/api', (req, res, next) => {
  if (!isReady() && req.path !== '/health') {
    return res.status(503).json({ error: 'The database is not reachable right now, so this page can\'t load. It usually comes back on its own within a minute.', database: 'down' });
  }
  next();
});
app.use('/api', requireAuth);
app.use('/api/dashboard', dashboard);
app.use('/api/schedule', schedule);
app.use('/api/customers', customerRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/settings', settingsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// The built website.
const webDir = [path.join(__dirname, '..', '..', 'frontend', 'dist'), path.join(process.cwd(), 'frontend', 'dist')].find((d) => fs.existsSync(d));
if (webDir) {
  app.use(express.static(webDir, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Marketing Center API is running. Build the frontend with "npm run build" to see the website.'));
}

app.use(errorHandler);

function uploadDirSafe() {
  try { return uploadDir(); } catch (e) {
    log.error('boot', `Could not create the upload folder ${env.uploadDir}`, e);
    return path.resolve(env.uploadDir);
  }
}

/** Boot: connect → migrate → owner account → starter templates → recover → start jobs. Retries if the database is down. */
async function boot(attempt = 1) {
  try {
    await migrate();
    await ensureAdmin();
    await seedStarterTemplates();
    await recoverStuck();
    log.info('boot', 'Database ready');
    startScheduler();
    startSyncJob();
  } catch (e: any) {
    const wait = Math.min(60, 5 * attempt);
    log.error('boot', `Database not ready (${e?.message || e}). Trying again in ${wait}s. The website stays up meanwhile.`);
    setTimeout(() => boot(attempt + 1), wait * 1000);
  }
}

process.on('unhandledRejection', (e) => log.error('process', 'Unhandled rejection', e));
process.on('uncaughtException', (e) => log.error('process', 'Uncaught exception', e));

app.listen(env.port, () => {
  log.info('boot', `Marketing Center listening on port ${env.port} (commit ${env.gitCommit})`);
  if (!env.databaseUrl) log.error('boot', 'DATABASE_URL is not set. Add a PostgreSQL database in Railway.');
  boot();
});
