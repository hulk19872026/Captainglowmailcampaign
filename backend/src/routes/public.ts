// Public routes: unsubscribe page, open pixel, click redirect and provider webhooks.
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { ah } from '../lib/http';
import { one, query, tx } from '../lib/db';
import { env } from '../lib/env';
import { log } from '../lib/log';
import { getSettings } from '../lib/settings';
import { verifyLink } from '../lib/sign';
import { escapeHtml, phoneLast10, normalizeEmail } from '../lib/util';
import { verifyTwilioSignature } from '../services/twilio';

const r = Router();

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

async function page(title: string, body: string) {
  let accent = '#22C55E', name = 'Captain Glow Mini Golf', logo = '', website = '';
  try {
    const s = await getSettings();
    accent = s.accent_color; name = s.company_name; logo = s.logo_url; website = s.website;
  } catch { /* database down: plain page */ }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(name)}</title>
<style>body{margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827}
.card{max-width:480px;margin:48px auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);border-top:6px solid ${accent};text-align:center}
h1{font-size:24px;margin:8px 0 12px}p{color:#4b5563;line-height:1.6}
button{background:${accent};color:#fff;border:0;border-radius:999px;padding:14px 28px;font-size:16px;font-weight:700;cursor:pointer}
a{color:${accent}}img{max-width:180px;height:auto}</style></head>
<body><div class="card">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}">` : `<div style="font-weight:800;color:${accent};font-size:20px">${escapeHtml(name)}</div>`}
${body}${website ? `<p style="margin-top:24px;font-size:13px"><a href="${escapeHtml(website)}">${escapeHtml(website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></p>` : ''}</div></body></html>`;
}

async function findRecipient(token: string) {
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return null;
  return one(`SELECT r.*, c.email AS customer_email, c.unsubscribed FROM campaign_recipients r JOIN customers c ON c.id = r.customer_id WHERE r.token = $1`, [token]);
}

async function unsubscribe(rec: any, source: 'link' | 'one_click') {
  await tx(async (c) => {
    const upd = await c.query(`UPDATE customers SET unsubscribed = true, unsubscribed_at = now(), updated_at = now() WHERE id = $1 AND unsubscribed = false`, [rec.customer_id]);
    if (upd.rowCount) {
      await c.query(`INSERT INTO unsubscribe_records (customer_id, email, channel, source, campaign_id) VALUES ($1, $2, 'email', $3, $4)`,
        [rec.customer_id, rec.customer_email, source, rec.campaign_id]);
      await c.query(`INSERT INTO email_events (campaign_id, recipient_id, customer_id, type) VALUES ($1, $2, $3, 'unsubscribed')`,
        [rec.campaign_id, rec.id, rec.customer_id]);
      // Nothing else goes out to them, even if already queued.
      await c.query(`UPDATE campaign_recipients SET status = 'skipped', last_error = 'Unsubscribed' WHERE customer_id = $1 AND channel = 'email' AND status = 'queued'`, [rec.customer_id]);
    }
  });
}

// ---------- unsubscribe ----------

r.get('/u/:token', ah(async (req, res) => {
  const token = String(req.params.token);
  if (token === 'test' || token === 'preview') {
    return res.send(await page('Unsubscribe', `<h1>This is a test link</h1><p>In real emails, this link lets the customer unsubscribe with one click. Nothing was changed.</p>`));
  }
  const rec = await findRecipient(token);
  if (!rec) return res.status(404).send(await page('Link not found', `<h1>Hmm, that link didn't work</h1><p>It may be incomplete. Reply to any of our emails and we'll take you off the list by hand.</p>`));
  if (rec.unsubscribed) return res.send(await page('Unsubscribed', `<h1>You're already unsubscribed</h1><p>You won't get any more marketing emails from us.</p>`));
  res.send(await page('Unsubscribe', `<h1>Unsubscribe from our emails?</h1>
    <p>Click the button below and we'll stop sending marketing emails to <strong>${escapeHtml(rec.customer_email || 'this address')}</strong>.</p>
    <form method="post" action="/u/${escapeHtml(token)}"><button type="submit">Unsubscribe me</button></form>`));
}));

// Handles both the button above and one-click unsubscribe from email apps (List-Unsubscribe-Post).
r.post('/u/:token', express.urlencoded({ extended: false }), ah(async (req, res) => {
  const token = String(req.params.token);
  const rec = await findRecipient(token);
  const oneClick = String(req.body?.['List-Unsubscribe'] || '') === 'One-Click';
  if (rec) {
    await unsubscribe(rec, oneClick ? 'one_click' : 'link');
    log.info('unsubscribe', `Customer #${rec.customer_id} unsubscribed (${oneClick ? 'one-click' : 'link'})`);
  }
  if (oneClick) return res.status(200).send('OK');
  res.send(await page('Unsubscribed', rec
    ? `<h1>You're unsubscribed</h1><p>Sorry to see you go! You won't receive any more marketing emails from us. If this was a mistake, just reply to one of our emails.</p>`
    : `<h1>Hmm, that link didn't work</h1><p>Reply to any of our emails and we'll take you off the list by hand.</p>`));
}));

