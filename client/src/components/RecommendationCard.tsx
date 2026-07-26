import { useState } from 'react';
import { explainRecommendation } from '../api';

interface StockScore {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  capTier: 'mega' | 'large' | 'mid' | 'small';
  price: number;
  change1d: number;
  change1w: number;
  change1m: number;
  composite: number;
  technical: number;
  sentiment: number;
  volume: number;
  relativeStrength: number;
  macro: number;
  fundamental: number;
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  reasoning: string[];
  scoreDelta: number;
  prevSignal: string;
  sparkline: { date: string; price: number }[];
}

function signalBadge(signal: string): { bg: string; text: string; label: string } {
  switch (signal) {
    case 'STRONG_BUY': return { bg: 'bg-green-900/40', text: 'text-green-300', label: 'Strong Buy' };
    case 'BUY': return { bg: 'bg-green-800/30', text: 'text-green-400', label: 'Buy' };
    case 'HOLD': return { bg: 'bg-gray-700/30', text: 'text-gray-300', label: 'Hold' };
    case 'SELL': return { bg: 'bg-red-800/30', text: 'text-red-400', label: 'Sell' };
    case 'STRONG_SELL': return { bg: 'bg-red-900/40', text: 'text-red-300', label: 'Strong Sell' };
    default: return { bg: 'bg-gray-700/30', text: 'text-gray-300', label: signal };
  }
}

function capTierBadge(tier: string): { bg: string; text: string; label: string } {
  switch (tier) {
    case 'mega': return { bg: 'bg-purple-900/40', text: 'text-purple-300', label: 'Mega' };
    case 'large': return { bg: 'bg-blue-900/30', text: 'text-blue-300', label: 'Large' };
    case 'mid': return { bg: 'bg-teal-900/30', text: 'text-teal-300', label: 'Mid' };
    case 'small': return { bg: 'bg-gray-700/30', text: 'text-gray-400', label: 'Small' };
    default: return { bg: 'bg-gray-700/30', text: 'text-gray-400', label: tier };
  }
}

function Sparkline({ data, color }: { data: { price: number }[]; color: string }) {
  if (!data || data.length < 2) return null;
  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-6 shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RadarChart({ scores }: { scores: { label: string; value: number }[] }) {
  const cx = 80, cy = 80, r = 60;
  const n = scores.length;
  const angleStep = (Math.PI * 2) / n;

  const getPoint = (i: number, val: number) => {
    const angle = angleStep * i - Math.PI / 2;
    const norm = (val + 100) / 200;
    return { x: cx + r * norm * Math.cos(angle), y: cy + r * norm * Math.sin(angle) };
  };

  const gridLevels = [-100, -50, 0, 50, 100];
  const gridPolygons = gridLevels.map(level =>
    scores.map((_, i) => {
      const p = getPoint(i, level);
      return `${p.x},${p.y}`;
    }).join(' ')
  );

  const dataPoints = scores.map((s, i) => getPoint(i, s.value));
  const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 160 160" className="w-full h-full">
      {gridPolygons.map((pts, i) => (
        <polygon key={i} points={pts} fill="none"
          stroke={i === 2 ? '#6B7280' : '#374151'} strokeWidth={i === 2 ? 1 : 0.5} />
      ))}
      {scores.map((s, i) => {
        const p = getPoint(i, 110);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            className="fill-gray-400 dark:fill-gray-500" fontSize="7">
            {s.label}
          </text>
        );
      })}
      <polygon points={dataPolygon} fill="rgba(59,130,246,0.2)" stroke="#3B82F6" strokeWidth="1.5" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#3B82F6" />
      ))}
    </svg>
  );
}

