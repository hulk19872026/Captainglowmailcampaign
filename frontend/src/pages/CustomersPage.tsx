import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Upload, Download, Search, Users, ChevronUp, ChevronDown, MessageSquare, Ban, MailX, ShieldAlert } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Badge, Empty, Modal, Confirm, useToast, Spinner, Toggle } from '../components/ui';
import CustomerForm from '../components/CustomerForm';
import { fmtDate, fullName, num } from '../lib/format';
import type { Customer, Group } from '../lib/types';

const FILTERS = [
  ['', 'Everyone'], ['active', 'Active (can be emailed)'], ['disabled', 'Disabled'], ['unsubscribed', 'Unsubscribed'],
  ['suppressed', 'Suppressed (bounced / complained)'], ['sms_consent', 'Agreed to texts'], ['phone_no_consent', 'Has a phone, no texting consent'],
  ['no_email', 'No email address'], ['never_emailed', 'Never emailed'],
];

export default function CustomersPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const query = {
    q: params.get('q') || '', filter: params.get('filter') || '', source: params.get('source') || '', group: params.get('group') || '',
    sort: params.get('sort') || 'created', dir: params.get('dir') || 'desc', page: Number(params.get('page') || 1),
  };
  const url = `/api/customers${qs(query)}`;
  const { data, error, loading, reload } = useApi<{ rows: Customer[]; total: number; page: number; pageSize: number }>(url);
  const groups = useApi<{ groups: Group[] }>('/api/groups');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [groupPick, setGroupPick] = useState(false);
  const [confirm, setConfirm] = useState<null | { action: string; title: string; text: string; danger?: boolean }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSelected(new Set()); setAllMatching(false); }, [url]);
  useEffect(() => {
    const t = setTimeout(() => { if (search !== query.q) update({ q: search, page: '' }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function update(p: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(p)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  }

  const rows = data?.rows || [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const s = new Set(selected);
    if (allOnPage) rows.forEach((r) => s.delete(r.id)); else rows.forEach((r) => s.add(r.id));
    setSelected(s);
    setAllMatching(false);
  };
  const count = allMatching ? data?.total || 0 : selected.size;

  const runBulk = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const body = allMatching ? { action, allMatching: true, query, ...extra } : { action, ids: [...selected], ...extra };
      const d = await api.post('/api/customers/bulk', body);
      toast('success', `Done: ${d.affected} customer${d.affected === 1 ? '' : 's'} updated.`);
      setSelected(new Set());
      setAllMatching(false);
      setConfirm(null);
      setGroupPick(false);
      reload(true);
      groups.reload(true);
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const sortBy = (k: string) => update({ sort: k, dir: query.sort === k && query.dir === 'asc' ? 'desc' : 'asc' });
  const SortHead = ({ k, children }: { k: string; children: string }) => (
    <th className="th cursor-pointer select-none" onClick={() => sortBy(k)}>
      <span className="inline-flex items-center gap-1">{children}{query.sort === k && (query.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
    </th>
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const exportUrl = `/api/customers/export.csv${qs({ ...query, page: undefined, sort: undefined, dir: undefined })}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" subtitle={data ? `${num(data.total)} customer${data.total === 1 ? '' : 's'} match` : 'Everyone you can market to'}
        actions={<>
          <a className="btn-secondary" href={exportUrl}><Download className="h-4 w-4" />Export CSV</a>
          <button className="btn-secondary" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Import CSV</button>
          <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add customer</button>
        </>} />

      <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input !pl-9" placeholder="Search name, email, phone, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input lg:w-64" value={query.filter} onChange={(e) => update({ filter: e.target.value, page: '' })}>
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input lg:w-40" value={query.source} onChange={(e) => update({ source: e.target.value, page: '' })}>
          <option value="">Any source</option><option value="manual">Added by hand</option><option value="csv">CSV import</option><option value="wave">Wave</option>
        </select>
        <select className="input lg:w-48" value={query.group} onChange={(e) => update({ group: e.target.value, page: '' })}>
          <option value="">Any group</option>
          {groups.data?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {count > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-night-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="font-semibold">{num(count)} selected</span>
          {!allMatching && allOnPage && data && data.total > rows.length && (
            <button className="underline text-brand-300" onClick={() => setAllMatching(true)}>Select all {num(data.total)} matching</button>
          )}
          <div className="flex-1" />
          <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => setGroupPick(true)}>Add to group</button>
          {query.group && <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => runBulk('remove_from_group', { groupId: Number(query.group) })}>Remove from this group</button>}
          <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => runBulk('sms_consent_on')}>Texting consent: on</button>
          <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => runBulk('sms_consent_off')}>Texting consent: off</button>
          <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => runBulk('disable')}>Disable</button>
          <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => runBulk('enable')}>Enable</button>
          <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => setConfirm({ action: 'unsubscribe', title: 'Unsubscribe these customers?', text: 'They will stop getting marketing emails. Only do this if they asked.' })}>Unsubscribe</button>
          <button className="btn !bg-red-600 !text-white hover:!bg-red-700" onClick={() => setConfirm({ action: 'delete', title: `Delete ${count} customer${count === 1 ? '' : 's'}?`, text: 'This removes them and their email history for good. To just stop emailing someone, use Disable instead.', danger: true })}>Delete</button>
        </div>
      )}

      {error && <ErrorBox error={error} onRetry={() => reload()} />}
      <Card padded={false}>
        {loading && !data ? <Loading /> : rows.length === 0 ? (
          <Empty icon={<Users className="h-10 w-10" />} title="No customers found">
            {query.q || query.filter || query.source || query.group ? 'Try clearing the search or filters.' : 'Add your first customer, or import a CSV file from your booking system or spreadsheet.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th w-10"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" /></th>
                  <SortHead k="name">Name</SortHead>
                  <SortHead k="email">Email</SortHead>
                  <th className="th">Phone</th>
                  <SortHead k="city">City</SortHead>
                  <th className="th">Flags</th>
                  <SortHead k="last_emailed">Last emailed</SortHead>
                  <SortHead k="created">Added</SortHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <tr key={c.id} className={`cursor-pointer hover:bg-slate-50 ${c.disabled ? 'opacity-60' : ''}`} onClick={() => nav(`/customers/${c.id}`)}>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={allMatching || selected.has(c.id)} onChange={() => {
                        const s = new Set(selected); s.has(c.id) ? s.delete(c.id) : s.add(c.id); setSelected(s); setAllMatching(false);
                      }} aria-label={`Select ${fullName(c)}`} />
                    </td>
                    <td className="td font-medium text-slate-900">{fullName(c)}{c.company_name && <div className="text-xs font-normal text-slate-500">{c.company_name}</div>}</td>
                    <td className="td">{c.email || <span className="text-slate-400">—</span>}</td>
                    <td className="td whitespace-nowrap">{c.phone || <span className="text-slate-400">—</span>}</td>
                    <td className="td">{c.city || <span className="text-slate-400">—</span>}</td>
                    <td className="td"><div className="flex flex-wrap gap-1">
                      {c.unsubscribed && <Badge color="yellow"><MailX className="h-3 w-3" />Unsubscribed</Badge>}
                      {c.suppressed && <Badge color="red"><ShieldAlert className="h-3 w-3" />Suppressed</Badge>}
                      {c.disabled && <Badge color="gray"><Ban className="h-3 w-3" />Disabled</Badge>}
                      {c.sms_consent && <Badge color="purple"><MessageSquare className="h-3 w-3" />Texts OK</Badge>}
                    </div></td>
                    <td className="td whitespace-nowrap">{fmtDate(c.last_emailed_at)}</td>
                    <td className="td whitespace-nowrap">{fmtDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">Page {data.page} of {pages}</span>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })}>Previous</button>
              <button className="btn-secondary" disabled={data.page >= pages} onClick={() => update({ page: String(data.page + 1) })}>Next</button>
            </div>
          </div>
        )}
      </Card>

      {adding && <CustomerForm open onClose={() => setAdding(false)} onSaved={(c) => nav(`/customers/${c.id}`)} />}
      {importing && <ImportModal groups={groups.data?.groups || []} onClose={() => setImporting(false)} onDone={() => { reload(true); groups.reload(true); }} />}

      <Modal open={groupPick} onClose={() => setGroupPick(false)} title={`Add ${num(count)} to a group`}>
        <GroupPicker groups={groups.data?.groups || []} busy={busy} onPick={(id) => runBulk('add_to_group', { groupId: id })} onCreated={() => groups.reload(true)} />
      </Modal>
      <Confirm open={!!confirm} title={confirm?.title || ''} danger={confirm?.danger} busy={busy} confirmLabel={confirm?.danger ? 'Delete' : 'Yes, continue'}
        onClose={() => setConfirm(null)} onConfirm={() => confirm && runBulk(confirm.action)}>{confirm?.text}</Confirm>
    </div>
  );
}

function GroupPicker({ groups, busy, onPick, onCreated }: { groups: Group[]; busy: boolean; onPick: (id: number) => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const toast = useToast();
  const create = async () => {
    try {
      const d = await api.post('/api/groups', { name });
      onCreated();
      onPick(d.group.id);
    } catch (e: any) { toast('error', e.message); }
  };
  return (
    <div className="space-y-3">
      {groups.length === 0 && <p className="text-sm text-slate-500">You don't have any groups yet. Create one below.</p>}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {groups.map((g) => (
          <button key={g.id} disabled={busy} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-400 hover:bg-brand-50" onClick={() => onPick(g.id)}>
            <span className="font-medium">{g.name}</span><span className="text-xs text-slate-500">{g.member_count} members</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 border-t border-slate-100 pt-3">
        <input className="input" placeholder="New group name, e.g. Birthday party guests 2026" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary whitespace-nowrap" disabled={!name.trim() || busy} onClick={create}>Create &amp; add</button>
      </div>
    </div>
  );
}

function ImportModal({ groups, onClose, onDone }: { groups: Group[]; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const run = async () => {
    if (!file) return;
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('smsConsent', String(consent));
    if (groupId) fd.append('groupId', groupId);
    try { setResult(await api.upload('/api/customers/import', fd)); onDone(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const sample = useMemo(() => 'data:text/csv;charset=utf-8,' + encodeURIComponent('First name,Last name,Email,Phone,City,SMS consent\nJamie,Lee,jamie@example.com,555-123-4567,Orlando,no\n'), []);
  return (
    <Modal open onClose={onClose} title="Import customers from a CSV file" wide
      footer={result ? <button className="btn-primary" onClick={onClose}>Done</button> : <>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!file || busy} onClick={run}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Import</button></>}>
      {result ? (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-brand-50 p-3"><div className="text-2xl font-bold text-brand-700">{result.created}</div>new</div>
            <div className="rounded-xl bg-sky-50 p-3"><div className="text-2xl font-bold text-sky-700">{result.updated}</div>updated</div>
            <div className="rounded-xl bg-amber-50 p-3"><div className="text-2xl font-bold text-amber-700">{result.skipped}</div>skipped</div>
          </div>
          {result.problems?.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">{result.problems.map((p: string) => <li key={p}>{p}</li>)}</ul>}
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">Your file needs a header row. We recognise columns like <strong>Email</strong>, <strong>First name</strong>, <strong>Last name</strong> (or just <strong>Name</strong>), <strong>Phone</strong>, <strong>Company</strong>, <strong>City</strong>, <strong>State</strong>, <strong>Zip</strong>, <strong>Notes</strong> and <strong>SMS consent</strong>. Customers already on file (same email) are updated, never duplicated. <a className="text-brand-600 underline" href={sample} download="customers-sample.csv">Download a sample file</a>.</p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700" />
          <div><label className="label">Also add everyone to a group (optional)</label>
            <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></div>
          <Toggle checked={consent} onChange={setConsent} label="Everyone in this file agreed to receive text messages"
            help="Only switch this on if you have their permission. Otherwise we use the file's SMS consent column, if there is one." />
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
