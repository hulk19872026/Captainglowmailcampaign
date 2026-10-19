import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Clock, CheckCircle2, XCircle, Settings as SettingsIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Stat, Progress, StatusBadge, useToast, Spinner, Notice } from '../components/ui';
import { fmtDate, fmtDateTime, fmtRelative } from '../lib/format';

export default function SchedulePage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/api/schedule');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;
  const s = data.settings;
  const sendNow = async () => {
    setBusy(true);
    try { const r = await api.post('/api/schedule/send-now'); setResult(r.message); toast('success', r.message); reload(true); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Schedule" subtitle={`It's ${data.localTime} where you are (${s.timezone}).`}
        actions={<>
          <Link to="/settings" className="btn-secondary"><SettingsIcon className="h-4 w-4" />Change limits</Link>
          <button className="btn-primary" onClick={sendNow} disabled={busy}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <Zap className="h-4 w-4" />}Send next batch now</button>
        </>} />
      {result && <Notice kind="info" title="Result of the last manual batch">{result}</Notice>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Emails today" value={`${data.today.emailSent} / ${s.daily_limit}`} hint={<Progress value={data.today.emailSent} max={s.daily_limit} className="mt-2" />} />
        {s.sms_enabled && <Stat label="Texts today" value={`${data.today.smsSent} / ${s.sms_daily_limit}`} hint={<Progress value={data.today.smsSent} max={s.sms_daily_limit} className="mt-2" />} />}
        <Stat label="Next send window" value={<span className="text-xl">{fmtDateTime(data.nextSendWindow)}</span>} hint={data.pastSendTime ? 'Today\'s window is open. The scheduler checks every 5 minutes.' : `Sending starts at ${s.send_time} each day.`} icon={<Clock className="h-5 w-5" />} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="How sending works">
          <ul className="space-y-2 text-sm text-slate-600">
            <li>• Every 5 minutes, after <strong>{s.send_time}</strong>, the scheduler checks for waiting messages.</li>
            <li>• It sends in batches of <strong>{s.batch_size}</strong>, one message at a time, then waits <strong>{s.batch_delay_seconds} seconds</strong>.</li>
            <li>• It stops at <strong>{s.daily_limit} emails</strong>{s.sms_enabled && <> and <strong>{s.sms_daily_limit} texts</strong></>} a day, then carries on tomorrow exactly where it left off.</li>
            <li>• The database makes sure nobody gets the same campaign pass twice.</li>
            <li>• "Send next batch now" sends one batch straight away (still within today's limit), even before the send time.</li>
          </ul>
        </Card>
        <Card title="System status">
          {[
            ['Database', data.system.database.healthy, data.system.database.healthy ? 'Connected' : data.system.database.lastError],
            ['Scheduler', data.system.scheduler.healthy, data.system.scheduler.lastTickAt ? `Last check ${fmtRelative(data.system.scheduler.lastTickAt)}: ${data.system.scheduler.lastTickResult}` : 'Starting up'],
            ['Email provider', data.system.email.configured && !data.system.scheduler.lastError, data.system.email.configured ? data.system.scheduler.lastError || 'Ready' : 'Not set up (see Integrations)'],
            ...(s.sms_enabled ? [['Texting provider', data.system.sms.configured, data.system.sms.configured ? 'Ready' : 'Not set up (see Integrations)']] : []),
          ].map(([label, ok, detail]: any) => (
            <div key={label} className="flex items-start gap-3 py-2">
              {ok ? <CheckCircle2 className="h-5 w-5 flex-none text-brand-500" /> : <XCircle className="h-5 w-5 flex-none text-red-500" />}
              <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-slate-500">{detail}</div></div>
            </div>
          ))}
        </Card>
      </div>
      <Card title="Campaigns in the schedule" padded={false}>
        {data.upcoming.length === 0 ? <p className="p-5 text-sm text-slate-500">No running or paused campaigns.</p> : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr><th className="th">Campaign</th><th className="th">Status</th><th className="th">Next sending day</th><th className="th">Waiting</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.upcoming.map((c: any) => (
                <tr key={c.id}><td className="td font-medium"><Link to={`/campaigns/${c.id}`} className="hover:text-brand-600">{c.name}</Link> <span className="text-xs text-slate-400">{c.channel === 'sms' ? 'text' : 'email'}</span></td>
                  <td className="td"><StatusBadge status={c.status} /></td><td className="td">{fmtDate(c.next_run_date)}</td><td className="td">{c.queued}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
