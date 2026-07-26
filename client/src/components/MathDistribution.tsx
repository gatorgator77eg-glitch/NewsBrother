import { useState, useEffect, useCallback } from 'react';

type Tab = 'returns' | 'normality' | 'skewkurt';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'returns', label: 'Returns Dist.', icon: '📊' },
  { id: 'normality', label: 'Normality Tests', icon: '🧪' },
  { id: 'skewkurt', label: 'Skew & Kurtosis', icon: '📈' },
];

export default function MathDistribution({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('returns');
  const [symbol, setSymbol] = useState('AAPL');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const base = '/api/math/distribution';
      const url = tab === 'skewkurt' ? `${base}/skewness-kurtosis/${symbol}?window=60` : `${base}/${tab}/${symbol}?days=252`;
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch { }
    setLoading(false);
  }, [tab, symbol]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← Back</button>
        <h1 className="text-2xl font-bold">📊 Distribution Analysis</h1>
      </div>
      <div className="flex gap-2 mb-4">
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded w-32 text-sm" placeholder="Symbol" />
      </div>
      <div className="flex gap-1 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 rounded text-sm ${tab === t.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>{t.icon} {t.label}</button>
        ))}
      </div>
      {loading && <div className="text-gray-400">Loading...</div>}
      {data && !loading && (
        <div className="space-y-6">
          {tab === 'returns' && <ReturnsViz data={data} />}
          {tab === 'normality' && <NormalViz data={data} />}
          {tab === 'skewkurt' && <SkewKurtViz data={data} />}
        </div>
      )}
    </div>
  );
}

