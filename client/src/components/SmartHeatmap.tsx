import { useState, useEffect } from 'react';

interface SectorEntry { sector: string; articleCount: number; tickerCount: number; velocityScore: number; }
interface TickerHeat { symbol: string; name: string; sector: string; articleCount: number; avgTone: number; sourceCount: number; }
interface HourlyPat { hour: number; dayOfWeek: number; count: number; }
interface Anomaly { symbol: string; name: string; sector: string; articleCount: number; expectedCount: number; deviation: number; isAnomaly: boolean; }

interface HeatmapData {
  sectors: SectorEntry[];
  tickerHeatmap: TickerHeat[];
  hourlyPattern: HourlyPat[];
  anomalies: Anomaly[];
  summary: { totalSectors: number; totalTickersWithNews: number; totalAnomalies: number };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function heatColor(value: number, max: number): string {
  const pct = Math.min(value / Math.max(max, 1), 1);
  if (pct > 0.7) return 'bg-red-500 dark:bg-red-400 text-white';
  if (pct > 0.4) return 'bg-amber-400 dark:bg-amber-500 text-gray-900';
  if (pct > 0.15) return 'bg-yellow-200 dark:bg-yellow-700 text-gray-800';
  return 'bg-gray-100 dark:bg-gray-700 text-gray-400';
}

function toneColor(t: number): string {
  if (t > 1) return 'text-green-600 dark:text-green-400';
  if (t < -1) return 'text-red-500 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

export default function SmartHeatmap({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'sectors' | 'tickers' | 'hourly' | 'anomalies'>('sectors');

  useEffect(() => {
    fetch('/api/smart/heatmap')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxSectorArticles = data ? Math.max(...data.sectors.map(s => s.articleCount), 1) : 1;
  const maxTickerArticles = data ? Math.max(...data.tickerHeatmap.map(t => t.articleCount), 1) : 1;
  const maxHourly = data ? Math.max(...data.hourlyPattern.map(h => h.count), 1) : 1;

  const tabs = [
    { id: 'sectors' as const, label: 'Sectors', icon: '🏭' },
    { id: 'tickers' as const, label: 'Tickers', icon: '📊' },
    { id: 'hourly' as const, label: 'Hourly', icon: '🕐' },
    { id: 'anomalies' as const, label: 'Anomalies', icon: '⚠️', badge: data?.anomalies.length },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Velocity Heatmap</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {data ? `${data.summary.totalSectors} sectors · ${data.summary.totalTickersWithNews} tickers with news · ${data.summary.totalAnomalies} anomalies` : 'Loading...'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}>
            {t.icon} {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : !data ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <p className="text-gray-400">Failed to load heatmap data.</p>
        </div>
      ) : (
        <>
          {tab === 'sectors' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
                {data.sectors.map(s => (
                  <div key={s.sector} className={`rounded-xl p-4 ${heatColor(s.articleCount, maxSectorArticles)}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{s.sector}</span>
                      <span className="text-[10px] opacity-70">{s.tickerCount} tickers</span>
                    </div>
                    <p className="text-2xl font-bold">{s.articleCount}</p>
                    <p className="text-[10px] opacity-60">velocity: {s.velocityScore}/ticker</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'tickers' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-5 py-2.5 text-[11px] font-medium text-gray-500 uppercase">Ticker</th>
                    <th className="text-left px-5 py-2.5 text-[11px] font-medium text-gray-500 uppercase">Sector</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-medium text-gray-500 uppercase">Articles</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-medium text-gray-500 uppercase">Tone</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-medium text-gray-500 uppercase">Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tickerHeatmap.map(t => {
                    const pct = t.articleCount / maxTickerArticles;
                    return (
                      <tr key={t.symbol} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: pct > 0.7 ? '#ef4444' : pct > 0.3 ? '#f59e0b' : '#22c55e' }} />
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{t.symbol}</span>
                            <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-xs text-gray-500">{t.sector}</td>
                        <td className="px-5 py-2.5 text-right text-sm font-medium text-gray-900 dark:text-gray-100">{t.articleCount}</td>
                        <td className={`px-5 py-2.5 text-right text-sm font-medium ${toneColor(t.avgTone)}`}>
                          {t.avgTone.toFixed(1)}
                        </td>
                        <td className="px-5 py-2.5 text-right text-xs text-gray-500">{t.sourceCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'hourly' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">News Distribution by Hour × Day</h2>
              <div className="overflow-x-auto">
                <table className="min-w-[600px]">
                  <thead>
                    <tr>
                      <th className="text-[10px] text-gray-400 w-12"></th>
                      {Array.from({ length: 24 }, (_, h) => (
                        <th key={h} className="text-[9px] text-gray-400 text-center px-0.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day, dow) => (
                      <tr key={dow}>
                        <td className="text-[10px] text-gray-500 font-medium py-0.5">{day}</td>
                        {Array.from({ length: 24 }, (_, h) => {
                          const entry = data.hourlyPattern.find(e => e.hour === h && e.dayOfWeek === dow);
                          const count = entry?.count || 0;
                          return (
                            <td key={h} className="p-0.5">
                              <div className={`w-full h-6 rounded-sm flex items-center justify-center text-[8px] font-medium ${
                                count === 0 ? 'bg-gray-50 dark:bg-gray-800 text-transparent' :
                                count >= maxHourly * 0.7 ? 'bg-red-400 dark:bg-red-500 text-white' :
                                count >= maxHourly * 0.3 ? 'bg-amber-300 dark:bg-amber-600 text-gray-800' :
                                'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                              }`}>
                                {count > 0 ? count : ''}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 mt-3">Darker = more articles published at that time</p>
            </div>
          )}

          {tab === 'anomalies' && (
            <div className="space-y-3">
              {data.anomalies.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 text-center">
                  <p className="text-gray-400">No anomalies detected — all tickers within expected ranges.</p>
                </div>
              ) : (
                data.anomalies.map(a => (
                  <div key={a.symbol} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm flex items-center gap-4 border border-amber-200 dark:border-amber-800">
                    <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center text-xl">⚠️</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-gray-100">{a.symbol}</span>
                        <span className="text-xs text-gray-400">{a.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500">{a.sector}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {a.articleCount} articles (expected ~{a.expectedCount}) — {a.deviation}x deviation
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{a.deviation}x</p>
                      <p className="text-[10px] text-gray-400">above expected</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
