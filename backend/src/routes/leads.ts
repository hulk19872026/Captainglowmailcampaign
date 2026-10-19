import { Router } from 'express';
import { ah, bad, notFound, intParam } from '../lib/http';
import { many, one } from '../lib/db';
import { audit } from '../lib/audit';

const r = Router();
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

r.get('/', ah(async (req, res) => {
  const params: unknown[] = [];
  let where = 'true';
  if (req.query.status && STATUSES.includes(String(req.query.status))) { params.push(req.query.status); where += ` AND l.status = $${params.length}`; }
  if (req.query.q) { params.push(`%${req.query.q}%`); where += ` AND (c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR l.label ILIKE $${params.length})`; }
  const leads = await many(`SELECT l.*, c.first_name, c.last_name, c.email, c.phone, cp.name AS campaign_name
    FROM leads l LEFT JOIN customers c ON c.id = l.customer_id LEFT JOIN campaigns cp ON cp.id = l.campaign_id
    WHERE ${where} ORDER BY l.last_clicked_at DESC LIMIT 500`, params);
  const counts = await many(`SELECT status, count(*)::int AS c FROM leads GROUP BY status`);
  res.json({ leads, counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((x) => x.status === s)?.c ?? 0])) });
}));

r.put('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const status = req.body?.status;
  if (status !== undefined && !STATUSES.includes(status)) throw bad('Unknown lead status.');
  const lead = await one(`UPDATE leads SET status = COALESCE($2, status), notes = COALESCE($3, notes), updated_at = now() WHERE id = $1 RETURNING *`,
    [id, status ?? null, req.body?.notes !== undefined ? String(req.body.notes).slice(0, 4000) : null]);
  if (!lead) throw notFound('That lead');
  await audit(req.user!.email, 'lead.updated', { id, status });
  res.json({ lead });
}));

r.delete('/:id', ah(async (req, res) => {
  const row = await one('DELETE FROM leads WHERE id = $1 RETURNING id', [intParam(req.params.id)]);
  if (!row) throw notFound('That lead');
  res.json({ ok: true });
}));

export default r;