function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toFixed(0)}`;
}

interface Props {
  stock: StockScore;
  compact?: boolean;
  countryCode?: string;
  countryName?: string;
  aiEnabled?: boolean;
}

export default function RecommendationCard({ stock, compact, countryCode, countryName, aiEnabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState('');
  const badge = signalBadge(stock.signal);
  const capBadge = capTierBadge(stock.capTier || 'small');

  const scores = [
    { label: 'Technical', value: stock.technical },
    { label: 'Sentiment', value: stock.sentiment },
    { label: 'Volume', value: stock.volume },
    { label: 'Rel Strength', value: stock.relativeStrength },
    { label: 'Macro', value: stock.macro },
    { label: 'Fundamental', value: stock.fundamental },
  ];

  const sparkColor = stock.composite >= 0 ? '#22c55e' : '#ef4444';

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{stock.symbol}</span>
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>{badge.label}</span>
            <span className={`text-[8px] font-medium px-1 py-0.5 rounded ${capBadge.bg} ${capBadge.text}`}>{capBadge.label}</span>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{stock.name} &middot; {stock.sector}</p>
        </div>
        <Sparkline data={stock.sparkline} color={sparkColor} />
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{stock.price > 0 ? stock.price.toFixed(2) : 'N/A'}</p>
          <p className={`text-[10px] font-medium ${stock.change1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {stock.change1d >= 0 ? '+' : ''}{stock.change1d.toFixed(1)}%
          </p>
        </div>
        <div className="text-right shrink-0 w-12">
          <p className={`text-xs font-bold ${stock.composite >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stock.composite > 0 ? '+' : ''}{stock.composite}
          </p>
          <p className="text-[9px] text-gray-500">score</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stock.symbol}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>{badge.label}</span>
              <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded ${capBadge.bg} ${capBadge.text}`}>{capBadge.label}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stock.name}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{stock.sector} {stock.marketCap > 0 ? `\u00B7 ${formatMarketCap(stock.marketCap)}` : ''}</p>
          </div>
          <div className="flex items-start gap-3 ml-3">
            <Sparkline data={stock.sparkline} color={sparkColor} />
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stock.price > 0 ? stock.price.toFixed(2) : 'N/A'}</p>
              <div className="flex gap-2 mt-0.5">
                <span className={`text-[10px] ${stock.change1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stock.change1d >= 0 ? '+' : ''}{stock.change1d.toFixed(1)}% 1d
                </span>
                <span className={`text-[10px] ${stock.change1w >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stock.change1w >= 0 ? '+' : ''}{stock.change1w.toFixed(1)}% 1w
                </span>
                <span className={`text-[10px] ${stock.change1m >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stock.change1m >= 0 ? '+' : ''}{stock.change1m.toFixed(1)}% 1m
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${stock.composite >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, Math.abs(stock.composite))}%` }}
            />
          </div>
          <span className={`text-sm font-bold ${stock.composite >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stock.composite > 0 ? '+' : ''}{stock.composite}
          </span>
          <span className="text-[10px] text-gray-500">{(stock.confidence * 100).toFixed(0)}% conf</span>
          {stock.prevSignal && stock.prevSignal !== stock.signal && (
            <span className="text-[9px] text-yellow-500 font-medium">
              {stock.prevSignal.replace('_', ' ')} &rarr; {stock.signal.replace('_', ' ')}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex gap-4 mt-3">
            <div className="w-36 h-36 shrink-0">
              <RadarChart scores={scores} />
            </div>
            <div className="flex-1 space-y-1.5">
              {scores.map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-20 shrink-0">{s.label}</span>
                  <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.value >= 0 ? 'bg-blue-500' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(100, Math.abs(s.value))}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium w-8 text-right ${s.value >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                    {s.value > 0 ? '+' : ''}{s.value}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-gray-400 w-20 shrink-0">Confidence</span>
                <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-yellow-500" style={{ width: `${stock.confidence * 100}%` }} />
                </div>
                <span className="text-[10px] font-medium text-gray-300">{(stock.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
          {stock.reasoning.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
              <p className="text-[10px] font-medium text-gray-400 mb-1">Signal Reasoning</p>
              <ul className="space-y-0.5">
                {stock.reasoning.map((r, i) => (
                  <li key={i} className="text-[10px] text-gray-500 dark:text-gray-400 flex items-start gap-1">
                    <span className="text-gray-600 mt-0.5">\u2022</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Explain */}
          {countryCode && countryName && (
            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
              {!explanation && !explainLoading && (
                <button
                  disabled={!aiEnabled}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setExplainLoading(true);
                    setExplainError('');
                    try {
                      const result = await explainRecommendation(stock as any, countryCode, countryName);
                      setExplanation(result.explanation);
                    } catch (err: any) {
                      setExplainError(err.message || 'Failed to generate explanation');
                    }
                    setExplainLoading(false);
                  }}
                  className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors font-medium ${
                    aiEnabled
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {aiEnabled ? '✨ Explain this pick' : '✨ AI is OFF'}
                </button>
              )}
              {explainLoading && (
                <div className="flex items-center gap-2 py-2">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-purple-500 border-t-transparent" />
                  <span className="text-[11px] text-purple-400">AI is analyzing {stock.symbol}...</span>
                </div>
              )}
              {explainError && (
                <p className="text-[11px] text-red-400 mt-1">{explainError}</p>
              )}
              {explanation && (
                <div className="mt-1">
                  <p className="text-[10px] font-medium text-purple-400 mb-1.5">AI ANALYSIS</p>
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                    {explanation}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
