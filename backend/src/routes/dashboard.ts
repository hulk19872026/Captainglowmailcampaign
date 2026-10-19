import { Router } from 'express';
import { ah } from '../lib/http';
import { many, one, dbStatus } from '../lib/db';
import { getSettings, localNow, nextSendWindow, isPastSendTime } from '../lib/settings';
import { engineState, schedulerHealthy, sentToday, tick } from '../services/engine';
import { resendConfigured } from '../services/resend';
import { twilioConfigured } from '../services/twilio';
import { audit } from '../lib/audit';

export const dashboard = Router();
export const schedule = Router();

async function systemStatus() {
  const settings = await getSettings();
  return {
    database: dbStatus(),
    scheduler: { healthy: schedulerHealthy(), ...engineState },
    email: { configured: resendConfigured() },
    sms: { configured: twilioConfigured(), enabled: settings.sms_enabled },
  };
}

dashboard.get('/', ah(async (_req, res) => {
  const settings = await getSettings();
  const { today } = localNow(settings.timezone);
  const counts = await one(`SELECT
      (SELECT count(*)::int FROM customers) AS customers,
      (SELECT count(*)::int FROM customers c WHERE c.disabled = false AND c.unsubscribed = false AND c.email IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM suppression_list s WHERE s.email = c.email)) AS emailable,
      (SELECT count(*)::int FROM customers WHERE sms_consent AND phone_last10 IS NOT NULL) AS textable,
      (SELECT count(*)::int FROM campaign_recipients WHERE status = 'sent' AND channel = 'email') AS emails_sent,
      (SELECT count(*)::int FROM campaign_recipients WHERE status = 'sent' AND channel = 'sms') AS texts_sent,
      (SELECT count(*)::int FROM campaign_recipients WHERE channel = 'email' AND opened_at IS NOT NULL) AS opened,
      (SELECT count(*)::int FROM campaign_recipients WHERE channel = 'email' AND clicked_at IS NOT NULL) AS clicked,
      (SELECT count(*)::int FROM leads WHERE status = 'new') AS new_leads,
      (SELECT count(*)::int FROM campaign_recipients WHERE status IN ('queued','sending')) AS queued`);
  const active = await many(`SELECT c.id, c.name, c.channel, c.status, c.next_run_date, c.current_occurrence, c.recurrence,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.occurrence = c.current_occurrence) AS total,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.occurrence = c.current_occurrence AND r.status = 'sent') AS sent,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.occurrence = c.current_occurrence AND r.status IN ('queued','sending')) AS queued
    FROM campaigns c WHERE c.status IN ('active','paused') ORDER BY c.created_at`);
  const notifications = await many(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 8`);
  const sent = counts?.emails_sent || 0;
  res.json({
    counts,
    rates: {
      open: sent ? Math.round((counts.opened / sent) * 1000) / 10 : 0,
      click: sent ? Math.round((counts.clicked / sent) * 1000) / 10 : 0,
    },
    today: {
      date: today,
      emailSent: await sentToday(today, 'email'),
      emailLimit: settings.daily_limit,
      smsSent: await sentToday(today, 'sms'),
      smsLimit: settings.sms_daily_limit,
      smsEnabled: settings.sms_enabled,
    },
    active,
    notifications,
    system: await systemStatus(),
    nextSendWindow: nextSendWindow(settings),
    mailingAddressMissing: !settings.mailing_address,
  });
}));

schedule.get('/', ah(async (_req, res) => {
  const settings = await getSettings();
  const { today, now } = localNow(settings.timezone);
  const upcoming = await many(`SELECT c.id, c.name, c.channel, c.status, c.next_run_date, c.current_occurrence, c.recurrence,
      (SELECT count(*)::int FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('queued','sending')) AS queued
    FROM campaigns c WHERE c.status IN ('active','paused') ORDER BY c.next_run_date NULLS LAST, c.created_at`);
  const history = await many(`SELECT day, channel, count FROM daily_send_counts WHERE day >= ($1::date - 13) ORDER BY day`, [today]);
  res.json({
    settings: {
      daily_limit: settings.daily_limit, sms_daily_limit: settings.sms_daily_limit, send_time: settings.send_time,
      timezone: settings.timezone, batch_size: settings.batch_size, batch_delay_seconds: settings.batch_delay_seconds, sms_enabled: settings.sms_enabled,
    },
    localTime: now.toFormat("cccc, LLL d 'at' h:mm a"),
    pastSendTime: isPastSendTime(settings),
    nextSendWindow: nextSendWindow(settings),
    today: { emailSent: await sentToday(today, 'email'), smsSent: await sentToday(today, 'sms') },
    upcoming,
    history,
    system: await systemStatus(),
  });
}));

schedule.post('/send-now', ah(async (req, res) => {
  await audit(req.user!.email, 'schedule.send_next_batch');
  const message = await tick({ manual: true });
  res.json({ message });
}));
