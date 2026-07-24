import { useState, useEffect, useCallback } from 'react';

type Tab = 'historical' | 'var' | 'montecarlo' | 'drawdown';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'historical', label: 'Historical Vol', icon: '📉' },
  { id: 'var', label: 'Value at Risk', icon: '⚠️' },
  { id: 'montecarlo', label: 'Monte Carlo', icon: '🎲' },
  { id: 'drawdown', label: 'Drawdown', icon: '📊' },
];

export default function MathVolatility({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('historical');
  const [symbol, setSymbol] = useState('AAPL');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const base = '/api/math/volatility';
      const url = `${base}/${tab}/${symbol}?days=252${tab === 'var' ? '&confidence=0.95' : ''}${tab === 'montecarlo' ? '&simulations=100&horizon=252' : ''}`;
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
        <h1 className="text-2xl font-bold">⚡ Volatility & Risk</h1>
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
          {tab === 'historical' && <HistVolViz data={data} />}
          {tab === 'var' && <VaRViz data={data} />}
          {tab === 'montecarlo' && <MCViz data={data} />}
          {tab === 'drawdown' && <DDViz data={data} />}
        </div>
      )}
    </div>
  );
}

function HistVolViz({ data }: { data: any }) {
  const { series, latestVol, windows } = data;
  const w = 800, h = 350, pad = 60;
  const allVals = Object.values(series).flat().map((s: any) => s.volatility);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const colors = ['#3B82F6', '#10B981', '#F59E0B'];
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Historical Volatility — {data.symbol}</h3>
      <div className="bg-gray-900 rounded p-3 mb-3"><span className="text-gray-400 text-sm">Latest Vol (20d): </span><span className="text-lg font-bold text-yellow-400">{(latestVol * 100).toFixed(1)}%</span></div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        {Object.entries(series).map(([key, vals]: [string, any], idx) => {
          const sx = (i: number) => pad + (i / Math.max(vals.length - 1, 1)) * (w - 2 * pad);
          const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
          return <polyline key={key} points={vals.map((v: any, i: number) => `${sx(i)},${sy(v.volatility)}`).join(' ')} fill="none" stroke={colors[idx % colors.length]} strokeWidth="1.5" />;
        })}
      </svg>
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        {windows.map((w: number, i: number) => <span key={w}><span style={{ color: colors[i] }}>━━</span> {w}d</span>)}
      </div>
    </div>
  );
}

