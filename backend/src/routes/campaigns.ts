import { Router } from 'express';
import { ah, bad, notFound, intParam } from '../lib/http';
import { many, one, query } from '../lib/db';
import { audit } from '../lib/audit';
import { getSettings, localNow, nextSendWindow } from '../lib/settings';
import { isValidEmail, normalizeEmail, phoneLast10 } from '../lib/util';
import { normalizeRecurrence, firstOnOrAfter, describeRecurrence, occurrencesBetween, addDays } from '../lib/recurrence';
import { sanitizeBlocks } from '../email/blocks';
import { sanitizeAudience, countAudience } from '../services/customers';
import { sendTestEmail, sendTestSms, sentToday } from '../services/engine';
import { SendError } from '../services/providerError';

const r = Router();

const STATS = `
  (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id) AS total,
  (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('queued','sending')) AS queued,
  (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'sent') AS sent,
  (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('failed','bounced')) AS failed,
  (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'skipped') AS skipped,
  (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.opened_at IS NOT NULL) AS opened,
  (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.clicked_at IS NOT NULL) AS clicked,
  (SELECT count(*)::int FROM leads l WHERE l.campaign_id = c.id) AS leads`;

function clean(body: any, today: string) {
  const channel = body?.channel === 'sms' ? 'sms' : 'email';
  const name = String(body?.name || '').trim().slice(0, 150);
  if (!name) throw bad('Please give the campaign a name.');
  const testEmail = normalizeEmail(body?.test_email);
  return {
    name,
    channel,
    template_id: Number(body?.template_id) > 0 ? Number(body.template_id) : null,
    subject: String(body?.subject || '').slice(0, 300),
    preheader: String(body?.preheader || '').slice(0, 300),
    blocks: sanitizeBlocks(body?.blocks),
    sms_body: String(body?.sms_body || '').slice(0, 1200),
    audience: sanitizeAudience(body?.audience),
    recurrence: normalizeRecurrence(body?.recurrence, today),
    from_name: String(body?.from_name || '').trim().slice(0, 80) || null,
    from_email: normalizeEmail(body?.from_email),
    reply_to: normalizeEmail(body?.reply_to),
    test_mode: !!body?.test_mode,
    test_email: testEmail,
    test_phone: body?.test_phone ? String(body.test_phone).trim().slice(0, 30) : null,
  };
}

r.get('/', ah(async (_req, res) => {
  res.json({ campaigns: await many(`SELECT c.*, ${STATS} FROM campaigns c ORDER BY c.created_at DESC`) });
}));

r.get('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const c = await one(`SELECT c.*, ${STATS} FROM campaigns c WHERE c.id = $1`, [id]);
  if (!c) throw notFound('That campaign');
  const settings = await getSettings();
  const rule = normalizeRecurrence(c.recurrence, localNow(settings.timezone).today);
  const occurrences = await many(
    `SELECT occurrence, count(*)::int AS total,
       count(*) FILTER (WHERE status = 'sent')::int AS sent,
       count(*) FILTER (WHERE status IN ('queued','sending'))::int AS queued,
       count(*) FILTER (WHERE status IN ('failed','bounced'))::int AS failed,
       min(sent_at) AS first_sent, max(sent_at) AS last_sent
     FROM campaign_recipients WHERE campaign_id = $1 GROUP BY occurrence ORDER BY occurrence DESC LIMIT 50`,
    [id],
  );
  res.json({ campaign: c, schedule: describeRecurrence(rule), occurrences, nextSendWindow: nextSendWindow(settings) });
}));

r.get('/:id/recipients', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const params: unknown[] = [id];
  let where = 'r.campaign_id = $1';
  if (req.query.status) { params.push(String(req.query.status)); where += ` AND r.status = $${params.length}`; }
  if (req.query.occurrence) { params.push(Number(req.query.occurrence)); where += ` AND r.occurrence = $${params.length}`; }
  if (req.query.q) { params.push(`%${req.query.q}%`); where += ` AND (r.address ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`; }
  const page = Math.max(1, Number(req.query.page) || 1);
  const total = await one<{ c: number }>(`SELECT count(*)::int AS c FROM campaign_recipients r JOIN customers c ON c.id = r.customer_id WHERE ${where}`, params);
  const rows = await many(
    `SELECT r.*, c.first_name, c.last_name FROM campaign_recipients r JOIN customers c ON c.id = r.customer_id
     WHERE ${where} ORDER BY CASE r.status WHEN 'sending' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END, r.sent_at DESC NULLS LAST, r.id
     LIMIT 100 OFFSET ${(page - 1) * 100}`,
    params,
  );
  res.json({ rows, total: total?.c ?? 0, page, pageSize: 100 });
}));

