import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Mail, MessageSquare, Eye, MousePointerClick } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Badge, StatusBadge, Confirm, Toggle, useToast, Empty } from '../components/ui';
import CustomerForm from '../components/CustomerForm';
import { fmtDate, fmtDateTime, fullName } from '../lib/format';

export default function CustomerProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/api/customers/${id}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;
  const { customer: c, history, groups, leads } = data;

  const patch = async (body: any, msg: string) => {
    try { await api.put(`/api/customers/${c.id}`, body); toast('success', msg); reload(true); } catch (e: any) { toast('error', e.message); }
  };
  const suppress = async (v: boolean) => {
    try { await api.post(`/api/customers/${c.id}/suppression`, { suppressed: v }); toast('success', v ? 'Added to the suppression list.' : 'Removed from the suppression list.'); reload(true); } catch (e: any) { toast('error', e.message); }
  };
  const del = async () => {
    try { await api.del(`/api/customers/${c.id}`); toast('success', 'Customer deleted.'); nav('/customers'); } catch (e: any) { toast('error', e.message); }
  };

  const Row = ({ label, value }: { label: string; value: any }) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><span className="text-slate-500">{label}</span><span className="text-right text-slate-800">{value || <span className="text-slate-400">—</span>}</span></div>
  );

  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />All customers</Link>
      <PageHeader title={fullName(c)} subtitle={<span className="flex flex-wrap gap-1">
        {c.unsubscribed && <Badge color="yellow">Unsubscribed</Badge>}
        {c.suppressed && <Badge color="red">Suppressed</Badge>}
        {c.disabled && <Badge>Disabled</Badge>}
        {c.sms_consent && <Badge color="purple">Agreed to texts</Badge>}
        {c.sms_opted_out && <Badge color="red">Replied STOP</Badge>}
        <Badge color="blue">Source: {c.source === 'csv' ? 'CSV import' : c.source === 'wave' ? 'Wave' : 'added by hand'}</Badge>
      </span>}
        actions={<>
          <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button>
          <button className="btn-secondary !text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</button>
        </>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Details">
          <Row label="Email" value={c.email} />
          <Row label="Phone" value={c.phone} />
          <Row label="Company" value={c.company_name} />
          <Row label="Address" value={[c.address_line, c.city, c.state, c.postal_code].filter(Boolean).join(', ')} />
          <Row label="Added" value={fmtDate(c.created_at)} />
          <Row label="Last emailed" value={fmtDateTime(c.last_emailed_at)} />
          {c.external_id && <Row label="Wave ID" value={<span className="font-mono text-xs">{c.external_id}</span>} />}
          {c.notes && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{c.notes}</div>}
        </Card>
        <Card title="Permissions">
          <div className="space-y-4">
            <Toggle checked={!c.disabled} onChange={(v) => patch({ disabled: !v }, v ? 'Customer enabled.' : 'Customer disabled. They won\'t get any messages.')} label="Active" help="Disabled customers never receive emails or texts." />
            <Toggle checked={!c.unsubscribed} onChange={(v) => patch({ unsubscribed: !v }, v ? 'Re-subscribed.' : 'Unsubscribed from emails.')} label="Subscribed to emails" help="Only re-subscribe someone if they asked you to." />
            <Toggle checked={c.sms_consent} onChange={(v) => patch({ sms_consent: v }, v ? 'Texting consent recorded.' : 'Texting consent removed.')} label="Agreed to texts" help="Required before we send any text message." />
            {c.email && <Toggle checked={!c.suppressed} onChange={(v) => suppress(!v)} label="Email address is deliverable" help="Switched off automatically when an email hard-bounces or the person marks it as spam." />}
          </div>
        </Card>
        <Card title="Groups & leads">
          <div className="mb-4 flex flex-wrap gap-1">
            {groups.length === 0 ? <span className="text-sm text-slate-500">Not in any group.</span> : groups.map((g: any) => <Link key={g.id} to={`/groups/${g.id}`}><Badge color="green">{g.name}</Badge></Link>)}
          </div>
          {leads.length === 0 ? <div className="text-sm text-slate-500">No leads yet.</div> : leads.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm">
              <div><div className="font-medium">{l.label}</div><div className="text-xs text-slate-500">{l.campaign_name} · {fmtDate(l.created_at)}</div></div>
              <StatusBadge status={l.status} />
            </div>
          ))}
        </Card>
      </div>

      <Card title="Message history" padded={false}>
        {history.length === 0 ? <Empty icon={<Mail className="h-10 w-10" />} title="No messages yet">Emails and texts sent to this customer will show up here.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50"><tr><th className="th">Campaign</th><th className="th">Status</th><th className="th">Sent</th><th className="th">Delivered</th><th className="th">Opened</th><th className="th">Clicked</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h: any) => (
                  <tr key={h.id}>
                    <td className="td"><Link className="font-medium text-slate-900 hover:text-brand-600" to={`/campaigns/${h.campaign_id}`}>
                      {h.channel === 'sms' ? <MessageSquare className="mr-1 inline h-4 w-4 text-violet-500" /> : <Mail className="mr-1 inline h-4 w-4 text-brand-500" />}{h.campaign_name}</Link>
                      {h.occurrence > 1 && <span className="ml-1 text-xs text-slate-400">pass {h.occurrence}</span>}
                      {h.last_error && h.status !== 'sent' && <div className="text-xs text-slate-500">{h.last_error}</div>}
                    </td>
                    <td className="td"><StatusBadge status={h.status} /></td>
                    <td className="td whitespace-nowrap">{fmtDateTime(h.sent_at)}</td>
                    <td className="td whitespace-nowrap">{fmtDateTime(h.delivered_at)}</td>
                    <td className="td whitespace-nowrap">{h.opened_at ? <span className="text-brand-700"><Eye className="mr-1 inline h-3.5 w-3.5" />{fmtDateTime(h.opened_at)}</span> : '—'}</td>
                    <td className="td whitespace-nowrap">{h.clicked_at ? <span className="text-brand-700"><MousePointerClick className="mr-1 inline h-3.5 w-3.5" />{fmtDateTime(h.clicked_at)}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <CustomerForm open customer={c} onClose={() => setEditing(false)} onSaved={() => reload(true)} />}
      <Confirm open={deleting} danger title="Delete this customer?" confirmLabel="Delete" onClose={() => setDeleting(false)} onConfirm={del}>
        This removes {fullName(c)} and their message history for good. If you just want to stop messaging them, switch off "Active" instead.
      </Confirm>
    </div>
  );
}
