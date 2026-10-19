import { Router } from 'express';
import { ah, bad, notFound, intParam } from '../lib/http';
import { many, one, query } from '../lib/db';
import { env } from '../lib/env';
import { audit } from '../lib/audit';
import { getSettings } from '../lib/settings';
import { sanitizeBlocks } from '../email/blocks';
import { renderEmail, MERGE_TAGS } from '../email/render';

const r = Router();

r.get('/', ah(async (_req, res) => {
  res.json({ templates: await many('SELECT * FROM email_templates ORDER BY is_starter DESC, updated_at DESC'), mergeTags: MERGE_TAGS });
}));

r.get('/:id', ah(async (req, res) => {
  const t = await one('SELECT * FROM email_templates WHERE id = $1', [intParam(req.params.id)]);
  if (!t) throw notFound('That template');
  res.json({ template: t, mergeTags: MERGE_TAGS });
}));

function clean(body: any) {
  const name = String(body?.name || '').trim().slice(0, 120);
  if (!name) throw bad('Please give the template a name.');
  return {
    name,
    description: String(body?.description || '').slice(0, 500),
    subject: String(body?.subject || '').slice(0, 300),
    preheader: String(body?.preheader || '').slice(0, 300),
    blocks: sanitizeBlocks(body?.blocks),
  };
}

r.post('/', ah(async (req, res) => {
  const t = clean(req.body);
  const row = await one('INSERT INTO email_templates (name, description, subject, preheader, blocks) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [t.name, t.description, t.subject, t.preheader, JSON.stringify(t.blocks)]);
  await audit(req.user!.email, 'template.created', { id: row.id, name: t.name });
  res.json({ template: row });
}));

r.put('/:id', ah(async (req, res) => {
  const t = clean(req.body);
  const row = await one('UPDATE email_templates SET name=$2, description=$3, subject=$4, preheader=$5, blocks=$6, updated_at=now() WHERE id=$1 RETURNING *',
    [intParam(req.params.id), t.name, t.description, t.subject, t.preheader, JSON.stringify(t.blocks)]);
  if (!row) throw notFound('That template');
  res.json({ template: row });
}));

r.post('/:id/duplicate', ah(async (req, res) => {
  const src = await one('SELECT * FROM email_templates WHERE id = $1', [intParam(req.params.id)]);
  if (!src) throw notFound('That template');
  const row = await one('INSERT INTO email_templates (name, description, subject, preheader, blocks) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [`${src.name} (copy)`, src.description, src.subject, src.preheader, JSON.stringify(src.blocks)]);
  res.json({ template: row });
}));

r.delete('/:id', ah(async (req, res) => {
  const row = await one('DELETE FROM email_templates WHERE id = $1 RETURNING name', [intParam(req.params.id)]);
  if (!row) throw notFound('That template');
  await audit(req.user!.email, 'template.deleted', { name: row.name });
  res.json({ ok: true });
}));

/** Live preview: renders blocks exactly as a customer would see them. */
r.post('/preview', ah(async (req, res) => {
  const settings = await getSettings();
  const sample = await one(`SELECT * FROM customers WHERE email IS NOT NULL AND first_name IS NOT NULL ORDER BY id LIMIT 1`);
  const { html, subject, text } = renderEmail({
    subject: String(req.body?.subject || ''),
    preheader: String(req.body?.preheader || ''),
    blocks: sanitizeBlocks(req.body?.blocks),
    settings,
    vars: sample
      ? { first_name: sample.first_name, last_name: sample.last_name, email: sample.email, city: sample.city, customer_company: sample.company_name }
      : { first_name: 'Alex', last_name: 'Rivera', email: 'alex@example.com', city: 'Your town' },
    links: { unsubscribeUrl: `${env.appUrl}/u/preview` },
    appUrl: env.appUrl,
  });
  res.json({ html, subject, text });
}));

export default r;
