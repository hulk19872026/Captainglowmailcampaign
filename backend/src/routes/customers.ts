import { Router } from 'express';
import multer from 'multer';
import { ah, bad, notFound, intParam } from '../lib/http';
import { many, one, query, tx } from '../lib/db';
import { audit } from '../lib/audit';
import { parseCsv, toCsv, mapHeaders } from '../lib/csv';
import { phoneLast10, isValidEmail, normalizeEmail, bool } from '../lib/util';
import { cleanCustomer, upsertByEmail } from '../services/customers';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SORTS: Record<string, string> = {
  name: "lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))",
  email: 'c.email',
  created: 'c.created_at',
  last_emailed: 'c.last_emailed_at',
  city: 'lower(c.city)',
};

const SELECT_CUSTOMER = `c.*,
  EXISTS (SELECT 1 FROM suppression_list s WHERE s.email = c.email) AS suppressed,
  EXISTS (SELECT 1 FROM sms_suppression_list s WHERE s.phone_last10 = c.phone_last10) AS sms_opted_out`;

/** Builds the WHERE clause for the list, export and "select all matching" bulk actions. */
function listWhere(q: any) {
  const parts: string[] = ['true'];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (q.q) {
    const s = p(`%${String(q.q).trim()}%`);
    parts.push(`(c.first_name ILIKE ${s} OR c.last_name ILIKE ${s} OR c.email ILIKE ${s} OR c.company_name ILIKE ${s} OR c.phone ILIKE ${s} OR c.city ILIKE ${s}
      OR (coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) ILIKE ${s})`);
  }
  switch (q.filter) {
    case 'active': parts.push('c.disabled = false AND c.unsubscribed = false'); break;
    case 'disabled': parts.push('c.disabled = true'); break;
    case 'unsubscribed': parts.push('c.unsubscribed = true'); break;
    case 'suppressed': parts.push('EXISTS (SELECT 1 FROM suppression_list s WHERE s.email = c.email)'); break;
    case 'sms_consent': parts.push('c.sms_consent = true'); break;
    case 'phone_no_consent': parts.push('c.phone_last10 IS NOT NULL AND c.sms_consent = false'); break;
    case 'no_email': parts.push('c.email IS NULL'); break;
    case 'never_emailed': parts.push('c.last_emailed_at IS NULL'); break;
  }
  if (q.source && ['manual', 'csv', 'wave'].includes(q.source)) parts.push(`c.source = ${p(q.source)}`);
  if (q.group) parts.push(`EXISTS (SELECT 1 FROM customer_group_members m WHERE m.customer_id = c.id AND m.group_id = ${p(Number(q.group))})`);
  if (q.city) parts.push(`c.city ILIKE ${p(String(q.city))}`);
  return { where: parts.join(' AND '), params };
}

