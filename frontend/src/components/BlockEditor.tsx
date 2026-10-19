import { useRef, useState } from 'react';
import {
  ArrowUp, ArrowDown, Trash2, Copy, Plus, Image as ImageIcon, Type, Heading, MousePointerClick, MessageSquare, Minus, MoveVertical,
  ListChecks, BadgeDollarSign, Stamp, FileImage, Upload,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Block, BlockType, Plan } from '../lib/types';
import { useToast, Spinner } from './ui';

const BLOCK_INFO: Record<BlockType, { label: string; icon: any; help: string }> = {
  logo: { label: 'Logo', icon: Stamp, help: 'Your logo from Settings (or your name if no logo is uploaded).' },
  headline: { label: 'Headline', icon: Heading, help: 'A big bold title.' },
  paragraph: { label: 'Paragraph', icon: Type, help: 'Body text. Use **double stars** for bold.' },
  image: { label: 'Image', icon: ImageIcon, help: 'A photo, optionally linked.' },
  flyer: { label: 'Flyer', icon: FileImage, help: 'A full-width flyer image. Always shown first in the email.' },
  button: { label: 'Button', icon: MousePointerClick, help: 'Tracked. Anyone who clicks becomes a lead.' },
  text_us: { label: '"Text us" button', icon: MessageSquare, help: 'Opens the customer\'s texting app with a ready-made message. Shown beside the main button.' },
  divider: { label: 'Divider', icon: Minus, help: 'A thin line.' },
  spacer: { label: 'Spacer', icon: MoveVertical, help: 'Empty space.' },
  services: { label: 'Services list', icon: ListChecks, help: 'Your services from Settings.' },
  plans: { label: 'Party packages', icon: BadgeDollarSign, help: 'Your packages from Settings. Pick which ones to show.' },
};

export function newBlock(type: BlockType, plans: Plan[]): Block {
  const id = Math.random().toString(36).slice(2, 10);
  switch (type) {
    case 'logo': return { id, type, align: 'center' };
    case 'headline': return { id, type, text: 'Your headline here', size: 'lg', align: 'left' };
    case 'paragraph': return { id, type, text: 'Hi {{first_name|there}},\n\nWrite your message here.', align: 'left' };
    case 'image': return { id, type, url: '', alt: '', link: '' };
    case 'flyer': return { id, type, url: '', alt: 'Flyer', link: '' };
    case 'button': return { id, type, text: 'Book a party', url: 'https://www.captainglowsminigolf.com/', leadLabel: 'Birthday party', align: 'center' };
    case 'text_us': return { id, type, text: 'Text us', message: '' };
    case 'divider': return { id, type };
    case 'spacer': return { id, type, height: 24 };
    case 'services': return { id, type, title: 'What we offer' };
    case 'plans': return { id, type, title: 'Party packages', planIds: plans.map((p) => p.id) };
  }
}

