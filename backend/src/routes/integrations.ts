import { Router } from 'express';
import { ah, bad } from '../lib/http';
import { env } from '../lib/env';
import { audit } from '../lib/audit';
import { getSettings } from '../lib/settings';
import { isValidEmail, normalizeEmail } from '../lib/util';
import { resendConfigured, testResend } from '../services/resend';
import { twilioConfigured, testTwilio } from '../services/twilio';
import { waveConfigured, listWaveBusinesses } from '../services/wave';
import { runSync, syncStatus } from '../services/sync';
import { sendTestEmail } from '../services/engine';
import { SendError } from '../services/providerError';
import { STARTER_TEMPLATES } from '../email/starters';

const r = Router();

r.get('/', ah(async (_req, res) => {
  const settings = await getSettings();
  res.json({
    appUrl: env.appUrl,
    customerSource: waveConfigured() ? 'wave' : 'csv',
    wave: { configured: waveConfigured(), ...(waveConfigured() ? await syncStatus() : {}) },
    resend: {
      configured: resendConfigured(),
      fromEmail: settings.from_email,
      fromName: settings.from_name,
      replyTo: settings.reply_to,
      webhookUrl: `${env.appUrl}/webhooks/resend`,
      webhookSecretSet: !!env.resendWebhookSecret,
    },
    twilio: {
      configured: twilioConfigured(),
      enabled: settings.sms_enabled,
      fromNumber: env.twilioFrom,
      textUsNumber: settings.sms_text_us_number,
      inboundUrl: `${env.appUrl}/webhooks/twilio/inbound`,
    },
  });
}));

r.post('/resend/test', ah(async (_req, res) => { res.json(await testResend()); }));
r.post('/twilio/test', ah(async (_req, res) => { res.json(await testTwilio()); }));

r.get('/wave/businesses', ah(async (_req, res) => {
  if (!waveConfigured()) throw bad('Wave is not connected. Add WAVE_API_TOKEN in Railway first.');
  try {
    res.json({ businesses: await listWaveBusinesses() });
  } catch (e: any) {
    throw bad(e.message);
  }
}));

r.post('/sync', ah(async (req, res) => {
  const result = await runSync('manual', req.user!.email);
  if (!result.ok) return res.status(400).json({ error: result.message, ...result });
  res.json(result);
}));

r.post('/test-email', ah(async (req, res) => {
  const to = normalizeEmail(req.body?.to);
  if (!to || !isValidEmail(to)) throw bad('Please enter a valid email address.');
  const t = STARTER_TEMPLATES[0];
  try {
    await sendTestEmail({ subject: 'Your Marketing Center can send email', preheader: 'This is a connection test.', blocks: [
      { id: 'a', type: 'logo' },
      { id: 'b', type: 'headline', text: 'It works! 🎉' },
      { id: 'c', type: 'paragraph', text: `This test came from your Marketing Center at ${env.appUrl}.\n\nIf you can read this, email sending is set up correctly. No customers received this email.` },
      ...t.blocks.filter((b) => b.type === 'plans'),
    ] }, to);
  } catch (e) {
    if (e instanceof SendError) throw bad(e.message);
    throw e;
  }
  await audit(req.user!.email, 'integrations.test_email', { to });
  res.json({ ok: true, message: `Test email sent to ${to}. Check the inbox (and the spam folder) in a minute.` });
}));

export default r;
