import { useState, useEffect, useCallback } from 'react';

type Tab = 'linear' | 'exponential' | 'polynomial' | 'trend';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'linear', label: 'Linear', icon: '📈' },
  { id: 'exponential', label: 'Exponential', icon: '📊' },
  { id: 'polynomial', label: 'Polynomial', icon: '🔮' },
  { id: 'trend', label: 'Moving Trend', icon: '📉' },
];

export default function MathRegression({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('linear');
  const [symbol, setSymbol] = useState('AAPL');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(252);
  const [degree, setDegree] = useState(3);

  const fetchData = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const base = '/api/math/regression';
      const url = tab === 'trend' ? `${base}/trend/${symbol}?window=20` : `${base}/${tab}/${symbol}?days=${days}${tab === 'polynomial' ? `&degree=${degree}` : ''}`;
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch { }
    setLoading(false);
  }, [tab, symbol, days, degree]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← Back</button>
        <h1 className="text-2xl font-bold">📈 Regression Analysis</h1>
      </div>
      <div className="flex gap-2 mb-4">
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded w-32 text-sm" placeholder="Symbol" />
        <select value={days} onChange={e => setDays(+e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm">
          <option value={60}>60d</option><option value={120}>120d</option><option value={252}>1Y</option><option value={504}>2Y</option><option value={1260}>5Y</option>
        </select>
        {tab === 'polynomial' && (
          <select value={degree} onChange={e => setDegree(+e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm">
            <option value={2}>Degree 2</option><option value={3}>Degree 3</option><option value={4}>Degree 4</option><option value={5}>Degree 5</option>
          </select>
        )}
      </div>
      <div className="flex gap-1 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 rounded text-sm ${tab === t.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>{t.icon} {t.label}</button>
        ))}
      </div>
      {loading && <div className="text-gray-400">Loading...</div>}
      {data && !loading && (
        <div className="space-y-6">
          {tab === 'linear' && <LinearViz data={data} />}
          {tab === 'exponential' && <ExpViz data={data} />}
          {tab === 'polynomial' && <PolyViz data={data} />}
          {tab === 'trend' && <TrendViz data={data} />}
        </div>
      )}
    </div>
  );
}

function LinearViz({ data }: { data: any }) {
  const r2 = data?.r2 ?? 0, slope = data?.slope ?? 0, intercept = data?.intercept ?? 0;
  const tStat = data?.tStat ?? 0, annualizedReturnPct = data?.annualizedReturnPct ?? 0;
  const trendLine = data?.trendLine || [], startDate = data?.startDate ?? '', endDate = data?.endDate ?? '';
  if (trendLine.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data available</div>;
  const w = 800, h = 400, pad = 60;
  const prices = trendLine.map((d: any) => d.actual ?? 0);
  const preds = trendLine.map((d: any) => d.predicted ?? 0);
  const allVals = [...prices, ...preds];
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const scaleX = (i: number) => pad + (i / Math.max(trendLine.length - 1, 1)) * (w - 2 * pad);
  const scaleY = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Linear Regression — {data.symbol}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'R²', value: r2.toFixed(4), color: r2 > 0.7 ? 'text-green-400' : 'text-yellow-400' },
          { label: 'Slope', value: slope.toFixed(6), color: slope > 0 ? 'text-green-400' : 'text-red-400' },
          { label: 't-Stat', value: tStat.toFixed(2), color: Math.abs(tStat) > 2 ? 'text-green-400' : 'text-gray-400' },
          { label: 'Ann. Return', value: `${annualizedReturnPct.toFixed(1)}%`, color: annualizedReturnPct > 0 ? 'text-green-400' : 'text-red-400' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 rounded p-3 text-center">
            <div className="text-xs text-gray-400">{m.label}</div>
            <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <polyline points={trendLine.map((_: any, i: number) => `${scaleX(i)},${scaleY(prices[i])}`).join(' ')} fill="none" stroke="#60A5FA" strokeWidth="1.5" />
        <polyline points={trendLine.map((_: any, i: number) => `${scaleX(i)},${scaleY(preds[i])}`).join(' ')} fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4,4" />
        <text x={w / 2} y={h - 10} textAnchor="middle" fill="#9CA3AF" fontSize="11">{startDate} → {endDate}</text>
      </svg>
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        <span><span className="text-blue-400">━━</span> Actual</span>
        <span><span className="text-yellow-400">╌╌</span> Trend</span>
      </div>
    </div>
  );
}

