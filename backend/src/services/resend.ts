import { env } from '../lib/env';
import { SendError } from './providerError';

const API = 'https://api.resend.com';

export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

export function resendConfigured() {
  return !!env.resendKey;
}

export async function sendEmail(msg: OutgoingEmail): Promise<{ id: string }> {
  if (!env.resendKey) throw new SendError('config', 'Email is not set up yet: RESEND_API_KEY is missing.');
  let res: Response;
  try {
    res = await fetch(`${API}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: msg.from,
        to: [msg.to],
        reply_to: msg.replyTo || undefined,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: msg.headers,
        tags: msg.tags,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e: any) {
    throw new SendError('retry', `Could not reach Resend: ${e?.message || e}`);
  }
  const body: any = await res.json().catch(() => ({}));
  if (res.ok && body?.id) return { id: String(body.id) };
  const detail = body?.message || body?.error || `HTTP ${res.status}`;
  const name = String(body?.name || '');
  if (res.status === 429 || res.status >= 500) throw new SendError('retry', `Resend is busy (${detail})`);
  if (res.status === 401 || name === 'missing_api_key' || name === 'invalid_api_key' || name === 'restricted_api_key') {
    throw new SendError('config', `Resend refused the API key (${detail})`);
  }
  if (res.status === 403 || /domain|verify|testing emails/i.test(detail)) {
    throw new SendError('config', `Resend won't send from this address yet (${detail})`);
  }
  if (res.status === 422 || res.status === 400) throw new SendError('rejected', `Address rejected (${detail})`);
  throw new SendError('retry', `Unexpected reply from Resend (${detail})`);
}

/** Checks the key. A sending-only key is reported as "limited", not as rejected. */
export async function testResend(): Promise<{ status: 'ok' | 'limited' | 'rejected' | 'missing' | 'error'; message: string; domains?: { name: string; status: string }[] }> {
  if (!env.resendKey) return { status: 'missing', message: 'RESEND_API_KEY is not set.' };
  try {
    const res = await fetch(`${API}/domains`, { headers: { Authorization: `Bearer ${env.resendKey}` }, signal: AbortSignal.timeout(10000) });
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) {
      const domains = (body?.data || []).map((d: any) => ({ name: d.name, status: d.status }));
      const verified = domains.filter((d: any) => d.status === 'verified');
      return {
        status: 'ok',
        message: verified.length
          ? `Connected. Verified domain${verified.length > 1 ? 's' : ''}: ${verified.map((d: any) => d.name).join(', ')}.`
          : 'Connected, but no domain is verified yet. Finish the DNS steps in Resend.',
        domains,
      };
    }
    if (body?.name === 'restricted_api_key' || /restricted|only send/i.test(String(body?.message))) {
      return { status: 'limited', message: 'Connected with a sending-only key. Sending works; domain details just can\'t be shown here.' };
    }
    if (res.status === 401 || res.status === 403) return { status: 'rejected', message: `Resend rejected the key (${body?.message || res.status}).` };
    return { status: 'error', message: `Resend replied with ${res.status}: ${body?.message || 'unknown error'}` };
  } catch (e: any) {
    return { status: 'error', message: `Could not reach Resend: ${e?.message || e}` };
  }
}
