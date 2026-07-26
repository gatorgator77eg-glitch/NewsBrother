import { useState, useEffect, useCallback } from 'react';

type Tab = 'acf' | 'hurst' | 'stationarity' | 'entropy';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'acf', label: 'Autocorrelation', icon: '📊' },
  { id: 'hurst', label: 'Hurst Exponent', icon: '📈' },
  { id: 'stationarity', label: 'Stationarity', icon: '🧪' },
  { id: 'entropy', label: 'Entropy', icon: '🎲' },
];

export default function MathTimeSeries({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('acf');
  const [symbol, setSymbol] = useState('AAPL');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const base = '/api/math/time-series';
      const url = `${base}/${tab}/${symbol}?days=252`;
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
        <h1 className="text-2xl font-bold">⏱️ Time Series Analysis</h1>
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
          {tab === 'acf' && <ACFViz data={data} />}
          {tab === 'hurst' && <HurstViz data={data} />}
          {tab === 'stationarity' && <StationViz data={data} />}
          {tab === 'entropy' && <EntropyViz data={data} />}
        </div>
      )}
    </div>
  );
}

function ACFViz({ data }: { data: any }) {
  const acf = data?.acf || [];
  const significantThreshold = data?.significantThreshold ?? 0;
  if (acf.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No ACF data available</div>;
  const w = 800, h = 350, pad = 60;
  const vals = acf.map((a: any) => a.acf);
  const maxAbs = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals)), 0.1);
  const sy = (v: number) => pad + (0.5 - v / (2 * maxAbs)) * (h - 2 * pad);
  const barW = (w - 2 * pad) / acf.length;
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Autocorrelation Function — {data.symbol}</h3>
      <div className="bg-gray-900 rounded p-2 mb-3 text-sm text-gray-400">Significance threshold: ±{significantThreshold.toFixed(4)}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={sy(0)} x2={w - pad} y2={sy(0)} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={sy(significantThreshold)} x2={w - pad} y2={sy(significantThreshold)} stroke="#4B5563" strokeWidth="0.5" strokeDasharray="4,4" />
        <line x1={pad} y1={sy(-significantThreshold)} x2={w - pad} y2={sy(-significantThreshold)} stroke="#4B5563" strokeWidth="0.5" strokeDasharray="4,4" />
        {acf.map((a: any, i: number) => (
          <g key={i}>
            <rect x={pad + i * barW + barW * 0.2} y={Math.min(sy(a.acf), sy(0))} width={barW * 0.6} height={Math.abs(sy(a.acf) - sy(0))} fill={a.significant ? '#3B82F6' : '#6B7280'} rx="2" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function HurstViz({ data }: { data: any }) {
  const hurst = data?.hurst ?? 0.5;
  const classification = data?.classification ?? 'Unknown';
  const rsValues = data?.rsValues || [];
  const w = 800, h = 300, pad = 60;
  const hurstColor = hurst > 0.6 ? '#22C55E' : hurst < 0.4 ? '#EF4444' : '#EAB308';
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Hurst Exponent — {data.symbol}</h3>
      <div className="flex gap-4 mb-4">
        <div className="bg-gray-900 rounded p-4 text-center">
          <div className="text-xs text-gray-400">Hurst Exponent</div>
          <div className="text-3xl font-bold" style={{ color: hurstColor }}>{hurst.toFixed(4)}</div>
          <div className="text-sm mt-1" style={{ color: hurstColor }}>{classification}</div>
        </div>
        <div className="bg-gray-900 rounded p-4 flex-1">
          <div className="text-sm text-gray-400 mb-2">Interpretation:</div>
          <div className="text-sm text-gray-300">• <span className="text-green-400">H &gt; 0.5</span> = Trending (momentum)</div>
          <div className="text-sm text-gray-300">• <span className="text-yellow-400">H = 0.5</span> = Random walk</div>
          <div className="text-sm text-gray-300">• <span className="text-red-400">H &lt; 0.5</span> = Mean-reverting</div>
        </div>
      </div>
      {rsValues.length > 0 && (
        <div>
          <h4 className="text-sm text-gray-400 mb-2">R/S Analysis</h4>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-h-48">
            {rsValues.map((r: any, i: number) => (
              <circle key={i} cx={60 + (i / Math.max(rsValues.length - 1, 1)) * (w - 120)} cy={h - 40 - (r.rs / Math.max(...rsValues.map((v: any) => v.rs), 1)) * (h - 80)} r="4" fill="#3B82F6" />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

function StationViz({ data }: { data: any }) {
  const adfStat = data?.adfStat ?? 0;
  const criticalValues = data?.criticalValues || {};
  const isStationary = data?.isStationary ?? false;
  const conclusion = data?.conclusion ?? 'Unknown';
  const stats = data?.stats || {};
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Augmented Dickey-Fuller Test — {data.symbol}</h3>
      <div className={`bg-gray-900 rounded p-4 mb-4 text-center text-xl font-bold ${isStationary ? 'text-green-400' : 'text-red-400'}`}>{conclusion}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded p-4">
          <h4 className="text-sm text-gray-300 font-semibold mb-2">Test Statistic</h4>
          <div className="text-2xl font-bold text-blue-400">{adfStat.toFixed(4)}</div>
        </div>
        <div className="bg-gray-900 rounded p-4">
          <h4 className="text-sm text-gray-300 font-semibold mb-2">Critical Values</h4>
          {Object.entries(criticalValues).map(([k, v]) => (
            <div key={k} className="text-sm"><span className="text-gray-400">{k}: </span><span className="text-gray-300">{v as number}</span></div>
          ))}
        </div>
        <div className="bg-gray-900 rounded p-4">
          <h4 className="text-sm text-gray-300 font-semibold mb-2">Stats</h4>
          <div className="text-sm text-gray-400">Mean: <span className="text-gray-300">{stats.mean.toFixed(6)}</span></div>
          <div className="text-sm text-gray-400">Variance: <span className="text-gray-300">{stats.variance.toFixed(6)}</span></div>
        </div>
      </div>
    </div>
  );
}

function EntropyViz({ data }: { data: any }) {
  const rollingEntropy = data?.rollingEntropy || [];
  const totalEntropy = data?.totalEntropy ?? 0;
  const maxEntropy = data?.maxEntropy ?? 0;
  const normalizedEntropy = data?.normalizedEntropy ?? 0;
  const currentEntropy = data?.currentEntropy ?? 0;
  const avgEntropy = data?.avgEntropy ?? 0;
  const classification = data?.classification ?? 'Unknown';
  const w = 800, h = 250, pad = 60;
  const vals = rollingEntropy.map((e: any) => e.entropy ?? 0);
  if (vals.length === 0) return <div className="bg-gray-800 rounded-lg p-4 text-gray-400">No entropy data available</div>;
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const sx = (i: number) => pad + (i / Math.max(vals.length - 1, 1)) * (w - 2 * pad);
  const sy = (v: number) => pad + (1 - (v - minV) / Math.max(maxV - minV, 0.001)) * (h - 2 * pad);
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Shannon Entropy — {data.symbol}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Entropy', value: totalEntropy.toFixed(3), color: 'text-blue-400' },
          { label: 'Normalized', value: normalizedEntropy.toFixed(3), color: 'text-purple-400' },
          { label: 'Current', value: currentEntropy.toFixed(3), color: 'text-green-400' },
          { label: 'Classification', value: classification, color: 'text-yellow-400' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 rounded p-2 text-center">
            <div className="text-xs text-gray-400">{m.label}</div>
            <div className={`text-sm font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#4B5563" strokeWidth="1" />
        <polyline points={vals.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ')} fill="none" stroke="#A855F7" strokeWidth="1.5" />
        <line x1={pad} y1={sy(avgEntropy)} x2={w - pad} y2={sy(avgEntropy)} stroke="#F59E0B" strokeWidth="1" strokeDasharray="4,4" />
      </svg>
      <div className="text-xs text-gray-400 mt-1">Dashed = average entropy</div>
    </div>
  );
}
