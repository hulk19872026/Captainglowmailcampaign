import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { occurrencesBetween, daysInMonth, weekdayOf, type Recurrence } from '@recurrence';

/** Month calendar that highlights sending days. Uses the same maths as the server. */
export default function SendCalendar({ rule, today, months = 2 }: { rule: Recurrence; today: string; months?: number }) {
  const [offset, setOffset] = useState(0);
  const start = useMemo(() => {
    const [y, m] = (rule.startDate > today ? rule.startDate : today).split('-').map(Number);
    const total = y * 12 + (m - 1) + offset;
    return { y: Math.floor(total / 12), m: (total % 12) + 1 };
  }, [rule.startDate, today, offset]);

  const blocks = Array.from({ length: months }, (_, i) => {
    const total = start.y * 12 + (start.m - 1) + i;
    return { y: Math.floor(total / 12), m: (total % 12) + 1 };
  });
  const first = `${blocks[0].y}-${String(blocks[0].m).padStart(2, '0')}-01`;
  const lastB = blocks[blocks.length - 1];
  const last = `${lastB.y}-${String(lastB.m).padStart(2, '0')}-${daysInMonth(lastB.y, lastB.m)}`;
  const occ = useMemo(() => new Map(occurrencesBetween(rule, first, last, 400).map((o) => [o.date, o.index])), [rule, first, last]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="btn-ghost !p-1" onClick={() => setOffset(offset - 1)}><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-xs text-slate-500"><span className="mr-1 inline-block h-3 w-3 rounded bg-brand-500 align-middle" />sending day &nbsp; <span className="mr-1 inline-block h-3 w-3 rounded ring-2 ring-slate-400 align-middle" />today</div>
        <button type="button" className="btn-ghost !p-1" onClick={() => setOffset(offset + 1)}><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className={`grid gap-4 ${months > 1 ? 'sm:grid-cols-2' : ''}`}>
        {blocks.map(({ y, m }) => {
          const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
          const lead = weekdayOf(firstDay);
          const n = daysInMonth(y, m);
          return (
            <div key={`${y}-${m}`}>
              <div className="mb-1 text-center text-sm font-semibold text-slate-700">{new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="font-semibold text-slate-400">{d}</div>)}
                {Array.from({ length: lead }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: n }, (_, i) => {
                  const date = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                  const idx = occ.get(date);
                  return (
                    <div key={date} title={idx ? `Send #${idx}` : undefined}
                      className={`flex h-8 items-center justify-center rounded-lg text-xs ${idx ? 'bg-brand-500 font-bold text-white' : date < today ? 'text-slate-300' : 'text-slate-600'} ${date === today ? 'ring-2 ring-slate-400' : ''}`}>
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
