import { useState, useEffect, useCallback } from 'react';

type Tab = 'fourier' | 'zscore' | 'portfolio' | 'frontier' | 'pca';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'fourier', label: 'Fourier', icon: '🌊' },
  { id: 'zscore', label: 'Z-Score', icon: '📈' },
  { id: 'portfolio', label: 'Portfolio', icon: '💼' },
  { id: 'frontier', label: 'Frontier', icon: '📊' },
  { id: 'pca', label: 'PCA', icon: '🧬' },
];

export default function MathAdvanced({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('fourier');
  const [symbol, setSymbol] = useState('AAPL');
  const [symbols, setSymbols] = useState('AAPL,MSFT,GOOGL,AMZN,META');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const base = '/api/math/advanced';
      let url = '';
      if (tab === 'portfolio' || tab === 'pca') url = `${base}/${tab}?symbols=${symbols}&days=252`;
      else if (tab === 'frontier') url = `${base}/efficient-frontier/${symbol}?benchmark=SPY&days=502`;
      else url = `${base}/${tab}/${symbol}?days=500${tab === 'zscore' ? '&window=20' : ''}`;
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch { }
    setLoading(false);
  }, [tab, symbol, symbols]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← Back</button>
        <h1 className="text-2xl font-bold">🧬 Advanced Analysis</h1>
      </div>
      <div className="flex gap-2 mb-4">
        {(tab === 'portfolio' || tab === 'pca') ? (
          <input value={symbols} onChange={e => setSymbols(e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm flex-1" placeholder="Comma-separated symbols" />
        ) : (
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded w-32 text-sm" placeholder="Symbol" />
        )}
      </div>
      <div className="flex gap-1 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 rounded text-sm ${tab === t.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}>{t.icon} {t.label}</button>
        ))}
      </div>
      {loading && <div className="text-gray-400">Loading...</div>}
      {data && !loading && (
        <div className="space-y-6">
          {tab === 'fourier' && <FourierViz data={data} />}
          {tab === 'zscore' && <ZScoreViz data={data} />}
          {tab === 'portfolio' && <PortfolioViz data={data} />}
          {tab === 'frontier' && <FrontierViz data={data} />}
          {tab === 'pca' && <PCAViz data={data} />}
        </div>
      )}
    </div>
  );
}

