import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Loads data from the API and keeps track of loading / error states. */
export function useApi<T = any>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!url) return;
    const n = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const d = await api.get<T>(url);
      if (n === seq.current) { setData(d); setError(''); }
    } catch (e: any) {
      if (n === seq.current) setError(e.message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