r.get('/', ah(async (req, res) => {
  const { where, params } = listWhere(req.query);
  const sort = SORTS[String(req.query.sort)] || SORTS.created;
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));
  const page = Math.max(1, Number(req.query.page) || 1);
  const total = await one<{ c: number }>(`SELECT count(*)::int AS c FROM customers c WHERE ${where}`, params);
  const rows = await many(
    `SELECT ${SELECT_CUSTOMER} FROM customers c WHERE ${where}
     ORDER BY ${sort} ${dir} NULLS LAST, c.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  const cities = await many(`SELECT DISTINCT city FROM customers WHERE city IS NOT NULL AND city <> '' ORDER BY city LIMIT 200`);
  res.json({ rows, total: total?.c ?? 0, page, pageSize, cities: cities.map((c) => c.city) });
}));

r.get('/export.csv', ah(async (req, res) => {
  const { where, params } = listWhere(req.query);
  const rows = await many(`SELECT ${SELECT_CUSTOMER} FROM customers c WHERE ${where} ORDER BY c.id`, params);
  const headers = ['First name', 'Last name', 'Company', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Notes', 'SMS consent', 'Unsubscribed', 'Suppressed', 'Disabled', 'Source', 'Added', 'Last emailed'];
  const csv = toCsv(headers, rows.map((c) => [c.first_name, c.last_name, c.company_name, c.email, c.phone, c.address_line, c.city, c.state, c.postal_code, c.notes,
    c.sms_consent ? 'yes' : 'no', c.unsubscribed ? 'yes' : 'no', c.suppressed ? 'yes' : 'no', c.disabled ? 'yes' : 'no', c.source, c.created_at, c.last_emailed_at]));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

r.get('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const customer = await one(`SELECT ${SELECT_CUSTOMER} FROM customers c WHERE c.id = $1`, [id]);
  if (!customer) throw notFound('That customer');
  const history = await many(
    `SELECT r.id, r.campaign_id, r.occurrence, r.channel, r.status, r.sent_at, r.delivered_at, r.opened_at, r.clicked_at, r.bounced_at,
            r.last_error, r.queued_at, c.name AS campaign_name, c.subject
     FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
     WHERE r.customer_id = $1 ORDER BY r.queued_at DESC LIMIT 300`,
    [id],
  );
  const events = await many(`SELECT e.*, c.name AS campaign_name FROM email_events e LEFT JOIN campaigns c ON c.id = e.campaign_id WHERE e.customer_id = $1 ORDER BY e.created_at DESC LIMIT 300`, [id]);
  const groups = await many(`SELECT g.id, g.name FROM customer_groups g JOIN customer_group_members m ON m.group_id = g.id WHERE m.customer_id = $1 ORDER BY g.name`, [id]);
  const leads = await many(`SELECT l.*, c.name AS campaign_name FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id WHERE l.customer_id = $1 ORDER BY l.created_at DESC`, [id]);
  res.json({ customer, history, events, groups, leads });
}));

r.post('/', ah(async (req, res) => {
  const { data, error } = cleanCustomer(req.body || {});
  if (error) throw bad(error);
  if (!data.email && !data.phone) throw bad('Please enter at least an email address or a phone number.');
  if (data.email && (await one('SELECT 1 FROM customers WHERE email = $1', [data.email]))) throw bad('A customer with that email already exists.');
  const row = await one(
    `INSERT INTO customers (source, first_name, last_name, company_name, email, phone, phone_last10, address_line, city, state, postal_code, notes, sms_consent, sms_consent_at)
     VALUES ('manual',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $12 THEN now() ELSE NULL END) RETURNING *`,
    [data.first_name ?? null, data.last_name ?? null, data.company_name ?? null, data.email ?? null, data.phone ?? null, phoneLast10(data.phone),
      data.address_line ?? null, data.city ?? null, data.state ?? null, data.postal_code ?? null, data.notes ?? null, !!data.sms_consent],
  );
  await audit(req.user!.email, 'customer.created', { id: row.id, email: row.email });
  res.json({ customer: row });
}));

r.put('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const before = await one('SELECT * FROM customers WHERE id = $1', [id]);
  if (!before) throw notFound('That customer');
  const { data, error } = cleanCustomer(req.body || {});
  if (error) throw bad(error);
  if (data.email && data.email !== before.email && (await one('SELECT 1 FROM customers WHERE email = $1 AND id <> $2', [data.email, id]))) {
    throw bad('Another customer already uses that email.');
  }
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'sms_consent') continue;
    add(k, v);
  }
  if (data.phone !== undefined) add('phone_last10', phoneLast10(data.phone));
  if (data.sms_consent !== undefined && data.sms_consent !== before.sms_consent) {
    add('sms_consent', data.sms_consent);
    sets.push(`sms_consent_at = ${data.sms_consent ? 'now()' : 'NULL'}`);
  }
  if (req.body?.unsubscribed !== undefined) {
    const unsub = bool(req.body.unsubscribed);
    if (unsub !== before.unsubscribed) {
      add('unsubscribed', unsub);
      sets.push(`unsubscribed_at = ${unsub ? 'now()' : 'NULL'}`);
      await query(`INSERT INTO unsubscribe_records (customer_id, email, channel, source) VALUES ($1, $2, 'email', $3)`, [id, before.email, unsub ? 'admin' : 'admin_resubscribe']);
    }
  }
  if (sets.length) await query(`UPDATE customers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
  await audit(req.user!.email, 'customer.updated', { id, fields: Object.keys(req.body || {}) });
  res.json({ customer: await one(`SELECT ${SELECT_CUSTOMER} FROM customers c WHERE c.id = $1`, [id]) });
}));

