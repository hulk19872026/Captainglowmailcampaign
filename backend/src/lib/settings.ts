import { DateTime, IANAZone } from 'luxon';
import { many, query } from './db';
import { env } from './env';
import { clampInt, normalizeEmail, isValidEmail } from './util';

export interface Plan {
  id: string;
  name: string;
  price: string;
  tagline: string;
  features: string[];
}

export interface Settings {
  company_name: string;
  short_name: string;
  website: string;
  company_phone: string;
  tagline: string;
  mailing_address: string;
  timezone: string;
  send_time: string;           // HH:MM in the business timezone
  daily_limit: number;
  sms_daily_limit: number;
  batch_size: number;
  batch_delay_seconds: number;
  logo_url: string;
  accent_color: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  sms_enabled: boolean;
  sms_text_us_number: string;
  sms_text_us_message: string;
  sms_opt_out_text: string;
  nightly_sync_enabled: boolean;
  nightly_sync_hour: number;
  wave_business_id: string;
  services: string[];
  plans: Plan[];
}

export const DEFAULT_SETTINGS: Settings = {
  company_name: 'Captain Glow Mini Golf',
  short_name: 'Captain Glow Mini Golf',
  website: 'https://www.captainglowsminigolf.com/',
  company_phone: '',
  tagline: 'Glow-in-the-dark mini golf and arcade fun for all ages',
  mailing_address: '',
  timezone: 'America/New_York',
  send_time: '10:00',
  daily_limit: 99,
  sms_daily_limit: 99,
  batch_size: 10,
  batch_delay_seconds: 30,
  logo_url: '',
  accent_color: '#22C55E',
  from_name: 'Captain Glow',
  from_email: 'marketing@captainglowsminigolf.com',
  reply_to: 'service@captainglowsminigolf.com',
  sms_enabled: true,
  sms_text_us_number: '',
  sms_text_us_message: "Hi Captain Glow! I'd like to ask about a birthday party.",
  sms_opt_out_text: 'Reply STOP to opt out.',
  nightly_sync_enabled: true,
  nightly_sync_hour: 2,
  wave_business_id: '',
  services: [
    'Glow-in-the-dark 18-hole mini golf',
    'Arcade games and prizes',
    'Birthday parties for kids and grown-ups',
    'Group outings, school trips and team events',
    'Gift cards',
  ],
  plans: [
    {
      id: 'basic',
      name: 'BASIC',
      price: 'Ask for pricing',
      tagline: 'Easy, glowing fun for the birthday crew',
      features: [
        'A round of glow mini golf for every guest',
        'Reserved party table for 90 minutes',
        'Party host to get you set up',
        'Paper goods and a birthday shout-out',
      ],
    },
    {
      id: 'pro',
      name: 'PRO',
      price: 'Ask for pricing',
      tagline: 'Everything in BASIC, plus food and arcade play',
      features: [
        'Everything in BASIC',
        'Pizza and drinks for every guest',
        'Arcade game card for every guest',
        'Two hours at your party table',
      ],
    },
    {
      id: 'elite',
      name: 'ELITE',
      price: 'Ask for pricing',
      tagline: 'Everything in PRO, plus the VIP treatment',
      features: [
        'Everything in PRO',
        'Private party room',
        'Bonus arcade credits and a prize for the birthday star',
        'Dedicated host for the whole party',
        'Goodie bags for every guest',
      ],
    },
  ],
};

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 15000) return cache.value;
  const rows = await many<{ key: string; value: any }>('SELECT key, value FROM settings');
  const merged: any = { ...DEFAULT_SETTINGS };
  if (env.resendFromEmail) merged.from_email = env.resendFromEmail;
  if (env.resendFromName) merged.from_name = env.resendFromName;
  if (env.resendReplyTo) merged.reply_to = env.resendReplyTo;
  if (env.smsNumber) merged.sms_text_us_number = env.smsNumber;
  if (env.waveBusinessId) merged.wave_business_id = env.waveBusinessId;
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  const value = sanitizeSettings(merged);
  cache = { at: Date.now(), value };
  return value;
}

export function clearSettingsCache() { cache = null; }

