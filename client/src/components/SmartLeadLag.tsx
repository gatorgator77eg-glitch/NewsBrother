import { useState } from 'react';

interface LagEntry { lag: number; correlation: number; pValue: number; }
interface DecayEntry { hours: number; correlation: number; }
interface LeadLagData {
  ticker: { symbol: string; name: string; sector: string };
  lagCorrelations: LagEntry[];
  signalDecay: DecayEntry[];
  granger: { significant: boolean; fStat: number; pValue: number; optimalLag: number };
  bestPredictiveLag: { lag: number; correlation: number; pValue: number } | null;
  dataPoints: number;
}

export default function SmartLeadLag({ onBack }: { onBack: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [data, setData] = useState<LeadLagData | null>(null);
  const [loading, setLoading] = useState(false);

  const search = () => {
    if (!symbol.trim()) return;
    setLoading(true);
    fetch(`/api/smart/lead-lag/${symbol.trim().toUpperCase()}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const corrColor = (c: number, p: number) => {
    if (p >= 0.1) return 'text-gray-300 dark:text-gray-600';
    if (c > 0) return 'text-green-600 dark:text-green-400';
    return 'text-red-500 dark:text-red-400';
  };

  const maxCorr = data ? Math.max(...data.lagCorrelations.map(l => Math.abs(l.correlation)), 0.01) : 1;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sentiment Lead-Lag</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Does sentiment predict price movement?</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <input value={symbol} onChange={e => setSymbol(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Ticker (e.g. AAPL)"
          className="flex-1 max-w-xs px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        <button onClick={search} disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {data && !loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Granger Causality</p>
              <p className={`text-xl font-bold ${data.granger.significant ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                {data.granger.significant ? 'Significant' : 'Not Significant'}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">F={data.granger.fStat} p={data.granger.pValue}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Optimal Predictive Lag</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {data.bestPredictiveLag ? `${data.bestPredictiveLag.lag}d` : 'None'}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {data.bestPredictiveLag ? `r=${data.bestPredictiveLag.correlation} p=${data.bestPredictiveLag.pValue}` : 'No significant lag found'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Best Positive Lag</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">
                {data.lagCorrelations.filter(l => l.lag > 0 && l.pValue < 0.1).sort((a, b) => b.correlation - a.correlation)[0]
                  ? `+${data.lagCorrelations.filter(l => l.lag > 0 && l.pValue < 0.1).sort((a, b) => b.correlation - a.correlation)[0].lag}d`
                  : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Data Points</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.dataPoints}</p>
              <p className="text-[10px] text-gray-400 mt-1">aligned days</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm mb-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Lag Correlation Map</h2>
            <p className="text-[11px] text-gray-400 mb-3">Positive lag = sentiment leads price. Negative lag = price leads sentiment.</p>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-px min-w-[600px] h-40">
                {data.lagCorrelations.map((l, i) => {
                  const barH = (Math.abs(l.correlation) / maxCorr) * 100;
                  const isPositive = l.correlation > 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      <div className={`w-full rounded-t transition-all ${
                        l.pValue < 0.05
                          ? isPositive ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'
                          : l.pValue < 0.1
                            ? isPositive ? 'bg-green-300 dark:bg-green-600' : 'bg-red-300 dark:bg-red-600'
                            : 'bg-gray-200 dark:bg-gray-600'
                      }`} style={{ height: `${barH}%`, minHeight: l.correlation !== 0 ? '2px' : '0' }} />
                      <div className="absolute -top-10 hidden group-hover:block bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        Lag {l.lag > 0 ? `+${l.lag}` : l.lag}d: r={l.correlation} p={l.pValue}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-2 min-w-[600px]">
                <span>{data.lagCorrelations[0]?.lag}d</span>
                <span className="font-medium">0 (now)</span>
                <span>+{data.lagCorrelations[data.lagCorrelations.length - 1]?.lag}d</span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded" /> Positive (sig p&lt;0.05)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded" /> Negative (sig p&lt;0.05)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-300 rounded" /> Not significant</span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Signal Decay Curve</h2>
            <div className="flex items-end gap-2 h-32">
              {data.signalDecay.map((d, i) => {
                const maxD = Math.max(...data.signalDecay.map(x => Math.abs(x.correlation)), 0.01);
                const barH = (Math.abs(d.correlation) / maxD) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className={`w-full rounded-t ${d.correlation > 0 ? 'bg-blue-500 dark:bg-blue-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                         style={{ height: `${barH}%`, minHeight: d.correlation !== 0 ? '2px' : '0' }} />
                    <p className="text-[10px] text-gray-400 mt-1.5">{d.hours}h</p>
                    <div className="absolute -top-8 hidden group-hover:block bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                      {d.hours}h: r={d.correlation.toFixed(3)}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Shows how sentiment-price correlation decays over hours. Higher = more persistent signal.</p>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="text-5xl mb-4">🔗</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">Enter a ticker to analyze lead-lag relationships</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Tests if sentiment predicts future price movements</p>
        </div>
      )}
    </div>
  );
}
