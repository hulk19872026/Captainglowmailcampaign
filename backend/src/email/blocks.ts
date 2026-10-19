// The building blocks of an email template.
export type Align = 'left' | 'center' | 'right';

export type Block =
  | { id: string; type: 'logo'; align?: Align; width?: number }
  | { id: string; type: 'headline'; text: string; size?: 'lg' | 'md' | 'sm'; align?: Align }
  | { id: string; type: 'paragraph'; text: string; align?: Align }
  | { id: string; type: 'image'; url: string; alt?: string; link?: string }
  | { id: string; type: 'flyer'; url: string; alt?: string; link?: string }
  | { id: string; type: 'button'; text: string; url: string; leadLabel?: string; align?: Align }
  | { id: string; type: 'text_us'; text: string; message?: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height?: number }
  | { id: string; type: 'services'; title?: string }
  | { id: string; type: 'plans'; title?: string; planIds: string[] };

export const BLOCK_TYPES = ['logo', 'headline', 'paragraph', 'image', 'flyer', 'button', 'text_us', 'divider', 'spacer', 'services', 'plans'] as const;

/** Keeps only known block types and sensible fields. */
export function sanitizeBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  for (const raw of input.slice(0, 60)) {
    if (!raw || typeof raw !== 'object') continue;
    const b: any = raw;
    if (!BLOCK_TYPES.includes(b.type)) continue;
    const id = typeof b.id === 'string' && b.id ? b.id.slice(0, 40) : Math.random().toString(36).slice(2, 10);
    const str = (v: any, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
    const align = ['left', 'center', 'right'].includes(b.align) ? b.align : undefined;
    switch (b.type) {
      case 'logo': out.push({ id, type: 'logo', align, width: Math.min(400, Math.max(60, Number(b.width) || 180)) }); break;
      case 'headline': out.push({ id, type: 'headline', text: str(b.text, 300), size: ['lg', 'md', 'sm'].includes(b.size) ? b.size : 'lg', align }); break;
      case 'paragraph': out.push({ id, type: 'paragraph', text: str(b.text), align }); break;
      case 'image': out.push({ id, type: 'image', url: str(b.url, 1000), alt: str(b.alt, 200), link: str(b.link, 1000) }); break;
      case 'flyer': out.push({ id, type: 'flyer', url: str(b.url, 1000), alt: str(b.alt, 200), link: str(b.link, 1000) }); break;
      case 'button': out.push({ id, type: 'button', text: str(b.text, 80) || 'Learn more', url: str(b.url, 1000), leadLabel: str(b.leadLabel, 80), align }); break;
      case 'text_us': out.push({ id, type: 'text_us', text: str(b.text, 80) || 'Text us', message: str(b.message, 300) }); break;
      case 'divider': out.push({ id, type: 'divider' }); break;
      case 'spacer': out.push({ id, type: 'spacer', height: Math.min(120, Math.max(4, Number(b.height) || 24)) }); break;
      case 'services': out.push({ id, type: 'services', title: str(b.title, 120) }); break;
      case 'plans': out.push({ id, type: 'plans', title: str(b.title, 120), planIds: Array.isArray(b.planIds) ? b.planIds.map(String).slice(0, 10) : [] }); break;
    }
  }
  return out;
}
