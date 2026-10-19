import { one, many, query, withClient, isReady } from '../lib/db';
import { log } from '../lib/log';
import { getSettings, localNow } from '../lib/settings';
import { notify, audit } from '../lib/audit';
import { phoneLast10 } from '../lib/util';
import { fetchWaveCustomers, waveConfigured } from './wave';

const SYNC_LOCK = 727003;
const MAX_FAILURES_PER_DAY = 3;
let timer: NodeJS.Timeout | null = null;
let lastCheckAt: string | null = null;

export interface SyncResult { ok: boolean; created: number; updated: number; skipped: number; message: string }

/** Pulls customers from Wave. Matching is on the Wave ID, so it never creates duplicates. */
export async function runSync(trigger: 'nightly' | 'manual', userEmail: string | null = null): Promise<SyncResult> {
  if (!waveConfigured()) return { ok: false, created: 0, updated: 0, skipped: 0, message: 'Wave is not connected (WAVE_API_TOKEN is not set).' };
  const settings = await getSettings(true);
  if (!settings.wave_business_id) return { ok: false, created: 0, updated: 0, skipped: 0, message: 'Choose your Wave business in Settings first.' };

  return withClient(async (lockClient) => {
    const got = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [SYNC_LOCK]);
    if (!got.rows[0].ok) return { ok: false, created: 0, updated: 0, skipped: 0, message: 'A sync is already running. Try again in a minute.' };
    const { today } = localNow(settings.timezone);
    const run = await one<{ id: number }>(
      `INSERT INTO sync_runs (source, trigger, status, local_day) VALUES ('wave', $1, 'running', $2) RETURNING id`,
      [trigger, today],
    );
    let created = 0, updated = 0, skipped = 0;
    try {
      const { customers, skipped: sk } = await fetchWaveCustomers(settings.wave_business_id);
      skipped = sk;
      for (const c of customers) {
        const p10 = phoneLast10(c.phone);
        const byId = await one<{ id: number }>('SELECT id FROM customers WHERE external_id = $1', [c.waveId]);
        if (byId) {
          // Another customer may already own this email; leave the email alone in that case.
          const clash = await one('SELECT 1 FROM customers WHERE email = $1 AND id <> $2', [c.email, byId.id]);
          await query(
            `UPDATE customers SET first_name = $2, last_name = $3, company_name = $4, phone = COALESCE($5, phone),
               phone_last10 = COALESCE($6, phone_last10), address_line = COALESCE($7, address_line), city = COALESCE($8, city),
               state = COALESCE($9, state), postal_code = COALESCE($10, postal_code),
               email = CASE WHEN $11 THEN email ELSE $12 END, updated_at = now()
             WHERE id = $1`,
            [byId.id, c.first_name, c.last_name, c.company_name, c.phone, p10, c.address_line, c.city, c.state, c.postal_code, !!clash, c.email],
          );
          updated++;
          continue;
        }
        const byEmail = await one<{ id: number; external_id: string | null }>('SELECT id, external_id FROM customers WHERE email = $1', [c.email]);
        if (byEmail) {
          if (byEmail.external_id && byEmail.external_id !== c.waveId) { skipped++; continue; }
          await query(
            `UPDATE customers SET external_id = $2, source = CASE WHEN source = 'manual' THEN source ELSE 'wave' END,
               first_name = COALESCE($3, first_name), last_name = COALESCE($4, last_name), company_name = COALESCE($5, company_name),
               phone = COALESCE($6, phone), phone_last10 = COALESCE($7, phone_last10), updated_at = now() WHERE id = $1`,
            [byEmail.id, c.waveId, c.first_name, c.last_name, c.company_name, c.phone, p10],
          );
          updated++;
          continue;
        }
        await query(
          `INSERT INTO customers (external_id, source, first_name, last_name, company_name, email, phone, phone_last10, address_line, city, state, postal_code)
           VALUES ($1, 'wave', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [c.waveId, c.first_name, c.last_name, c.company_name, c.email, c.phone, p10, c.address_line, c.city, c.state, c.postal_code],
        );
        created++;
      }
      await query(`UPDATE sync_runs SET status = 'success', created = $2, updated = $3, skipped = $4, finished_at = now() WHERE id = $1`, [run!.id, created, updated, skipped]);
      const message = `Sync finished: ${created} new, ${updated} updated, ${skipped} skipped (no valid email or archived).`;
      log.info('sync', message);
      if (trigger === 'manual') await audit(userEmail, 'customers.sync', { created, updated, skipped });
      if (created > 0) await notify('info', `${created} new customer${created === 1 ? '' : 's'} from Wave`, message, '/customers');
      return { ok: true, created, updated, skipped, message };
    } catch (e: any) {
      const msg = e?.message || String(e);
      await query(`UPDATE sync_runs SET status = 'failed', error = $2, created = $3, updated = $4, finished_at = now() WHERE id = $1`, [run!.id, msg, created, updated]).catch(() => {});
      log.error('sync', 'Customer sync failed', msg);
      return { ok: false, created, updated, skipped, message: `Sync failed: ${msg}` };
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK]).catch(() => {});
    }
  });
}

/** Every 15 minutes: past the sync hour, nothing succeeded today, fewer than 3 failures → sync. */
export async function nightlyCheck() {
  lastCheckAt = new Date().toISOString();
  if (!waveConfigured() || !isReady()) return;
  const settings = await getSettings(true);
  if (!settings.nightly_sync_enabled || !settings.wave_business_id) return;
  const { now, today } = localNow(settings.timezone);
  if (now.hour < settings.nightly_sync_hour) return;
  const stats = await one<{ ok: number; failed: number }>(
    `SELECT count(*) FILTER (WHERE status = 'success')::int AS ok, count(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM sync_runs WHERE local_day = $1`,
    [today],
  );
  if ((stats?.ok ?? 0) > 0) return;
  if ((stats?.failed ?? 0) >= MAX_FAILURES_PER_DAY) return; // wait until tomorrow
  const r = await runSync('nightly');
  if (!r.ok && (stats?.failed ?? 0) + 1 >= MAX_FAILURES_PER_DAY) {
    await notify('error', 'Customer sync failed 3 times today', `${r.message} It will try again tomorrow.`, '/integrations');
  }
}

export function startSyncJob() {
  if (timer) return;
  if (!waveConfigured()) {
    log.info('sync', 'Wave is not connected, so the nightly customer sync is off (CSV import still works).');
  }
  const tick = () => nightlyCheck().catch((e) => log.error('sync', 'Nightly check failed', e));
  setTimeout(tick, 30_000);
  timer = setInterval(tick, 15 * 60 * 1000);
}

export async function syncStatus() {
  const settings = await getSettings();
  const last = await one(`SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1`);
  const lastOk = await one(`SELECT * FROM sync_runs WHERE status = 'success' ORDER BY started_at DESC LIMIT 1`);
  const recent = await many(`SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 10`);
  const { now, today } = localNow(settings.timezone);
  const doneToday = !!lastOk && (lastOk as any).local_day === today;
  const todayAt = now.set({ hour: settings.nightly_sync_hour, minute: 0, second: 0, millisecond: 0 });
  const next = doneToday ? todayAt.plus({ days: 1 }) : todayAt > now ? todayAt : now.plus({ minutes: 15 });
  return {
    configured: waveConfigured(),
    enabled: settings.nightly_sync_enabled,
    businessId: settings.wave_business_id,
    last,
    lastSuccess: lastOk,
    recent,
    nextRunAt: waveConfigured() && settings.nightly_sync_enabled ? next.toISO() : null,
    lastCheckAt,
  };
}
