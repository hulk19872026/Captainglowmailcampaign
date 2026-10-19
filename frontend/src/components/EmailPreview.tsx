import { useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import type { Block } from '../lib/types';
import { Spinner } from './ui';

/** Live preview: the server renders the email exactly as customers will get it. */
export default function EmailPreview({ subject, preheader, blocks }: { subject: string; preheader: string; blocks: Block[] }) {
  const [html, setHtml] = useState('');
  const [renderedSubject, setRenderedSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const key = JSON.stringify({ subject, preheader, blocks });

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const d = await api.post('/api/templates/preview', { subject, preheader, blocks });
        if (!cancelled) { setHtml(d.html); setRenderedSubject(d.subject); }
      } catch { /* keep the last good preview */ } finally {
        if (!cancelled) setBusy(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Preview{busy && <Spinner className="ml-2 inline !h-3 !w-3" />}</div>
          <div className="truncate text-sm font-semibold text-slate-800">{renderedSubject || subject || '(no subject yet)'}</div>
        </div>
        <button type="button" className={`btn-ghost !p-1.5 ${!mobile ? '!bg-slate-100' : ''}`} onClick={() => setMobile(false)} title="Desktop"><Monitor className="h-4 w-4" /></button>
        <button type="button" className={`btn-ghost !p-1.5 ${mobile ? '!bg-slate-100' : ''}`} onClick={() => setMobile(true)} title="Phone"><Smartphone className="h-4 w-4" /></button>
      </div>
      <div className="flex justify-center bg-slate-100 p-3">
        <iframe title="Email preview" srcDoc={html} sandbox="allow-popups" className={`h-[70vh] rounded-lg bg-white transition-all ${mobile ? 'w-[380px]' : 'w-full'}`} />
      </div>
    </div>
  );
}
