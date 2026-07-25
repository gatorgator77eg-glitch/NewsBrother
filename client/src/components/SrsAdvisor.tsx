import { useState, useEffect, useCallback } from 'react';

interface Props { onBack: () => void; }

interface FundScore {
  isin: string;
  name: string;
  fundHouse: string;
  fundType: string;
  category: string;
  riskLevel: string;
  description: string;
  compositeScore: number;
  scores: { momentum: number; sharpe: number; trend: number; valuation: number; macroFit: number };
  explanation: string;
  latestNav: number;
  periodReturns: { '1m': number; '3m': number; '6m': number; '1y': number };
  factsheetUrl: string;
  sharpeRaw: number;
  annualReturn: number;
  volatility: number;
}

interface AdvisorData {
  topPicks: FundScore[];
  allRanked: FundScore[];
  meta: {
    analyzedCount: number;
    totalIsinsWithNav: number;
    skippedBonds: number;
    skippedInsufficient: number;
    riskFreeRate: number;
    inflation: number;
    tbillYield: number;
    timestamp: string;
  };
}

const SCORE_DIMS = [
  { key: 'momentum', label: 'Momentum', icon: '🚀', color: '#22c55e' },
  { key: 'sharpe', label: 'Risk-Adj', icon: '📉', color: '#3b82f6' },
  { key: 'trend', label: 'Trend', icon: '📈', color: '#8b5cf6' },
  { key: 'valuation', label: 'Valuation', icon: '💎', color: '#f59e0b' },
  { key: 'macroFit', label: 'Macro Fit', icon: '🌍', color: '#ec4899' },
] as const;

const RANK_BADGES = ['🥇', '🥈', '🥉'];
const RANK_COLORS = [
  'from-amber-400 to-yellow-500',
  'from-gray-300 to-gray-400',
  'from-amber-600 to-amber-700',
];

