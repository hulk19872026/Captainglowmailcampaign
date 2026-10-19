import { Router } from 'express';
import { ah } from '../lib/http';
import { many, one } from '../lib/db';

const r = Router();

r.get('/', ah(async (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const totals = await one(`SELECT
      count(*) FILTER (WHERE status = 'sent' OR delivered_at IS NOT NULL OR bounced_at IS NOT NULL)::int AS sent,
      count(*) FILTER (WHERE delivered_at IS NOT NULL)::int AS delivered,
      count(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked,
      count(*) FILTER (WHERE status = 'bounced' OR bounced_at IS NOT NULL)::int AS bounced,
      count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM campaign_recipients WHERE channel = 'email' AND queued_at >= now() - ($1 || ' days')::interval`, [String(days)]);
  const sms = await one(`SELECT count(*) FILTER (WHERE status = 'sent')::int AS sent, count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM campaign_recipients WHERE channel = 'sms' AND queued_at >= now() - ($1 || ' days')::interval`, [String(days)]);
  const daily = await many(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE type = 'sent' AND channel = 'email')::int AS sent,
      count(*) FILTER (WHERE type = 'delivered')::int AS delivered,
      count(*) FILTER (WHERE type = 'opened')::int AS opened,
      count(*) FILTER (WHERE type = 'clicked')::int AS clicked,
      count(*) FILTER (WHERE type IN ('bounced','complained'))::int AS bounced,
      count(*) FILTER (WHERE type = 'failed')::int AS failed,
      count(*) FILTER (WHERE type = 'sent' AND channel = 'sms')::int AS texts
    FROM email_events WHERE created_at >= now() - ($1 || ' days')::interval
    GROUP BY 1 ORDER BY 1`, [String(days)]);
  const campaigns = await many(`SELECT c.id, c.name, c.channel, c.status, c.created_at,
      count(r.id) FILTER (WHERE r.status = 'sent' OR r.bounced_at IS NOT NULL)::int AS sent,
      count(r.id) FILTER (WHERE r.delivered_at IS NOT NULL)::int AS delivered,
      count(r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int AS opened,
      count(r.id) FILTER (WHERE r.clicked_at IS NOT NULL)::int AS clicked,
      count(r.id) FILTER (WHERE r.status = 'bounced')::int AS bounced,
      count(r.id) FILTER (WHERE r.status = 'failed')::int AS failed,
      (SELECT count(*)::int FROM leads l WHERE l.campaign_id = c.id) AS leads
    FROM campaigns c LEFT JOIN campaign_recipients r ON r.campaign_id = c.id
    WHERE c.status <> 'draft' GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`);
  const unsubscribes = await one(`SELECT count(*)::int AS c FROM unsubscribe_records WHERE source IN ('link','one_click','sms_stop','complaint') AND created_at >= now() - ($1 || ' days')::interval`, [String(days)]);
  res.json({ days, totals, sms, daily, campaigns, unsubscribes: unsubscribes?.c ?? 0 });
}));

export default r;
