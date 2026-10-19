import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FolderHeart, Send, LayoutTemplate, CalendarClock, BarChart3, Target, PlugZap, Settings, HelpCircle,
  LogOut, Menu, X, Bell,
} from 'lucide-react';
import { api } from '../lib/api';
import { fmtRelative } from '../lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/groups', label: 'Customer groups', icon: FolderHeart },
  { to: '/campaigns', label: 'Campaigns', icon: Send },
  { to: '/templates', label: 'Email templates', icon: LayoutTemplate },
  { to: '/schedule', label: 'Schedule', icon: CalendarClock },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/leads', label: 'Leads', icon: Target },
  { to: '/integrations', label: 'Integrations', icon: PlugZap },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: HelpCircle },
];

export default function Layout({ children, email, onLogout }: { children: ReactNode; email: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const [notes, setNotes] = useState<{ notifications: any[]; unread: number }>({ notifications: [], unread: 0 });
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const load = () => api.get('/api/notifications').then(setNotes).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const openBell = async () => {
    setBell(!bell);
    if (!bell && notes.unread) {
      await api.post('/api/notifications/read-all').catch(() => {});
      setNotes((n) => ({ ...n, unread: 0 }));
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-night-900 text-slate-300">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/favicon.svg" alt="" className="h-9 w-9" />
        <div>
          <div className="text-sm font-bold leading-tight text-white">Captain Glow Mini Golf</div>
          <div className="text-xs text-brand-400">Marketing Center</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-500/15 text-brand-300' : 'hover:bg-white/5 hover:text-white'}`}>
            <Icon className="h-[18px] w-[18px]" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-5 py-4">
        <div className="truncate text-xs text-slate-400" title={email}>{email}</div>
        <button onClick={onLogout} className="mt-2 flex items-center gap-2 text-sm text-slate-300 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-2 backdrop-blur lg:px-8">
          <button className="btn-ghost !p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
          <div className="flex-1" />
          <div className="relative">
            <button className="btn-ghost relative !p-2" onClick={openBell} aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {notes.unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
            </button>
            {bell && (
              <div className="absolute right-0 mt-2 w-[min(90vw,360px)] rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">Notifications</div>
                <div className="max-h-96 overflow-y-auto">
                  {notes.notifications.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">Nothing new.</div>}
                  {notes.notifications.map((n) => (
                    <a key={n.id} href={n.link || '#'} className="block border-b border-slate-50 px-4 py-3 hover:bg-slate-50">
                      <div className={`text-sm font-medium ${n.kind === 'error' ? 'text-red-700' : 'text-slate-800'}`}>{n.title}</div>
                      {n.body && <div className="text-xs text-slate-500">{n.body}</div>}
                      <div className="mt-1 text-[11px] text-slate-400">{fmtRelative(n.created_at)}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
