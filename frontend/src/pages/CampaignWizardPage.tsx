import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Mail, MessageSquare, Rocket, Save, Send, FlaskConical, Users, Filter, FolderHeart, FileText } from 'lucide-react';
import { normalizeRecurrence, describeRecurrence, type Recurrence } from '@recurrence';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Notice, Toggle, useToast, Spinner, Confirm } from '../components/ui';
import BlockEditor from '../components/BlockEditor';
import EmailPreview from '../components/EmailPreview';
import MergeTags from '../components/MergeTags';
import SendCalendar from '../components/SendCalendar';
import { todayIn, num, fmtDate } from '../lib/format';
import type { Audience, Block, Group, Settings, Template } from '../lib/types';

const STEPS = ['Channel', 'Template', 'Content', 'Customers', 'Schedule', 'Sender', 'Test mode', 'Review'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Draft {
  name: string; channel: 'email' | 'sms'; template_id: number | null; subject: string; preheader: string; blocks: Block[];
  sms_body: string; audience: Audience; recurrence: Recurrence; from_name: string; from_email: string; reply_to: string;
  test_mode: boolean; test_email: string; test_phone: string;
}

const SMS_STARTERS = [
  "Hi {{first_name|there}}! Birthday coming up? Captain Glow's party packages include glow golf, arcade fun and a party host. Reply or call to book!",
  "Glow night this weekend at Captain Glow Mini Golf! Bring the crew for a round under the black lights. See you there!",
  "Hi {{first_name|there}}, we miss you on the course! Come play a round of glow golf this week.",
];

export default function CampaignWizardPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const settingsQ = useApi<{ settings: Settings }>('/api/settings');
  const templatesQ = useApi<{ templates: Template[] }>('/api/templates');
  const groupsQ = useApi<{ groups: Group[] }>('/api/groups');
  const existing = useApi(id ? `/api/campaigns/${id}` : null);
  const [campaignId, setCampaignId] = useState<number | null>(id ? Number(id) : null);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [testTo, setTestTo] = useState('');
  const [confirmLaunch, setConfirmLaunch] = useState(false);

  const settings = settingsQ.data?.settings;
  const today = settings ? todayIn(settings.timezone) : '';

  // Set up the draft once everything has loaded.
  useEffect(() => {
    if (d || !settings || !templatesQ.data) return;
    if (id) {
      if (!existing.data) return;
      const c = existing.data.campaign;
      setD({
        name: c.name, channel: c.channel, template_id: c.template_id, subject: c.subject, preheader: c.preheader, blocks: c.blocks, sms_body: c.sms_body,
        audience: c.audience, recurrence: normalizeRecurrence(c.recurrence, today), from_name: c.from_name || '', from_email: c.from_email || '', reply_to: c.reply_to || '',
        test_mode: c.test_mode, test_email: c.test_email || '', test_phone: c.test_phone || '',
      });
      return;
    }
    const tid = Number(search.get('template'));
    const t = templatesQ.data.templates.find((x) => x.id === tid);
    setD({
      name: t ? t.name : '', channel: 'email', template_id: t?.id ?? null, subject: t?.subject || '', preheader: t?.preheader || '', blocks: t?.blocks || [],
      sms_body: '', audience: { type: 'all' }, recurrence: normalizeRecurrence({ type: 'once', startDate: today }, today),
      from_name: '', from_email: '', reply_to: '', test_mode: false, test_email: '', test_phone: '',
    });
  }, [d, settings, templatesQ.data, existing.data, id, search, today]);

  const payload = useMemo(() => d && ({ ...d, recurrence: normalizeRecurrence(d.recurrence, today) }), [d, today]);

  // Live audience count + numbers for the review screen.
  useEffect(() => {
    if (!payload) return;
    const t = setTimeout(() => api.post('/api/campaigns/estimate', payload).then(setEstimate).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [payload?.channel, JSON.stringify(payload?.audience), JSON.stringify(payload?.recurrence), payload?.from_email, payload?.from_name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (settingsQ.error) return <ErrorBox error={settingsQ.error} />;
  if (existing.error) return <ErrorBox error={existing.error} />;
  if (!d || !settings || !payload) return <Loading />;
  if (existing.data && !['draft', 'paused'].includes(existing.data.campaign.status)) {
    return <ErrorBox error="This campaign has already started, so it can't be edited. Duplicate it from the campaign page to make a new version." />;
  }

  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const setRule = (patch: Partial<Recurrence>) => set({ recurrence: normalizeRecurrence({ ...d.recurrence, ...patch }, today) });
  const isEmail = d.channel === 'email';

  const problems: Record<number, string | null> = {
    0: !d.name.trim() ? 'Give your campaign a name.' : null,
    2: isEmail ? (!d.subject.trim() ? 'Add a subject line.' : !d.blocks.length ? 'Add at least one block.' : null) : !d.sms_body.trim() ? 'Write your text message.' : null,
    3: d.audience.type === 'groups' && !d.audience.groupIds?.length ? 'Pick at least one group.' : null,
    6: d.test_mode && (isEmail ? !d.test_email : !d.test_phone) ? `Enter the ${isEmail ? 'email address' : 'phone number'} for the test.` : null,
  };
  const firstProblem = Object.entries(problems).find(([, v]) => v);

  const save = async (quiet = false): Promise<number | null> => {
    setBusy(true);
    try {
      let cid = campaignId;
      if (cid) await api.put(`/api/campaigns/${cid}`, payload);
      else { const r = await api.post('/api/campaigns', payload); cid = r.campaign.id; setCampaignId(cid); }
      if (!quiet) toast('success', 'Draft saved.');
      return cid;
    } catch (e: any) { toast('error', e.message); return null; } finally { setBusy(false); }
  };

  const launch = async () => {
    if (firstProblem) { setStep(Number(firstProblem[0])); toast('error', firstProblem[1]!); return; }
    const cid = await save(true);
    if (!cid) return;
    setBusy(true);
    try {
      if (existing.data?.campaign.status === 'paused') {
        await api.post(`/api/campaigns/${cid}/resume`);
        toast('success', 'Changes saved and campaign resumed.');
      } else {
        const r = await api.post(`/api/campaigns/${cid}/launch`);
        toast('success', r.message);
      }
      nav(`/campaigns/${cid}`);
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); setConfirmLaunch(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    try { const r = await api.post('/api/campaigns/test', { ...payload, to: testTo }); toast('success', r.message); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const pickTemplate = (t: Template | null) => set({ template_id: t?.id ?? null, subject: t?.subject || d.subject, preheader: t?.preheader || d.preheader, blocks: t ? t.blocks : [], name: d.name || t?.name || '' });

  const rule = payload.recurrence;
  const choice = (active: boolean) => `flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`;

  return (
    <div className="space-y-6">
      <Link to="/campaigns" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />All campaigns</Link>
      <PageHeader title={campaignId ? `Edit: ${d.name || 'campaign'}` : 'New campaign'} subtitle="Eight quick steps. Your work is saved as a draft whenever you click Save."
        actions={<button className="btn-secondary" onClick={() => save()} disabled={busy}><Save className="h-4 w-4" />Save draft</button>} />

      {/* Step bar */}
      <div className="card overflow-x-auto p-3">
        <ol className="flex min-w-max gap-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => setStep(i)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${i === step ? 'bg-brand-500 text-white' : i < step ? 'text-brand-700 hover:bg-brand-50' : 'text-slate-500 hover:bg-slate-50'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i === step ? 'bg-white/25' : i < step ? 'bg-brand-100' : 'bg-slate-100'}`}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>{s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {d.test_mode && (
        <Notice kind="warning" title="Test mode is ON">No customers will receive this campaign. It will only go to {isEmail ? d.test_email || '(enter a test email in step 7)' : d.test_phone || '(enter a test phone in step 7)'}.</Notice>
      )}

      {/* 1. Channel */}
      {step === 0 && (
        <Card title="1. What kind of campaign?">
          <div className="mb-5"><label className="label">Campaign name (only you see this)</label><input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Fall birthday party push" autoFocus /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button className={choice(isEmail)} onClick={() => set({ channel: 'email' })}>
              <Mail className="h-6 w-6 flex-none text-brand-600" /><span><span className="block font-semibold">Email</span><span className="text-sm text-slate-500">A branded email with images, buttons and your party packages.</span></span>
            </button>
            <button className={choice(!isEmail)} onClick={() => settings.sms_enabled && set({ channel: 'sms' })} disabled={!settings.sms_enabled}>
              <MessageSquare className="h-6 w-6 flex-none text-violet-600" /><span><span className="block font-semibold">Text message (SMS)</span>
                <span className="text-sm text-slate-500">{settings.sms_enabled ? 'A short text, sent only to customers who agreed to texts.' : 'Switched off in Settings.'}</span></span>
            </button>
          </div>
        </Card>
      )}

      {/* 2. Template */}
      {step === 1 && (
        <Card title="2. Start from a template">
          {isEmail ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templatesQ.data?.templates.map((t) => (
                <button key={t.id} className={choice(d.template_id === t.id)} onClick={() => pickTemplate(t)}>
                  <FileText className="h-5 w-5 flex-none text-brand-600" /><span><span className="block font-semibold">{t.name}</span><span className="text-xs text-slate-500">{t.description}</span></span>
                </button>
              ))}
              <button className={choice(d.template_id === null && d.blocks.length === 0)} onClick={() => pickTemplate(null)}>
                <FileText className="h-5 w-5 flex-none text-slate-400" /><span><span className="block font-semibold">Start blank</span><span className="text-xs text-slate-500">Build your own from blocks.</span></span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Pick a starter text (you can change it in the next step) or write your own.</p>
              {SMS_STARTERS.map((s) => <button key={s} className={choice(d.sms_body === s) + ' w-full'} onClick={() => set({ sms_body: s })}><MessageSquare className="h-5 w-5 flex-none text-violet-500" /><span className="text-sm">{s}</span></button>)}
            </div>
          )}
          {isEmail && d.template_id && d.blocks.length > 0 && <p className="help mt-3">Picking another template replaces the content of this campaign. Templates themselves are never changed by campaigns.</p>}
        </Card>
      )}

      {/* 3. Content */}
      {step === 2 && isEmail && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-4">
            <Card title="3. Content">
              <div className="space-y-4">
                <div><label className="label">Subject line</label><input className="input" value={d.subject} onChange={(e) => set({ subject: e.target.value })} /></div>
                <div><label className="label">Preview text</label><input className="input" value={d.preheader} onChange={(e) => set({ preheader: e.target.value })} placeholder="Shown after the subject in most inboxes" /></div>
                <MergeTags />
              </div>
            </Card>
            <BlockEditor blocks={d.blocks} onChange={(blocks) => set({ blocks })} plans={settings.plans} textUsNumber={settings.sms_text_us_number} />
          </div>
          <div className="xl:sticky xl:top-20 xl:self-start"><EmailPreview subject={d.subject} preheader={d.preheader} blocks={d.blocks} /></div>
        </div>
      )}
      {step === 2 && !isEmail && (
        <Card title="3. Your text message">
          <textarea className="input font-mono" rows={5} value={d.sms_body} onChange={(e) => set({ sms_body: e.target.value })} />
          <SmsMeter body={d.sms_body} settings={settings} />
          <div className="mt-3"><MergeTags /></div>
        </Card>
      )}

      {/* 4. Customers */}
      {step === 3 && (
        <Card title="4. Who should get it?">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button className={choice(d.audience.type === 'all')} onClick={() => set({ audience: { type: 'all' } })}><Users className="h-5 w-5 flex-none text-brand-600" /><span><span className="block font-semibold">All customers</span><span className="text-xs text-slate-500">Everyone who can be {isEmail ? 'emailed' : 'texted'}.</span></span></button>
            <button className={choice(d.audience.type === 'filters')} onClick={() => set({ audience: { type: 'filters', filters: d.audience.filters || {} } })}><Filter className="h-5 w-5 flex-none text-brand-600" /><span><span className="block font-semibold">Filtered</span><span className="text-xs text-slate-500">By city, source, when they were added…</span></span></button>
            <button className={choice(d.audience.type === 'groups')} onClick={() => set({ audience: { type: 'groups', groupIds: d.audience.groupIds || [] } })}><FolderHeart className="h-5 w-5 flex-none text-brand-600" /><span><span className="block font-semibold">Specific groups</span><span className="text-xs text-slate-500">One or more of your saved groups.</span></span></button>
          </div>
          {d.audience.type === 'filters' && (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {([['search', 'Name or email contains', 'text'], ['city', 'City is', 'text'], ['addedWithinDays', 'Added in the last … days', 'number'], ['notEmailedWithinDays', 'Not emailed in the last … days', 'number']] as const).map(([k, l, t]) => (
                <div key={k}><label className="label">{l}</label><input className="input" type={t} value={(d.audience.filters as any)?.[k] ?? ''} onChange={(e) => set({ audience: { ...d.audience, filters: { ...d.audience.filters, [k]: t === 'number' ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value } } })} /></div>
              ))}
              <div><label className="label">Came from</label><select className="input" value={d.audience.filters?.source || ''} onChange={(e) => set({ audience: { ...d.audience, filters: { ...d.audience.filters, source: e.target.value || undefined } } })}>
                <option value="">Anywhere</option><option value="manual">Added by hand</option><option value="csv">CSV import</option><option value="wave">Wave</option></select></div>
            </div>
          )}
          {d.audience.type === 'groups' && (
            <div className="mt-5 space-y-2">
              {groupsQ.data?.groups.length === 0 && <p className="text-sm text-slate-500">You don't have any groups yet. <Link className="text-brand-600 underline" to="/groups">Create one</Link>.</p>}
              {groupsQ.data?.groups.map((g) => {
                const on = d.audience.groupIds?.includes(g.id);
                return (
                  <label key={g.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50">
                    <input type="checkbox" checked={!!on} onChange={() => set({ audience: { type: 'groups', groupIds: on ? d.audience.groupIds!.filter((x) => x !== g.id) : [...(d.audience.groupIds || []), g.id] } })} />
                    <span className="flex-1 font-medium">{g.name}</span>
                    <span className="text-xs text-slate-500">{isEmail ? `${g.emailable_count} can be emailed` : `${g.textable_count} can be texted`} · {g.member_count} members</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-5 rounded-2xl bg-night-900 p-4 text-white">
            <div className="text-3xl font-bold">{estimate ? num(estimate.recipients) : '…'}</div>
            <div className="text-sm text-slate-300">customer{estimate?.recipients === 1 ? '' : 's'} will get this {isEmail ? 'email' : 'text'} right now. Unsubscribed, suppressed and disabled customers are always left out{isEmail ? '' : ', and only people who agreed to texts are included'}. On each sending day the list is rebuilt, so new matching customers are added automatically.</div>
          </div>
        </Card>
      )}

      {/* 5. Schedule */}
      {step === 4 && (
        <Card title="5. When should it send?">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div><label className="label">How often</label>
                <select className="input" value={rule.type} onChange={(e) => setRule({ type: e.target.value as any, end: { type: 'never' } })}>
                  <option value="once">Once</option><option value="daily">Every few days</option><option value="weekly">On certain weekdays</option><option value="monthly">On a day of the month</option>
                </select></div>
              <div><label className="label">{rule.type === 'once' ? 'Send on' : 'First send'}</label><input className="input" type="date" min={today} value={rule.startDate} onChange={(e) => setRule({ startDate: e.target.value })} /></div>
              {rule.type !== 'once' && (
                <div><label className="label">Repeat every</label>
                  <div className="flex items-center gap-2"><input className="input w-24" type="number" min={1} max={365} value={rule.interval} onChange={(e) => setRule({ interval: Number(e.target.value) })} />
                    <span className="text-sm text-slate-600">{rule.type === 'daily' ? 'day(s)' : rule.type === 'weekly' ? 'week(s)' : 'month(s)'}</span></div></div>
              )}
              {rule.type === 'weekly' && (
                <div><label className="label">On these days</label>
                  <div className="flex flex-wrap gap-1">{WEEKDAYS.map((w, i) => {
                    const on = rule.weekdays?.includes(i);
                    return <button key={w} type="button" onClick={() => setRule({ weekdays: on ? (rule.weekdays || []).filter((x) => x !== i) : [...(rule.weekdays || []), i] })}
                      className={`h-10 w-12 rounded-xl text-sm font-semibold ${on ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{w}</button>;
                  })}</div></div>
              )}
              {rule.type === 'monthly' && (
                <div><label className="label">Day of the month</label><input className="input w-24" type="number" min={1} max={31} value={rule.monthDay} onChange={(e) => setRule({ monthDay: Number(e.target.value) })} />
                  {(rule.monthDay || 0) > 28 && <p className="help">In shorter months it sends on the last day instead, then goes back to the {rule.monthDay}th.</p>}</div>
              )}
              {rule.type !== 'once' && (
                <div><label className="label">Keep repeating</label>
                  <select className="input" value={rule.end?.type || 'never'} onChange={(e) => {
                    const t = e.target.value;
                    setRule({ end: t === 'count' ? { type: 'count', count: 6 } : t === 'until' ? { type: 'until', date: rule.startDate } : { type: 'never' } });
                  }}><option value="never">Until I stop it</option><option value="count">For a number of sends</option><option value="until">Until a date</option></select>
                  {rule.end?.type === 'count' && <div className="mt-2 flex items-center gap-2"><input className="input w-24" type="number" min={1} value={rule.end.count} onChange={(e) => setRule({ end: { type: 'count', count: Number(e.target.value) } })} /><span className="text-sm text-slate-600">sends</span></div>}
                  {rule.end?.type === 'until' && <input className="input mt-2" type="date" min={rule.startDate} value={rule.end.date} onChange={(e) => setRule({ end: { type: 'until', date: e.target.value } })} />}
                </div>
              )}
              <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900"><strong>{describeRecurrence(rule)}.</strong> Sending starts at {settings.send_time} ({settings.timezone}) on each sending day, at up to {isEmail ? settings.daily_limit : settings.sms_daily_limit} {isEmail ? 'emails' : 'texts'} a day.</div>
            </div>
            <div><div className="label">Sending calendar</div><SendCalendar rule={rule} today={today} /></div>
          </div>
        </Card>
      )}

      {/* 6. Sender */}
      {step === 5 && (
        <Card title="6. Who is it from?">
          {isEmail ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div><label className="label">From name</label><input className="input" value={d.from_name} onChange={(e) => set({ from_name: e.target.value })} placeholder={settings.from_name} /></div>
              <div><label className="label">From address</label><input className="input" type="email" value={d.from_email} onChange={(e) => set({ from_email: e.target.value })} placeholder={settings.from_email} />
                <p className="help">Must be on your verified sending domain.</p></div>
              <div><label className="label">Replies go to</label><input className="input" type="email" value={d.reply_to} onChange={(e) => set({ reply_to: e.target.value })} placeholder={settings.reply_to || 'same as From'} /></div>
              <p className="md:col-span-3 text-sm text-slate-500">Leave these blank to use the defaults from Settings.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Texts are sent from your Twilio number (set up on the Integrations page). Every text starts with "{settings.short_name}:" unless you mention your name, and ends with "{settings.sms_opt_out_text}" unless it already says how to stop.</p>
          )}
        </Card>
      )}

      {/* 7. Test mode */}
      {step === 6 && (
        <Card title="7. Test mode">
          <Toggle checked={d.test_mode} onChange={(v) => set({ test_mode: v })} label="Test mode: send only to me"
            help="When this is on, launching the campaign sends it once to the address below and nobody else. Great for checking everything before the real thing." />
          {d.test_mode && (
            <div className="mt-4 max-w-md">
              {isEmail ? <><label className="label">Test email address</label><input className="input" type="email" value={d.test_email} onChange={(e) => set({ test_email: e.target.value })} placeholder="you@example.com" /></>
                : <><label className="label">Test mobile number</label><input className="input" value={d.test_phone} onChange={(e) => set({ test_phone: e.target.value })} placeholder="+1 555 123 4567" /></>}
            </div>
          )}
        </Card>
      )}

      {/* 8. Review */}
      {step === 7 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="8. Review" className="lg:col-span-2">
            {estimate?.warnings?.map((w: string) => <div key={w} className="mb-3"><Notice kind="warning">{w}</Notice></div>)}
            {firstProblem && <div className="mb-3"><Notice kind="error">Step {Number(firstProblem[0]) + 1}: {firstProblem[1]}</Notice></div>}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Campaign" value={d.name} />
              <Item label="Channel" value={isEmail ? 'Email' : 'Text message'} />
              <Item label="Recipients" value={d.test_mode ? `Test only: ${isEmail ? d.test_email : d.test_phone}` : `${num(estimate?.recipients)} customers`} />
              <Item label="Daily limit" value={`${estimate?.limit ?? '…'} per day (${estimate?.alreadyToday ?? 0} already sent today)`} />
              <Item label="Estimated time" value={d.test_mode ? 'Immediately' : estimate ? `${estimate.estimatedDays} sending day${estimate.estimatedDays === 1 ? '' : 's'} per pass` : '…'} />
              <Item label="Schedule" value={describeRecurrence(rule)} />
              {isEmail && <Item label="From" value={estimate?.from} />}
              {isEmail && <Item label="Reply-to" value={estimate?.replyTo || '—'} />}
              {isEmail ? <Item label="Subject" value={d.subject} wide /> : <Item label="Message" value={d.sms_body} wide />}
              {!d.test_mode && estimate?.upcoming?.length > 0 && <Item label="Next sending days" value={estimate.upcoming.slice(0, 6).map((o: any) => fmtDate(o.date)).join(' · ')} wide />}
            </dl>
          </Card>
          <div className="space-y-4">
            <Card title="Send a test">
              <input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={isEmail ? 'you@example.com' : '+1 555 123 4567'} />
              <button className="btn-secondary mt-2 w-full" disabled={!testTo || busy} onClick={sendTest}><FlaskConical className="h-4 w-4" />Send test</button>
              <p className="help">Goes only to this {isEmail ? 'address' : 'number'}, marked TEST.</p>
            </Card>
            <button className="btn-primary w-full !py-3 text-base" disabled={busy || !!firstProblem} onClick={() => setConfirmLaunch(true)}>
              {busy ? <Spinner className="!h-5 !w-5 !text-white" /> : d.test_mode ? <Send className="h-5 w-5" /> : <Rocket className="h-5 w-5" />}
              {existing.data?.campaign.status === 'paused' ? 'Save & resume' : d.test_mode ? 'Send test-mode campaign' : 'Launch campaign'}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" />Back</button>
        {step < STEPS.length - 1 && <button className="btn-primary" onClick={() => { if (problems[step]) { toast('error', problems[step]!); return; } setStep(step + 1); }}>Next: {STEPS[step + 1]}<ArrowRight className="h-4 w-4" /></button>}
      </div>

      <Confirm open={confirmLaunch} title={d.test_mode ? 'Send the test-mode campaign?' : 'Launch this campaign?'} busy={busy} confirmLabel={d.test_mode ? 'Send test' : 'Launch'}
        onClose={() => setConfirmLaunch(false)} onConfirm={launch}>
        {d.test_mode
          ? <>This sends the campaign once to <strong>{isEmail ? d.test_email : d.test_phone}</strong>. No customers will receive it.</>
          : <>About <strong>{num(estimate?.recipients)}</strong> customers will get this {isEmail ? 'email' : 'text'}, starting {rule.startDate === today ? 'today' : fmtDate(rule.startDate)} at {settings.send_time}, up to {estimate?.limit} a day. You can pause or cancel at any time.</>}
      </Confirm>
    </div>
  );
}

function Item({ label, value, wide }: { label: string; value: any; wide?: boolean }) {
  return <div className={wide ? 'sm:col-span-2' : ''}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{value || '—'}</dd></div>;
}

function SmsMeter({ body, settings }: { body: string; settings: Settings }) {
  let full = body.trim();
  if (full && !/\bstop\b/i.test(full)) full += `\n${settings.sms_opt_out_text}`;
  if (full && !full.toLowerCase().includes(settings.short_name.toLowerCase()) && !full.toLowerCase().includes(settings.company_name.toLowerCase())) full = `${settings.short_name}: ${full}`;
  const unicode = /[^\x00-\x7F]/.test(full);
  const per = unicode ? 67 : 153;
  const segments = full.length <= (unicode ? 70 : 160) ? 1 : Math.ceil(full.length / per);
  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs text-slate-500">{full.length} characters · {segments} text segment{segments === 1 ? '' : 's'} per person{unicode ? ' (emoji/special characters make texts shorter)' : ''}</div>
      {full && <div className="max-w-sm whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 text-sm text-slate-800">{full.replace(/\{\{\s*first_name\s*(\|[^}]*)?\}\}/g, 'Alex')}</div>}
      <p className="help">This is how the text will look. The opt-out line is added automatically if you don't include one.</p>
    </div>
  );
}
