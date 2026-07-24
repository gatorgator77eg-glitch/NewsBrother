import { useState } from 'react';

interface VelocityData {
  ticker: { symbol: string; name: string; sector: string };
  velocityScore: number;
  velocityAlert: string;
  todayArticles: number;
  avgDaily: number;
  trendSlope: number;
  trendDirection: string;
  acceleration: number;
  sourceDiversityIndex: number;
  todaySourceCount: number;
  dailyHistory: { date: string; count: number; domains: string[]; sourceDiversity: number }[];
  hourlyDistribution: { hour: number; count: number }[];
  totalArticles: number;
}

function alertColor(alert: string) {
  if (alert === 'spike') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700';
  if (alert === 'elevated') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700';
  if (alert === 'low') return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600';
  return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700';
}

function trendIcon(dir: string) {
  if (dir === 'accelerating') return { icon: '📈', color: 'text-green-600 dark:text-green-400' };
  if (dir === 'decelerating') return { icon: '📉', color: 'text-red-500 dark:text-red-400' };
  return { icon: '➡️', color: 'text-gray-400' };
}

export default function SmartVelocityScanner({ onBack }: { onBack: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [data, setData] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(false);

  const search = () => {
    if (!symbol.trim()) return;
    setLoading(true);
    fetch(`/api/smart/velocity/${symbol.trim().toUpperCase()}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const maxCount = data ? Math.max(...data.dailyHistory.map(d => d.count), 1) : 1;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Velocity Scanner</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Measure how fast news is hitting a company</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <input value={symbol} onChange={e => setSymbol(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Enter ticker (e.g. AAPL)"
          className="flex-1 max-w-xs px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        <button onClick={search} disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className={`rounded-2xl p-5 border text-center ${alertColor(data.velocityAlert)}`}>
              <p className="text-3xl font-bold">{data.velocityScore}</p>
              <p className="text-xs font-medium mt-1 uppercase">{data.velocityAlert} velocity</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{data.todayArticles}</p>
              <p className="text-xs text-gray-500 mt-1">Articles Today</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{data.avgDaily}</p>
              <p className="text-xs text-gray-500 mt-1">7d Avg/Day</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className={`text-3xl font-bold ${trendIcon(data.trendDirection).color}`}>
                {trendIcon(data.trendDirection).icon}
              </p>
              <p className="text-xs text-gray-500 mt-1 capitalize">{data.trendDirection}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">30-Day Article Volume</h2>
              <div className="flex items-end gap-1 h-32">
                {data.dailyHistory.slice().reverse().map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className="w-full bg-blue-500 dark:bg-blue-400 rounded-t transition-all hover:bg-blue-600"
                         style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }} />
                    <div className="absolute -top-8 hidden group-hover:block bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                      {d.date}: {d.count} articles
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-2">
                <span>{data.dailyHistory[data.dailyHistory.length - 1]?.date?.slice(5)}</span>
                <span>{data.dailyHistory[0]?.date?.slice(5)}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Hourly Distribution (7d)</h2>
              <div className="flex items-end gap-0.5 h-32">
                {Array.from({ length: 24 }, (_, h) => {
                  const entry = data.hourlyDistribution.find(e => e.hour === h);
                  const maxH = Math.max(...data.hourlyDistribution.map(e => e.count), 1);
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      <div className="w-full bg-purple-500 dark:bg-purple-400 rounded-t hover:bg-purple-600 transition-all"
                           style={{ height: `${((entry?.count || 0) / maxH) * 100}%`, minHeight: (entry?.count || 0) > 0 ? '2px' : '0' }} />
                      <div className="absolute -top-8 hidden group-hover:block bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                        {h}:00 — {entry?.count || 0} articles
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-2">
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Acceleration</p>
              <p className={`text-xl font-bold ${data.acceleration >= 1.5 ? 'text-green-600' : data.acceleration < 0.7 ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                {data.acceleration}x
              </p>
              <p className="text-[10px] text-gray-400">vs previous 7d</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Source Diversity</p>
              <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{data.sourceDiversityIndex}x</p>
              <p className="text-[10px] text-gray-400">{data.todaySourceCount} sources today</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Total Articles</p>
              <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{data.totalArticles.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400">in archive</p>
            </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="text-5xl mb-4">📡</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">Enter a ticker to scan news velocity</p>
        </div>
      )}
    </div>
  );
}