// ---------- open pixel ----------

r.get('/t/open/:file', async (req, res) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' });
  res.end(PIXEL);
  const token = String(req.params.file).replace(/\.gif$/i, '');
  try {
    const upd = await one(`UPDATE campaign_recipients SET opened_at = now() WHERE token = $1 AND opened_at IS NULL RETURNING id, campaign_id, customer_id, channel`, [token]);
    if (upd) await query(`INSERT INTO email_events (campaign_id, recipient_id, customer_id, channel, type) VALUES ($1, $2, $3, $4, 'opened')`, [upd.campaign_id, upd.id, upd.customer_id, upd.channel]);
  } catch (e) {
    log.warn('track', 'Could not record an open', e);
  }
});

// ---------- click redirect ----------

r.get('/t/click/:token', ah(async (req, res) => {
  const token = String(req.params.token);
  const url = String(req.query.u || '');
  const label = String(req.query.l || '');
  const sig = String(req.query.s || '');
  let fallback = 'https://www.captainglowsminigolf.com/';
  try { fallback = (await getSettings()).website || fallback; } catch { /* keep default */ }

  const safe = /^https?:\/\//i.test(url) && verifyLink(sig, token, url, label);
  if (!safe) return res.redirect(302, fallback);
  res.redirect(302, url);

  try {
    const rec = await one(`SELECT id, campaign_id, customer_id, channel, clicked_at FROM campaign_recipients WHERE token = $1`, [token]);
    if (!rec) return;
    await query(`UPDATE campaign_recipients SET clicked_at = COALESCE(clicked_at, now()), opened_at = COALESCE(opened_at, now()) WHERE id = $1`, [rec.id]);
    await query(`INSERT INTO email_events (campaign_id, recipient_id, customer_id, channel, type, meta) VALUES ($1, $2, $3, $4, 'clicked', $5)`,
      [rec.campaign_id, rec.id, rec.customer_id, rec.channel, JSON.stringify({ url, label })]);
    if (label) {
      // An offer button was clicked: this person is a sales lead.
      await query(
        `INSERT INTO leads (customer_id, campaign_id, recipient_id, label, url) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (recipient_id, label) WHERE recipient_id IS NOT NULL
         DO UPDATE SET click_count = leads.click_count + 1, last_clicked_at = now()`,
        [rec.customer_id, rec.campaign_id, rec.id, label.slice(0, 80), url.slice(0, 1000)],
      );
    }
  } catch (e) {
    log.warn('track', 'Could not record a click', e);
  }
}));

// ---------- Resend webhook ----------