function RadarChart({ scores, size = 140 }: { scores: FundScore['scores']; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 20;
  const dims = SCORE_DIMS;
  const n = dims.length;
  const angleStep = (2 * Math.PI) / n;

  const getPoint = (i: number, val: number) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (val / 100) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const polygonPoints = dims.map((d, i) => {
    const p = getPoint(i, scores[d.key as keyof typeof scores]);
    return `${p.x},${p.y}`;
  }).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[20, 40, 60, 80, 100].map(level => (
        <polygon key={level}
          points={dims.map((_, i) => {
            const p = getPoint(i, level);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.1}
          className="text-gray-400"
        />
      ))}
      {dims.map((_, i) => {
        const p = getPoint(i, 100);
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.1} className="text-gray-400" />;
      })}
      <polygon points={polygonPoints} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={1.5} />
      {dims.map((d, i) => {
        const p = getPoint(i, 115);
        return (
          <text key={d.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            className="fill-gray-500 dark:fill-gray-400" fontSize={9}>
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 dark:text-gray-400 w-14 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-gray-600 dark:text-gray-300 w-8 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

function ReturnBadge({ label, value }: { label: string; value: number }) {
  const color = value >= 0
    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400';
  return (
    <div className={`px-2 py-1 rounded-lg text-center ${color}`}>
      <div className="text-[9px] font-medium opacity-70">{label}</div>
      <div className="text-xs font-bold">{value >= 0 ? '+' : ''}{value.toFixed(1)}%</div>
    </div>
  );
}

function PickCard({ fund, rank }: { fund: FundScore; rank: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
      {/* Rank header */}
      <div className={`bg-gradient-to-r ${RANK_COLORS[rank]} px-5 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{RANK_BADGES[rank]}</span>
          <span className="text-white font-bold text-sm">Rank #{rank + 1}</span>
        </div>
        <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
          <span className="text-white font-bold text-lg">{fund.compositeScore.toFixed(1)}</span>
          <span className="text-white/70 text-xs">/100</span>
        </div>
      </div>

      <div className="p-5">
        {/* Fund info */}
        <div className="mb-4">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">{fund.name}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">{fund.fundHouse}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">{fund.fundType}</span>
            {fund.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">{fund.category}</span>}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              fund.riskLevel === 'High' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : fund.riskLevel === 'Medium-High' ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
              : 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            }`}>{fund.riskLevel}</span>
          </div>
        </div>

        {/* Radar + Scores */}
        <div className="flex gap-4 mb-4">
          <div className="flex-shrink-0">
            <RadarChart scores={fund.scores} size={130} />
          </div>
          <div className="flex-1 space-y-1.5 justify-center flex flex-col">
            {SCORE_DIMS.map(d => (
              <ScoreBar key={d.key} label={d.label} value={fund.scores[d.key as keyof typeof fund.scores]} color={d.color} />
            ))}
          </div>
        </div>

        {/* Period returns */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <ReturnBadge label="1M" value={fund.periodReturns['1m']} />
          <ReturnBadge label="3M" value={fund.periodReturns['3m']} />
          <ReturnBadge label="6M" value={fund.periodReturns['6m']} />
          <ReturnBadge label="1Y" value={fund.periodReturns['1y']} />
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2 text-center">
            <div className="text-[9px] text-gray-400">Sharpe</div>
            <div className={`text-sm font-bold ${fund.sharpeRaw > 1 ? 'text-green-600 dark:text-green-400' : fund.sharpeRaw > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
              {fund.sharpeRaw.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2 text-center">
            <div className="text-[9px] text-gray-400">Ann. Return</div>
            <div className={`text-sm font-bold ${fund.annualReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {fund.annualReturn >= 0 ? '+' : ''}{fund.annualReturn.toFixed(1)}%
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-2 text-center">
            <div className="text-[9px] text-gray-400">Volatility</div>
            <div className="text-sm font-bold text-gray-700 dark:text-gray-300">{fund.volatility.toFixed(1)}%</div>
          </div>
        </div>

        {/* Explanation */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 mb-3">
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{fund.explanation}</p>
        </div>

        {/* Factsheet */}
        {fund.factsheetUrl && (
          <a href={fund.factsheetUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            View Factsheet →
          </a>
        )}
      </div>
    </div>
  );
}

export default function SrsAdvisor({ onBack }: Props) {
  const [data, setData] = useState<AdvisorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/srs/advisor');
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }
      const d = await res.json();
      setData(d);
    } catch (err: any) {
      setError(err.message || 'Failed to load advisor data');
    }
    setLoading(false);
    setScanning(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Analyzing all SRS funds...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">SRS Fund Advisor</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              AI-powered top 3 buy recommendations based on momentum, risk-adjusted returns, valuation & macro alignment
            </p>
          </div>
        </div>
        <button onClick={load} disabled={scanning}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          {scanning ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : '🔄'}
          {scanning ? 'Analyzing...' : 'Refresh'}
        </button>
      </div>

      {/* Meta stats */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
          <strong>Error:</strong> {error}
          <p className="text-xs mt-1 text-red-500 dark:text-red-400">Make sure the server has been restarted to load the advisor route.</p>
        </div>
      )}
      {data?.meta && (
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>📊 {data.meta.analyzedCount} funds analyzed</span>
          <span>📈 {data.meta.totalIsinsWithNav} with NAV data</span>
          <span>🏦 T-Bill: {data.meta.tbillYield}%</span>
          <span>📉 Inflation: {data.meta.inflation}%</span>
          <span className="text-gray-400 dark:text-gray-500">Last scan: {new Date(data.meta.timestamp).toLocaleString()}</span>
        </div>
      )}

      {/* Top 3 Picks */}
      {data?.topPicks && data.topPicks.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {data.topPicks.map((fund, i) => (
            <PickCard key={fund.isin} fund={fund} rank={i} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 dark:text-gray-400">
            No funds with sufficient NAV data. Click "Refresh" or download NAV data from the Fund Catalog first.
          </p>
        </div>
      )}

      {/* Full Ranking Table */}
      {data?.allRanked && data.allRanked.length > 3 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">All Ranked Funds ({data.allRanked.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-750">
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Fund</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Score</th>
                  <th className="px-4 py-2 text-right">Momentum</th>
                  <th className="px-4 py-2 text-right">Sharpe</th>
                  <th className="px-4 py-2 text-right">Trend</th>
                  <th className="px-4 py-2 text-right">Valuation</th>
                  <th className="px-4 py-2 text-right">Macro</th>
                  <th className="px-4 py-2 text-right">1M</th>
                  <th className="px-4 py-2 text-right">1Y</th>
                  <th className="px-4 py-2 text-right">Ann. Ret</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.allRanked.map((fund, i) => (
                  <tr key={fund.isin} className={`hover:bg-gray-50 dark:hover:bg-gray-750 ${i < 3 ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-400'
                      }`}>{i + 1}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">{fund.name}</div>
                      <div className="text-[10px] text-gray-400">{fund.fundHouse}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{fund.fundType}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-bold text-sm ${
                        fund.compositeScore >= 70 ? 'text-green-600 dark:text-green-400'
                        : fund.compositeScore >= 50 ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-gray-500 dark:text-gray-400'
                      }`}>{fund.compositeScore.toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs">{fund.scores.momentum.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-xs">{fund.scores.sharpe.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-xs">{fund.scores.trend.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-xs">{fund.scores.valuation.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-xs">{fund.scores.macroFit.toFixed(0)}</td>
                    <td className={`px-4 py-2 text-right text-xs font-medium ${fund.periodReturns['1m'] >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fund.periodReturns['1m'] >= 0 ? '+' : ''}{fund.periodReturns['1m'].toFixed(1)}%
                    </td>
                    <td className={`px-4 py-2 text-right text-xs font-medium ${fund.periodReturns['1y'] >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fund.periodReturns['1y'] >= 0 ? '+' : ''}{fund.periodReturns['1y'].toFixed(1)}%
                    </td>
                    <td className={`px-4 py-2 text-right text-xs font-medium ${fund.annualReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fund.annualReturn >= 0 ? '+' : ''}{fund.annualReturn.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Scoring Methodology</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {SCORE_DIMS.map(d => (
            <div key={d.key} className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span>{d.icon}</span>
                <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{d.label}</span>
                <span className="text-[10px] text-gray-400 ml-auto">30%</span>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                {d.key === 'momentum' && 'Combined 1M + 3M returns. Growth-oriented weighting favors recent outperformance.'}
                {d.key === 'sharpe' && 'Annualized risk-adjusted return. Measures return per unit of volatility vs risk-free rate.'}
                {d.key === 'trend' && 'RSI(14) + SMA20/50 crossover alignment. Bullish trends score higher.'}
                {d.key === 'valuation' && 'Z-score vs 1-year mean. Contrarian: undervalued funds score higher (buy low).'}
                {d.key === 'macroFit' && 'Outperformance vs 6M T-Bill yield. Rewards funds beating safe alternatives.'}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">
          Composite = Momentum (30%) + Sharpe (25%) + Trend (20%) + Valuation (15%) + Macro Fit (10%).
          Growth-oriented posture: bond/money market funds excluded. Funds with negative returns AND negative momentum filtered out.
        </p>
      </div>
    </div>
  );
}