r.delete('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const row = await one('DELETE FROM customers WHERE id = $1 RETURNING email', [id]);
  if (!row) throw notFound('That customer');
  await audit(req.user!.email, 'customer.deleted', { id, email: row.email });
  res.json({ ok: true });
}));

r.post('/:id/suppression', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const c = await one('SELECT email FROM customers WHERE id = $1', [id]);
  if (!c?.email) throw bad('This customer has no email address.');
  if (bool(req.body?.suppressed)) {
    await query(`INSERT INTO suppression_list (email, reason) VALUES ($1, 'manual') ON CONFLICT (email) DO NOTHING`, [c.email]);
  } else {
    await query('DELETE FROM suppression_list WHERE email = $1', [c.email]);
  }
  await audit(req.user!.email, 'customer.suppression', { id, suppressed: bool(req.body?.suppressed) });
  res.json({ ok: true });
}));

/** Bulk actions on a list of IDs, or on everything matching the current filters. */
r.post('/bulk', ah(async (req, res) => {
  const action = String(req.body?.action || '');
  let ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n: number) => n > 0) : [];
  if (req.body?.allMatching) {
    const { where, params } = listWhere(req.body.query || {});
    ids = (await many(`SELECT c.id FROM customers c WHERE ${where}`, params)).map((x) => x.id);
  }
  if (!ids.length) throw bad('Please select at least one customer.');
  let affected = 0;
  switch (action) {
    case 'disable': affected = (await query('UPDATE customers SET disabled = true, updated_at = now() WHERE id = ANY($1::int[])', [ids])).rowCount ?? 0; break;
    case 'enable': affected = (await query('UPDATE customers SET disabled = false, updated_at = now() WHERE id = ANY($1::int[])', [ids])).rowCount ?? 0; break;
    case 'unsubscribe':
      affected = (await query('UPDATE customers SET unsubscribed = true, unsubscribed_at = now(), updated_at = now() WHERE id = ANY($1::int[]) AND unsubscribed = false', [ids])).rowCount ?? 0;
      await query(`INSERT INTO unsubscribe_records (customer_id, email, channel, source) SELECT id, email, 'email', 'admin' FROM customers WHERE id = ANY($1::int[])`, [ids]);
      break;
    case 'sms_consent_on': affected = (await query('UPDATE customers SET sms_consent = true, sms_consent_at = COALESCE(sms_consent_at, now()), updated_at = now() WHERE id = ANY($1::int[])', [ids])).rowCount ?? 0; break;
    case 'sms_consent_off': affected = (await query('UPDATE customers SET sms_consent = false, sms_consent_at = NULL, updated_at = now() WHERE id = ANY($1::int[])', [ids])).rowCount ?? 0; break;
    case 'delete': affected = (await query('DELETE FROM customers WHERE id = ANY($1::int[])', [ids])).rowCount ?? 0; break;
    case 'add_to_group': {
      const groupId = intParam(req.body?.groupId, 'group');
      if (!(await one('SELECT 1 FROM customer_groups WHERE id = $1', [groupId]))) throw notFound('That group');
      affected = (await query(
        `INSERT INTO customer_group_members (group_id, customer_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`, [groupId, ids],
      )).rowCount ?? 0;
      await query('UPDATE customer_groups SET updated_at = now() WHERE id = $1', [groupId]);
      break;
    }
    case 'remove_from_group': {
      const groupId = intParam(req.body?.groupId, 'group');
      affected = (await query('DELETE FROM customer_group_members WHERE group_id = $1 AND customer_id = ANY($2::int[])', [groupId, ids])).rowCount ?? 0;
      break;
    }
    default: throw bad('Unknown bulk action.');
  }
  await audit(req.user!.email, `customers.bulk.${action}`, { count: ids.length, affected });
  res.json({ ok: true, affected, selected: ids.length });
}));