r.post('/', ah(async (req, res) => {
  const settings = await getSettings();
  const d = clean(req.body, localNow(settings.timezone).today);
  const row = await one(
    `INSERT INTO campaigns (name, channel, template_id, subject, preheader, blocks, sms_body, audience, recurrence, from_name, from_email, reply_to, test_mode, test_email, test_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [d.name, d.channel, d.template_id, d.subject, d.preheader, JSON.stringify(d.blocks), d.sms_body, JSON.stringify(d.audience), JSON.stringify(d.recurrence),
      d.from_name, d.from_email, d.reply_to, d.test_mode, d.test_email, d.test_phone],
  );
  await audit(req.user!.email, 'campaign.created', { id: row.id, name: d.name });
  res.json({ campaign: row });
}));

r.put('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const c = await one('SELECT status FROM campaigns WHERE id = $1', [id]);
  if (!c) throw notFound('That campaign');
  if (!['draft', 'paused'].includes(c.status)) throw bad('Only draft or paused campaigns can be edited.');
  const settings = await getSettings();
  const d = clean(req.body, localNow(settings.timezone).today);
  const row = await one(
    `UPDATE campaigns SET name=$2, channel=$3, template_id=$4, subject=$5, preheader=$6, blocks=$7, sms_body=$8, audience=$9, recurrence=$10,
       from_name=$11, from_email=$12, reply_to=$13, test_mode=$14, test_email=$15, test_phone=$16, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, d.name, d.channel, d.template_id, d.subject, d.preheader, JSON.stringify(d.blocks), d.sms_body, JSON.stringify(d.audience), JSON.stringify(d.recurrence),
      d.from_name, d.from_email, d.reply_to, d.test_mode, d.test_email, d.test_phone],
  );
  res.json({ campaign: row });
}));

r.delete('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const c = await one('SELECT status, name FROM campaigns WHERE id = $1', [id]);
  if (!c) throw notFound('That campaign');
  if (['active', 'paused'].includes(c.status)) throw bad('Cancel this campaign before deleting it.');
  await query('DELETE FROM campaigns WHERE id = $1', [id]);
  await audit(req.user!.email, 'campaign.deleted', { id, name: c.name });
  res.json({ ok: true });
}));

/** Numbers for the review step: who gets it, how long it takes, when it sends. */
r.post('/estimate', ah(async (req, res) => {
  const settings = await getSettings();
  const { today } = localNow(settings.timezone);
  const channel = req.body?.channel === 'sms' ? 'sms' : 'email';
  const audience = sanitizeAudience(req.body?.audience);
  const rule = normalizeRecurrence(req.body?.recurrence, today);
  const recipients = await countAudience(audience, channel);
  const limit = channel === 'sms' ? settings.sms_daily_limit : settings.daily_limit;
  const alreadyToday = await sentToday(today, channel);
  const estimatedDays = recipients === 0 ? 0 : Math.ceil(recipients / Math.max(1, limit));
  const upcoming = occurrencesBetween(rule, today, addDays(today, 366), 24);
  const missingAddress = !settings.mailing_address;
  res.json({
    recipients, limit, alreadyToday, estimatedDays,
    schedule: describeRecurrence(rule),
    upcoming,
    sendTime: settings.send_time,
    timezone: settings.timezone,
    from: `${req.body?.from_name || settings.from_name} <${req.body?.from_email || settings.from_email}>`,
    replyTo: req.body?.reply_to || settings.reply_to,
    warnings: [
      ...(missingAddress && channel === 'email' ? ['Your mailing address is empty. The law (CAN-SPAM) requires it in every marketing email. Add it in Settings.'] : []),
      ...(recipients === 0 ? ['Nobody matches this audience right now.'] : []),
      ...(channel === 'sms' && !settings.sms_enabled ? ['Text messages are switched off in Settings.'] : []),
    ],
  });
}));

/** Sends one test to the address given. No customer receives it. */
r.post('/test', ah(async (req, res) => {
  const channel = req.body?.channel === 'sms' ? 'sms' : 'email';
  try {
    if (channel === 'sms') {
      if (!phoneLast10(req.body?.to)) throw bad('Please enter a mobile number for the test text.');
      await sendTestSms(String(req.body?.sms_body || ''), String(req.body.to));
    } else {
      const to = normalizeEmail(req.body?.to);
      if (!to || !isValidEmail(to)) throw bad('Please enter a valid email address for the test.');
      await sendTestEmail(req.body, to);
    }
  } catch (e) {
    if (e instanceof SendError) throw bad(e.message);
    throw e;
  }
  await audit(req.user!.email, 'campaign.test_sent', { channel, to: req.body?.to });
  res.json({ ok: true, message: `Test sent to ${req.body.to}. No customers received it.` });
}));

