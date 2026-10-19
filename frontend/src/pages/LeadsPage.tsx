import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Phone, Mail, Search } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Loading, ErrorBox, Empty, StatusBadge, Modal, useToast } from '../components/ui';
import { fmtDateTime, fullName } from '../lib/format';

const STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['quoted', 'Quoted'], ['won', 'Won'], ['lost', 'Lost']];

export default function LeadsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useApi(`/api/leads${qs({ status, q })}`);
  const [open, setOpen] = useState<any>(null);
  const [notes, setNotes] = useState('');

  const update = async (id: number, body: any) => {
    try { await api.put(`/api/leads/${id}`, body); reload(true); } catch (e: any) { toast('error', e.message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Leads" subtitle="Everyone who clicked an offer button in your emails. Follow up while they're interested!" />
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <button onClick={() => setStatus('')} className={`card p-4 text-left ${status === '' ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="text-xs font-semibold uppercase text-slate-500">All</div><div className="text-2xl font-bold">{Object.values(data.counts as Record<string, number>).reduce((a, b) => a + b, 0)}</div></button>
          {STAGES.map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`card p-4 text-left ${status === k ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="text-xs font-semibold uppercase text-slate-500">{l}</div><div className="text-2xl font-bold">{data.counts[k]}</div></button>
          ))}
        </div>
      )}
      <div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="input !pl-9" placeholder="Search leads…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <ErrorBox error={error} onRetry={() => reload()} />}
      {loading && !data ? <Loading /> : data.leads.length === 0 ? (
        <div className="card"><Empty icon={<Target className="h-10 w-10" />} title="No leads here yet">When a customer clicks a button like "Book a party", they show up here so you can follow up.</Empty></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr><th className="th">Customer</th><th className="th">Interested in</th><th className="th">Campaign</th><th className="th">Clicked</th><th className="th">Stage</th><th className="th">Notes</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.leads.map((l: any) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="td">
                    {l.customer_id ? <Link to={`/customers/${l.customer_id}`} className="font-medium text-slate-900 hover:text-brand-600">{fullName(l)}</Link> : 'Deleted customer'}
                    <div className="flex gap-3 text-xs text-slate-500">
                      {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 hover:text-brand-600"><Mail className="h-3 w-3" />{l.email}</a>}
                      {l.phone && <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 hover:text-brand-600"><Phone className="h-3 w-3" />{l.phone}</a>}
                    </div>
                  </td>
                  <td className="td font-medium">{l.label}{l.click_count > 1 && <span className="ml-1 text-xs text-slate-400">×{l.click_count}</span>}</td>
                  <td className="td">{l.campaign_name ? <Link to={`/campaigns/${l.campaign_id}`} className="hover:text-brand-600">{l.campaign_name}</Link> : '—'}</td>
                  <td className="td whitespace-nowrap">{fmtDateTime(l.last_clicked_at)}</td>
                  <td className="td">
                    <select className="input !w-32 !py-1" value={l.status} onChange={(e) => update(l.id, { status: e.target.value })}>{STAGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </td>
                  <td className="td"><button className="text-left text-xs text-slate-500 hover:text-brand-600" onClick={() => { setOpen(l); setNotes(l.notes || ''); }}>{l.notes ? l.notes.slice(0, 40) + (l.notes.length > 40 ? '…' : '') : '+ Add note'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Notes: ${fullName(open)}` : ''}
        footer={<><button className="btn-secondary" onClick={() => setOpen(null)}>Cancel</button><button className="btn-primary" onClick={async () => { await update(open.id, { notes }); setOpen(null); }}>Save notes</button></>}>
        {open && <div className="mb-3 flex items-center gap-2 text-sm"><StatusBadge status={open.status} />{open.label}</div>}
        <textarea className="input" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called Tuesday, wants a Saturday party for 12 kids" />
      </Modal>
    </div>
  );
}
