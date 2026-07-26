import { useState, useEffect, useRef, useCallback } from 'react';
import { searchTickers } from '../api';

export default function TickerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await searchTickers(q);
      setResults(r);
      setOpen(r.length > 0);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fmt = (n: number) => {
    if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    return n.toLocaleString();
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1.5 gap-2 w-full sm:w-64">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value.toUpperCase()); if (e.target.value.length === 0) { setResults([]); setOpen(false); } }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Ticker lookup..."
          className="bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none w-full"
        />
        {loading && <div className="animate-spin rounded-full h-3 w-3 border border-gray-400 border-t-transparent shrink-0" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute right-0 mt-1 w-72 sm:w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {results.map((t: any) => (
            <div
              key={t.symbol}
              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
              onClick={() => { navigator.clipboard.writeText(t.symbol); setOpen(false); setQuery(''); }}
              title="Click to copy ticker"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">{t.symbol}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t.exchange || '—'}</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{t.name || '—'}</div>
              <div className="flex gap-2 mt-0.5">
                {t.sector && <span className="text-[10px] text-gray-400">{t.sector}</span>}
                {t.market_cap > 0 && <span className="text-[10px] text-gray-400">${fmt(t.market_cap)}</span>}
              </div>
            </div>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-gray-400 text-center">Click to copy ticker to clipboard</div>
        </div>
      )}
    </div>
  );
}
