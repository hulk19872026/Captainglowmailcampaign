import { Router } from 'express';
import { ah, bad, notFound, intParam } from '../lib/http';
import { many, one, query } from '../lib/db';
import { audit } from '../lib/audit';
import { eligibleSql } from '../services/customers';

const r = Router();

const GROUP_STATS = `
  (SELECT count(*)::int FROM customer_group_members m WHERE m.group_id = g.id) AS member_count,
  (SELECT count(*)::int FROM customer_group_members m JOIN customers c ON c.id = m.customer_id WHERE m.group_id = g.id AND ${eligibleSql('email')}) AS emailable_count,
  (SELECT count(*)::int FROM customer_group_members m JOIN customers c ON c.id = m.customer_id WHERE m.group_id = g.id AND ${eligibleSql('sms')}) AS textable_count`;

r.get('/', ah(async (_req, res) => {
  res.json({ groups: await many(`SELECT g.*, ${GROUP_STATS} FROM customer_groups g ORDER BY lower(g.name)`) });
}));

r.get('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const group = await one(`SELECT g.*, ${GROUP_STATS} FROM customer_groups g WHERE g.id = $1`, [id]);
  if (!group) throw notFound('That group');
  const members = await many(
    `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.city, c.disabled, c.unsubscribed, c.sms_consent, m.added_at,
       EXISTS (SELECT 1 FROM suppression_list s WHERE s.email = c.email) AS suppressed
     FROM customer_group_members m JOIN customers c ON c.id = m.customer_id WHERE m.group_id = $1
     ORDER BY lower(coalesce(c.first_name,'') || coalesce(c.last_name,'')), c.id LIMIT 2000`,
    [id],
  );
  const campaigns = await many(
    `SELECT id, name, status FROM campaigns WHERE audience->>'type' = 'groups' AND audience->'groupIds' @> $1::jsonb ORDER BY created_at DESC`,
    [JSON.stringify([id])],
  );
  res.json({ group, members, campaigns });
}));

r.post('/', ah(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 100);
  if (!name) throw bad('Please give the group a name.');
  const g = await one('INSERT INTO customer_groups (name, description) VALUES ($1, $2) RETURNING *', [name, String(req.body?.description || '').slice(0, 500) || null]);
  await audit(req.user!.email, 'group.created', { id: g.id, name });
  res.json({ group: g });
}));

r.put('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  if (!name) throw bad('Please give the group a name.');
  const g = await one('UPDATE customer_groups SET name = $2, description = $3, updated_at = now() WHERE id = $1 RETURNING *', [id, name, String(req.body?.description || '').slice(0, 500) || null]);
  if (!g) throw notFound('That group');
  res.json({ group: g });
}));

r.delete('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const live = await many(
    `SELECT name FROM campaigns WHERE status IN ('draft','active','paused') AND audience->>'type' = 'groups' AND audience->'groupIds' @> $1::jsonb`,
    [JSON.stringify([id])],
  );
  if (live.length) {
    throw bad(`This group is still used by ${live.length === 1 ? 'the campaign' : 'these campaigns'}: ${live.map((c) => `"${c.name}"`).join(', ')}. Finish, cancel or change ${live.length === 1 ? 'it' : 'them'} first.`);
  }
  const g = await one('DELETE FROM customer_groups WHERE id = $1 RETURNING name', [id]);
  if (!g) throw notFound('That group');
  await audit(req.user!.email, 'group.deleted', { id, name: g.name });
  res.json({ ok: true });
}));

r.post('/:id/members', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const ids: number[] = Array.isArray(req.body?.customerIds) ? req.body.customerIds.map(Number).filter((n: number) => n > 0) : [];
  if (!ids.length) throw bad('Pick at least one customer to add.');
  const r2 = await query('INSERT INTO customer_group_members (group_id, customer_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [id, ids]);
  await query('UPDATE customer_groups SET updated_at = now() WHERE id = $1', [id]);
  res.json({ added: r2.rowCount });
}));

r.delete('/:id/members/:customerId', ah(async (req, res) => {
  await query('DELETE FROM customer_group_members WHERE group_id = $1 AND customer_id = $2', [intParam(req.params.id), intParam(req.params.customerId)]);
  res.json({ ok: true });
}));

export default r;