r.post('/:id/launch', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const c = await one('SELECT * FROM campaigns WHERE id = $1', [id]);
  if (!c) throw notFound('That campaign');
  if (c.status !== 'draft') throw bad('This campaign has already been started.');
  const settings = await getSettings(true);
  const { today } = localNow(settings.timezone);
  if (c.channel === 'email' && !c.subject.trim()) throw bad('Please add a subject line.');
  if (c.channel === 'email' && !sanitizeBlocks(c.blocks).length) throw bad('The email has no content yet.');
  if (c.channel === 'sms' && !c.sms_body.trim()) throw bad('Please write the text message.');

  // Test mode: send only to the test address and finish. Customers never receive it.
  if (c.test_mode) {
    try {
      if (c.channel === 'sms') {
        if (!c.test_phone) throw bad('Test mode is on, so please enter a test phone number.');
        await sendTestSms(c.sms_body, c.test_phone);
      } else {
        if (!c.test_email) throw bad('Test mode is on, so please enter a test email address.');
        await sendTestEmail(c, c.test_email);
      }
    } catch (e) {
      if (e instanceof SendError) throw bad(e.message);
      throw e;
    }
    await query(`UPDATE campaigns SET status = 'completed', started_at = now(), completed_at = now(), updated_at = now() WHERE id = $1`, [id]);
    await audit(req.user!.email, 'campaign.test_mode_sent', { id, to: c.test_email || c.test_phone });
    return res.json({ ok: true, message: `Test-mode campaign sent only to ${c.test_email || c.test_phone}. No customers received it.` });
  }

  if (c.channel === 'sms' && !settings.sms_enabled) throw bad('Text messages are switched off in Settings.');
  const rule = normalizeRecurrence(c.recurrence, today);
  const first = firstOnOrAfter(rule, today);
  if (!first) throw bad('This schedule has no sending days left. Check the start and end dates.');
  await query(
    `UPDATE campaigns SET status = 'active', recurrence = $2, current_occurrence = $3, next_run_date = $4, audience_built_on = NULL,
       started_at = now(), updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(rule), first.index, first.date],
  );
  await audit(req.user!.email, 'campaign.launched', { id, name: c.name, first: first.date });
  res.json({ ok: true, message: first.date === today ? 'Campaign started. Sending begins at the next send time.' : `Campaign scheduled. First send: ${first.date}.` });
}));

r.post('/:id/pause', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const row = await one(`UPDATE campaigns SET status = 'paused', updated_at = now() WHERE id = $1 AND status = 'active' RETURNING id`, [id]);
  if (!row) throw bad('Only a running campaign can be paused.');
  await audit(req.user!.email, 'campaign.paused', { id });
  res.json({ ok: true });
}));

r.post('/:id/resume', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const row = await one(`UPDATE campaigns SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'paused' RETURNING id`, [id]);
  if (!row) throw bad('Only a paused campaign can be resumed.');
  await audit(req.user!.email, 'campaign.resumed', { id });
  res.json({ ok: true });
}));

r.post('/:id/cancel', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const row = await one(`UPDATE campaigns SET status = 'cancelled', completed_at = now(), updated_at = now() WHERE id = $1 AND status IN ('active','paused','draft') RETURNING id`, [id]);
  if (!row) throw bad('This campaign is already finished.');
  await query(`UPDATE campaign_recipients SET status = 'skipped', last_error = 'Campaign cancelled' WHERE campaign_id = $1 AND status = 'queued'`, [id]);
  await audit(req.user!.email, 'campaign.cancelled', { id });
  res.json({ ok: true });
}));

r.post('/:id/duplicate', ah(async (req, res) => {
  const src = await one('SELECT * FROM campaigns WHERE id = $1', [intParam(req.params.id)]);
  if (!src) throw notFound('That campaign');
  const row = await one(
    `INSERT INTO campaigns (name, channel, template_id, subject, preheader, blocks, sms_body, audience, recurrence, from_name, from_email, reply_to, test_mode, test_email, test_phone)
     SELECT name || ' (copy)', channel, template_id, subject, preheader, blocks, sms_body, audience, recurrence, from_name, from_email, reply_to, false, test_email, test_phone
     FROM campaigns WHERE id = $1 RETURNING *`,
    [src.id],
  );
  res.json({ campaign: row });
}));

export default r;