/** Clamps every value to something safe. Used for both reading and saving. */
export function sanitizeSettings(input: any): Settings {
  const d = DEFAULT_SETTINGS;
  const s = (v: any, fb: string, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : fb);
  const tz = s(input.timezone, d.timezone, 64);
  const sendTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.send_time)) ? String(input.send_time) : d.send_time;
  const color = /^#[0-9a-f]{6}$/i.test(String(input.accent_color)) ? String(input.accent_color) : d.accent_color;
  const fromEmail = normalizeEmail(input.from_email);
  const replyTo = normalizeEmail(input.reply_to);
  const plans: Plan[] = Array.isArray(input.plans)
    ? input.plans.slice(0, 10).map((p: any, i: number) => ({
        id: s(p?.id, `plan${i + 1}`, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '') || `plan${i + 1}`,
        name: s(p?.name, `Plan ${i + 1}`, 60),
        price: s(p?.price, '', 60),
        tagline: s(p?.tagline, '', 200),
        features: Array.isArray(p?.features) ? p.features.map((f: any) => s(f, '', 200)).filter(Boolean).slice(0, 15) : [],
      }))
    : d.plans;
  return {
    company_name: s(input.company_name, d.company_name, 120) || d.company_name,
    short_name: s(input.short_name, d.short_name, 60) || d.short_name,
    website: s(input.website, d.website, 300),
    company_phone: s(input.company_phone, '', 40),
    tagline: s(input.tagline, '', 200),
    mailing_address: s(input.mailing_address, '', 500),
    timezone: IANAZone.isValidZone(tz) ? tz : d.timezone,
    send_time: sendTime,
    daily_limit: clampInt(input.daily_limit, 1, 2000, d.daily_limit),
    sms_daily_limit: clampInt(input.sms_daily_limit, 0, 2000, d.sms_daily_limit),
    batch_size: clampInt(input.batch_size, 1, 50, d.batch_size),
    batch_delay_seconds: clampInt(input.batch_delay_seconds, 5, 600, d.batch_delay_seconds),
    logo_url: s(input.logo_url, '', 500),
    accent_color: color,
    from_name: s(input.from_name, d.from_name, 80) || d.from_name,
    from_email: fromEmail && isValidEmail(fromEmail) ? fromEmail : d.from_email,
    reply_to: replyTo && isValidEmail(replyTo) ? replyTo : '',
    sms_enabled: input.sms_enabled === undefined ? d.sms_enabled : !!input.sms_enabled,
    sms_text_us_number: s(input.sms_text_us_number, '', 30),
    sms_text_us_message: s(input.sms_text_us_message, d.sms_text_us_message, 300),
    sms_opt_out_text: s(input.sms_opt_out_text, d.sms_opt_out_text, 80) || d.sms_opt_out_text,
    nightly_sync_enabled: input.nightly_sync_enabled === undefined ? d.nightly_sync_enabled : !!input.nightly_sync_enabled,
    nightly_sync_hour: clampInt(input.nightly_sync_hour, 0, 23, d.nightly_sync_hour),
    wave_business_id: s(input.wave_business_id, '', 200),
    services: Array.isArray(input.services) ? input.services.map((x: any) => s(x, '', 200)).filter(Boolean).slice(0, 30) : d.services,
    plans,
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings(true);
  const next = sanitizeSettings({ ...current, ...patch });
  for (const key of Object.keys(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify((next as any)[key])],
    );
  }
  clearSettingsCache();
  return next;
}

/** Today's date (YYYY-MM-DD) and the current time in the business timezone. */
export function localNow(tz: string) {
  const now = DateTime.now().setZone(tz);
  return { now, today: now.toISODate()!, hhmm: now.toFormat('HH:mm') };
}

/** True once the business's send time has been reached today. */
export function isPastSendTime(settings: Settings): boolean {
  const { hhmm } = localNow(settings.timezone);
  return hhmm >= settings.send_time;
}

/** Next moment the scheduler will start sending (ISO string). */
export function nextSendWindow(settings: Settings): string {
  const { now } = localNow(settings.timezone);
  const [h, m] = settings.send_time.split(':').map(Number);
  let at = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  if (at <= now) at = at.plus({ days: 1 });
  return at.toISO()!;
}
