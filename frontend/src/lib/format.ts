export function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? v + 'T12:00:00' : v);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtRelative(v?: string | null) {
  if (!v) return '—';
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  const abs = Math.abs(diff);
  const fut = diff < 0;
  const f = (n: number, u: string) => `${fut ? 'in ' : ''}${n} ${u}${n === 1 ? '' : 's'}${fut ? '' : ' ago'}`;
  if (abs < 60) return fut ? 'in a moment' : 'just now';
  if (abs < 3600) return f(Math.round(abs / 60), 'minute');
  if (abs < 86400) return f(Math.round(abs / 3600), 'hour');
  return f(Math.round(abs / 86400), 'day');
}

export function pct(part: number, whole: number) {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function num(n?: number | null) {
  return (n ?? 0).toLocaleString();
}

export function fullName(c: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const n = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return n || c.email || 'No name';
}

export function todayIn(tz: string) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
