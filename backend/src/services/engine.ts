// The sending engine. Wakes every 5 minutes, respects the daily limit, claims
// small batches with FOR UPDATE SKIP LOCKED, and never sends to the same person
// twice for the same pass (enforced by a unique index in the database).
import type { PoolClient } from 'pg';
import { query, one, many, tx, withClient, isReady } from '../lib/db';
import { env } from '../lib/env';
import { log } from '../lib/log';
import { getSettings, localNow, isPastSendTime, Settings } from '../lib/settings';
import { notify } from '../lib/audit';
import { signLink } from '../lib/sign';
import { toE164 } from '../lib/util';
import { normalizeRecurrence, nextAfter } from '../lib/recurrence';
import { renderEmail, finalizeSms, MergeVars } from '../email/render';
import { sanitizeBlocks } from '../email/blocks';
import { sendEmail } from './resend';
import { sendSms } from './twilio';
import { SendError } from './providerError';
import { queueAudience, sanitizeAudience } from './customers';

const SEND_LOCK = 727002;
const MAX_ATTEMPTS = 3;
const TICK_MS = 5 * 60 * 1000;

type Channel = 'email' | 'sms';

export const engineState = {
  running: false,
  startedAt: null as string | null,
  lastTickAt: null as string | null,
  lastTickResult: '' as string,
  lastSentAt: null as string | null,
  lastError: '' as string,
};

let timer: NodeJS.Timeout | null = null;
const configWarnedOn = new Set<string>();

// ---------- counters ----------

export async function sentToday(day: string, channel: Channel): Promise<number> {
  const r = await one<{ count: number }>('SELECT count FROM daily_send_counts WHERE day = $1 AND channel = $2', [day, channel]);
  return r?.count ?? 0;
}

async function bumpCounter(c: PoolClient | null, day: string, channel: Channel) {
  const sql = `INSERT INTO daily_send_counts (day, channel, count) VALUES ($1, $2, 1)
               ON CONFLICT (day, channel) DO UPDATE SET count = daily_send_counts.count + 1`;
  if (c) await c.query(sql, [day, channel]);
  else await query(sql, [day, channel]);
}

// ---------- links ----------

export function trackedLinks(token: string) {
  const app = env.appUrl;
  return {
    unsubscribeUrl: `${app}/u/${token}`,
    openPixelUrl: `${app}/t/open/${token}.gif`,
    track: (url: string, leadLabel?: string) => {
      const l = leadLabel || '';
      const q = new URLSearchParams({ u: url });
      if (l) q.set('l', l);
      q.set('s', signLink(token, url, l));
      return `${app}/t/click/${token}?${q.toString()}`;
    },
  };
}

