import { FormEvent, useState } from 'react';
import { LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui';

export default function LoginPage({ onLogin }: { onLogin: (u: { email: string }) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api.post('/api/auth/login', { email, password });
      onLogin(d.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-night-950 p-4" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(34,197,94,.18), transparent 40%), radial-gradient(circle at 80% 80%, rgba(168,85,247,.15), transparent 40%)' }}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-glow">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-3 h-14 w-14" />
          <h1 className="text-xl font-bold text-slate-900">Captain Glow Mini Golf</h1>
          <p className="text-sm text-slate-500">Marketing Center: please sign in</p>
        </div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input mb-4" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label className="label" htmlFor="pw">Password</label>
        <input id="pw" className="input mb-4" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy ? <Spinner className="!h-4 !w-4 !text-white" /> : <LogIn className="h-4 w-4" />}Sign in</button>
        <p className="mt-4 text-center text-xs text-slate-400">Forgot your password? See "Lost password" in the README, or ask whoever set up your hosting.</p>
      </form>
    </div>
  );
}
