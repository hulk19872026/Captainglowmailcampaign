import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageSquare, RefreshCw, PlugZap, CheckCircle2, AlertTriangle, XCircle, Copy, Upload, FileSpreadsheet } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Badge, useToast, Spinner, StatusBadge } from '../components/ui';
import { fmtDateTime } from '../lib/format';

type TestResult = { status: string; message: string; domains?: { name: string; status: string }[] };

function ResultBox({ r }: { r: TestResult | null }) {
  if (!r) return null;
  const ok = r.status === 'ok', limited = r.status === 'limited';
  const Icon = ok ? CheckCircle2 : limited ? AlertTriangle : XCircle;
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-sm ${ok ? 'bg-brand-50 text-brand-900' : limited ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div>{limited && <strong>Limited key. </strong>}{r.message}
        {r.domains && r.domains.length > 0 && <div className="mt-1 text-xs">{r.domains.map((d) => `${d.name} (${d.status})`).join(' · ')}</div>}</div>
    </div>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="mt-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
        <code className="flex-1 truncate text-xs text-slate-700">{value}</code>
        <button className="btn-ghost !p-1" onClick={() => { navigator.clipboard?.writeText(value); toast('info', 'Copied.'); }}><Copy className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/api/integrations');
  const settings = useApi('/api/settings');
  const [resendResult, setResendResult] = useState<TestResult | null>(null);
  const [twilioResult, setTwilioResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState('');
  const [testTo, setTestTo] = useState('');
  const [businesses, setBusinesses] = useState<any[] | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { toast('error', e.message); } finally { setBusy(''); }
  };
  const wave = data.wave;
  const smsEnabled = data.twilio.enabled;

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" subtitle="Where your customers come from and the services that deliver your emails and texts." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Customer source */}
        {wave.configured ? (
          <Card title={<span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-brand-500" />Wave Accounting</span>} actions={<Badge color="green">Connected</Badge>}>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-semibold text-slate-500">Business</div>
                {wave.businessId ? <code className="block break-all rounded-lg bg-slate-50 px-2 py-1.5 text-xs">{wave.businessId}</code> : <span className="text-amber-700">Not chosen yet. Pick your business below.</span>}
              </div>
              <button className="btn-secondary" disabled={busy === 'biz'} onClick={() => run('biz', async () => setBusinesses((await api.get('/api/integrations/wave/businesses')).businesses))}>
                {busy === 'biz' ? <Spinner className="!h-4 !w-4" /> : <PlugZap className="h-4 w-4" />}Test connection &amp; list businesses</button>
              {businesses && (
                <div className="space-y-1">
                  {businesses.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                      <div className="min-w-0"><div className="font-medium">{b.name}{b.isPersonal && <span className="ml-1 text-xs text-slate-400">(personal)</span>}</div><code className="block break-all text-[11px] text-slate-500">{b.id}</code></div>
                      {wave.businessId === b.id ? <Badge color="green">In use</Badge> : (
                        <button className="btn-primary !py-1" onClick={() => run('pick', async () => { await api.put('/api/settings', { wave_business_id: b.id }); toast('success', `Now syncing from "${b.name}".`); reload(true); })}>Use this</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                <div><div className="font-semibold text-slate-500">Last sync</div>{wave.last ? <>{fmtDateTime(wave.last.started_at)} <StatusBadge status={wave.last.status} /></> : 'Never'}</div>
                <div><div className="font-semibold text-slate-500">Next nightly sync</div>{wave.enabled ? fmtDateTime(wave.nextRunAt) : 'Switched off in Settings'}</div>
              </div>
              {wave.last?.status === 'failed' && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{wave.last.error}</div>}
              <button className="btn-primary" disabled={!!busy || !wave.businessId} onClick={() => run('sync', async () => { const r = await api.post('/api/integrations/sync'); toast('success', r.message); reload(true); })}>
                {busy === 'sync' ? <Spinner className="!h-4 !w-4 !text-white" /> : <RefreshCw className="h-4 w-4" />}Sync customers now</button>
              {wave.recent?.length > 1 && (
                <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Recent syncs</summary>
                  <ul className="mt-2 space-y-1">{wave.recent.map((r: any) => <li key={r.id}>{fmtDateTime(r.started_at)} · {r.trigger} · <StatusBadge status={r.status} /> · {r.created} new, {r.updated} updated{r.error ? ` · ${r.error}` : ''}</li>)}</ul></details>
              )}
              <p className="help">Only Wave customers with a valid email are imported, matched by their Wave ID so there are never duplicates.</p>
            </div>
          </Card>
        ) : (
          <Card title={<span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-brand-500" />Customer source: CSV import</span>} actions={<Badge color="green">Ready</Badge>}>
            <p className="text-sm text-slate-600">Customers come from CSV files you import and people you add by hand. Export a spreadsheet from your booking or point-of-sale system and import it on the Customers page. Re-importing the same file updates people instead of duplicating them.</p>
            <Link to="/customers" className="btn-primary mt-4"><Upload className="h-4 w-4" />Go to Customers to import</Link>
          </Card>
        )}

        {/* Resend */}
        <Card title={<span className="flex items-center gap-2"><Mail className="h-4 w-4 text-brand-500" />Email: Resend</span>} actions={<Badge color={data.resend.configured ? 'green' : 'red'}>{data.resend.configured ? 'Key added' : 'Not set up'}</Badge>}>
          <div className="text-sm text-slate-600">
            Sending as <strong>{data.resend.fromName}</strong> &lt;{data.resend.fromEmail}&gt;{data.resend.replyTo && <>, replies to {data.resend.replyTo}</>}.
          </div>
          <button className="btn-secondary mt-3" disabled={busy === 'resend'} onClick={() => run('resend', async () => setResendResult(await api.post('/api/integrations/resend/test')))}>
            {busy === 'resend' ? <Spinner className="!h-4 !w-4" /> : <PlugZap className="h-4 w-4" />}Test connection</button>
          <ResultBox r={resendResult} />
          <div className="mt-4 flex gap-2">
            <input className="input" type="email" placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <button className="btn-primary whitespace-nowrap" disabled={!testTo || busy === 'test'} onClick={() => run('test', async () => toast('success', (await api.post('/api/integrations/test-email', { to: testTo })).message))}>
              {busy === 'test' ? <Spinner className="!h-4 !w-4 !text-white" /> : <Mail className="h-4 w-4" />}Send test email</button>
          </div>
          <CopyLine label="Webhook address (paste into Resend → Webhooks)" value={data.resend.webhookUrl} />
          {!data.resend.webhookSecretSet && <p className="mt-2 text-xs text-amber-700">RESEND_WEBHOOK_SECRET isn't set, so bounces and spam complaints can't be recorded yet.</p>}
        </Card>

        {/* Twilio */}
        {smsEnabled && (
          <Card title={<span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-violet-500" />Text messages: Twilio</span>} actions={<Badge color={data.twilio.configured ? 'green' : 'red'}>{data.twilio.configured ? 'Details added' : 'Not set up'}</Badge>}>
            <div className="space-y-1 text-sm text-slate-600">
              <div>Sending from: <strong>{data.twilio.fromNumber || '—'}</strong></div>
              <div>"Text us" number in emails: <strong>{data.twilio.textUsNumber || <Link to="/settings" className="text-amber-700 underline">not set</Link>}</strong></div>
            </div>
            <button className="btn-secondary mt-3" disabled={busy === 'twilio'} onClick={() => run('twilio', async () => setTwilioResult(await api.post('/api/integrations/twilio/test')))}>
              {busy === 'twilio' ? <Spinner className="!h-4 !w-4" /> : <PlugZap className="h-4 w-4" />}Test connection</button>
            <ResultBox r={twilioResult} />
            <CopyLine label="Incoming message webhook (Twilio → Phone number → Messaging → A message comes in)" value={data.twilio.inboundUrl} />
            <p className="help mt-2">Customers who reply STOP, UNSUBSCRIBE, CANCEL, QUIT or END are opted out automatically; START opts them back in.</p>
          </Card>
        )}
      </div>
      {settings.data && <p className="text-xs text-slate-400">App address: {data.appUrl}</p>}
    </div>
  );
}