/** CSV import. Matches existing customers by email so re-importing never duplicates. */
r.post('/import', upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw bad('Please choose a CSV file to import.');
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length < 2) throw bad('That file looks empty. The first row should be column names (like Email, First name, Last name, Phone).');
  const map = mapHeaders(rows[0]);
  if (map.email === undefined && map.phone === undefined) throw bad('We couldn\'t find an "Email" or "Phone" column. Please check the first row of your file.');
  const consentAll = bool(req.body?.smsConsent);
  const groupId = req.body?.groupId ? Number(req.body.groupId) : null;
  let created = 0, updated = 0, skipped = 0;
  const problems: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (f: string) => (map[f] !== undefined ? (row[map[f]] ?? '').trim() : undefined);
    let first = get('first_name'), last = get('last_name');
    if (!first && !last && get('name')) {
      const parts = get('name')!.split(/\s+/);
      first = parts[0]; last = parts.slice(1).join(' ');
    }
    const rawEmail = get('email');
    const email = normalizeEmail(rawEmail);
    if (email && !isValidEmail(email)) { skipped++; if (problems.length < 20) problems.push(`Row ${i + 1}: "${rawEmail}" isn't a valid email`); continue; }
    if (!email && !get('phone')) { skipped++; if (problems.length < 20) problems.push(`Row ${i + 1}: no email or phone`); continue; }
    const consentCol = get('sms_consent');
    const input = cleanCustomer({
      first_name: first, last_name: last, company_name: get('company_name'), email, phone: get('phone'),
      address_line: get('address_line'), city: get('city'), state: get('state'), postal_code: get('postal_code'), notes: get('notes'),
      sms_consent: consentCol !== undefined && consentCol !== '' ? bool(consentCol) : consentAll || undefined,
    }).data;
    try {
      const result = email
        ? await upsertByEmail(input, 'csv', { overwriteConsent: input.sms_consent === true })
        : await upsertByPhoneOnly(input);
      if (result === 'created') created++; else updated++;
      if (groupId) {
        const cust = email ? await one('SELECT id FROM customers WHERE email = $1', [email]) : await one('SELECT id FROM customers WHERE phone_last10 = $1 AND email IS NULL ORDER BY id LIMIT 1', [phoneLast10(input.phone)]);
        if (cust) await query('INSERT INTO customer_group_members (group_id, customer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, cust.id]);
      }
    } catch (e: any) {
      skipped++;
      if (problems.length < 20) problems.push(`Row ${i + 1}: ${e.message}`);
    }
  }
  await audit(req.user!.email, 'customers.import', { created, updated, skipped, file: req.file.originalname });
  res.json({ created, updated, skipped, problems });
}));

async function upsertByPhoneOnly(input: any): Promise<'created' | 'updated'> {
  const p10 = phoneLast10(input.phone);
  if (!p10) throw new Error('phone number is too short');
  const existing = await one('SELECT id FROM customers WHERE phone_last10 = $1 ORDER BY id LIMIT 1', [p10]);
  return tx(async (c) => {
    if (existing) {
      if (input.sms_consent) await c.query('UPDATE customers SET sms_consent = true, sms_consent_at = COALESCE(sms_consent_at, now()) WHERE id = $1', [existing.id]);
      return 'updated' as const;
    }
    await c.query(
      `INSERT INTO customers (source, first_name, last_name, company_name, phone, phone_last10, city, state, postal_code, notes, sms_consent, sms_consent_at)
       VALUES ('csv',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $10 THEN now() ELSE NULL END)`,
      [input.first_name ?? null, input.last_name ?? null, input.company_name ?? null, input.phone, p10, input.city ?? null, input.state ?? null, input.postal_code ?? null, input.notes ?? null, !!input.sms_consent],
    );
    return 'created' as const;
  });
}

export default r;
