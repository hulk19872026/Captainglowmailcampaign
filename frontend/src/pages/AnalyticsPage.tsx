import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import { useApi } from '../lib/useApi';
import { PageHeader, Card, Loading, ErrorBox, Stat, Empty } from '../components/ui';
import { num, pct } from '../lib/format';

// Validated for colour-blind separation and contrast on white.
const C = { sent: '#16a34a', opened: '#0369a1', clicked: '#c2410c', problems: '#7c3aed' };

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useApi(`/api/analytics?days=${days}`);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload()} />;
  const t = data.totals;
  const daily = data.daily.map((d: any) => ({ ...d, day: d.day.slice(5), problems: d.bounced + d.failed }));
  const campaigns = data.campaigns.filter((c: any) => c.channel === 'email' && c.sent > 0).slice(0, 12).map((c: any) => ({
    name: c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name,
    'Open rate': Math.round((c.opened / c.sent) * 1000) / 10,
    'Click rate': Math.round((c.clicked / c.sent) * 1000) / 10,
  }));
  const axis = { stroke: '#94a3b8', fontSize: 12, tickLine: false, axisLine: false };
  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="How your emails and texts are performing."
        actions={<select className="input !w-44" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sent" value={num(t.sent)} />
        <Stat label="Delivered" value={num(t.delivered)} hint={pct(t.delivered, t.sent)} />
        <Stat label="Opened" value={num(t.opened)} hint={pct(t.opened, t.sent)} />
        <Stat label="Clicked" value={num(t.clicked)} hint={pct(t.clicked, t.sent)} />
        <Stat label="Bounced" value={num(t.bounced)} hint={pct(t.bounced, t.sent)} />
        <Stat label="Failed" value={num(t.failed)} hint={`${num(data.unsubscribes)} unsubscribed`} />
      </div>
      {data.sms.sent > 0 && <div className="text-sm text-slate-500">Plus {num(data.sms.sent)} text messages sent ({num(data.sms.failed)} failed) in this period.</div>}
      <Card title="Activity over time">
        {daily.length === 0 ? <Empty title="No activity in this period yet" /> : (
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} />
                <Line type="monotone" dataKey="sent" name="Sent" stroke={C.sent} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="opened" name="Opened" stroke={C.opened} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="clicked" name="Clicked" stroke={C.clicked} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="problems" name="Bounced / failed" stroke={C.problems} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      {campaigns.length > 0 && (
        <Card title="Open and click rate by campaign (%)">
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={campaigns} margin={{ top: 8, right: 16, left: -8, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" {...axis} interval={0} tick={{ fontSize: 11 }} />
                <YAxis unit="%" {...axis} />
                <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="Open rate" fill={C.opened} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Click rate" fill={C.clicked} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <Card title="Campaign performance" padded={false}>
        {data.campaigns.length === 0 ? <Empty title="No campaigns have sent yet" /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50"><tr>{['Campaign', 'Sent', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Failed', 'Leads'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.campaigns.map((c: any) => (
                  <tr key={c.id}>
                    <td className="td font-medium"><Link to={`/campaigns/${c.id}`} className="hover:text-brand-600">{c.name}</Link>{c.channel === 'sms' && <span className="ml-1 text-xs text-slate-400">(text)</span>}</td>
                    <td className="td">{num(c.sent)}</td>
                    <td className="td">{num(c.delivered)} <span className="text-xs text-slate-400">{pct(c.delivered, c.sent)}</span></td>
                    <td className="td">{c.channel === 'sms' ? '—' : <>{num(c.opened)} <span className="text-xs text-slate-400">{pct(c.opened, c.sent)}</span></>}</td>
                    <td className="td">{c.channel === 'sms' ? '—' : <>{num(c.clicked)} <span className="text-xs text-slate-400">{pct(c.clicked, c.sent)}</span></>}</td>
                    <td className="td">{num(c.bounced)}</td><td className="td">{num(c.failed)}</td><td className="td">{num(c.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-400">Note: some email apps (like Apple Mail) load images automatically, which can make open rates look higher than they really are. Clicks are the most reliable number.</p>
    </div>
  );
}
