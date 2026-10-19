import type { Settings } from '../lib/settings';
import { escapeHtml } from '../lib/util';
import type { Block } from './blocks';

export interface MergeVars {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  city?: string | null;
  customer_company?: string | null;
  phone?: string | null;
}

export interface RenderLinks {
  /** Wraps a URL for click tracking. leadLabel set = record an "interest" lead. */
  track?: (url: string, leadLabel?: string) => string;
  openPixelUrl?: string;
  unsubscribeUrl: string;
}

export interface RenderInput {
  subject: string;
  preheader?: string;
  blocks: Block[];
  settings: Settings;
  vars: MergeVars;
  links: RenderLinks;
  appUrl: string;
  /** Shown as a yellow strip at the top of test emails. */
  testBanner?: string;
}

export const MERGE_TAGS = [
  { tag: '{{first_name}}', help: "Customer's first name (use {{first_name|there}} for a fallback)" },
  { tag: '{{last_name}}', help: "Customer's last name" },
  { tag: '{{full_name}}', help: "Customer's full name" },
  { tag: '{{company_name}}', help: 'Your business name' },
  { tag: '{{customer_company}}', help: "Customer's company, if they have one" },
  { tag: '{{city}}', help: "Customer's city" },
  { tag: '{{email}}', help: "Customer's email address" },
  { tag: '{{website}}', help: 'Your website' },
  { tag: '{{phone}}', help: 'Your phone number' },
];

/** Replaces {{tags}}. `{{first_name|there}}` uses "there" when the value is blank. */
export function personalize(text: string, vars: MergeVars, settings: Settings, html = false): string {
  const full = [vars.first_name, vars.last_name].filter(Boolean).join(' ');
  const map: Record<string, string> = {
    first_name: vars.first_name || '',
    last_name: vars.last_name || '',
    full_name: full,
    company_name: settings.company_name,
    business_name: settings.company_name,
    customer_company: vars.customer_company || '',
    city: vars.city || '',
    email: vars.email || '',
    website: settings.website,
    phone: settings.company_phone,
  };
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_m, key: string, fb?: string) => {
    const k = key.toLowerCase();
    let v = map[k];
    if (v === undefined) return _m;
    if (!v.trim()) v = (fb ?? '').trim();
    return html ? escapeHtml(v) : v;
  });
}

/** Paragraph text: escapes HTML, keeps line breaks, supports **bold** and bare links. */
function richText(text: string, color: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${color};">$1</a>`);
  return s.replace(/\r?\n/g, '<br>');
}

function absUrl(url: string, appUrl: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return appUrl + url;
  return url;
}

function smsHref(number: string, message: string): string {
  const digits = number.replace(/[^\d+]/g, '');
  return `sms:${digits}?&body=${encodeURIComponent(message)}`;
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function buttonHtml(href: string, label: string, bg: string, fg: string, outline = false): string {
  const style = outline
    ? `display:inline-block;padding:13px 24px;border-radius:999px;border:2px solid ${bg};color:${bg};background:#ffffff;text-decoration:none;font-weight:700;font-size:16px;${FONT}`
    : `display:inline-block;padding:15px 26px;border-radius:999px;background:${bg};color:${fg};text-decoration:none;font-weight:700;font-size:16px;${FONT}`;
  return `<a href="${escapeHtml(href)}" target="_blank" style="${style}">${escapeHtml(label)}</a>`;
}

/** Picks black or white text to sit on top of the accent colour. */
function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0b0b0b' : '#ffffff';
}

