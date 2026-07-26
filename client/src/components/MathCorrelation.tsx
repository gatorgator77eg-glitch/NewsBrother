import { useState, useEffect, useCallback } from 'react';

type Tab = 'matrix' | 'spearman' | 'beta' | 'coint' | 'granger';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'matrix', label: 'Pearson Matrix', icon: '🔗' },
  { id: 'spearman', label: 'Spearman', icon: '📊' },
  { id: 'beta', label: 'Beta & Alpha', icon: '📉' },
  { id: 'coint', label: 'Cointegration', icon: '🧪' },
  { id: 'granger', label: 'Granger', icon: '🔬' },
];

const DEFAULT_TICKERS = 'AAPL,MSFT,GOOGL,AMZN,META,TSLA,NVDA,JPM';

export default function MathCorrelation({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('matrix');
  const [symbols, setSymbols] = useState(DEFAULT_TICKERS);
  const [symbol, setSymbol] = useState('AAPL');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const base = '/api/math/correlation';
      let url = '';
      if (tab === 'matrix') url = `${base}/matrix?symbols=${symbols}&days=252`;
      else if (tab === 'spearman') url = `${base}/spearman?symbols=${symbols}&days=252`;
      else if (tab === 'beta') url = `${base}/beta-alpha/${symbol}?benchmark=SPY&days=252`;
      else if (tab === 'coint') url = `${base}/cointegration?s1=${symbol}&s2=MSFT&days=252`;
      else url = `${base}/granger/${symbol}?cause=SPY&days=252`;
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch { }
    setLoading(false);
  }, [tab, symbols, symbol]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">← Back</button>
        <h1 className="text-2xl font-bold">🔗 Correlation Analysis</h1>
      </div>
      <div className="flex gap-2 mb-4">
        {(tab === 'matrix' || tab === 'spearman') ? (
          <input value={symbols} onChange={e => setSymbols(e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm flex-1" placeholder="Comma-separated symbols" />
        ) : (
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="px-3 py-2 bg-gray-800 border border-gray-600 rounded w-32 text-sm" placeholder="Symbol" />
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
          {(tab === 'matrix' || tab === 'spearman') && <MatrixViz data={data} />}
          {tab === 'beta' && <BetaViz data={data} />}
          {tab === 'coint' && <CointViz data={data} />}
          {tab === 'granger' && <GrangerViz data={data} />}
        </div>
      )}
    </div>
  );
}

function MatrixViz({ data }: { data: any }) {
  const symbols = data?.symbols || [], matrix = data?.matrix || {};
  if (symbols.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data available</div>;
  const n = symbols.length;
  const cellSize = 60;
  const pad = 80;
  const sz = pad + n * cellSize;
  const getColor = (v: number) => {
    if (v > 0.5) return `rgba(34,197,94,${v})`;
    if (v > 0) return `rgba(34,197,94,${v * 0.6})`;
    if (v > -0.5) return `rgba(239,68,68,${-v * 0.6})`;
    return `rgba(239,68,68,${-v})`;
  };
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">{data.type === 'spearman' ? 'Spearman' : 'Pearson'} Correlation Matrix</h3>
      <svg viewBox={`0 0 ${sz} ${sz}`} className="w-full max-w-lg">
        {symbols.map((s1: string, i: number) => symbols.map((s2: string, j: number) => (
          <g key={`${i}-${j}`}>
            <rect x={pad + j * cellSize} y={pad + i * cellSize} width={cellSize - 2} height={cellSize - 2} fill={getColor(matrix[s1][s2])} rx="4" />
            <text x={pad + j * cellSize + cellSize / 2} y={pad + i * cellSize + cellSize / 2 + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{matrix[s1][s2].toFixed(2)}</text>
          </g>
        )))}
        {symbols.map((s: string, i: number) => (
          <g key={`lbl-${i}`}>
            <text x={pad - 5} y={pad + i * cellSize + cellSize / 2 + 4} textAnchor="end" fill="#9CA3AF" fontSize="10">{s}</text>
            <text x={pad + i * cellSize + cellSize / 2} y={pad - 8} textAnchor="middle" fill="#9CA3AF" fontSize="10">{s}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BetaViz({ data }: { data: any }) {
  const beta = data?.beta ?? 0, alpha = data?.alpha ?? 0, sharpe = data?.sharpe ?? 0;
  const treynor = data?.treynor ?? 0, informationRatio = data?.informationRatio ?? 0, correlation = data?.correlation ?? 0;
  const metrics = [
    { label: 'Beta', value: beta.toFixed(3), color: Math.abs(beta) > 1 ? 'text-yellow-400' : 'text-blue-400' },
    { label: 'Alpha (ann.)', value: `${(alpha * 100).toFixed(2)}%`, color: alpha > 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Sharpe', value: sharpe.toFixed(3), color: sharpe > 1 ? 'text-green-400' : 'text-gray-400' },
    { label: 'Treynor', value: treynor.toFixed(4), color: 'text-blue-400' },
    { label: 'Info Ratio', value: informationRatio.toFixed(3), color: informationRatio > 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Correlation', value: correlation.toFixed(4), color: 'text-purple-400' },
  ];
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Beta & Alpha — {data.symbol} vs {data.benchmark}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-gray-900 rounded p-3 text-center">
            <div className="text-xs text-gray-400">{m.label}</div>
            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CointViz({ data }: { data: any }) {
  const w = 800, h = 250, pad = 50;
  const res = data?.residuals || [];
  const vals = res.map((r: any) => r.residual ?? 0);
  if (vals.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No data</div>;
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const sx = (i: number) => pad + (i / Math.max(res.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Cointegration — {data.symbol1} vs {data.symbol2}</h3>
      <div className="flex gap-4 mb-3">
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">ADF Stat</div><div className={`text-lg font-bold ${data.isCointegrated ? 'text-green-400' : 'text-red-400'}`}>{data.engleGrangerStat.toFixed(3)}</div></div>
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Cointegrated?</div><div className={`text-lg font-bold ${data.isCointegrated ? 'text-green-400' : 'text-red-400'}`}>{data.isCointegrated ? 'YES' : 'NO'}</div></div>
        <div className="bg-gray-900 rounded p-3 text-center"><div className="text-xs text-gray-400">Hedge Ratio</div><div className="text-lg font-bold text-blue-400">{data.beta.toFixed(3)}</div></div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={sy(0)} x2={w - pad} y2={sy(0)} stroke="#4B5563" strokeWidth="1" strokeDasharray="4,4" />
        <polyline points={res.map((_: any, i: number) => `${sx(i)},${sy(vals[i])}`).join(' ')} fill="none" stroke="#60A5FA" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function GrangerViz({ data }: { data: any }) {
  const cause = data?.cause ?? 'N/A', symbol = data?.symbol ?? 'N/A', conclusion = data?.conclusion ?? '';
  const results = data?.results || [];
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Granger Causality — {cause} → {symbol}</h3>
      <div className="bg-gray-900 rounded p-3 mb-4 text-sm text-gray-300">{conclusion}</div>
      <div className="bg-gray-900 rounded p-4">
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 border-b border-gray-700"><th className="py-2 text-left">Lag</th><th className="py-2 text-left">F-Stat</th><th className="py-2 text-left">Significant</th></tr></thead>
          <tbody>
            {results.map((r: any) => (
              <tr key={r.lag} className="border-b border-gray-700/50">
                <td className="py-2 text-gray-300">{r.lag}</td>
                <td className="py-2 text-blue-400 font-mono">{(r.fStat ?? 0).toFixed(4)}</td>
                <td className="py-2">{r.significant ? <span className="text-green-400">✓ Yes (p&lt;0.05)</span> : <span className="text-gray-500">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
