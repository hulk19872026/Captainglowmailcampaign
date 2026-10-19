import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, UserPlus, X, Search, Pencil } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Badge, StatusBadge, Confirm, Modal, useToast, Empty, Stat } from '../components/ui';
import { fullName, num } from '../lib/format';
import type { Customer } from '../lib/types';

export default function GroupDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/api/groups/${id}`);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;
  const { group: g, members, campaigns } = data;

  const remove = async (cid: number) => {
    try { await api.del(`/api/groups/${g.id}/members/${cid}`); reload(true); } catch (e: any) { toast('error', e.message); }
  };
  const del = async () => {
    try { await api.del(`/api/groups/${g.id}`); toast('success', 'Group deleted. The customers themselves were kept.'); nav('/groups'); }
    catch (e: any) { toast('error', e.message); setDeleting(false); }
  };
  const save = async () => {
    try { await api.put(`/api/groups/${g.id}`, form); setEditing(false); reload(true); } catch (e: any) { toast('error', e.message); }
  };

  return (
    <div className="space-y-6">
      <Link to="/groups" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />All groups</Link>
      <PageHeader title={g.name} subtitle={g.description}
        actions={<>
          <button className="btn-secondary" onClick={() => { setForm({ name: g.name, description: g.description || '' }); setEditing(true); }}><Pencil className="h-4 w-4" />Rename</button>
          <button className="btn-secondary !text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete group</button>
          <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add people</button>
        </>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Members" value={num(g.member_count)} />
        <Stat label="Can be emailed" value={num(g.emailable_count)} hint="Not unsubscribed, suppressed or disabled" />
        <Stat label="Can be texted" value={num(g.textable_count)} hint="Has a phone and agreed to texts" />
      </div>
      {campaigns.length > 0 && (
        <Card title="Campaigns using this group">
          <div className="flex flex-wrap gap-2">{campaigns.map((c: any) => <Link key={c.id} to={`/campaigns/${c.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">{c.name}<StatusBadge status={c.status} /></Link>)}</div>
        </Card>
      )}
      <Card title="Members" padded={false}>
        {members.length === 0 ? <Empty title="This group is empty">Click "Add people", or select customers on the Customers page and choose "Add to group".</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Phone</th><th className="th">Status</th><th className="th w-10"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="td font-medium"><Link to={`/customers/${m.id}`} className="hover:text-brand-600">{fullName(m)}</Link></td>
                    <td className="td">{m.email || '—'}</td>
                    <td className="td">{m.phone || '—'}</td>
                    <td className="td"><div className="flex flex-wrap gap-1">
                      {m.unsubscribed && <Badge color="yellow">Unsubscribed</Badge>}{m.suppressed && <Badge color="red">Suppressed</Badge>}
                      {m.disabled && <Badge>Disabled</Badge>}{m.sms_consent && <Badge color="purple">Texts OK</Badge>}
                    </div></td>
                    <td className="td"><button className="btn-ghost !p-1" title="Remove from group" onClick={() => remove(m.id)}><X className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <AddPeople groupId={g.id} memberIds={new Set(members.map((m: any) => m.id))} onClose={() => setAdding(false)} onAdded={() => reload(true)} />}
      <Confirm open={deleting} danger title="Delete this group?" confirmLabel="Delete group" onClose={() => setDeleting(false)} onConfirm={del}>
        The customers stay in your list; only the group is removed. A group can't be deleted while a draft, running or paused campaign still uses it.
      </Confirm>
      <Modal open={editing} onClose={() => setEditing(false)} title="Rename group" footer={<><button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

function AddPeople({ groupId, memberIds, onClose, onAdded }: { groupId: number; memberIds: Set<number>; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Customer[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  useEffect(() => {
    const t = setTimeout(() => api.get(`/api/customers${qs({ q, pageSize: 50, sort: 'name', dir: 'asc' })}`).then((d) => setRows(d.rows)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const add = async () => {
    try {
      const d = await api.post(`/api/groups/${groupId}/members`, { customerIds: [...picked] });
      toast('success', `Added ${d.added} customer${d.added === 1 ? '' : 's'}.`);
      onAdded(); onClose();
    } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open onClose={onClose} title="Add people to this group" wide
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!picked.size} onClick={add}>Add {picked.size || ''}</button></>}>
      <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input !pl-9" placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {rows.map((c) => {
          const inGroup = memberIds.has(c.id);
          return (
            <label key={c.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 ${inGroup ? 'opacity-50' : ''}`}>
              <input type="checkbox" disabled={inGroup} checked={inGroup || picked.has(c.id)} onChange={() => { const s = new Set(picked); s.has(c.id) ? s.delete(c.id) : s.add(c.id); setPicked(s); }} />
              <span className="flex-1"><span className="font-medium">{fullName(c)}</span> <span className="text-slate-500">{c.email}</span></span>
              {inGroup && <span className="text-xs text-slate-400">already in group</span>}
            </label>
          );
        })}
        {rows.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No customers match.</div>}
      </div>
      <p className="help mt-2">Tip: to add lots of people at once, use the filters and "Select all matching" on the Customers page, then "Add to group".</p>
    </Modal>
  );
}