function ImageField({ url, onChange }: { url: string; onChange: (u: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const upload = async (f: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    try { onChange((await api.upload('/api/uploads', fd)).url); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <label className="label">Image</label>
      <div className="flex gap-2">
        <input className="input" placeholder="Paste an image link, or upload" value={url} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Spinner className="!h-4 !w-4" /> : <Upload className="h-4 w-4" />}Upload</button>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {url && <img src={url} alt="" className="mt-2 max-h-32 rounded-lg border border-slate-200" />}
    </div>
  );
}

function AlignPick({ value, onChange }: { value?: string; onChange: (v: any) => void }) {
  return (
    <div><label className="label">Alignment</label>
      <select className="input" value={value || 'left'} onChange={(e) => onChange(e.target.value)}>
        <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
      </select></div>
  );
}

function BlockFields({ block, onChange, plans, textUsNumber }: { block: Block; onChange: (b: Block) => void; plans: Plan[]; textUsNumber: string }) {
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);
  switch (block.type) {
    case 'logo':
      return <div className="grid grid-cols-2 gap-3"><AlignPick value={block.align} onChange={(align) => set({ align })} />
        <div><label className="label">Width (px)</label><input className="input" type="number" min={60} max={400} value={block.width || 180} onChange={(e) => set({ width: Number(e.target.value) })} /></div></div>;
    case 'headline':
      return <div className="space-y-3"><input className="input text-lg font-bold" value={block.text} onChange={(e) => set({ text: e.target.value })} />
        <div className="grid grid-cols-2 gap-3"><div><label className="label">Size</label><select className="input" value={block.size || 'lg'} onChange={(e) => set({ size: e.target.value as any })}><option value="lg">Large</option><option value="md">Medium</option><option value="sm">Small</option></select></div>
          <AlignPick value={block.align} onChange={(align) => set({ align })} /></div></div>;
    case 'paragraph':
      return <div className="space-y-3"><textarea className="input" rows={6} value={block.text} onChange={(e) => set({ text: e.target.value })} /><AlignPick value={block.align} onChange={(align) => set({ align })} /></div>;
    case 'image':
    case 'flyer':
      return <div className="space-y-3"><ImageField url={block.url} onChange={(url) => set({ url })} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Description (for screen readers)</label><input className="input" value={block.alt || ''} onChange={(e) => set({ alt: e.target.value })} /></div>
          <div><label className="label">Link when clicked (optional)</label><input className="input" value={block.link || ''} onChange={(e) => set({ link: e.target.value })} placeholder="https://" /></div>
        </div></div>;
    case 'button':
      return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Button text</label><input className="input" value={block.text} onChange={(e) => set({ text: e.target.value })} /></div>
        <div><label className="label">Goes to</label><input className="input" value={block.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></div>
        <div><label className="label">Lead label</label><input className="input" value={block.leadLabel || ''} onChange={(e) => set({ leadLabel: e.target.value })} placeholder="e.g. Birthday party" />
          <p className="help">Shown on the Leads page when someone clicks.</p></div>
        <AlignPick value={block.align || 'center'} onChange={(align) => set({ align })} />
      </div>;
    case 'text_us':
      return <div className="space-y-3">
        {!textUsNumber && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Set your "Text us" number in Settings, otherwise this button is hidden.</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Button text</label><input className="input" value={block.text} onChange={(e) => set({ text: e.target.value })} /></div>
          <div><label className="label">Pre-filled message</label><input className="input" value={block.message || ''} onChange={(e) => set({ message: e.target.value })} placeholder="Leave blank to use the one in Settings" /></div>
        </div></div>;
    case 'spacer':
      return <div><label className="label">Height: {block.height || 24}px</label><input type="range" min={4} max={120} value={block.height || 24} onChange={(e) => set({ height: Number(e.target.value) })} className="w-full accent-brand-500" /></div>;
    case 'services':
      return <div><label className="label">Title (optional)</label><input className="input" value={block.title || ''} onChange={(e) => set({ title: e.target.value })} /><p className="help">The list itself comes from Settings → Services.</p></div>;
    case 'plans':
      return <div className="space-y-3">
        <div><label className="label">Title (optional)</label><input className="input" value={block.title || ''} onChange={(e) => set({ title: e.target.value })} /></div>
        <div><label className="label">Packages to show</label>
          <div className="flex flex-wrap gap-2">{plans.map((p) => {
            const on = block.planIds.includes(p.id);
            return <button type="button" key={p.id} onClick={() => set({ planIds: on ? block.planIds.filter((x) => x !== p.id) : plans.filter((x) => x.id === p.id || block.planIds.includes(x.id)).map((x) => x.id) })}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-500'}`}>{p.name}</button>;
          })}</div>
          <p className="help">Package details are edited in Settings → Party packages.</p></div>
      </div>;
    default:
      return <p className="text-xs text-slate-500">No settings for this block.</p>;
  }
}

export default function BlockEditor({ blocks, onChange, plans, textUsNumber }: { blocks: Block[]; onChange: (b: Block[]) => void; plans: Plan[]; textUsNumber: string }) {
  const [openId, setOpenId] = useState<string | null>(blocks[0]?.id ?? null);
  const [menu, setMenu] = useState(false);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (type: BlockType) => {
    const b = newBlock(type, plans);
    onChange([...blocks, b]);
    setOpenId(b.id);
    setMenu(false);
  };
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const info = BLOCK_INFO[b.type];
        const Icon = info.icon;
        const open = openId === b.id;
        const summary = 'text' in b && b.text ? b.text.slice(0, 60) : 'url' in b && b.url ? b.url.split('/').pop() : '';
        return (
          <div key={b.id} className={`rounded-xl border bg-white ${open ? 'border-brand-400 shadow-sm' : 'border-slate-200'}`}>
            <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={() => setOpenId(open ? null : b.id)}>
              <Icon className="h-4 w-4 flex-none text-brand-600" />
              <span className="text-sm font-semibold text-slate-800">{info.label}</span>
              <span className="flex-1 truncate text-xs text-slate-400">{summary}</span>
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn-ghost !p-1" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></button>
                <button type="button" className="btn-ghost !p-1" title="Move down" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}><ArrowDown className="h-4 w-4" /></button>
                <button type="button" className="btn-ghost !p-1" title="Duplicate" onClick={() => { const c = { ...b, id: Math.random().toString(36).slice(2, 10) }; const n = blocks.slice(); n.splice(i + 1, 0, c as Block); onChange(n); }}><Copy className="h-4 w-4" /></button>
                <button type="button" className="btn-ghost !p-1 !text-red-500" title="Remove" onClick={() => onChange(blocks.filter((x) => x.id !== b.id))}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {open && (
              <div className="border-t border-slate-100 p-3">
                <p className="mb-2 text-xs text-slate-500">{info.help}</p>
                <BlockFields block={b} plans={plans} textUsNumber={textUsNumber} onChange={(nb) => onChange(blocks.map((x) => (x.id === b.id ? nb : x)))} />
              </div>
            )}
          </div>
        );
      })}
      <div className="relative">
        <button type="button" className="btn-secondary w-full border-dashed" onClick={() => setMenu(!menu)}><Plus className="h-4 w-4" />Add a block</button>
        {menu && (
          <div className="absolute z-20 mt-2 grid w-full grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl sm:grid-cols-3">
            {(Object.keys(BLOCK_INFO) as BlockType[]).map((t) => {
              const Icon = BLOCK_INFO[t].icon;
              return <button type="button" key={t} onClick={() => add(t)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50"><Icon className="h-4 w-4 text-brand-600" />{BLOCK_INFO[t].label}</button>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
