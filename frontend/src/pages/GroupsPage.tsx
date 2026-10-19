import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderHeart, Mail, MessageSquare, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Loading, ErrorBox, Empty, Modal, useToast } from '../components/ui';
import { fmtDate, num } from '../lib/format';
import type { Group } from '../lib/types';

export default function GroupsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ groups: Group[] }>('/api/groups');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const create = async () => {
    try {
      await api.post('/api/groups', { name, description: desc });
      toast('success', 'Group created. Add people from the group page or with "Add to group" on Customers.');
      setOpen(false); setName(''); setDesc('');
      reload(true);
    } catch (e: any) { toast('error', e.message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Customer groups" subtitle="Saved lists of customers you can send campaigns to, like past party hosts or league players."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New group</button>} />
      {error && <ErrorBox error={error} onRetry={() => reload()} />}
      {loading && !data ? <Loading /> : data?.groups.length === 0 ? (
        <div className="card"><Empty icon={<FolderHeart className="h-10 w-10" />} title="No groups yet">Create a group, then add customers to it. You can target a group when you set up a campaign.</Empty></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="card block p-5 transition hover:shadow-glow">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-900">{g.name}</div>
                <FolderHeart className="h-5 w-5 text-brand-500" />
              </div>
              {g.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{g.description}</p>}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-slate-50 p-2"><Users className="mx-auto mb-1 h-4 w-4 text-slate-400" /><div className="text-lg font-bold text-slate-800">{num(g.member_count)}</div>members</div>
                <div className="rounded-xl bg-brand-50 p-2"><Mail className="mx-auto mb-1 h-4 w-4 text-brand-500" /><div className="text-lg font-bold text-brand-700">{num(g.emailable_count)}</div>can email</div>
                <div className="rounded-xl bg-violet-50 p-2"><MessageSquare className="mx-auto mb-1 h-4 w-4 text-violet-500" /><div className="text-lg font-bold text-violet-700">{num(g.textable_count)}</div>can text</div>
              </div>
              <div className="mt-3 text-xs text-slate-400">Updated {fmtDate(g.updated_at)}</div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New group"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={!name.trim()} onClick={create}>Create group</button></>}>
        <div className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Birthday party hosts" autoFocus /></div>
          <div><label className="label">Description (optional)</label><textarea className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
      </Modal>
    </div>
  );
}