function verifySvix(req: Request, raw: string): boolean {
  const secret = env.resendWebhookSecret;
  if (!secret) return false;
  const id = req.header('svix-id'), ts = req.header('svix-timestamp'), sigHeader = req.header('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return sigHeader.split(' ').some((part) => {
    const [, sig] = part.split(',');
    if (!sig) return false;
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

r.post('/webhooks/resend', express.raw({ type: '*/*', limit: '1mb' }), ah(async (req: Request, res: Response) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifySvix(req, raw)) {
    log.warn('webhook', 'Rejected a Resend webhook with a missing or wrong signature (check RESEND_WEBHOOK_SECRET)');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
  const type = String(evt?.type || '');
  const emailId = evt?.data?.email_id;
  const rec = emailId ? await one(`SELECT r.*, c.email AS customer_email FROM campaign_recipients r JOIN customers c ON c.id = r.customer_id WHERE r.provider_id = $1`, [emailId]) : null;
  const toEmail = normalizeEmail(Array.isArray(evt?.data?.to) ? evt.data.to[0] : evt?.data?.to) || rec?.customer_email;
  const addEvent = (t: string, meta: object = {}) =>
    rec ? query(`INSERT INTO email_events (campaign_id, recipient_id, customer_id, type, meta) VALUES ($1, $2, $3, $4, $5)`, [rec.campaign_id, rec.id, rec.customer_id, t, JSON.stringify({ ...meta, resend_type: type })]) : null;

  switch (type) {
    case 'email.delivered':
      if (rec) { await query(`UPDATE campaign_recipients SET delivered_at = COALESCE(delivered_at, now()) WHERE id = $1`, [rec.id]); await addEvent('delivered'); }
      break;
    case 'email.opened':
      // Our own pixel already records opens; this just fills the gap if it was blocked.
      if (rec && !rec.opened_at) { await query(`UPDATE campaign_recipients SET opened_at = now() WHERE id = $1`, [rec.id]); await addEvent('opened', { via: 'resend' }); }
      break;
    case 'email.bounced': {
      const bounceType = String(evt?.data?.bounce?.type || evt?.data?.bounce_type || 'Permanent');
      const hard = !/transient|soft/i.test(bounceType);
      if (rec) {
        await query(`UPDATE campaign_recipients SET status = 'bounced', bounced_at = now(), last_error = $2 WHERE id = $1`, [rec.id, `Bounced (${bounceType}) ${evt?.data?.bounce?.message || ''}`.trim()]);
        await addEvent('bounced', { hard, bounceType });
      }
      if (hard && toEmail) await query(`INSERT INTO suppression_list (email, reason) VALUES ($1, 'hard_bounce') ON CONFLICT (email) DO NOTHING`, [toEmail]);
      break;
    }
    case 'email.complained':
      if (rec) await addEvent('complained');
      if (toEmail) {
        await query(`INSERT INTO suppression_list (email, reason) VALUES ($1, 'complaint') ON CONFLICT (email) DO UPDATE SET reason = 'complaint'`, [toEmail]);
        const cust = await one(`UPDATE customers SET unsubscribed = true, unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE email = $1 RETURNING id`, [toEmail]);
        await query(`INSERT INTO unsubscribe_records (customer_id, email, channel, source, campaign_id) VALUES ($1, $2, 'email', 'complaint', $3)`, [cust?.id ?? null, toEmail, rec?.campaign_id ?? null]);
      }
      break;
    default:
      // email.sent, email.clicked, email.delivery_delayed: nothing extra to do.
      break;
  }
  res.json({ ok: true });
}));

// ---------- Twilio inbound texts (STOP / START) ----------

const STOP_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'quit', 'end'];
const START_WORDS = ['start', 'unstop', 'yes'];

r.post('/webhooks/twilio/inbound', express.urlencoded({ extended: false }), ah(async (req, res) => {
  const url = env.appUrl + req.originalUrl;
  if (!verifyTwilioSignature(url, req.body || {}, req.header('x-twilio-signature'))) {
    log.warn('webhook', `Rejected a Twilio webhook with a missing or wrong signature (URL checked: ${url})`);
    return res.status(403).send('Invalid signature');
  }
  const from = String(req.body?.From || '');
  const word = String(req.body?.Body || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const p10 = phoneLast10(from);
  res.type('text/xml');
  if (!p10) return res.send('<Response></Response>');

  if (STOP_WORDS.includes(word)) {
    await query(`INSERT INTO sms_suppression_list (phone_last10, reason) VALUES ($1, 'stop') ON CONFLICT (phone_last10) DO NOTHING`, [p10]);
    const custs = await query(`UPDATE customers SET sms_consent = false, sms_consent_at = NULL, updated_at = now() WHERE phone_last10 = $1 RETURNING id`, [p10]);
    await query(`UPDATE campaign_recipients SET status = 'skipped', last_error = 'Replied STOP' WHERE channel = 'sms' AND status = 'queued'
                 AND customer_id IN (SELECT id FROM customers WHERE phone_last10 = $1)`, [p10]);
    await query(`INSERT INTO unsubscribe_records (customer_id, phone, channel, source) VALUES ($1, $2, 'sms', 'sms_stop')`, [custs.rows[0]?.id ?? null, from]);
    log.info('sms', `Opt-out (${word.toUpperCase()}) from …${p10.slice(-4)}`);
  } else if (START_WORDS.includes(word)) {
    await query(`DELETE FROM sms_suppression_list WHERE phone_last10 = $1`, [p10]);
    const custs = await query(`UPDATE customers SET sms_consent = true, sms_consent_at = now(), updated_at = now() WHERE phone_last10 = $1 RETURNING id`, [p10]);
    await query(`INSERT INTO unsubscribe_records (customer_id, phone, channel, source) VALUES ($1, $2, 'sms', 'sms_start')`, [custs.rows[0]?.id ?? null, from]);
    log.info('sms', `Opt-in (START) from …${p10.slice(-4)}`);
  }
  // Twilio sends the standard STOP/START confirmation replies itself.
  res.send('<Response></Response>');
}));

export default r;
