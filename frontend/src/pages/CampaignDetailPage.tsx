import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pause, Play, XCircle, Copy, Trash2, Pencil, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { normalizeRecurrence } from '@recurrence';
import { api, qs } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, StatusBadge, Stat, Notice, Confirm, useToast, Progress, Empty } from '../components/ui';
import SendCalendar from '../components/SendCalendar';
import { fmtDate, fmtDateTime, fullName, num, pct, todayIn } from '../lib/format';

const FILTERS = [['', 'Everyone'], ['queued', 'Waiting'], ['sending', 'Sending'], ['sent', 'Sent'], ['failed', 'Failed'], ['bounced', 'Bounced'], ['skipped', 'Skipped']];

export default function CampaignDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/api/campaigns/${id}`);
  const settings = useApi('/api/settings');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const recips = useApi(`/api/campaigns/${id}/recipients${qs({ status: filter, page })}`);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep the live queue fresh while the campaign is running.
  useEffect(() => {
    if (data?.campaign?.status !== 'active') return;
    const t = setInterval(() => { reload(true); recips.reload(true); }, 15000);
    return () => clearInterval(t);
  }, [data?.campaign?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;
  const c = data.campaign;
  const today = settings.data ? todayIn(settings.data.settings.timezone) : new Date().toISOString().slice(0, 10);
  const rule = normalizeRecurrence(c.recurrence, today);

  const act = async (action: string, msg: string) => {
    setBusy(true);
    try {
      if (action === 'delete') { await api.del(`/api/campaigns/${c.id}`); toast('success', msg); nav('/campaigns'); return; }
      if (action === 'duplicate') { const d = await api.post(`/api/campaigns/${c.id}/duplicate`); toast('success', msg); nav(`/campaigns/${d.campaign.id}/edit`); return; }
      await api.post(`/api/campaigns/${c.id}/${action}`);
      toast('success', msg);
      reload(true); recips.reload(true);
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); setConfirm(null); }
  };

  return (
    <div className="space-y-6">
      <Link to="/campaigns" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />All campaigns</Link>
      <PageHeader title={c.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{c.channel === 'sms' ? <MessageSquare className="h-4 w-4 text-violet-500" /> : <Mail className="h-4 w-4 text-brand-500" />}<StatusBadge status={c.status} />{data.schedule}</span>}
        actions={<>
          <button className="btn-ghost" onClick={() => { reload(true); recips.reload(true); }}><RefreshCw className="h-4 w-4" /></button>
          {c.status === 'draft' && <Link to={`/campaigns/${c.id}/edit`} className="btn-primary"><Pencil className="h-4 w-4" />Continue editing</Link>}
          {c.status === 'active' && <button className="btn-secondary" disabled={busy} onClick={() => act('pause', 'Paused. Nothing more goes out until you resume.')}><Pause className="h-4 w-4" />Pause</button>}
          {c.status === 'paused' && <>
            <Link to={`/campaigns/${c.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" />Edit</Link>
            <button className="btn-primary" disabled={busy} onClick={() => act('resume', 'Resumed. Sending picks up at the next send time.')}><Play className="h-4 w-4" />Resume</button>
          </>}
          {['active', 'paused', 'draft'].includes(c.status) && <button className="btn-secondary !text-red-600" onClick={() => setConfirm('cancel')}><XCircle className="h-4 w-4" />{c.recurrence?.type !== 'once' ? 'Stop' : 'Cancel'}</button>}
          <button className="btn-secondary" disabled={busy} onClick={() => act('duplicate', 'Copied into a new draft.')}><Copy className="h-4 w-4" />Duplicate</button>
          {['completed', 'cancelled', 'draft'].includes(c.status) && <button className="btn-ghost !text-red-600" onClick={() => setConfirm('delete')}><Trash2 className="h-4 w-4" /></button>}
        </>} />

      {c.test_mode && <Notice kind="warning" title="Test-mode campaign">This campaign was sent only to {c.test_email || c.test_phone}. No customers received it.</Notice>}
      {c.status === 'active' && c.next_run_date && c.next_run_date > today && <Notice kind="info">Waiting for the next sending day: <strong>{fmtDate(c.next_run_date)}</strong> (pass {c.current_occurrence}).</Notice>}
      {c.status === 'active' && c.next_run_date && c.next_run_date <= today && c.queued > 0 && <Notice kind="info">Sending now: up to the daily limit, in batches, starting at {settings.data?.settings.send_time}. Next window: {fmtDateTime(data.nextSendWindow)}.</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Sent" value={num(c.sent)} hint={c.total ? `of ${num(c.total)} queued` : undefined} />
        <Stat label="Waiting" value={num(c.queued)} />
        <Stat label="Opened" value={c.channel === 'email' ? pct(c.opened, c.sent) : '—'} hint={c.channel === 'email' ? `${num(c.opened)} people` : 'Not tracked for texts'} />
        <Stat label="Clicked" value={c.channel === 'email' ? pct(c.clicked, c.sent) : '—'} hint={`${num(c.leads)} lead${c.leads === 1 ? '' : 's'}`} />
        <Stat label="Failed / skipped" value={`${num(c.failed)} / ${num(c.skipped)}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Passes" className="lg:col-span-1">
          {data.occurrences.length === 0 ? <p className="text-sm text-slate-500">Nothing queued yet. The recipient list is built on the first sending day at the send time.</p> : (
            <div className="space-y-3">
              {data.occurrences.map((o: any) => (
                <div key={o.occurrence}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">Pass {o.occurrence}</span><span className="text-slate-500">{o.sent} / {o.total} sent{o.failed ? ` · ${o.failed} failed` : ''}</span></div>
                  <Progress value={o.sent} max={o.total || 1} />
                  <div className="mt-0.5 text-[11px] text-slate-400">{o.first_sent ? `${fmtDateTime(o.first_sent)} – ${fmtDateTime(o.last_sent)}` : 'Not started'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Sending calendar" className="lg:col-span-2"><SendCalendar rule={rule} today={today} /></Card>
      </div>

      <Card title="Recipients (live queue)" padded={false} actions={
        <select className="input !w-40 !py-1" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}>
        {!recips.data ? <Loading /> : recips.data.rows.length === 0 ? <Empty title="Nobody here yet">{c.status === 'active' ? 'The list fills up at the send time on each sending day.' : 'No recipients match this filter.'}</Empty> : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr><th className="th">Customer</th><th className="th">{c.channel === 'sms' ? 'Phone' : 'Email'}</th><th className="th">Pass</th><th className="th">Status</th><th className="th">Sent</th>{c.channel === 'email' && <><th className="th">Opened</th><th className="th">Clicked</th></>}<th className="th">Note</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {recips.data.rows.map((r: any) => (
                    <tr key={r.id}>
                      <td className="td font-medium"><Link to={`/customers/${r.customer_id}`} className="hover:text-brand-600">{fullName(r)}</Link></td>
                      <td className="td">{r.address}</td>
                      <td className="td">{r.occurrence}</td>
                      <td className="td"><StatusBadge status={r.status} />{r.attempts > 1 && <span className="ml-1 text-[11px] text-slate-400">try {r.attempts}</span>}</td>
                      <td className="td whitespace-nowrap">{fmtDateTime(r.sent_at)}</td>
                      {c.channel === 'email' && <><td className="td whitespace-nowrap">{r.opened_at ? fmtDateTime(r.opened_at) : '—'}</td><td className="td whitespace-nowrap">{r.clicked_at ? fmtDateTime(r.clicked_at) : '—'}</td></>}
                      <td className="td max-w-xs truncate text-xs text-slate-500" title={r.last_error || ''}>{r.last_error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recips.data.total > recips.data.pageSize && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
                <span className="text-slate-500">{num(recips.data.total)} people</span>
                <div className="flex gap-2"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn-secondary" disabled={page * recips.data.pageSize >= recips.data.total} onClick={() => setPage(page + 1)}>Next</button></div>
              </div>
            )}
          </>
        )}
      </Card>

      <Confirm open={confirm === 'cancel'} danger busy={busy} title={c.recurrence?.type !== 'once' ? 'Stop this repeating campaign?' : 'Cancel this campaign?'} confirmLabel="Yes, stop it"
        onClose={() => setConfirm(null)} onConfirm={() => act('cancel', 'Campaign stopped. Nobody else will receive it.')}>
        Everyone still waiting will be skipped, and no future passes will run. People who already received it are unaffected. This can't be undone, but you can duplicate the campaign later.
      </Confirm>
      <Confirm open={confirm === 'delete'} danger busy={busy} title="Delete this campaign?" confirmLabel="Delete"
        onClose={() => setConfirm(null)} onConfirm={() => act('delete', 'Campaign deleted.')}>
        This also removes its stats and recipient history. Leads it created are kept.
      </Confirm>
    </div>
  );
}