export function renderEmail(input: RenderInput): { html: string; text: string; subject: string } {
  const { settings, vars, links, appUrl } = input;
  const accent = settings.accent_color || '#22C55E';
  const onAccent = contrastText(accent);
  const track = links.track || ((u: string) => u);
  const P = (t: string, html = true) => personalize(t, vars, settings, html);
  const textParts: string[] = [];

  // Flyers always show first.
  const blocks = [...input.blocks.filter((b) => b.type === 'flyer'), ...input.blocks.filter((b) => b.type !== 'flyer')];
  const textUs = blocks.find((b) => b.type === 'text_us') as Extract<Block, { type: 'text_us' }> | undefined;
  const textUsNumber = settings.sms_text_us_number;
  let textUsUsed = false;

  const rows: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'logo': {
        const align = b.align || 'center';
        if (settings.logo_url) {
          const img = `<img src="${escapeHtml(absUrl(settings.logo_url, appUrl))}" alt="${escapeHtml(settings.company_name)}" width="${b.width || 180}" style="display:inline-block;max-width:100%;height:auto;border:0;">`;
          const href = settings.website ? track(settings.website) : '';
          rows.push(`<tr><td align="${align}" style="padding:24px 32px 8px;">${href ? `<a href="${escapeHtml(href)}" target="_blank">${img}</a>` : img}</td></tr>`);
        } else {
          rows.push(`<tr><td align="${align}" style="padding:24px 32px 8px;${FONT}font-size:22px;font-weight:800;color:${accent};letter-spacing:.5px;">${escapeHtml(settings.company_name)}</td></tr>`);
        }
        break;
      }
      case 'headline': {
        const size = b.size === 'sm' ? 20 : b.size === 'md' ? 24 : 30;
        rows.push(`<tr><td align="${b.align || 'left'}" style="padding:16px 32px 4px;${FONT}font-size:${size}px;line-height:1.25;font-weight:800;color:#111827;">${P(b.text)}</td></tr>`);
        textParts.push(P(b.text, false).toUpperCase());
        break;
      }
      case 'paragraph':
        rows.push(`<tr><td align="${b.align || 'left'}" style="padding:8px 32px;${FONT}font-size:16px;line-height:1.6;color:#374151;">${richText(P(b.text, false), accent)}</td></tr>`);
        textParts.push(P(b.text, false));
        break;
      case 'image':
      case 'flyer': {
        if (!b.url) break;
        const img = `<img src="${escapeHtml(absUrl(b.url, appUrl))}" alt="${escapeHtml(b.alt || '')}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:${b.type === 'flyer' ? 12 : 8}px;">`;
        const href = b.link ? track(b.link) : '';
        rows.push(`<tr><td style="padding:${b.type === 'flyer' ? '20px 32px 12px' : '12px 32px'};">${href ? `<a href="${escapeHtml(href)}" target="_blank">${img}</a>` : img}</td></tr>`);
        if (b.alt) textParts.push(`[${b.alt}]`);
        break;
      }
      case 'button': {
        const href = b.url ? track(b.url, b.leadLabel || b.text || 'Interested') : '#';
        let inner = buttonHtml(href, P(b.text, false), accent, onAccent);
        textParts.push(`${P(b.text, false)}: ${href}`);
        if (textUs && textUsNumber && !textUsUsed) {
          textUsUsed = true;
          const sms = smsHref(textUsNumber, P(textUs.message || settings.sms_text_us_message, false));
          inner += `&nbsp;&nbsp;<span style="display:inline-block;height:10px;"></span>${buttonHtml(sms, textUs.text, accent, onAccent, true)}`;
          textParts.push(`${textUs.text}: ${textUsNumber}`);
        }
        rows.push(`<tr><td align="${b.align || 'center'}" style="padding:18px 32px;line-height:3;">${inner}</td></tr>`);
        break;
      }
      case 'text_us': {
        if (textUsUsed || !textUsNumber) break;
        textUsUsed = true;
        const sms = smsHref(textUsNumber, P(b.message || settings.sms_text_us_message, false));
        rows.push(`<tr><td align="center" style="padding:14px 32px;">${buttonHtml(sms, b.text, accent, onAccent, true)}</td></tr>`);
        textParts.push(`${b.text}: ${textUsNumber}`);
        break;
      }
      case 'divider':
        rows.push(`<tr><td style="padding:16px 32px;"><div style="height:1px;background:#e5e7eb;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>`);
        break;
      case 'spacer':
        rows.push(`<tr><td style="height:${b.height || 24}px;line-height:${b.height || 24}px;font-size:1px;">&nbsp;</td></tr>`);
        break;
      case 'services': {
        if (!settings.services.length) break;
        const items = settings.services
          .map((s) => `<tr><td width="28" valign="top" style="${FONT}font-size:16px;color:${accent};font-weight:800;padding:4px 0;">&#10003;</td><td style="${FONT}font-size:16px;color:#374151;padding:4px 0;">${escapeHtml(s)}</td></tr>`)
          .join('');
        rows.push(`<tr><td style="padding:12px 32px;">${b.title ? `<div style="${FONT}font-size:18px;font-weight:800;color:#111827;margin-bottom:8px;">${P(b.title)}</div>` : ''}<table role="presentation" cellpadding="0" cellspacing="0" border="0">${items}</table></td></tr>`);
        textParts.push((b.title ? P(b.title, false) + '\n' : '') + settings.services.map((s) => `- ${s}`).join('\n'));
        break;
      }
      case 'plans': {
        const chosen = (b.planIds.length ? b.planIds.map((id) => settings.plans.find((p) => p.id === id)) : settings.plans).filter(Boolean) as Settings['plans'];
        if (!chosen.length) break;
        const cards = chosen
          .map((p, i) => {
            const featured = chosen.length > 1 && i === chosen.length - 1;
            const feats = p.features.map((f) => `<div style="${FONT}font-size:14px;color:#374151;padding:3px 0;"><span style="color:${accent};font-weight:800;">&#10003;</span>&nbsp; ${escapeHtml(f)}</div>`).join('');
            return `<tr><td style="padding:8px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid ${featured ? accent : '#e5e7eb'};border-radius:12px;"><tr><td style="padding:16px 18px;">
              <div style="${FONT}font-size:13px;font-weight:800;letter-spacing:1.5px;color:${accent};">${escapeHtml(p.name)}</div>
              ${p.price ? `<div style="${FONT}font-size:20px;font-weight:800;color:#111827;margin:4px 0;">${escapeHtml(p.price)}</div>` : ''}
              ${p.tagline ? `<div style="${FONT}font-size:14px;color:#6b7280;margin-bottom:8px;">${escapeHtml(p.tagline)}</div>` : ''}
              ${feats}</td></tr></table></td></tr>`;
          })
          .join('');
        rows.push(`<tr><td style="padding:12px 32px;">${b.title ? `<div style="${FONT}font-size:20px;font-weight:800;color:#111827;margin-bottom:6px;">${P(b.title)}</div>` : ''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cards}</table></td></tr>`);
        textParts.push((b.title ? P(b.title, false) + '\n' : '') + chosen.map((p) => `${p.name}${p.price ? ` (${p.price})` : ''}: ${p.features.join('; ')}`).join('\n'));
        break;
      }
    }
  }

  const address = settings.mailing_address
    ? escapeHtml(settings.mailing_address).replace(/\r?\n/g, '<br>')
    : '<span style="color:#b91c1c;">[Mailing address missing: add it in Settings]</span>';
  const footer = `<tr><td style="padding:24px 32px 32px;${FONT}font-size:12px;line-height:1.6;color:#6b7280;text-align:center;border-top:1px solid #f3f4f6;">
    <div style="font-weight:700;color:#374151;">${escapeHtml(settings.company_name)}</div>
    <div>${address}</div>
    ${settings.website ? `<div><a href="${escapeHtml(settings.website)}" style="color:#6b7280;">${escapeHtml(settings.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></div>` : ''}
    <div style="margin-top:10px;">You're getting this email because you're a customer of ${escapeHtml(settings.company_name)}.<br>
    <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> at any time.</div>
  </td></tr>`;

  const preheader = P(input.preheader || '', true);
  const banner = input.testBanner
    ? `<tr><td style="background:#fef3c7;color:#92400e;padding:10px 20px;${FONT}font-size:13px;font-weight:700;text-align:center;">${escapeHtml(input.testBanner)}</td></tr>`
    : '';
  const pixel = links.openPixelUrl ? `<img src="${escapeHtml(links.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">` : '';
  const subject = personalize(input.subject, vars, settings, false);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="height:6px;background:${accent};line-height:6px;font-size:1px;">&nbsp;</td></tr>
${banner}
${rows.join('\n')}
${footer}
</table>${pixel}
</td></tr></table>
</body></html>`;

  const text = [
    input.testBanner ? `*** ${input.testBanner} ***\n` : '',
    textParts.join('\n\n'),
    '\n--\n' + settings.company_name,
    settings.mailing_address,
    `Unsubscribe: ${links.unsubscribeUrl}`,
  ].filter(Boolean).join('\n');

  return { html, text, subject };
}

/** Adds the opt-out line to a text message if it's not already there. */
export function finalizeSms(body: string, vars: MergeVars, settings: Settings): string {
  let msg = personalize(body, vars, settings, false).trim();
  if (!/\bstop\b/i.test(msg)) msg += `\n${settings.sms_opt_out_text || 'Reply STOP to opt out.'}`;
  if (!msg.toLowerCase().includes(settings.short_name.toLowerCase()) && !msg.toLowerCase().includes(settings.company_name.toLowerCase())) {
    msg = `${settings.short_name}: ${msg}`;
  }
  return msg;
}
