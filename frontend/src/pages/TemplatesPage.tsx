import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, LayoutTemplate, Copy, Trash2, Pencil, Send, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Loading, ErrorBox, Empty, Confirm, useToast, Badge } from '../components/ui';
import { fmtDate } from '../lib/format';
import type { Template } from '../lib/types';

export default function TemplatesPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ templates: Template[] }>('/api/templates');
  const [del, setDel] = useState<Template | null>(null);

  const duplicate = async (t: Template) => {
    try { const d = await api.post(`/api/templates/${t.id}/duplicate`); nav(`/templates/${d.template.id}`); } catch (e: any) { toast('error', e.message); }
  };
  const remove = async () => {
    if (!del) return;
    try { await api.del(`/api/templates/${del.id}`); toast('success', 'Template deleted.'); setDel(null); reload(true); } catch (e: any) { toast('error', e.message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Email templates" subtitle="Reusable email designs. Pick one when you create a campaign and change whatever you like."
        actions={<Link to="/templates/new" className="btn-primary"><Plus className="h-4 w-4" />New template</Link>} />
      {error && <ErrorBox error={error} onRetry={() => reload()} />}
      {loading && !data ? <Loading /> : data?.templates.length === 0 ? (
        <div className="card"><Empty icon={<LayoutTemplate className="h-10 w-10" />} title="No templates yet" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.templates.map((t) => (
            <div key={t.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/templates/${t.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{t.name}</Link>
                {t.is_starter && <Badge color="green"><Sparkles className="h-3 w-3" />Starter</Badge>}
              </div>
              <div className="mt-1 text-sm text-slate-500">{t.description}</div>
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><span className="font-semibold">Subject:</span> {t.subject || '—'}</div>
              <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
                <Link to={`/campaigns/new?template=${t.id}`} className="btn-primary !px-3 !py-1.5"><Send className="h-4 w-4" />Use</Link>
                <Link to={`/templates/${t.id}`} className="btn-ghost !px-2"><Pencil className="h-4 w-4" />Edit</Link>
                <button className="btn-ghost !px-2" onClick={() => duplicate(t)}><Copy className="h-4 w-4" />Copy</button>
                <button className="btn-ghost !px-2 !text-red-600" onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></button>
                <span className="ml-auto text-xs text-slate-400">{fmtDate(t.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Confirm open={!!del} danger title="Delete this template?" confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={remove}>
        Campaigns that already used "{del?.name}" keep their own copy of the content, so nothing already sent or scheduled changes.
      </Confirm>
    </div>
  );
}
