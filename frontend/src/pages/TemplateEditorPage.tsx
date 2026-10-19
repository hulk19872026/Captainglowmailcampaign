import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, useToast, Spinner, Modal } from '../components/ui';
import BlockEditor, { newBlock } from '../components/BlockEditor';
import EmailPreview from '../components/EmailPreview';
import MergeTags from '../components/MergeTags';
import type { Block, Settings } from '../lib/types';

export default function TemplateEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const isNew = !id;
  const tpl = useApi(isNew ? null : `/api/templates/${id}`);
  const settings = useApi<{ settings: Settings }>('/api/settings');
  const [form, setForm] = useState<{ name: string; description: string; subject: string; preheader: string; blocks: Block[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (isNew && settings.data && !form) {
      const plans = settings.data.settings.plans;
      setForm({ name: 'New template', description: '', subject: '', preheader: '', blocks: [newBlock('logo', plans), newBlock('headline', plans), newBlock('paragraph', plans), newBlock('button', plans)] });
    }
    if (!isNew && tpl.data && !form) {
      const t = tpl.data.template;
      setForm({ name: t.name, description: t.description || '', subject: t.subject, preheader: t.preheader, blocks: t.blocks });
    }
  }, [isNew, tpl.data, settings.data, form]);

  if (tpl.error) return <ErrorBox error={tpl.error} />;
  if (!form || !settings.data) return <Loading />;
  const s = settings.data.settings;

  const save = async () => {
    setBusy(true);
    try {
      if (isNew) { const d = await api.post('/api/templates', form); toast('success', 'Template saved.'); nav(`/templates/${d.template.id}`, { replace: true }); }
      else { await api.put(`/api/templates/${id}`, form); toast('success', 'Template saved.'); }
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  const sendTest = async () => {
    setBusy(true);
    try { const d = await api.post('/api/campaigns/test', { channel: 'email', to: testTo, ...form }); toast('success', d.message); setTestOpen(false); }
    catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Link to="/templates" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />All templates</Link>
      <PageHeader title={isNew ? 'New template' : form.name} subtitle="Build your email from blocks. The preview on the right updates as you type."
        actions={<>
          <button className="btn-secondary" onClick={() => setTestOpen(true)}><Send className="h-4 w-4" />Send test</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <Save className="h-4 w-4" />}Save template</button>
        </>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-4">
              <div><label className="label">Template name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">Description</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="When to use this template" /></div>
              <div><label className="label">Subject line</label><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div><label className="label">Preview text</label><input className="input" value={form.preheader} onChange={(e) => setForm({ ...form, preheader: e.target.value })} placeholder="The grey line shown after the subject in most inboxes" /></div>
              <MergeTags />
            </div>
          </Card>
          <BlockEditor blocks={form.blocks} onChange={(blocks) => setForm({ ...form, blocks })} plans={s.plans} textUsNumber={s.sms_text_us_number} />
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start"><EmailPreview subject={form.subject} preheader={form.preheader} blocks={form.blocks} /></div>
      </div>
      <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Send a test email"
        footer={<><button className="btn-secondary" onClick={() => setTestOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy || !testTo} onClick={sendTest}>Send test</button></>}>
        <label className="label">Send to</label>
        <input className="input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" autoFocus />
        <p className="help">Only this address gets the email, marked as a TEST. No customers receive it.</p>
      </Modal>
    </div>
  );
}