function ReturnsViz({ data }: { data: any }) {
  const histogram = data?.histogram || [], mean = data?.mean ?? 0, std = data?.std ?? 0;
  const skewness = data?.skewness ?? 0, kurtosis = data?.kurtosis ?? 0;
  const positivePct = data?.positivePct ?? 0, bestDay = data?.bestDay ?? 0, worstDay = data?.worstDay ?? 0;
  const annualizedReturn = data?.annualizedReturn ?? 0, annualizedVol = data?.annualizedVol ?? 0;
  if (histogram.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data available</div>;
  const w = 800, h = 400, pad = 60;
  const maxCount = Math.max(...histogram.map((b: any) => Math.max(b.count ?? 0, b.normalDensity ?? 0)), 1);
  const barW = (w - 2 * pad) / histogram.length;
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Log Returns Distribution — {data.symbol}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Mean', value: mean.toFixed(6) },
          { label: 'Std Dev', value: std.toFixed(6) },
          { label: 'Skewness', value: skewness.toFixed(3), color: skewness > 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Kurtosis', value: kurtosis.toFixed(3), color: kurtosis > 0 ? 'text-yellow-400' : 'text-blue-400' },
          { label: 'Positive %', value: `${positivePct.toFixed(1)}%`, color: positivePct > 50 ? 'text-green-400' : 'text-red-400' },
          { label: 'Best Day', value: `${(bestDay * 100).toFixed(2)}%`, color: 'text-green-400' },
          { label: 'Worst Day', value: `${(worstDay * 100).toFixed(2)}%`, color: 'text-red-400' },
          { label: 'Ann. Return', value: `${(annualizedReturn * 100).toFixed(1)}%`, color: annualizedReturn > 0 ? 'text-green-400' : 'text-red-400' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 rounded p-2 text-center">
            <div className="text-xs text-gray-400">{m.label}</div>
            <div className={`text-sm font-bold ${m.color || 'text-gray-200'}`}>{m.value}</div>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {histogram.map((b: any, i: number) => (
          <g key={i}>
            <rect x={pad + i * barW} y={h - pad - (b.count / maxCount) * (h - 2 * pad)} width={barW - 1} height={(b.count / maxCount) * (h - 2 * pad)} fill="#3B82F6" opacity="0.7" />
            <rect x={pad + i * barW} y={h - pad - (b.normalDensity / maxCount) * (h - 2 * pad)} width={barW - 1} height={(b.normalDensity / maxCount) * (h - 2 * pad)} fill="#F59E0B" opacity="0.5" />
          </g>
        ))}
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
      </svg>
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        <span><span className="text-blue-400">■</span> Histogram</span>
        <span><span className="text-yellow-400">■</span> Normal Fit</span>
      </div>
    </div>
  );
}

function NormalViz({ data }: { data: any }) {
  const jarqueBera = data?.jarqueBera || { statistic: 0, isNormal: false };
  const andersonDarling = data?.andersonDarling || { statistic: 0, isNormal: false };
  const percentiles = data?.percentiles || [];
  const conclusion = data?.conclusion ?? 'Unknown';
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Normality Tests — {data.symbol}</h3>
      <div className={`bg-gray-900 rounded p-3 mb-4 text-center text-lg font-bold ${conclusion === 'Normal' ? 'text-green-400' : 'text-yellow-400'}`}>{conclusion}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-900 rounded p-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Jarque-Bera Test</h4>
          <div className="text-sm text-gray-400">Statistic: <span className="text-blue-400 font-mono">{jarqueBera.statistic.toFixed(4)}</span></div>
          <div className="text-sm text-gray-400">Normal? <span className={jarqueBera.isNormal ? 'text-green-400' : 'text-red-400'}>{jarqueBera.isNormal ? 'Yes (p>0.05)' : 'No (fat tails/skew)'}</span></div>
        </div>
        <div className="bg-gray-900 rounded p-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Anderson-Darling</h4>
          <div className="text-sm text-gray-400">Statistic: <span className="text-blue-400 font-mono">{andersonDarling.statistic.toFixed(4)}</span></div>
          <div className="text-sm text-gray-400">Normal? <span className={andersonDarling.isNormal ? 'text-green-400' : 'text-red-400'}>{andersonDarling.isNormal ? 'Yes' : 'No'}</span></div>
        </div>
      </div>
      <div className="bg-gray-900 rounded p-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Percentiles</h4>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1">
          {percentiles.map((p: any) => (
            <div key={p.percentile} className="text-center text-xs">
              <div className="text-gray-500">{p.percentile}%</div>
              <div className="text-blue-400 font-mono">{(p.value * 100).toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkewKurtViz({ data }: { data: any }) {
  const series = data?.series || [], avgSkew = data?.avgSkew ?? 0, avgKurt = data?.avgKurt ?? 0;
  const currentSkew = data?.currentSkew ?? 0, currentKurt = data?.currentKurt ?? 0;
  const interpretation = data?.interpretation || {};
  if (series.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data available</div>;
  const w = 800, h = 300, pad = 60;
  const skews = series.map((s: any) => s.skewness ?? 0);
  const kurts = series.map((s: any) => s.kurtosis ?? 0);
  const allV = [...skews, ...kurts];
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const sx = (i: number) => pad + (i / Math.max(series.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Rolling Skewness & Kurtosis — {data.symbol}</h3>
      <div className="flex gap-4 mb-3">
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Avg Skew</div><div className="text-lg font-bold text-blue-400">{avgSkew.toFixed(3)}</div><div className="text-xs text-gray-500">{interpretation?.skewness}</div></div>
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Avg Kurt</div><div className="text-lg font-bold text-yellow-400">{avgKurt.toFixed(3)}</div><div className="text-xs text-gray-500">{interpretation?.kurtosis}</div></div>
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Current Skew</div><div className="text-lg font-bold text-purple-400">{currentSkew.toFixed(3)}</div></div>
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Current Kurt</div><div className="text-lg font-bold text-orange-400">{currentKurt.toFixed(3)}</div></div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={sy(0)} x2={w - pad} y2={sy(0)} stroke="#4B5563" strokeWidth="1" strokeDasharray="4,4" />
        <polyline points={skews.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ')} fill="none" stroke="#3B82F6" strokeWidth="1.5" />
        <polyline points={kurts.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ')} fill="none" stroke="#F59E0B" strokeWidth="1.5" />
      </svg>
      <div className="flex gap-4 mt-2 text-xs text-gray-400"><span><span className="text-blue-400">━━</span> Skewness</span><span><span className="text-yellow-400">━━</span> Kurtosis (excess)</span></div>
    </div>
  );
}
