import { Link } from 'react-router-dom';
import { Users, Mail, MousePointerClick, Target, Clock, Send, MessageSquare, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Stat, Loading, ErrorBox, Progress, StatusBadge, Notice, Empty } from '../components/ui';
import { fmtDateTime, fmtRelative, num } from '../lib/format';

function StatusRow({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail: string }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className={`mt-0.5 h-5 w-5 flex-none ${ok ? 'text-brand-500' : warn ? 'text-amber-500' : 'text-red-500'}`} />
      <div><div className="text-sm font-medium text-slate-800">{label}</div><div className="text-xs text-slate-500">{detail}</div></div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi('/api/dashboard');
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;
  const d = data!;
  const sys = d.system;
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="How your marketing is doing today, at a glance."
        actions={<Link to="/campaigns/new" className="btn-primary"><Send className="h-4 w-4" />New campaign</Link>} />

      {d.mailingAddressMissing && (
        <Notice kind="warning" title="Your mailing address is missing">
          The law (CAN-SPAM) requires a physical mailing address in every marketing email. <Link to="/settings" className="font-semibold underline">Add it in Settings</Link>.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={num(d.counts.customers)} hint={`${num(d.counts.emailable)} can be emailed · ${num(d.counts.textable)} can be texted`} icon={<Users className="h-5 w-5" />} />
        <Stat label="Emails sent" value={num(d.counts.emails_sent)} hint={d.counts.texts_sent ? `plus ${num(d.counts.texts_sent)} texts` : 'All time'} icon={<Mail className="h-5 w-5" />} />
        <Stat label="Open / click rate" value={`${d.rates.open}% / ${d.rates.click}%`} hint="Of all emails sent" icon={<MousePointerClick className="h-5 w-5" />} />
        <Stat label="New leads" value={num(d.counts.new_leads)} hint={<Link to="/leads" className="text-brand-600 hover:underline">See leads →</Link>} icon={<Target className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Today's sending" className="lg:col-span-1">
          <div className="space-y-5">
            <div>
              <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">Emails</span><span className="text-slate-500">{d.today.emailSent} of {d.today.emailLimit}</span></div>
              <Progress value={d.today.emailSent} max={d.today.emailLimit} />
            </div>
            {d.today.smsEnabled && (
              <div>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">Texts</span><span className="text-slate-500">{d.today.smsSent} of {d.today.smsLimit}</span></div>
                <Progress value={d.today.smsSent} max={d.today.smsLimit} />
              </div>
            )}
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <Clock className="mr-1 inline h-3.5 w-3.5" /> Next send window: <strong>{fmtDateTime(d.nextSendWindow)}</strong><br />
              {num(d.counts.queued)} message{d.counts.queued === 1 ? '' : 's'} waiting in the queue.
            </div>
          </div>
        </Card>

        <Card title="Active campaigns" className="lg:col-span-2" actions={<Link to="/campaigns" className="text-sm text-brand-600 hover:underline">All campaigns</Link>}>
          {d.active.length === 0 ? (
            <Empty icon={<Send className="h-10 w-10" />} title="No campaigns running">Start one from <Link to="/campaigns/new" className="text-brand-600 underline">New campaign</Link>.</Empty>
          ) : (
            <div className="divide-y divide-slate-100">
              {d.active.map((c: any) => (
                <Link key={c.id} to={`/campaigns/${c.id}`} className="block py-3 hover:bg-slate-50">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      {c.channel === 'sms' ? <MessageSquare className="h-4 w-4 text-violet-500" /> : <Mail className="h-4 w-4 text-brand-500" />}{c.name}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <Progress value={c.sent} max={c.total || 1} />
                  <div className="mt-1 text-xs text-slate-500">
                    {c.total ? `${c.sent} of ${c.total} sent · ${c.queued} waiting` : `Next sending day: ${c.next_run_date || '—'}`}
                    {c.recurrence?.type !== 'once' && ` · pass ${c.current_occurrence}`}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="System status">
          <StatusRow ok={sys.database.healthy} label="Database" detail={sys.database.healthy ? 'Connected and up to date.' : `Not reachable: ${sys.database.lastError}`} />
          <StatusRow ok={sys.scheduler.healthy} label="Scheduler"
            detail={sys.scheduler.lastTickAt ? `Last checked ${fmtRelative(sys.scheduler.lastTickAt)}: ${sys.scheduler.lastTickResult || 'OK'}` : 'Started; first check within 5 minutes.'} />
          <StatusRow ok={sys.email.configured && !sys.scheduler.lastError} warn={sys.email.configured} label="Email provider (Resend)"
            detail={!sys.email.configured ? 'Not set up yet. Add RESEND_API_KEY (see Integrations).' : sys.scheduler.lastError ? sys.scheduler.lastError : 'Ready to send.'} />
          {sys.sms.enabled && <StatusRow ok={sys.sms.configured} warn label="Text messages (Twilio)" detail={sys.sms.configured ? 'Ready to send.' : 'Not set up. Texting campaigns will wait until it is.'} />}
          <Link to="/integrations" className="mt-2 inline-block text-sm text-brand-600 hover:underline">Open Integrations →</Link>
        </Card>
        <Card title="Recent activity">
          {d.notifications.length === 0 ? <div className="py-6 text-center text-sm text-slate-500">Nothing yet. Updates about your campaigns will appear here.</div> : (
            <ul className="divide-y divide-slate-100">
              {d.notifications.map((n: any) => (
                <li key={n.id} className="py-2">
                  <div className={`text-sm font-medium ${n.kind === 'error' ? 'text-red-700' : 'text-slate-800'}`}>{n.title}</div>
                  {n.body && <div className="text-xs text-slate-500">{n.body}</div>}
                  <div className="text-[11px] text-slate-400">{fmtRelative(n.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
