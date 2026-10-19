import { useState } from 'react';
import { Braces } from 'lucide-react';

const TAGS = [
  ['{{first_name}}', "Customer's first name"],
  ['{{first_name|there}}', 'First name, or "there" if we don\'t have one'],
  ['{{last_name}}', "Customer's last name"],
  ['{{full_name}}', "Customer's full name"],
  ['{{company_name}}', 'Your business name'],
  ['{{customer_company}}', "Customer's company"],
  ['{{city}}', "Customer's city"],
  ['{{website}}', 'Your website'],
  ['{{phone}}', 'Your phone number'],
];

export default function MergeTags() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
      <button type="button" className="flex items-center gap-1 font-semibold text-slate-700" onClick={() => setOpen(!open)}><Braces className="h-4 w-4" />Personalise with tags {open ? '▲' : '▼'}</button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {TAGS.map(([t, d]) => (
            <button type="button" key={t} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1 text-left hover:bg-brand-50" onClick={() => navigator.clipboard?.writeText(t)} title="Click to copy">
              <code className="text-brand-700">{t}</code><span className="text-slate-500">{d}</span>
            </button>
          ))}
          <p className="sm:col-span-2 mt-1 text-slate-500">Click a tag to copy it, then paste it into the subject or any text block.</p>
        </div>
      )}
    </div>
  );
}
