import crypto from 'crypto';

export function normalizeEmail(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  return s ? s : null;
}

const EMAIL_RE = /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[a-z]{2,}$/i;
export function isValidEmail(v: unknown): boolean {
  const e = normalizeEmail(v);
  return !!e && e.length <= 254 && EMAIL_RE.test(e);
}

/** Finds the first email address inside free text (used for Wave names). */
export function findEmailInText(v: unknown): string | null {
  if (!v) return null;
  const m = String(v).match(/[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[a-z]{2,}/i);
  return m ? normalizeEmail(m[0]) : null;
}

export function stripEmailFromText(v: unknown): string {
  if (!v) return '';
  return String(v).replace(/[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[a-z]{2,}/gi, '').replace(/[<>()]/g, '').replace(/\s+/g, ' ').trim();
}

export function phoneDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Phone numbers are matched on their last 10 digits. */
export function phoneLast10(v: unknown): string | null {
  const d = phoneDigits(v);
  return d.length >= 10 ? d.slice(-10) : null;
}

/** Best-effort E.164 for US/Canada numbers; leaves numbers with a + alone. */
export function toE164(v: unknown): string | null {
  const raw = String(v ?? '').trim();
  const d = phoneDigits(raw);
  if (!d) return null;
  if (raw.startsWith('+')) return '+' + d;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return d.length > 10 ? '+' + d : null;
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  return /^(1|true|yes|y|on|x)$/i.test(String(v ?? '').trim());
}