function ExpViz({ data }: { data: any }) {
  const growthRate = data?.growthRate ?? 0, baseValue = data?.baseValue ?? 0, r2 = data?.r2 ?? 0;
  const fitLine = data?.fitLine || [];
  if (fitLine.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data available</div>;
  const w = 800, h = 400, pad = 60;
  const prices = fitLine.map((d: any) => d.actual ?? 0);
  const preds = fitLine.map((d: any) => d.predicted ?? 0);
  const allV = [...prices, ...preds];
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const sx = (i: number) => pad + (i / Math.max(fitLine.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  const dailyGrowth = Math.exp(growthRate) - 1;
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Exponential Regression — {data.symbol}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Daily Growth</div><div className="text-lg font-bold text-green-400">{(dailyGrowth * 100).toFixed(3)}%</div></div>
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">R² (Log)</div><div className="text-lg font-bold text-blue-400">{r2.toFixed(4)}</div></div>
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Base Value</div><div className="text-lg font-bold text-yellow-400">${baseValue.toFixed(2)}</div></div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <polyline points={fitLine.map((_: any, i: number) => `${sx(i)},${sy(prices[i])}`).join(' ')} fill="none" stroke="#60A5FA" strokeWidth="1.5" />
        <polyline points={fitLine.map((_: any, i: number) => `${sx(i)},${sy(preds[i])}`).join(' ')} fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="4,4" />
      </svg>
      <div className="flex gap-4 mt-2 text-xs text-gray-400"><span><span className="text-blue-400">━━</span> Actual</span><span><span className="text-green-400">╌╌</span> Exponential Fit</span></div>
    </div>
  );
}

function PolyViz({ data }: { data: any }) {
  const degree = data?.degree ?? 0, r2 = data?.r2 ?? 0;
  const fitLine = data?.fitLine || [], coefficients = data?.coefficients || [];
  if (fitLine.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data available</div>;
  const w = 800, h = 400, pad = 60;
  const prices = fitLine.map((d: any) => d.actual ?? 0);
  const preds = fitLine.map((d: any) => d.predicted ?? 0);
  const allV = [...prices, ...preds];
  const minV = Math.min(...allV), maxV = Math.max(...allV);
  const sx = (i: number) => pad + (i / Math.max(fitLine.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Polynomial (Degree {degree}) — {data.symbol}</h3>
      <div className="flex gap-4 mb-4">
        <div className="bg-gray-900 rounded p-3"><div className="text-xs text-gray-400">R²</div><div className="text-lg font-bold text-blue-400">{r2.toFixed(4)}</div></div>
        <div className="bg-gray-900 rounded p-3"><div className="text-xs text-gray-400">Coefficients</div><div className="text-sm text-gray-300">[{coefficients.map((c: number) => c.toExponential(2)).join(', ')}]</div></div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <polyline points={fitLine.map((_: any, i: number) => `${sx(i)},${sy(prices[i])}`).join(' ')} fill="none" stroke="#60A5FA" strokeWidth="1.5" />
        <polyline points={fitLine.map((_: any, i: number) => `${sx(i)},${sy(preds[i])}`).join(' ')} fill="none" stroke="#A855F7" strokeWidth="2" strokeDasharray="4,4" />
      </svg>
      <div className="flex gap-4 mt-2 text-xs text-gray-400"><span><span className="text-blue-400">━━</span> Actual</span><span><span className="text-purple-400">╌╌</span> Polynomial Fit</span></div>
    </div>
  );
}

function TrendViz({ data }: { data: any }) {
  const trendSlopes = data?.trendSlopes || [], currentSlope = data?.currentSlope ?? 0;
  const avgSlope = data?.avgSlope ?? 0, trend = data?.trend ?? 'neutral', window = data?.window ?? 20;
  if (trendSlopes.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data available</div>;
  const w = 800, h = 300, pad = 60;
  const vals = trendSlopes.map((s: any) => s.slope ?? 0);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const sx = (i: number) => pad + (i / Math.max(vals.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  const trendColor = trend.includes('up') ? '#22C55E' : trend === 'neutral' ? '#EAB308' : '#EF4444';
  const trendLabel = trend.replace('_', ' ').toUpperCase();
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Moving Trend ({window}-day) — {data.symbol}</h3>
      <div className="flex gap-4 mb-4">
        <div className="bg-gray-900 rounded p-3"><div className="text-xs text-gray-400">Current Slope</div><div className="text-lg font-bold" style={{ color: trendColor }}>{currentSlope.toFixed(6)}</div></div>
        <div className="bg-gray-900 rounded p-3"><div className="text-xs text-gray-400">Avg Slope</div><div className="text-lg font-bold text-gray-300">{avgSlope.toFixed(6)}</div></div>
        <div className="bg-gray-900 rounded p-3"><div className="text-xs text-gray-400">Trend</div><div className="text-lg font-bold" style={{ color: trendColor }}>{trendLabel}</div></div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={sy(avgSlope)} x2={w - pad} y2={sy(avgSlope)} stroke="#4B5563" strokeWidth="1" strokeDasharray="4,4" />
        <polyline points={vals.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ')} fill="none" stroke={trendColor} strokeWidth="2" />
      </svg>
      <div className="text-xs text-gray-400 mt-2">Dashed line = average slope</div>
    </div>
  );
}
