import crypto from 'crypto';
import { env } from '../lib/env';
import { SendError } from './providerError';

export function twilioConfigured() {
  return !!(env.twilioSid && env.twilioToken && env.twilioFrom);
}

function authHeader() {
  return 'Basic ' + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64');
}

export async function sendSms(to: string, body: string): Promise<{ id: string }> {
  if (!twilioConfigured()) throw new SendError('config', 'Texting is not set up yet: the Twilio settings are missing.');
  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: env.twilioFrom, Body: body }).toString(),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e: any) {
    throw new SendError('retry', `Could not reach Twilio: ${e?.message || e}`);
  }
  const data: any = await res.json().catch(() => ({}));
  if (res.ok && data?.sid) return { id: data.sid };
  const detail = data?.message || `HTTP ${res.status}`;
  if (res.status === 429 || res.status >= 500) throw new SendError('retry', `Twilio is busy (${detail})`);
  if (res.status === 401 || res.status === 403) throw new SendError('config', `Twilio refused the account details (${detail})`);
  // 21610 = recipient replied STOP, 21211/21614 = invalid / not a mobile number
  throw new SendError('rejected', `Number rejected (${detail})`);
}

export async function testTwilio(): Promise<{ status: 'ok' | 'rejected' | 'missing' | 'error'; message: string }> {
  if (!twilioConfigured()) return { status: 'missing', message: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are needed.' };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}.json`, {
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.ok) return { status: 'ok', message: `Connected to "${data.friendly_name || 'your Twilio account'}" (${data.status}). Sending from ${env.twilioFrom}.` };
    if (res.status === 401 || res.status === 403) return { status: 'rejected', message: 'Twilio rejected the Account SID / Auth Token.' };
    return { status: 'error', message: `Twilio replied with ${res.status}: ${data?.message || 'unknown error'}` };
  } catch (e: any) {
    return { status: 'error', message: `Could not reach Twilio: ${e?.message || e}` };
  }
}

/** Checks the X-Twilio-Signature header on incoming webhooks. */
export function verifyTwilioSignature(url: string, params: Record<string, any>, signature: string | undefined): boolean {
  if (!env.twilioToken || !signature) return false;
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + (params[k] ?? ''), url);
  const expected = crypto.createHmac('sha1', env.twilioToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
