import { Link } from 'react-router-dom';
import { Plus, Send, Mail, MessageSquare, Repeat, FlaskConical } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { PageHeader, Loading, ErrorBox, Empty, StatusBadge, Progress, Card } from '../components/ui';
import { describeRecurrence, normalizeRecurrence } from '@recurrence';
import { fmtDate, num, pct } from '../lib/format';
import type { Campaign } from '../lib/types';

export default function CampaignsPage() {
  const { data, error, loading, reload } = useApi<{ campaigns: Campaign[] }>('/api/campaigns');
  const groups: [string, (c: Campaign) => boolean][] = [
    ['Running & scheduled', (c) => ['active', 'paused'].includes(c.status)],
    ['Drafts', (c) => c.status === 'draft'],
    ['Finished', (c) => ['completed', 'cancelled'].includes(c.status)],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Campaigns" subtitle="Emails and texts sent to your customers, a little each day."
        actions={<Link to="/campaigns/new" className="btn-primary"><Plus className="h-4 w-4" />New campaign</Link>} />
      {error && <ErrorBox error={error} onRetry={() => reload()} />}
      {loading && !data ? <Loading /> : data?.campaigns.length === 0 ? (
        <div className="card"><Empty icon={<Send className="h-10 w-10" />} title="No campaigns yet">Create your first campaign. Try the "Birthday party packages" template to start.</Empty></div>
      ) : groups.map(([title, f]) => {
        const list = data!.campaigns.filter(f);
        if (!list.length) return null;
        return (
          <Card key={title} title={title} padded={false}>
            <div className="divide-y divide-slate-100">
              {list.map((c) => {
                const rule = normalizeRecurrence(c.recurrence, c.recurrence?.startDate || '2000-01-01');
                return (
                  <Link key={c.id} to={c.status === 'draft' ? `/campaigns/${c.id}/edit` : `/campaigns/${c.id}`} className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-semibold text-slate-900">
                        {c.channel === 'sms' ? <MessageSquare className="h-4 w-4 flex-none text-violet-500" /> : <Mail className="h-4 w-4 flex-none text-brand-500" />}
                        <span className="truncate">{c.name}</span>
                        <StatusBadge status={c.status} />
                        {c.test_mode && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><FlaskConical className="h-3 w-3" />test</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        {rule.type !== 'once' && <Repeat className="h-3 w-3" />}{describeRecurrence(rule)}
                        {c.status === 'active' && c.next_run_date && <> · next: {fmtDate(c.next_run_date)}</>}
                      </div>
                    </div>
                    {c.status !== 'draft' && (
                      <div className="grid w-full grid-cols-4 gap-4 text-center text-xs md:w-auto">
                        <div><div className="text-base font-bold text-slate-800">{num(c.sent)}</div>sent</div>
                        <div><div className="text-base font-bold text-slate-800">{num(c.queued)}</div>waiting</div>
                        <div><div className="text-base font-bold text-slate-800">{c.channel === 'email' ? pct(c.opened || 0, c.sent || 0) : '—'}</div>opened</div>
                        <div><div className="text-base font-bold text-slate-800">{num(c.leads)}</div>leads</div>
                      </div>
                    )}
                    {c.status === 'active' && (c.total || 0) > 0 && <div className="w-full md:w-40"><Progress value={c.sent || 0} max={c.total || 1} /></div>}
                  </Link>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
