import type { PoolClient } from 'pg';
import { query, one } from '../lib/db';
import { normalizeEmail, isValidEmail, phoneLast10, bool } from '../lib/util';

export interface CustomerInput {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  sms_consent?: boolean;
  disabled?: boolean;
}

const TEXT_FIELDS = ['first_name', 'last_name', 'company_name', 'address_line', 'city', 'state', 'postal_code', 'notes'] as const;

export function cleanCustomer(raw: any): { data: CustomerInput; error?: string } {
  const data: CustomerInput = {};
  for (const f of TEXT_FIELDS) {
    if (raw[f] !== undefined) data[f] = raw[f] === null ? null : String(raw[f]).trim().slice(0, f === 'notes' ? 4000 : 200) || null;
  }
  if (raw.email !== undefined) {
    const e = normalizeEmail(raw.email);
    if (e && !isValidEmail(e)) return { data, error: `"${raw.email}" doesn't look like a valid email address.` };
    data.email = e;
  }
  if (raw.phone !== undefined) data.phone = raw.phone ? String(raw.phone).trim().slice(0, 40) : null;
  if (raw.sms_consent !== undefined) data.sms_consent = bool(raw.sms_consent);
  if (raw.disabled !== undefined) data.disabled = bool(raw.disabled);
  return { data };
}

/** Creates a customer, or updates the one with the same email. Returns what happened. */
export async function upsertByEmail(input: CustomerInput, source: string, opts: { overwriteConsent?: boolean } = {}): Promise<'created' | 'updated'> {
  const p10 = input.phone !== undefined ? phoneLast10(input.phone) : undefined;
  const existing = input.email ? await one<{ id: number }>('SELECT id FROM customers WHERE email = $1', [input.email]) : null;
  if (existing) {
    const sets: string[] = [];
    const vals: unknown[] = [existing.id];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    for (const f of TEXT_FIELDS) if (input[f]) add(f, input[f]);
    if (input.phone) { add('phone', input.phone); add('phone_last10', p10); }
    if (opts.overwriteConsent && input.sms_consent !== undefined) {
      add('sms_consent', input.sms_consent);
      sets.push(`sms_consent_at = CASE WHEN $${vals.length} THEN COALESCE(sms_consent_at, now()) ELSE NULL END`);
    }
    if (sets.length) await query(`UPDATE customers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
    return 'updated';
  }
  await query(
    `INSERT INTO customers (source, first_name, last_name, company_name, email, phone, phone_last10, address_line, city, state, postal_code, notes, sms_consent, sms_consent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $13 THEN now() ELSE NULL END)`,
    [source, input.first_name ?? null, input.last_name ?? null, input.company_name ?? null, input.email ?? null, input.phone ?? null, p10 ?? null,
      input.address_line ?? null, input.city ?? null, input.state ?? null, input.postal_code ?? null, input.notes ?? null, !!input.sms_consent],
  );
  return 'created';
}

// ---------- Audience ----------

export interface Audience {
  type: 'all' | 'filters' | 'groups';
  groupIds?: number[];
  filters?: {
    search?: string;
    city?: string;
    source?: string;
    addedWithinDays?: number;
    notEmailedWithinDays?: number;
  };
}

export function sanitizeAudience(a: any): Audience {
  const type = ['all', 'filters', 'groups'].includes(a?.type) ? a.type : 'all';
  const out: Audience = { type };
  if (type === 'groups') out.groupIds = Array.isArray(a.groupIds) ? a.groupIds.map(Number).filter((n: number) => n > 0).slice(0, 50) : [];
  if (type === 'filters') {
    const f = a.filters || {};
    out.filters = {
      search: f.search ? String(f.search).slice(0, 100) : undefined,
      city: f.city ? String(f.city).slice(0, 100) : undefined,
      source: ['manual', 'csv', 'wave'].includes(f.source) ? f.source : undefined,
      addedWithinDays: Number(f.addedWithinDays) > 0 ? Math.min(3650, Math.round(Number(f.addedWithinDays))) : undefined,
      notEmailedWithinDays: Number(f.notEmailedWithinDays) > 0 ? Math.min(3650, Math.round(Number(f.notEmailedWithinDays))) : undefined,
    };
  }
  return out;
}

/** SQL that picks the customers who may receive this channel. Uses table alias "c". */
export function eligibleSql(channel: 'email' | 'sms'): string {
  if (channel === 'sms') {
    return `c.disabled = false AND c.sms_consent = true AND c.phone_last10 IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM sms_suppression_list s WHERE s.phone_last10 = c.phone_last10)`;
  }
  return `c.disabled = false AND c.unsubscribed = false AND c.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM suppression_list s WHERE s.email = c.email)`;
}

export function audienceSql(a: Audience, channel: 'email' | 'sms', startIndex = 1): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${startIndex + params.length - 1}`; };
  const parts = [eligibleSql(channel)];
  if (a.type === 'groups') {
    parts.push(`EXISTS (SELECT 1 FROM customer_group_members m WHERE m.customer_id = c.id AND m.group_id = ANY(${p(a.groupIds?.length ? a.groupIds : [0])}::int[]))`);
  }
  if (a.type === 'filters' && a.filters) {
    const f = a.filters;
    if (f.search) {
      const s = p(`%${f.search}%`);
      parts.push(`(c.first_name ILIKE ${s} OR c.last_name ILIKE ${s} OR c.email ILIKE ${s} OR c.company_name ILIKE ${s})`);
    }
    if (f.city) parts.push(`c.city ILIKE ${p(f.city)}`);
    if (f.source) parts.push(`c.source = ${p(f.source)}`);
    if (f.addedWithinDays) parts.push(`c.created_at >= now() - (${p(f.addedWithinDays)} || ' days')::interval`);
    if (f.notEmailedWithinDays) parts.push(`(c.last_emailed_at IS NULL OR c.last_emailed_at < now() - (${p(f.notEmailedWithinDays)} || ' days')::interval)`);
  }
  return { where: parts.join(' AND '), params };
}

export async function countAudience(a: Audience, channel: 'email' | 'sms'): Promise<number> {
  const { where, params } = audienceSql(a, channel);
  const r = await one<{ c: number }>(`SELECT count(*)::int AS c FROM customers c WHERE ${where}`, params);
  return r?.c ?? 0;
}

/**
 * Queues everyone who currently qualifies for this occurrence. The unique index on
 * (campaign_id, customer_id, occurrence) means running this again never double-queues.
 */
export async function queueAudience(client: PoolClient, campaignId: number, occurrence: number, a: Audience, channel: 'email' | 'sms'): Promise<number> {
  const { where, params } = audienceSql(a, channel, 4);
  const addressCol = channel === 'sms' ? 'c.phone' : 'c.email';
  const r = await client.query(
    `INSERT INTO campaign_recipients (campaign_id, customer_id, occurrence, channel, address)
     SELECT $1, c.id, $2, $3, ${addressCol} FROM customers c WHERE ${where}
     ON CONFLICT (campaign_id, customer_id, occurrence) DO NOTHING`,
    [campaignId, occurrence, channel, ...params],
  );
  // Anyone still waiting who no longer qualifies (unsubscribed, disabled, removed from group…) is skipped.
  await client.query(
    `UPDATE campaign_recipients r SET status = 'skipped', last_error = 'No longer eligible'
     WHERE r.campaign_id = $1 AND r.occurrence = $2 AND r.status = 'queued'
       AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = r.customer_id AND ${where})`,
    [campaignId, occurrence, channel, ...params],
  );
  return r.rowCount ?? 0;
}