function FourierViz({ data }: { data: any }) {
  const { topCycles, dominantCycleDays, spectrum } = data;
  const w = 800, h = 300, pad = 60;
  const powers = spectrum.map((s: any) => s.power);
  const maxP = Math.max(...powers);
  const sx = (i: number) => pad + (i / Math.max(spectrum.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - v / maxP) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Fourier Transform — {data.symbol}</h3>
      <div className="bg-gray-900 rounded p-3 mb-3"><span className="text-gray-400">Dominant cycle: </span><span className="text-lg font-bold text-blue-400">{dominantCycleDays} days</span></div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        {spectrum.map((s: any, i: number) => (
          <rect key={i} x={sx(i) - 1} y={sy(s.power)} width={3} height={sy(0) - sy(s.power)} fill="#3B82F6" opacity="0.7" />
        ))}
      </svg>
      <div className="grid grid-cols-5 gap-2 mt-3">
        {topCycles.map((c: any, i: number) => (
          <div key={i} className="bg-gray-900 rounded p-2 text-center">
            <div className="text-xs text-gray-400">Cycle {i + 1}</div>
            <div className="text-sm font-bold text-blue-400">{Math.round(c.period)}d</div>
            <div className="text-xs text-gray-500">{c.pctPower.toFixed(1)}% power</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZScoreViz({ data }: { data: any }) {
  const { series, current, stats } = data;
  const w = 800, h = 300, pad = 60;
  const vals = series.map((s: any) => s.zScore);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const sx = (i: number) => pad + (i / Math.max(vals.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  const getSignalColor = (s: string) => s === 'strong_buy' ? '#22C55E' : s === 'buy' ? '#86EFAC' : s === 'strong_sell' ? '#EF4444' : s === 'sell' ? '#FCA5A5' : '#9CA3AF';
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Z-Score Mean Reversion — {data.symbol}</h3>
      {current && (
        <div className="flex gap-4 mb-4">
          <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Current Z</div><div className="text-xl font-bold" style={{ color: getSignalColor(current.signal) }}>{current.zScore.toFixed(3)}</div></div>
          <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Signal</div><div className="text-xl font-bold" style={{ color: getSignalColor(current.signal) }}>{current.signal.replace('_', ' ').toUpperCase()}</div></div>
          <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Mean Z</div><div className="text-lg font-bold text-gray-300">{stats.meanZ.toFixed(3)}</div></div>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={sy(2)} x2={w - pad} y2={sy(2)} stroke="#EF4444" strokeWidth="0.5" strokeDasharray="4,4" />
        <line x1={pad} y1={sy(1)} x2={w - pad} y2={sy(1)} stroke="#FCA5A5" strokeWidth="0.5" strokeDasharray="4,4" />
        <line x1={pad} y1={sy(0)} x2={w - pad} y2={sy(0)} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={sy(-1)} x2={w - pad} y2={sy(-1)} stroke="#86EFAC" strokeWidth="0.5" strokeDasharray="4,4" />
        <line x1={pad} y1={sy(-2)} x2={w - pad} y2={sy(-2)} stroke="#22C55E" strokeWidth="0.5" strokeDasharray="4,4" />
        <polyline points={vals.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ')} fill="none" stroke="#60A5FA" strokeWidth="1.5" />
      </svg>
      <div className="text-xs text-gray-400 mt-1">Green = buy zone (Z{'<'}-1), Red = sell zone (Z{'>'}1)</div>
    </div>
  );
}

function PortfolioViz({ data }: { data: any }) {
  const { optimalPortfolio, minVariance, means, vols, frontier } = data;
  const w = 800, h = 400, pad = 60;
  const rets = frontier.map((p: any) => p.ret);
  const volsAll = frontier.map((p: any) => p.vol);
  const minRet = Math.min(...rets), maxRet = Math.max(...rets);
  const minVol = Math.min(...volsAll), maxVol = Math.max(...volsAll);
  const sx = (v: number) => pad + (v - minVol) / Math.max(maxVol - minVol, 0.001) * (w - 2 * pad);
  const sy = (r: number) => pad + (1 - (r - minRet) / Math.max(maxRet - minRet, 0.001)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Markowitz Optimal Portfolio</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-green-900/30 rounded p-3">
          <div className="text-sm text-green-400 font-semibold">Max Sharpe Portfolio</div>
          <div className="text-xs text-gray-400">Return: {(optimalPortfolio.return * 100).toFixed(1)}% | Vol: {(optimalPortfolio.vol * 100).toFixed(1)}% | Sharpe: {optimalPortfolio.sharpe.toFixed(3)}</div>
          <div className="text-xs text-gray-500 mt-1">{Object.entries(optimalPortfolio.weights).filter(([_, w]: [string, any]) => w > 0.05).map(([s, w]: [string, any]) => `${s}: ${(w * 100).toFixed(0)}%`).join(' | ')}</div>
        </div>
        <div className="bg-blue-900/30 rounded p-3">
          <div className="text-sm text-blue-400 font-semibold">Min Variance Portfolio</div>
          <div className="text-xs text-gray-400">Return: {(minVariance.return * 100).toFixed(1)}% | Vol: {(minVariance.vol * 100).toFixed(1)}% | Sharpe: {minVariance.sharpe.toFixed(3)}</div>
          <div className="text-xs text-gray-500 mt-1">{Object.entries(minVariance.weights).filter(([_, w]: [string, any]) => w > 0.05).map(([s, w]: [string, any]) => `${s}: ${(w * 100).toFixed(0)}%`).join(' | ')}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        {frontier.map((p: any, i: number) => (
          <circle key={i} cx={sx(p.vol)} cy={sy(p.ret)} r={p.sharpe === optimalPortfolio.sharpe ? 6 : 3} fill={p.sharpe === optimalPortfolio.sharpe ? '#22C55E' : p.sharpe === minVariance.sharpe ? '#3B82F6' : '#6B7280'} />
        ))}
        <circle cx={sx(optimalPortfolio.vol)} cy={sy(optimalPortfolio.return)} r="8" fill="none" stroke="#22C55E" strokeWidth="2" />
        <circle cx={sx(minVariance.vol)} cy={sy(minVariance.return)} r="8" fill="none" stroke="#3B82F6" strokeWidth="2" />
        <text x={w - pad - 10} y={h - pad + 20} textAnchor="end" fill="#9CA3AF" fontSize="10">Volatility →</text>
        <text x={15} y={pad + 10} fill="#9CA3AF" fontSize="10">← Return</text>
      </svg>
    </div>
  );
}

function FrontierViz({ data }: { data: any }) {
  const { frontier, alpha, beta, stockReturn, stockVol, benchReturn, benchVol, sharpeStock, sharpeBench } = data;
  const w = 800, h = 400, pad = 60;
  const rets = frontier.map((p: any) => p.expectedReturn);
  const vols = frontier.map((p: any) => p.volatility);
  const minRet = Math.min(...rets), maxRet = Math.max(...rets);
  const minVol = Math.min(...vols), maxVol = Math.max(...vols);
  const sx = (v: number) => pad + (v - minVol) / Math.max(maxVol - minVol, 0.001) * (w - 2 * pad);
  const sy = (r: number) => pad + (1 - (r - minRet) / Math.max(maxRet - minRet, 0.001)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Efficient Frontier — {data.symbol} vs {data.benchmark}</h3>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Alpha', value: `${(alpha * 100).toFixed(2)}%`, color: alpha > 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Beta', value: beta.toFixed(3), color: 'text-blue-400' },
          { label: 'Sharpe (Stock)', value: sharpeStock.toFixed(3), color: 'text-yellow-400' },
          { label: 'Sharpe (Bench)', value: sharpeBench.toFixed(3), color: 'text-gray-400' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 rounded p-2 text-center">
            <div className="text-xs text-gray-400">{m.label}</div>
            <div className={`text-sm font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        {frontier.map((p: any, i: number) => {
          const x = sx(p.volatility), y = sy(p.expectedReturn);
          return <circle key={i} cx={x} cy={y} r="4" fill={p.weight > 0.9 ? '#3B82F6' : p.weight < 0.1 ? '#22C55E' : '#A855F7'} />;
        })}
        <circle cx={sx(stockVol)} cy={sy(stockReturn)} r="6" fill="#3B82F6" />
        <circle cx={sx(benchVol)} cy={sy(benchReturn)} r="6" fill="#22C55E" />
        <text x={sx(stockVol) + 10} y={sy(stockReturn) - 8} fill="#3B82F6" fontSize="10">{data.symbol}</text>
        <text x={sx(benchVol) + 10} y={sy(benchReturn) - 8} fill="#22C55E" fontSize="10">{data.benchmark}</text>
        <text x={w - pad - 10} y={h - pad + 20} textAnchor="end" fill="#9CA3AF" fontSize="10">Volatility →</text>
        <text x={15} y={pad + 10} fill="#9CA3AF" fontSize="10">← Return</text>
      </svg>
    </div>
  );
}

function PCAViz({ data }: { data: any }) {
  const { loadings, nComponents } = data;
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Principal Component Analysis</h3>
      <div className="grid grid-cols-5 gap-2 mb-4">
        {loadings.map((l: any) => (
          <div key={l.component} className="bg-gray-900 rounded p-3 text-center">
            <div className="text-xs text-gray-400">PC{l.component}</div>
            <div className="text-lg font-bold text-blue-400">{l.varianceExplained.toFixed(1)}%</div>
            <div className="text-xs text-gray-500">Cum: {l.cumulativeVariance.toFixed(1)}%</div>
          </div>
        ))}
      </div>
      <div className="bg-gray-900 rounded p-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Component Loadings</h4>
        {loadings.map((l: any) => (
          <div key={l.component} className="mb-3">
            <div className="text-xs text-gray-400 mb-1">PC{l.component} ({l.varianceExplained.toFixed(1)}%)</div>
            <div className="flex gap-1 flex-wrap">
              {Object.entries(l.loadings).map(([ticker, loading]: [string, any]) => {
                const absVal = Math.abs(loading);
                const bg = loading > 0 ? `rgba(34,197,94,${absVal})` : `rgba(239,68,68,${absVal})`;
                return (
                  <div key={ticker} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: bg }}>
                    <span className="text-white font-mono">{ticker}</span>
                    <span className="text-gray-300 ml-1">{(loading * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
