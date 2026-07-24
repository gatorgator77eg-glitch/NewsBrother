import { useState, useEffect } from 'react';
import { getCorrelationTicker } from '../api';

interface WatchlistItem {
  symbol: string;
  addedAt: string;
}

interface TickerData {
  symbol: string;
  name: string;
  sector: string;
  correlation: number;
  toneBreakdown: { positive: number; negative: number; neutral: number };
}

const STORAGE_KEY = 'politicalNewsWatchlist';

function loadWatchlist(): WatchlistItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const defaultSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'JNJ'];

export default function Watchlist({ onBack }: { onBack: () => void }) {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(loadWatchlist);
  const [tickerData, setTickerData] = useState<Record<string, TickerData>>({});
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const initWatchlist = () => {
    if (watchlist.length === 0) {
      const initial = defaultSymbols.map(s => ({ symbol: s, addedAt: new Date().toISOString() }));
      setWatchlist(initial);
      saveWatchlist(initial);
    }
  };

  useEffect(() => { initWatchlist(); }, []);

  useEffect(() => {
    for (const item of watchlist) {
      if (!tickerData[item.symbol] && !loading[item.symbol]) {
        setLoading(prev => ({ ...prev, [item.symbol]: true }));
        getCorrelationTicker(item.symbol, 30)
          .then(d => {
            setTickerData(prev => ({
              ...prev,
              [item.symbol]: {
                symbol: item.symbol,
                name: d.ticker.name,
                sector: d.ticker.sector,
                correlation: d.correlation,
                toneBreakdown: d.toneBreakdown,
              },
            }));
          })
          .catch(() => {})
          .finally(() => setLoading(prev => ({ ...prev, [item.symbol]: false })));
      }
    }
  }, [watchlist]);

  const addSymbol = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || watchlist.some(w => w.symbol === sym)) return;
    const updated = [...watchlist, { symbol: sym, addedAt: new Date().toISOString() }];
    setWatchlist(updated);
    saveWatchlist(updated);
    setNewSymbol('');
  };

  const removeSymbol = (symbol: string) => {
    const updated = watchlist.filter(w => w.symbol !== symbol);
    setWatchlist(updated);
    saveWatchlist(updated);
    setTickerData(prev => { const next = { ...prev }; delete next[symbol]; return next; });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Watchlist</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{watchlist.length} tickers tracked</p>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <input
          value={newSymbol}
          onChange={e => setNewSymbol(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSymbol()}
          placeholder="Add ticker (e.g. AAPL)"
          className="flex-1 max-w-xs px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button onClick={addSymbol}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          Add
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ticker</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sector</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Correlation</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tone (+/-)</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {watchlist.map(item => {
              const d = tickerData[item.symbol];
              const isLoading = loading[item.symbol];
              return (
                <tr key={item.symbol} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{item.symbol}</span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {isLoading ? <span className="animate-pulse text-gray-300">Loading...</span> : d?.name || '—'}
                  </td>
                  <td className="px-5 py-3">
                    {d?.sector && (
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                        {d.sector}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {d && (
                      <span className={`text-sm font-medium ${d.correlation > 0 ? 'text-green-600 dark:text-green-400' : d.correlation < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                        {d.correlation > 0 ? '+' : ''}{d.correlation.toFixed(3)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {d && (
                      <div className="flex items-center justify-end gap-1.5 text-xs">
                        <span className="text-green-600 dark:text-green-400">{d.toneBreakdown.positive}</span>
                        <span className="text-gray-300 dark:text-gray-600">/</span>
                        <span className="text-red-500 dark:text-red-400">{d.toneBreakdown.negative}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => removeSymbol(item.symbol)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {watchlist.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No tickers in watchlist. Add one above.
          </div>
        )}
      </div>
    </div>
  );
}
