import { useEffect, useRef, useState } from 'react';
import { Save, Upload, Plus, Trash2, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Notice, Toggle, Field, useToast, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import type { Settings, Plan } from '../lib/types';

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico', 'America/Toronto', 'America/Halifax', 'Europe/London'];

export default function SettingsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ settings: Settings; env: any }>('/api/settings');
  const activity = useApi('/api/settings/activity?limit=50');
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => { if (data && !s) setS(data.settings); }, [data, s]);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!s) return <Loading />;

  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put('/api/settings', s);
      setS(r.settings);
      toast('success', r.adjusted?.length ? `Saved. Some values were adjusted to stay within safe limits: ${r.adjusted.join(', ')}.` : 'Settings saved.');
      activity.reload(true);
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  const uploadLogo = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('purpose', 'logo');
    try { const r = await api.upload('/api/uploads', fd); set({ logo_url: r.url }); toast('success', 'Logo uploaded.'); } catch (e: any) { toast('error', e.message); }
  };
  const changePw = async () => {
    if (pw.next !== pw.confirm) return toast('error', 'The two new passwords don\'t match.');
    try { await api.post('/api/auth/change-password', { current: pw.current, next: pw.next }); toast('success', 'Password changed.'); setPw({ current: '', next: '', confirm: '' }); } catch (e: any) { toast('error', e.message); }
  };
  const setPlan = (i: number, patch: Partial<Plan>) => set({ plans: s.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const saveBtn = <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <Save className="h-4 w-4" />}Save settings</button>;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your business details, sending rules and branding." actions={saveBtn} />

      <Card title="Company">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Business name"><input className="input" value={s.company_name} onChange={(e) => set({ company_name: e.target.value })} /></Field>
          <Field label="Short name (used at the start of texts)"><input className="input" value={s.short_name} onChange={(e) => set({ short_name: e.target.value })} /></Field>
          <Field label="Website"><input className="input" value={s.website} onChange={(e) => set({ website: e.target.value })} /></Field>
          <Field label="Phone number"><input className="input" value={s.company_phone} onChange={(e) => set({ company_phone: e.target.value })} /></Field>
          <div className="md:col-span-2">
            <Field label="Mailing address (shown at the bottom of every email)" help="Required by the CAN-SPAM Act: a street address or a PO box.">
              <textarea className="input" rows={3} value={s.mailing_address} onChange={(e) => set({ mailing_address: e.target.value })} placeholder={'Captain Glow Mini Golf\n123 Main Street\nYour Town, ST 12345'} />
            </Field>
            {!s.mailing_address.trim() && <div className="mt-2"><Notice kind="warning">Your mailing address is empty. Please add it before sending real campaigns.</Notice></div>}
          </div>
        </div>
      </Card>

      <Card title="Sending schedule & limits">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Timezone"><select className="input" value={s.timezone} onChange={(e) => set({ timezone: e.target.value })}>{(TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES]).map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Daily send time" help="Sending starts at this time each day."><input className="input" type="time" value={s.send_time} onChange={(e) => set({ send_time: e.target.value })} /></Field>
          <Field label="Emails per day" help="1–2000. Start low with a new domain."><input className="input" type="number" min={1} max={2000} value={s.daily_limit} onChange={(e) => set({ daily_limit: Number(e.target.value) })} /></Field>
          <Field label="Batch size" help="Messages per batch (1–50)."><input className="input" type="number" min={1} max={50} value={s.batch_size} onChange={(e) => set({ batch_size: Number(e.target.value) })} /></Field>
          <Field label="Wait between batches (seconds)" help="5–600 seconds."><input className="input" type="number" min={5} max={600} value={s.batch_delay_seconds} onChange={(e) => set({ batch_delay_seconds: Number(e.target.value) })} /></Field>
        </div>
      </Card>

      <Card title="Branding">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="label">Logo</label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                {s.logo_url ? <img src={s.logo_url} alt="Logo" className="max-h-16 max-w-[9rem]" /> : <span className="text-xs text-slate-400">No logo yet</span>}
              </div>
              <div className="space-y-2">
                <button className="btn-secondary" onClick={() => logoRef.current?.click()}><Upload className="h-4 w-4" />Upload logo</button>
                {s.logo_url && <button className="btn-ghost block text-xs" onClick={() => set({ logo_url: '' })}>Remove</button>}
              </div>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </div>
            <p className="help">PNG with a transparent background works best, about 400px wide.</p>
          </div>
          <Field label="Accent colour" help="Used for buttons and highlights in your emails.">
            <div className="flex items-center gap-2"><input type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300" value={s.accent_color} onChange={(e) => set({ accent_color: e.target.value })} />
              <input className="input w-32 font-mono" value={s.accent_color} onChange={(e) => set({ accent_color: e.target.value })} /></div>
          </Field>
        </div>
      </Card>

      <Card title="Email sender">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="From name"><input className="input" value={s.from_name} onChange={(e) => set({ from_name: e.target.value })} /></Field>
          <Field label="From address" help="Must be on the domain you verified in Resend."><input className="input" type="email" value={s.from_email} onChange={(e) => set({ from_email: e.target.value })} /></Field>
          <Field label="Reply-to address" help="Where customer replies go."><input className="input" type="email" value={s.reply_to} onChange={(e) => set({ reply_to: e.target.value })} /></Field>
        </div>
      </Card>

      <Card title="Text messages (SMS)">
        <div className="space-y-4">
          <Toggle checked={s.sms_enabled} onChange={(v) => set({ sms_enabled: v })} label="Text message campaigns are on" help="Texts only ever go to customers who agreed to receive them." />
          {s.sms_enabled && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Texts per day" help="Has its own daily counter, separate from emails."><input className="input" type="number" min={0} max={2000} value={s.sms_daily_limit} onChange={(e) => set({ sms_daily_limit: Number(e.target.value) })} /></Field>
              <Field label="Opt-out line" help="Added to every text that doesn't already say how to stop."><input className="input" value={s.sms_opt_out_text} onChange={(e) => set({ sms_opt_out_text: e.target.value })} /></Field>
              <Field label='"Text us" number shown in emails' help="The number customers can text you at."><input className="input" value={s.sms_text_us_number} onChange={(e) => set({ sms_text_us_number: e.target.value })} placeholder="+1 555 123 4567" /></Field>
              <Field label='"Text us" pre-filled message'><input className="input" value={s.sms_text_us_message} onChange={(e) => set({ sms_text_us_message: e.target.value })} /></Field>
            </div>
          )}
        </div>
      </Card>

      <Card title="Services (for the services block)">
        <div className="space-y-2">
          {s.services.map((sv, i) => (
            <div key={i} className="flex gap-2"><input className="input" value={sv} onChange={(e) => set({ services: s.services.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button className="btn-ghost !text-red-500" onClick={() => set({ services: s.services.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button></div>
          ))}
          <button className="btn-secondary" onClick={() => set({ services: [...s.services, ''] })}><Plus className="h-4 w-4" />Add service</button>
        </div>
      </Card>

      <Card title="Birthday party packages (for the packages block)">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {s.plans.map((p, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <div className="flex gap-2"><input className="input font-bold" value={p.name} onChange={(e) => setPlan(i, { name: e.target.value })} placeholder="Name" />
                <button className="btn-ghost !text-red-500" title="Remove package" onClick={() => set({ plans: s.plans.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button></div>
              <input className="input" value={p.price} onChange={(e) => setPlan(i, { price: e.target.value })} placeholder="Price, e.g. $199 for 10 kids" />
              <input className="input" value={p.tagline} onChange={(e) => setPlan(i, { tagline: e.target.value })} placeholder="Short description" />
              <label className="label !mb-0 pt-1">What's included (one per line)</label>
              <textarea className="input" rows={5} value={p.features.join('\n')} onChange={(e) => setPlan(i, { features: e.target.value.split('\n') })} />
              <p className="help">ID: <code>{p.id}</code></p>
            </div>
          ))}
          {s.plans.length < 10 && <button className="btn-secondary h-full min-h-[120px] border-dashed" onClick={() => set({ plans: [...s.plans, { id: `plan${Date.now().toString(36)}`, name: 'NEW', price: '', tagline: '', features: [] }] })}><Plus className="h-4 w-4" />Add package</button>}
        </div>
      </Card>

      <Card title="Customer sync">
        {data!.env.waveConnected ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Toggle checked={s.nightly_sync_enabled} onChange={(v) => set({ nightly_sync_enabled: v })} label="Sync customers from Wave every night" />
            <Field label="Sync after (hour of the day)"><select className="input" value={s.nightly_sync_hour} onChange={(e) => set({ nightly_sync_hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}</option>)}</select></Field>
            <div className="md:col-span-2"><Field label="Wave business ID" help="Choose it on the Integrations page."><code className="block break-all rounded-lg bg-slate-50 px-3 py-2 text-xs">{s.wave_business_id || 'Not chosen yet'}</code></Field></div>
          </div>
        ) : <p className="text-sm text-slate-600">Customers come from CSV import and manual entry. (To sync from Wave Accounting instead, add a WAVE_API_TOKEN in Railway; see the README.)</p>}
      </Card>

      <div className="flex justify-end">{saveBtn}</div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Change password</span>}>
          <div className="space-y-3">
            <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <input className="input" type="password" placeholder="New password (at least 10 characters)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <input className="input" type="password" placeholder="New password again" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            <button className="btn-primary" disabled={!pw.current || !pw.next} onClick={changePw}>Change password</button>
          </div>
        </Card>
        <Card title="Activity log" padded={false}>
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {activity.data?.logs.map((l: any) => (
              <div key={l.id} className="px-5 py-2 text-sm">
                <div className="flex justify-between gap-2"><span className="font-medium text-slate-800">{l.action.replace(/[._]/g, ' ')}</span><span className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(l.created_at)}</span></div>
                <div className="truncate text-xs text-slate-500">{l.user_email}{Object.keys(l.details || {}).length ? ` · ${JSON.stringify(l.details)}` : ''}</div>
              </div>
            ))}
            {activity.data?.logs.length === 0 && <div className="p-5 text-sm text-slate-500">No activity yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
