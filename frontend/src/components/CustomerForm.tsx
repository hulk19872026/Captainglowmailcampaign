import { useState } from 'react';
import { api } from '../lib/api';
import { Modal, Toggle, useToast, Spinner } from './ui';
import type { Customer } from '../lib/types';

const FIELDS: [keyof Customer, string, string?][] = [
  ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email', 'email'], ['phone', 'Phone'],
  ['company_name', 'Company'], ['address_line', 'Street address'], ['city', 'City'], ['state', 'State'], ['postal_code', 'Zip'],
];

export default function CustomerForm({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: Customer | null; onSaved: (c: Customer) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<any>(() => customer ? { ...customer } : { sms_consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body: any = {};
      for (const [k] of FIELDS) body[k] = form[k] ?? '';
      body.notes = form.notes ?? '';
      body.sms_consent = !!form.sms_consent;
      const d = customer ? await api.put(`/api/customers/${customer.id}`, body) : await api.post('/api/customers', body);
      toast('success', customer ? 'Customer saved.' : 'Customer added.');
      onSaved(d.customer);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={customer ? 'Edit customer' : 'Add a customer'} wide
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}Save</button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(([k, label, type]) => (
          <div key={k}><label className="label">{label}</label><input className="input" type={type || 'text'} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></div>
        ))}
        <div className="sm:col-span-2"><label className="label">Notes</label><textarea className="input" rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></div>
        <div className="sm:col-span-2">
          <Toggle checked={!!form.sms_consent} onChange={(v) => set('sms_consent', v)} label="Agreed to receive text messages"
            help="Only turn this on if the customer told you they want marketing texts. It's the law (TCPA)." />
        </div>
      </div>
      {error && <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    </Modal>
  );
}
