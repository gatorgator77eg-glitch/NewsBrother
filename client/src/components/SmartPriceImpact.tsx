import { useState } from 'react';

interface ImpactEvent {
  date: string;
  articleCount: number;
  avgTone: number;
  titles: string[];
  actualReturn: number;
  abnormalReturn: number;
  arZScore: number;
  volumeSpike: number;
  impactScore: number;
  estimatedLagHours: number;
  direction: string;
}

interface ImpactData {
  ticker: { symbol: string; name: string; sector: string };
  events: ImpactEvent[];
  summary: {
    totalEvents: number;
    avgImpact: number;
    avgLag: number;
    impactByCategory: { highImpact: number; mediumImpact: number; lowImpact: number };
    normalReturn: number;
    returnVolatility: number;
  };
}

function impactBadge(dir: string) {
  if (dir === 'bullish') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
  if (dir === 'bearish') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
  return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
}

export default function SmartPriceImpact({ onBack }: { onBack: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(false);

  const search = () => {
    if (!symbol.trim()) return;
    setLoading(true);
    fetch(`/api/smart/impact/${symbol.trim().toUpperCase()}?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Price Impact Analyzer</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Event study: how much news moves prices</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input value={symbol} onChange={e => setSymbol(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ticker (e.g. AAPL)"
          className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
          <option value={14}>14 days</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
        </select>
        <button onClick={search} disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.summary.totalEvents}</p>
              <p className="text-[11px] text-gray-500 mt-1">News Events</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.summary.avgImpact}%</p>
              <p className="text-[11px] text-gray-500 mt-1">Avg Impact</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.summary.avgLag}h</p>
              <p className="text-[11px] text-gray-500 mt-1">Avg Lag</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.summary.returnVolatility}%</p>
              <p className="text-[11px] text-gray-500 mt-1">Volatility</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.summary.normalReturn}%</p>
              <p className="text-[11px] text-gray-500 mt-1">Avg Return</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center">
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{data.summary.impactByCategory.highImpact}</p>
              <p className="text-[11px] text-red-500">High Impact</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-center">
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{data.summary.impactByCategory.mediumImpact}</p>
              <p className="text-[11px] text-amber-500">Medium Impact</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
              <p className="text-xl font-bold text-gray-500 dark:text-gray-400">{data.summary.impactByCategory.lowImpact}</p>
              <p className="text-[11px] text-gray-500">Low Impact</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Event Impact Ranking</h2>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {data.events.map((e, i) => (
                <div key={i} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400 w-20">{e.date}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${impactBadge(e.direction)}`}>
                        {e.direction}
                      </span>
                      <span className="text-[10px] text-gray-400">{e.articleCount} articles</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className={`font-mono ${e.abnormalReturn > 0 ? 'text-green-600 dark:text-green-400' : e.abnormalReturn < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                        AR {e.abnormalReturn > 0 ? '+' : ''}{e.abnormalReturn}%
                      </span>
                      <span className="text-gray-400">Vol {e.volumeSpike}x</span>
                      <span className="font-bold text-gray-700 dark:text-gray-300">IS {e.impactScore}</span>
                    </div>
                  </div>
                  {e.titles.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate ml-20">{e.titles[0]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="text-5xl mb-4">💥</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">Enter a ticker to analyze news price impact</p>
        </div>
      )}
    </div>
  );
}