function fromHeader(name: string, email: string) {
  const safe = name.replace(/["<>]/g, '').trim();
  return safe ? `"${safe}" <${email}>` : email;
}

function varsFromCustomer(c: any): MergeVars {
  return { first_name: c.first_name, last_name: c.last_name, email: c.email, city: c.city, customer_company: c.company_name, phone: c.phone };
}

// ---------- boot recovery ----------

/** Anything stuck in "sending" after a restart goes back in the queue. Sent rows are never touched. */
export async function recoverStuck(): Promise<number> {
  const r = await query(
    `UPDATE campaign_recipients SET status = 'queued', attempts = GREATEST(attempts - 1, 0) WHERE status = 'sending'`,
  );
  if (r.rowCount) log.warn('engine', `Put ${r.rowCount} interrupted send(s) back in the queue`);
  return r.rowCount ?? 0;
}

// ---------- preparing campaigns for today ----------

/** On each sending day, rebuild the audience for the current pass (adds new matches, skips people who no longer qualify). */
async function prepareCampaigns(today: string) {
  const due = await many(
    `SELECT * FROM campaigns WHERE status = 'active' AND next_run_date IS NOT NULL AND next_run_date <= $1
       AND (audience_built_on IS NULL OR audience_built_on < $1) ORDER BY created_at, id`,
    [today],
  );
  for (const c of due) {
    await tx(async (client) => {
      const added = await queueAudience(client, c.id, c.current_occurrence, sanitizeAudience(c.audience), c.channel);
      await client.query('UPDATE campaigns SET audience_built_on = $2, updated_at = now() WHERE id = $1', [c.id, today]);
      log.info('engine', `Campaign #${c.id} pass ${c.current_occurrence}: queued ${added} new recipient(s)`);
    });
  }
}

/** Completes campaigns (or moves repeating ones to their next sending day) once nothing is left queued. */
async function finalizeCampaigns(today: string) {
  const done = await many(
    `SELECT c.* FROM campaigns c
     WHERE c.status = 'active' AND c.next_run_date <= $1 AND c.audience_built_on = $1
       AND NOT EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = c.id
                       AND r.occurrence = c.current_occurrence AND r.status IN ('queued', 'sending'))`,
    [today],
  );
  for (const c of done) {
    const stats = await one<{ sent: number; failed: number }>(
      `SELECT count(*) FILTER (WHERE status = 'sent')::int AS sent, count(*) FILTER (WHERE status IN ('failed','bounced'))::int AS failed
       FROM campaign_recipients WHERE campaign_id = $1 AND occurrence = $2`,
      [c.id, c.current_occurrence],
    );
    const rule = normalizeRecurrence(c.recurrence, today);
    const from = c.next_run_date > today ? c.next_run_date : today;
    const next = rule.type === 'once' ? null : nextAfter(rule, from);
    const unit = c.channel === 'sms' ? 'text' : 'email';
    const summary = `${stats?.sent ?? 0} ${unit}${stats?.sent === 1 ? '' : 's'} sent${stats?.failed ? `, ${stats.failed} failed` : ''}.`;
    if (next) {
      await query(
        `UPDATE campaigns SET current_occurrence = $2, next_run_date = $3, audience_built_on = NULL,
           occurrences_done = occurrences_done + 1, updated_at = now() WHERE id = $1 AND status = 'active'`,
        [c.id, next.index, next.date],
      );
      await notify('success', `"${c.name}" pass ${c.current_occurrence} finished`, `${summary} Next send: ${next.date}.`, `/campaigns/${c.id}`);
    } else {
      await query(
        `UPDATE campaigns SET status = 'completed', completed_at = now(), occurrences_done = occurrences_done + 1, updated_at = now()
         WHERE id = $1 AND status = 'active'`,
        [c.id],
      );
      await notify('success', `Campaign "${c.name}" is complete`, summary, `/campaigns/${c.id}`);
    }
  }
}

// ---------- claiming ----------

async function claimBatch(channel: Channel, today: string, size: number) {
  if (size <= 0) return [];
  return tx(async (client) => {
    const r = await client.query(
      `WITH picked AS (
         SELECT r.id FROM campaign_recipients r
         JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.status = 'active' AND c.channel = $1 AND c.next_run_date <= $2
           AND r.occurrence = c.current_occurrence AND r.status = 'queued'
           AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= now())
         ORDER BY c.created_at, c.id, r.id
         LIMIT $3
         FOR UPDATE OF r SKIP LOCKED
       )
       UPDATE campaign_recipients r SET status = 'sending', attempts = r.attempts + 1
       FROM picked WHERE r.id = picked.id
       RETURNING r.*`,
      [channel, today, size],
    );
    return r.rows.sort((a, b) => Number(a.id) - Number(b.id));
  });
}

// ---------- sending one person ----------

type Outcome = 'sent' | 'skipped' | 'failed' | 'retry' | 'config';

async function markFailed(r: any, err: SendError | Error, kind: 'rejected' | 'retry') {
  const msg = err.message.slice(0, 500);
  if (kind === 'retry' && r.attempts < MAX_ATTEMPTS) {
    const waitMin = 2 ** r.attempts; // 2, 4 minutes
    await query(
      `UPDATE campaign_recipients SET status = 'queued', last_error = $2, next_attempt_at = now() + ($3 || ' minutes')::interval WHERE id = $1`,
      [r.id, msg, String(waitMin)],
    );
    return;
  }
  await query(`UPDATE campaign_recipients SET status = 'failed', last_error = $2 WHERE id = $1`, [r.id, msg]);
  await query(
    `INSERT INTO email_events (campaign_id, recipient_id, customer_id, channel, type, meta) VALUES ($1, $2, $3, $4, 'failed', $5)`,
    [r.campaign_id, r.id, r.customer_id, r.channel, JSON.stringify({ error: msg, attempts: r.attempts })],
  );
}

async function skip(r: any, reason: string) {
  await query(`UPDATE campaign_recipients SET status = 'skipped', last_error = $2 WHERE id = $1`, [r.id, reason]);
}

async function sendOne(r: any, campaign: any, settings: Settings, today: string): Promise<Outcome> {
  const customer = await one('SELECT * FROM customers WHERE id = $1', [r.customer_id]);
  if (!customer) { await skip(r, 'Customer was deleted'); return 'skipped'; }
  const vars = varsFromCustomer(customer);

  try {
    let providerId: string;
    if (r.channel === 'sms') {
      // Consent is checked again right before the text goes out.
      const blocked = await one('SELECT 1 FROM sms_suppression_list WHERE phone_last10 = $1', [customer.phone_last10]);
      if (customer.disabled || !customer.sms_consent || !customer.phone_last10 || blocked) {
        await skip(r, 'No texting consent (or opted out)');
        return 'skipped';
      }
      const to = toE164(customer.phone);
      if (!to) { await markFailed(r, new Error('Phone number is not a valid mobile number'), 'rejected'); return 'failed'; }
      const res = await sendSms(to, finalizeSms(campaign.sms_body, vars, settings));
      providerId = res.id;
    } else {
      const suppressed = customer.email ? await one('SELECT 1 FROM suppression_list WHERE email = $1', [customer.email]) : null;
      if (customer.disabled || customer.unsubscribed || !customer.email || suppressed) {
        await skip(r, customer.unsubscribed ? 'Unsubscribed' : suppressed ? 'On the suppression list' : 'Customer disabled or no email');
        return 'skipped';
      }
      const links = trackedLinks(r.token);
      const { html, text, subject } = renderEmail({
        subject: campaign.subject,
        preheader: campaign.preheader,
        blocks: sanitizeBlocks(campaign.blocks),
        settings,
        vars,
        links,
        appUrl: env.appUrl,
      });
      const replyTo = campaign.reply_to || settings.reply_to;
      const res = await sendEmail({
        from: fromHeader(campaign.from_name || settings.from_name, campaign.from_email || settings.from_email),
        to: customer.email,
        replyTo,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${links.unsubscribeUrl}>` + (replyTo ? `, <mailto:${replyTo}?subject=unsubscribe>` : ''),
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [{ name: 'campaign', value: String(campaign.id) }],
      });
      providerId = res.id;
    }

    await tx(async (c) => {
      await c.query(`UPDATE campaign_recipients SET status = 'sent', sent_at = now(), provider_id = $2, last_error = NULL WHERE id = $1`, [r.id, providerId]);
      await c.query(
        `INSERT INTO email_events (campaign_id, recipient_id, customer_id, channel, type, meta) VALUES ($1, $2, $3, $4, 'sent', $5)`,
        [r.campaign_id, r.id, r.customer_id, r.channel, JSON.stringify({ provider_id: providerId, occurrence: r.occurrence })],
      );
      await bumpCounter(c, today, r.channel);
      if (r.channel === 'email') await c.query('UPDATE customers SET last_emailed_at = now() WHERE id = $1', [r.customer_id]);
    });
    engineState.lastSentAt = new Date().toISOString();
    return 'sent';
  } catch (e: any) {
    if (e instanceof SendError) {
      if (e.kind === 'config') {
        // Our own setup problem: put the person back exactly as they were and stop.
        await query(`UPDATE campaign_recipients SET status = 'queued', attempts = GREATEST(attempts - 1, 0), last_error = $2 WHERE id = $1`, [r.id, e.message]);
        engineState.lastError = e.message;
        const key = `${today}:${r.channel}`;
        if (!configWarnedOn.has(key)) {
          configWarnedOn.add(key);
          await notify('error', `Sending is paused: ${r.channel === 'sms' ? 'texting' : 'email'} setup problem`, `${e.message} Nobody was skipped; sending picks up again once this is fixed.`, '/integrations');
        }
        log.error('engine', 'Provider setup problem; stopping this channel for now', e.message);
        return 'config';
      }
      await markFailed(r, e, e.kind === 'rejected' ? 'rejected' : 'retry');
      return e.kind === 'rejected' || r.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry';
    }
    log.error('engine', `Unexpected error sending recipient #${r.id}`, e);
    await markFailed(r, e, 'retry');
    return r.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry';
  }
}

// ---------- the tick ----------

export interface TickOptions {
  /** "Send next batch" button: ignores the send time, sends at most one batch per channel. */
  manual?: boolean;
}

export async function tick(opts: TickOptions = {}): Promise<string> {
  if (engineState.running) return 'The sender is already working. Give it a minute.';
  if (!isReady()) return 'The database is not reachable, so nothing was sent.';
  engineState.running = true;
  engineState.lastTickAt = new Date().toISOString();
  try {
    return await withClient(async (lockClient) => {
      const got = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [SEND_LOCK]);
      if (!got.rows[0].ok) return (engineState.lastTickResult = 'Another copy of the app is sending right now.');
      try {
        const settings = await getSettings(true);
        if (!opts.manual && !isPastSendTime(settings)) {
          return (engineState.lastTickResult = `Waiting for today's send time (${settings.send_time}).`);
        }
        const { today } = localNow(settings.timezone);
        await prepareCampaigns(today);

        const summary: string[] = [];
        for (const channel of ['email', 'sms'] as Channel[]) {
          if (channel === 'sms' && !settings.sms_enabled) continue;
          const limit = channel === 'sms' ? settings.sms_daily_limit : settings.daily_limit;
          let remaining = limit - (await sentToday(today, channel));
          let sent = 0, failed = 0, skipped = 0, batches = 0;
          let stop = false;
          while (remaining > 0 && !stop) {
            const batch = await claimBatch(channel, today, Math.min(settings.batch_size, remaining));
            if (!batch.length) break;
            batches++;
            const campaigns = new Map<number, any>();
            for (let i = 0; i < batch.length; i++) {
              const r = batch[i];
              if (stop) {
                // Stopped mid-batch: return the rest untouched.
                await query(`UPDATE campaign_recipients SET status = 'queued', attempts = GREATEST(attempts - 1, 0) WHERE id = $1 AND status = 'sending'`, [r.id]);
                continue;
              }
              let c = campaigns.get(r.campaign_id);
              if (!c) { c = await one('SELECT * FROM campaigns WHERE id = $1', [r.campaign_id]); campaigns.set(r.campaign_id, c); }
              if (!c || c.status !== 'active') {
                await query(`UPDATE campaign_recipients SET status = 'queued', attempts = GREATEST(attempts - 1, 0) WHERE id = $1`, [r.id]);
                continue;
              }
              const outcome = await sendOne(r, c, settings, today);
              if (outcome === 'sent') { sent++; remaining--; }
              else if (outcome === 'failed') failed++;
              else if (outcome === 'skipped') skipped++;
              else if (outcome === 'config') stop = true;
            }
            if (opts.manual || stop || remaining <= 0) break;
            // Wait between batches, then look for more.
            await new Promise((res) => setTimeout(res, settings.batch_delay_seconds * 1000));
          }
          if (batches) summary.push(`${channel === 'sms' ? 'Texts' : 'Emails'}: ${sent} sent, ${failed} failed, ${skipped} skipped`);
          if (remaining <= 0) summary.push(`${channel === 'sms' ? 'Text' : 'Email'} daily limit reached (${limit}); the rest go out tomorrow.`);
        }
        await finalizeCampaigns(today);
        engineState.lastError = '';
        return (engineState.lastTickResult = summary.length ? summary.join(' · ') : 'Nothing waiting to send.');
      } finally {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [SEND_LOCK]).catch(() => {});
      }
    });
  } catch (e: any) {
    engineState.lastError = e?.message || String(e);
    log.error('engine', 'Tick failed', e);
    return (engineState.lastTickResult = `Something went wrong: ${engineState.lastError}`);
  } finally {
    engineState.running = false;
  }
}

export function startScheduler() {
  if (timer) return;
  engineState.startedAt = new Date().toISOString();
  const run = () => { tick().then((m) => log.info('engine', m)).catch(() => {}); };
  setTimeout(run, 20_000);
  timer = setInterval(run, TICK_MS);
  log.info('engine', 'Scheduler started (wakes every 5 minutes)');
}

export function schedulerHealthy(): boolean {
  if (!timer) return false;
  if (!engineState.lastTickAt) return true;
  return Date.now() - new Date(engineState.lastTickAt).getTime() < TICK_MS * 3 || engineState.running;
}

// ---------- test sends ----------

/** Sends a single test email that no customer receives. Counts toward today's limit. */
export async function sendTestEmail(content: { subject: string; preheader?: string; blocks: unknown; from_name?: string; from_email?: string; reply_to?: string }, to: string) {
  const settings = await getSettings(true);
  const sample = await one(`SELECT * FROM customers WHERE email IS NOT NULL AND disabled = false ORDER BY id LIMIT 1`);
  const vars: MergeVars = sample ? varsFromCustomer(sample) : { first_name: 'Alex', last_name: 'Sample', email: to, city: '' };
  const { html, text, subject } = renderEmail({
    subject: content.subject,
    preheader: content.preheader,
    blocks: sanitizeBlocks(content.blocks),
    settings,
    vars,
    links: { unsubscribeUrl: `${env.appUrl}/u/test` },
    appUrl: env.appUrl,
    testBanner: 'TEST EMAIL: no customers received this',
  });
  const res = await sendEmail({
    from: fromHeader(content.from_name || settings.from_name, content.from_email || settings.from_email),
    to,
    replyTo: content.reply_to || settings.reply_to,
    subject: `[TEST] ${subject}`,
    html,
    text,
  });
  await bumpCounter(null, localNow(settings.timezone).today, 'email');
  return res;
}

export async function sendTestSms(body: string, to: string) {
  const settings = await getSettings(true);
  const phone = toE164(to);
  if (!phone) throw new SendError('rejected', 'That phone number doesn\'t look right.');
  const res = await sendSms(phone, '[TEST] ' + finalizeSms(body, { first_name: 'Alex' }, settings));
  await bumpCounter(null, localNow(settings.timezone).today, 'sms');
  return res;
}
