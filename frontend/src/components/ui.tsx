import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {icon && <span className="text-brand-500">{icon}</span>}
      </div>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: 'bg-brand-100 text-brand-800', red: 'bg-red-100 text-red-700', yellow: 'bg-amber-100 text-amber-800',
  blue: 'bg-sky-100 text-sky-800', gray: 'bg-slate-100 text-slate-700', purple: 'bg-violet-100 text-violet-800',
};
export function Badge({ color = 'gray', children }: { color?: keyof typeof BADGE | string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[color] || BADGE.gray}`}>{children}</span>;
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'gray', active: 'green', paused: 'yellow', completed: 'blue', cancelled: 'red',
  queued: 'gray', sending: 'purple', sent: 'green', failed: 'red', skipped: 'yellow', bounced: 'red',
  new: 'blue', contacted: 'purple', quoted: 'yellow', won: 'green', lost: 'red',
  success: 'green', running: 'purple',
};
const STATUS_LABEL: Record<string, string> = { active: 'Running', queued: 'Waiting', completed: 'Finished' };
export function StatusBadge({ status }: { status: string }) {
  return <Badge color={STATUS_COLOR[status] || 'gray'}>{STATUS_LABEL[status] || status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-brand-500 ${className}`} />;
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Spinner />{text}</div>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <XCircle className="mt-0.5 h-5 w-5 flex-none" />
      <div className="flex-1">{error}</div>
      {onRetry && <button className="btn-secondary !py-1" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Notice({ kind = 'info', children, title }: { kind?: 'info' | 'warning' | 'success' | 'error'; children: ReactNode; title?: string }) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-900', warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-brand-200 bg-brand-50 text-brand-900', error: 'border-red-200 bg-red-50 text-red-800',
  }[kind];
  const Icon = { info: Info, warning: AlertTriangle, success: CheckCircle2, error: XCircle }[kind];
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-5 w-5 flex-none" />
      <div>{title && <div className="font-semibold">{title}</div>}{children}</div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <div className="font-semibold text-slate-700">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl bg-white shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, children, confirmLabel = 'Yes, continue', danger, busy, onConfirm, onClose }:
  { open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <button className="btn-secondary" onClick={onClose}>Never mind</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>{busy && <Spinner className="!h-4 !w-4 !text-white" />}{confirmLabel}</button>
    </>}>
      <div className="text-sm text-slate-600">{children}</div>
    </Modal>
  );
}

export function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 flex-none rounded-full transition ${checked ? 'bg-brand-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
      <span><span className="text-sm font-medium text-slate-800">{label}</span>{help && <span className="block text-xs text-slate-500">{help}</span>}</span>
    </label>
  );
}

export function Progress({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className={`h-full rounded-full ${p >= 100 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return <div><label className="label">{label}</label>{children}{help && <p className="help">{help}</p>}</div>;
}

// ---------- toasts ----------
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ${t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'success' ? 'bg-night-900 text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
            {t.kind === 'success' ? <CheckCircle2 className="h-5 w-5 flex-none text-brand-400" /> : t.kind === 'error' ? <XCircle className="h-5 w-5 flex-none" /> : <Info className="h-5 w-5 flex-none text-sky-500" />}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X className="h-4 w-4 opacity-70" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