function VaRViz({ data }: { data: any }) {
  const metrics = [
    { label: 'Historical VaR (95%)', value: `${(data.historicalVaR * 100).toFixed(2)}%`, sub: `$${Math.abs(data.historicalVaRDollar).toLocaleString()}`, color: 'text-red-400' },
    { label: 'Parametric VaR', value: `${(data.parametricVaR * 100).toFixed(2)}%`, sub: `$${Math.abs(data.parametricVaRDollar).toLocaleString()}`, color: 'text-orange-400' },
    { label: 'Historical CVaR', value: `${(data.historicalCVaR * 100).toFixed(2)}%`, sub: 'Expected shortfall', color: 'text-red-500' },
    { label: 'Daily VaR', value: `${(data.historicalVaR * 100).toFixed(2)}%`, sub: `1-day horizon`, color: 'text-yellow-400' },
    { label: 'Weekly VaR', value: `${(data.hpVaR * 100).toFixed(2)}%`, sub: `$${Math.abs(data.hpVaRDollar).toLocaleString()}`, color: 'text-orange-500' },
    { label: 'Worst Day', value: `${(data.stats.min * 100).toFixed(2)}%`, sub: '', color: 'text-red-400' },
  ];
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Value at Risk — {data.symbol}</h3>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-gray-900 rounded p-3 text-center">
            <div className="text-xs text-gray-400">{m.label}</div>
            <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
            {m.sub && <div className="text-xs text-gray-500">{m.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MCViz({ data }: { data: any }) {
  const { paths, percentiles, stats, lastPrice, horizon } = data;
  const w = 800, h = 400, pad = 60;
  const allPrices = percentiles.flatMap((p: any) => [p.p5, p.p95]);
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices);
  const sx = (i: number) => pad + (i / horizon) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minP) / Math.max(maxP - minP, 0.01)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Monte Carlo Simulation — {data.symbol}</h3>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900 rounded p-2 text-center"><div className="text-xs text-gray-400">Last Price</div><div className="text-sm font-bold text-blue-400">${lastPrice.toFixed(2)}</div></div>
        <div className="bg-gray-900 rounded p-2 text-center"><div className="text-xs text-gray-400">Mean</div><div className="text-sm font-bold text-green-400">${stats.mean.toFixed(2)}</div></div>
        <div className="bg-gray-900 rounded p-2 text-center"><div className="text-xs text-gray-400">Prob Up</div><div className="text-sm font-bold text-green-400">{stats.probUp.toFixed(1)}%</div></div>
        <div className="bg-gray-900 rounded p-2 text-center"><div className="text-xs text-gray-400">Exp. Return</div><div className={`text-sm font-bold ${stats.expectedReturn > 0 ? 'text-green-400' : 'text-red-400'}`}>{stats.expectedReturn.toFixed(1)}%</div></div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <polygon
          points={percentiles.map((p: any) => `${sx(p.day)},${sy(p.p95)}`).concat([...percentiles].reverse().map((p: any) => `${sx(p.day)},${sy(p.p5)}`)).join(' ')}
          fill="rgba(59,130,246,0.1)" stroke="none"
        />
        <polyline points={percentiles.map((p: any) => `${sx(p.day)},${sy(p.p95)}`).join(' ')} fill="none" stroke="#3B82F6" strokeWidth="1" strokeDasharray="3,3" />
        <polyline points={percentiles.map((p: any) => `${sx(p.day)},${sy(p.p50)}`).join(' ')} fill="none" stroke="#3B82F6" strokeWidth="2" />
        <polyline points={percentiles.map((p: any) => `${sx(p.day)},${sy(p.p5)}`).join(' ')} fill="none" stroke="#3B82F6" strokeWidth="1" strokeDasharray="3,3" />
        {paths.slice(0, 20).map((path: number[], i: number) => (
          <polyline key={i} points={path.map((p, j) => `${sx(j)},${sy(p)}`).join(' ')} fill="none" stroke="rgba(156,163,175,0.15)" strokeWidth="0.5" />
        ))}
      </svg>
      <div className="flex gap-4 mt-2 text-xs text-gray-400"><span><span className="text-blue-400">━━</span> Median</span><span><span className="text-blue-400">╌╌</span> 5th-95th %ile</span><span><span className="text-gray-500">━</span> Sample paths</span></div>
    </div>
  );
}

function DDViz({ data }: { data: any }) {
  const { underwater, maxDrawdown, maxDDDuration, recoveryDays, stats } = data;
  const w = 800, h = 300, pad = 60;
  const vals = underwater.map((u: any) => u.underwater);
  const minV = Math.min(...vals), maxV = 0;
  const sx = (i: number) => pad + (i / Math.max(vals.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Drawdown Analysis — {data.symbol}</h3>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Max Drawdown', value: `${(maxDrawdown * 100).toFixed(1)}%`, color: 'text-red-400' },
          { label: 'Duration', value: `${maxDDDuration} days`, color: 'text-yellow-400' },
          { label: 'Recovery', value: `${recoveryDays} days`, color: 'text-blue-400' },
          { label: 'Current DD', value: `${(stats.currentDrawdown * 100).toFixed(1)}%`, color: stats.currentDrawdown < -0.05 ? 'text-red-400' : 'text-green-400' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 rounded p-2 text-center">
            <div className="text-xs text-gray-400">{m.label}</div>
            <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={sy(0)} x2={w - pad} y2={sy(0)} stroke="#4B5563" strokeWidth="1" />
        <polygon
          points={`${sx(0)},${sy(0)} ${vals.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ')} ${sx(vals.length - 1)},${sy(0)}`}
          fill="rgba(239,68,68,0.2)" stroke="none"
        />
        <polyline points={vals.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ')} fill="none" stroke="#EF4444" strokeWidth="1.5" />
      </svg>
      <div className="text-xs text-gray-400 mt-1">Red area = underwater (drawdown from peak)</div>
    </div>
  );
}
