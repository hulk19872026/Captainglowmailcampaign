// Minimal, dependency-free CSV reader/writer (handles quotes, commas and newlines in fields).

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Stop spreadsheet apps from treating cells as formulas.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

const ALIASES: Record<string, string[]> = {
  email: ['email', 'e-mail', 'email address', 'emailaddress', 'mail'],
  first_name: ['first name', 'firstname', 'first', 'given name', 'contact first name'],
  last_name: ['last name', 'lastname', 'last', 'surname', 'family name', 'contact last name'],
  name: ['name', 'full name', 'fullname', 'customer', 'customer name', 'contact name'],
  company_name: ['company', 'company name', 'business', 'organization', 'organisation'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'cell phone', 'mobile phone', 'telephone', 'tel'],
  address_line: ['address', 'street', 'address line 1', 'address1', 'street address'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  postal_code: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode'],
  notes: ['notes', 'note', 'comments'],
  sms_consent: ['sms consent', 'sms_consent', 'text consent', 'agreed to texts', 'texting consent', 'sms opt in', 'sms optin', 'opt in sms'],
};

/** Works out which column holds which field from the header row. */
export function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[_\s]+/g, ' ');
    for (const [field, names] of Object.entries(ALIASES)) {
      if (map[field] === undefined && names.includes(key)) map[field] = i;
    }
  });
  return map;
}
