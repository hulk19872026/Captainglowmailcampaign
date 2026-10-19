// Repeat-schedule maths, shared by the backend (what really sends) and the
// frontend (the sending calendar). It works purely on calendar dates written as
// "YYYY-MM-DD" in the business's own timezone, so it has no dependencies.
//
// Every rule is measured from a fixed first-send date (startDate). Because each
// occurrence is computed from that anchor rather than from the previous send,
// a "31st of the month" rule keeps coming back to the 31st and simply uses the
// last day of shorter months.

export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly';

export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'count'; count: number }
  | { type: 'until'; date: string };

export interface Recurrence {
  type: RecurrenceType;
  /** Every N days / weeks / months. */
  interval?: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  /** Monthly only: 1 … 31. */
  monthDay?: number;
  /** The first sending day, YYYY-MM-DD. */
  startDate: string;
  end?: RecurrenceEnd;
}

export interface Occurrence {
  /** 1-based number of this pass. */
  index: number;
  date: string;
}

const MAX_ITER = 5000;

export function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return { y, m, d };
}

function toDays(s: string): number {
  const { y, m, d } = parseDate(s);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function fromDays(n: number): string {
  const dt = new Date(n * 86400000);
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(s: string, n: number): string {
  return fromDays(toDays(s) + n);
}

export function weekdayOf(s: string): number {
  // 1970-01-01 was a Thursday (4).
  return (((toDays(s) + 4) % 7) + 7) % 7;
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseDate(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Cleans up a rule coming from a form or the database. */
export function normalizeRecurrence(input: any, fallbackStart: string): Recurrence {
  const type: RecurrenceType = ['once', 'daily', 'weekly', 'monthly'].includes(input?.type) ? input.type : 'once';
  const startDate = isValidDate(input?.startDate) ? input.startDate : fallbackStart;
  const interval = Math.min(365, Math.max(1, Math.round(Number(input?.interval) || 1)));
  const rule: Recurrence = { type, startDate, interval };
  if (type === 'weekly') {
    const days = Array.isArray(input?.weekdays) ? input.weekdays.map(Number).filter((n: number) => n >= 0 && n <= 6) : [];
    rule.weekdays = days.length ? Array.from(new Set<number>(days)).sort((a, b) => a - b) : [weekdayOf(startDate)];
  }
  if (type === 'monthly') {
    const md = Math.round(Number(input?.monthDay));
    rule.monthDay = md >= 1 && md <= 31 ? md : parseDate(startDate).d;
  }
  if (type === 'once') {
    rule.end = { type: 'count', count: 1 };
  } else {
    const e = input?.end;
    if (e?.type === 'count' && Number(e.count) >= 1) rule.end = { type: 'count', count: Math.min(1000, Math.round(Number(e.count))) };
    else if (e?.type === 'until' && isValidDate(e.date)) rule.end = { type: 'until', date: e.date };
    else rule.end = { type: 'never' };
  }
  return rule;
}

/** Generates occurrences in date order, starting with the first send. */
export function* iterateOccurrences(rule: Recurrence): Generator<Occurrence> {
  const start = rule.startDate;
  const interval = Math.max(1, rule.interval || 1);
  const end = rule.type === 'once' ? { type: 'count', count: 1 } as RecurrenceEnd : rule.end || { type: 'never' };
  let index = 0;

  const accept = (date: string): boolean | 'stop' => {
    if (date < start) return false;
    if (end.type === 'until' && date > end.date) return 'stop';
    if (end.type === 'count' && index >= end.count) return 'stop';
    return true;
  };

  if (rule.type === 'once') {
    index = 1;
    yield { index, date: start };
    return;
  }

  if (rule.type === 'daily') {
    for (let k = 0; k < MAX_ITER; k++) {
      const date = addDays(start, k * interval);
      const ok = accept(date);
      if (ok === 'stop') return;
      if (ok) { index++; yield { index, date }; }
    }
    return;
  }

  if (rule.type === 'weekly') {
    const weekdays = (rule.weekdays && rule.weekdays.length ? rule.weekdays : [weekdayOf(start)]).slice().sort((a, b) => a - b);
    const weekStart = addDays(start, -weekdayOf(start)); // the Sunday of the first week
    for (let k = 0; k < MAX_ITER; k++) {
      const base = addDays(weekStart, k * interval * 7);
      for (const wd of weekdays) {
        const date = addDays(base, wd);
        const ok = accept(date);
        if (ok === 'stop') return;
        if (ok) { index++; yield { index, date }; }
      }
    }
    return;
  }

  if (rule.type === 'monthly') {
    const { y, m } = parseDate(start);
    const monthDay = rule.monthDay || parseDate(start).d;
    for (let k = 0; k < MAX_ITER; k++) {
      const total = (m - 1) + k * interval;
      const yy = y + Math.floor(total / 12);
      const mm = (total % 12) + 1;
      const date = fmt(yy, mm, Math.min(monthDay, daysInMonth(yy, mm)));
      const ok = accept(date);
      if (ok === 'stop') return;
      if (ok) { index++; yield { index, date }; }
    }
  }
}

/** All sending days between two dates (inclusive). */
export function occurrencesBetween(rule: Recurrence, from: string, to: string, limit = 500): Occurrence[] {
  const out: Occurrence[] = [];
  for (const o of iterateOccurrences(rule)) {
    if (o.date > to) break;
    if (o.date >= from) out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}

/** The first occurrence on or after a date. */
export function firstOnOrAfter(rule: Recurrence, date: string): Occurrence | null {
  for (const o of iterateOccurrences(rule)) if (o.date >= date) return o;
  return null;
}

/** The first occurrence strictly after a date. */
export function nextAfter(rule: Recurrence, date: string): Occurrence | null {
  for (const o of iterateOccurrences(rule)) if (o.date > date) return o;
  return null;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Plain-English description, e.g. "Every 2 weeks on Monday and Friday, 6 times". */
export function describeRecurrence(rule: Recurrence): string {
  const n = rule.interval || 1;
  let text: string;
  switch (rule.type) {
    case 'once':
      return `Once, on ${rule.startDate}`;
    case 'daily':
      text = n === 1 ? 'Every day' : `Every ${n} days`;
      break;
    case 'weekly': {
      const days = (rule.weekdays || []).map((d) => WEEKDAY_NAMES[d]);
      const list = days.length <= 1 ? days.join('') : days.slice(0, -1).join(', ') + ' and ' + days[days.length - 1];
      text = (n === 1 ? 'Every week' : `Every ${n} weeks`) + (list ? ` on ${list}` : '');
      break;
    }
    case 'monthly': {
      const md = rule.monthDay || 1;
      text = (n === 1 ? 'Every month' : `Every ${n} months`) + ` on the ${ordinal(md)}` + (md > 28 ? ' (or the last day of shorter months)' : '');
      break;
    }
    default:
      text = 'Once';
  }
  text += `, starting ${rule.startDate}`;
  const e = rule.end;
  if (e?.type === 'count') text += `, ${e.count} time${e.count === 1 ? '' : 's'}`;
  else if (e?.type === 'until') text += `, until ${e.date}`;
  else text += ', until you stop it';
  return text;
}
