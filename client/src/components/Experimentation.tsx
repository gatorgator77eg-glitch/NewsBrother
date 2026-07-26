import { useState, useEffect, useRef, useMemo } from 'react';

interface Props {
  onBack: () => void;
}

interface TickerOption {
  symbol: string;
  name: string;
  exchange: string;
  country: string;
  hasData: boolean;
}

interface NewsHeadline {
  title: string;
  source: string;
  bias: string;
  url: string;
}

interface TimelinePoint {
  date: string;
  close: number;
  normalized: number;
  volume: number;
  newsCount: number;
  newsSentiment: number;
  newsHeadlines: NewsHeadline[];
}

interface BenchmarkData {
  symbol: string;
  name: string;
  timeline: { date: string; normalized: number }[];
}

interface TimelineResponse {
  ticker: TickerOption;
  timeline: TimelinePoint[];
  benchmark: BenchmarkData | null;
  stats: {
    totalNews: number;
    priceChange: number;
    high: number;
    low: number;
    maxNewsDay: string;
    maxNewsCount: number;
    avgDailyNews: number;
    volatility: number;
  };
}

const DAY_OPTIONS = [
  { value: 7, label: '7D' },
  { value: 30, label: '1M' },
  { value: 90, label: '3M' },
  { value: 180, label: '6M' },
  { value: 365, label: '1Y' },
];

const BIAS_COLORS: Record<string, string> = {
  left: '#3b82f6',
  'lean-left': '#60a5fa',
  center: '#9ca3af',
  'lean-right': '#f97316',
  right: '#ef4444',
};

function sentimentColor(s: number): string {
  if (s > 0.3) return '#22c55e';
  if (s > 0.1) return '#86efac';
  if (s < -0.3) return '#ef4444';
  if (s < -0.1) return '#fca5a5';
  return '#9ca3af';
}

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Experimentation({ onBack }: Props) {
  const [tickers, setTickers] = useState<TickerOption[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [benchmarkTicker, setBenchmarkTicker] = useState('');
  const [days, setDays] = useState(90);
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tickerSearch, setTickerSearch] = useState('');
  const [selectedNews, setSelectedNews] = useState<NewsHeadline[] | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/experimentation/tickers')
      .then(r => r.json())
      .then(d => {
        const list = d.tickers || [];
        setTickers(list);
        if (!selectedTicker) {
          const withData = list.find((t: TickerOption) => t.hasData);
          if (withData) setSelectedTicker(withData.symbol);
          else if (list.length) setSelectedTicker(list[0].symbol);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTicker) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ symbol: selectedTicker, days: String(days) });
    if (benchmarkTicker) params.set('benchmark', benchmarkTicker);
    fetch(`/api/experimentation/timeline?${params}`)
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Failed to load');
        return json;
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [selectedTicker, days, benchmarkTicker]);

  const filteredTickers = useMemo(() => {
    let list = tickers;
    if (tickerSearch) {
      const q = tickerSearch.toLowerCase();
      list = tickers.filter(t =>
        t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (a.hasData === b.hasData ? 0 : a.hasData ? -1 : 1));
  }, [tickers, tickerSearch]);

  const chartData = data?.timeline || [];
  const benchData = data?.benchmark?.timeline || [];

  const allNorms = useMemo(() => {
    const norms = chartData.map(d => d.normalized);
    if (benchData.length) norms.push(...benchData.map(d => d.normalized));
    return norms;
  }, [chartData, benchData]);

  const minNorm = allNorms.length ? Math.min(...allNorms) * 0.98 : 95;
  const maxNorm = allNorms.length ? Math.max(...allNorms) * 1.02 : 105;

  function buildChartPath(points: { date: string; normalized: number }[]): string {
    if (!points.length) return '';
    const w = 1000;
    const h = 280;
    const pad = 20;
    return points.map((p, i) => {
      const x = pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - ((p.normalized - minNorm) / (maxNorm - minNorm)) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
  }

  function buildAreaPath(points: { date: string; normalized: number }[]): string {
    if (!points.length) return '';
    const w = 1000;
    const h = 280;
    const pad = 20;
    const baseline = h - pad;
    const linePath = points.map((p, i) => {
      const x = pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - ((p.normalized - minNorm) / (maxNorm - minNorm)) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
    const lastX = pad + ((points.length - 1) / Math.max(points.length - 1, 1)) * (w - pad * 2);
    const firstX = pad;
    return `${linePath} L${lastX},${baseline} L${firstX},${baseline} Z`;
  }

  function getX(idx: number): number {
    const w = 1000;
    const pad = 20;
    return pad + (idx / Math.max(chartData.length - 1, 1)) * (w - pad * 2);
  }

  function getY(normalized: number): number {
    const h = 280;
    const pad = 20;
    return h - pad - ((normalized - minNorm) / (maxNorm - minNorm)) * (h - pad * 2);
  }

  const newsDays = useMemo(() =>
    chartData
      .map((d, i) => ({ ...d, idx: i }))
      .filter(d => d.newsCount > 0),
    [chartData]
  );

  function handleChartClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!chartRef.current || !chartData.length) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const svgWidth = rect.width;
    const pad = 20;
    const dataX = ((x / svgWidth) * 1000 - pad) / (1000 - pad * 2);
    const idx = Math.round(dataX * (chartData.length - 1));
    const clamped = Math.max(0, Math.min(chartData.length - 1, idx));
    const point = chartData[clamped];
    if (point.newsHeadlines.length) {
      setSelectedNews(point.newsHeadlines);
    } else {
      setSelectedNews(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Experimentation</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">News vs Market timeline analysis</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Ticker selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Stock / Asset</label>
            <div className="relative">
              <input
                type="text"
                value={tickerSearch || selectedTicker}
                onChange={e => { setTickerSearch(e.target.value); }}
                onFocus={() => setTickerSearch(selectedTicker)}
                onBlur={() => setTimeout(() => setTickerSearch(''), 200)}
                placeholder="Search ticker or name..."
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {tickerSearch && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredTickers.slice(0, 30).map(t => (
                    <button
                      key={t.symbol}
                      onMouseDown={() => {
                        setSelectedTicker(t.symbol);
                        setTickerSearch('');
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">{t.symbol}</span>
                      <span className="text-xs text-gray-400 truncate ml-2 flex-1">{t.name}</span>
                      {t.hasData && <span className="text-[9px] text-green-500 ml-1 flex-shrink-0">●</span>}
                      {!t.hasData && <span className="text-[9px] text-gray-300 ml-1 flex-shrink-0">○</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Benchmark */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Benchmark (optional)</label>
            <select
              value={benchmarkTicker}
              onChange={e => setBenchmarkTicker(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {tickers.filter(t => t.hasData).map(t => (
                <option key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</option>
              ))}
            </select>
          </div>

          {/* Day range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Period</label>
            <div className="flex gap-1">
              {DAY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDays(opt.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    days === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {error && (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      )}

      {!loading && data && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Price Change</div>
              <div className={`text-lg font-bold ${data.stats.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.stats.priceChange >= 0 ? '+' : ''}{data.stats.priceChange}%
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Volatility</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.stats.volatility}%</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total News</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.stats.totalNews}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Peak News Day</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.stats.maxNewsCount}</div>
              <div className="text-[10px] text-gray-400">{formatDate(data.stats.maxNewsDay)}</div>
            </div>
          </div>

          {/* Market Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {data.ticker.symbol} — {data.ticker.name}
                <span className="text-xs font-normal text-gray-400 ml-2">(base 100)</span>
              </h2>
              <div className="flex items-center gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Market</span>
                {data.benchmark && (
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-400 inline-block rounded" /> {data.benchmark.symbol}</span>
                )}
              </div>
            </div>
            <div
              ref={chartRef}
              className="relative cursor-crosshair"
              onMouseMove={e => {
                if (!chartRef.current || !chartData.length) return;
                const rect = chartRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const svgWidth = rect.width;
                const dataX = ((x / svgWidth) * 1000 - 20) / 960;
                const idx = Math.round(dataX * (chartData.length - 1));
                setHoveredIdx(Math.max(0, Math.min(chartData.length - 1, idx)));
              }}
              onMouseLeave={() => { setHoveredIdx(null); setSelectedNews(null); }}
              onClick={handleChartClick}
            >
              <svg viewBox="0 0 1000 370" className="w-full" preserveAspectRatio="none">
                {/* Y-axis labels */}
                {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                  const val = minNorm + frac * (maxNorm - minNorm);
                  const y = 280 - 20 - frac * 240;
                  return (
                    <g key={frac}>
                      <line x1="20" y1={y} x2="980" y2={y} stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth="0.5" strokeDasharray="4,4" />
                      <text x="16" y={y + 3} textAnchor="end" className="fill-gray-400 text-[9px]">{val.toFixed(0)}</text>
                    </g>
                  );
                })}

                {/* Baseline at 100 */}
                {minNorm < 100 && maxNorm > 100 && (
                  <line x1="20" y1={getY(100)} x2="980" y2={getY(100)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="2,4" />
                )}

                {/* Area under market line */}
                <path d={buildAreaPath(chartData)} fill="rgba(59,130,246,0.08)" />

                {/* Market line */}
                <path d={buildChartPath(chartData)} fill="none" stroke="#3b82f6" strokeWidth="2" />

                {/* Benchmark line */}
                {benchData.length > 0 && (
                  <path d={buildChartPath(benchData)} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4,3" />
                )}

                {/* News density strip background */}
                <rect x="20" y="295" width="960" height="40" fill="currentColor" className="text-gray-50 dark:text-gray-750" rx="3" />

                {/* News density bars — full-height colored bars per day */}
                {chartData.map((d, i) => {
                  if (d.newsCount === 0) return null;
                  const barW = Math.max(960 / Math.max(chartData.length, 1) - 1, 3);
                  const x = 20 + (i / Math.max(chartData.length - 1, 1)) * 960 - barW / 2;
                  const maxCount = Math.max(...chartData.map(x => x.newsCount), 1);
                  const barH = Math.max((d.newsCount / maxCount) * 36, 4);
                  return (
                    <rect
                      key={`density-${i}`}
                      x={x}
                      y={335 - barH}
                      width={barW}
                      height={barH}
                      fill={sentimentColor(d.newsSentiment)}
                      opacity={0.85}
                      rx="1"
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSelectedNews(d.newsHeadlines); }}
                    >
                      <title>{`${formatDate(d.date)}: ${d.newsCount} articles`}</title>
                    </rect>
                  );
                })}

                {/* News density strip label */}
                <text x="18" y="307" textAnchor="end" className="fill-gray-400 text-[8px]">NEWS</text>

                {/* News event markers on market line */}
                {newsDays.map(d => (
                  <g key={`news-${d.idx}`}>
                    {/* Vertical line from marker to news strip */}
                    <line
                      x1={getX(d.idx)} y1={getY(d.normalized)}
                      x2={getX(d.idx)} y2="295"
                      stroke={sentimentColor(d.newsSentiment)}
                      strokeWidth="0.5"
                      strokeDasharray="2,2"
                      opacity="0.4"
                    />
                    <circle
                      cx={getX(d.idx)}
                      cy={getY(d.normalized)}
                      r={Math.min(4 + d.newsCount * 0.8, 10)}
                      fill={sentimentColor(d.newsSentiment)}
                      stroke="white"
                      strokeWidth="2"
                      opacity="0.95"
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setSelectedNews(d.newsHeadlines); }}
                    />
                  </g>
                ))}

                {/* Hover crosshair */}
                {hoveredIdx !== null && hoveredIdx < chartData.length && (
                  <g>
                    <line
                      x1={getX(hoveredIdx)} y1="20"
                      x2={getX(hoveredIdx)} y2="335"
                      stroke="#6b7280" strokeWidth="1" strokeDasharray="3,3"
                    />
                    <circle cx={getX(hoveredIdx)} cy={getY(chartData[hoveredIdx].normalized)} r="5" fill="#3b82f6" stroke="white" strokeWidth="2" />
                    {benchData.length > 0 && (() => {
                      const bPt = benchData.find(b => b.date === chartData[hoveredIdx].date);
                      if (bPt) return <circle cx={getX(hoveredIdx)} cy={getY(bPt.normalized)} r="3.5" fill="#9ca3af" stroke="white" strokeWidth="1.5" />;
                      return null;
                    })()}
                  </g>
                )}
              </svg>

              {/* Tooltip */}
              {hoveredIdx !== null && hoveredIdx < chartData.length && (
                <div
                  className="absolute bg-gray-900 dark:bg-gray-700 text-white rounded-lg p-3 text-xs shadow-lg pointer-events-none z-10 max-w-xs"
                  style={{
                    left: `${Math.min((getX(hoveredIdx) / 1000) * 100, 65)}%`,
                    top: '10px',
                  }}
                >
                  <div className="font-bold mb-1">{formatDate(chartData[hoveredIdx].date)}</div>
                  <div>Close: <span className="font-mono">${chartData[hoveredIdx].close.toFixed(2)}</span></div>
                  <div>Indexed: <span className="font-mono">{chartData[hoveredIdx].normalized.toFixed(1)}</span></div>
                  {benchData.length > 0 && (() => {
                    const bPt = benchData.find(b => b.date === chartData[hoveredIdx].date);
                    if (bPt) return <div>Benchmark: <span className="font-mono">{bPt.normalized.toFixed(1)}</span></div>;
                    return null;
                  })()}
                  <div>Volume: <span className="font-mono">{(chartData[hoveredIdx].volume / 1000000).toFixed(1)}M</span></div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: sentimentColor(chartData[hoveredIdx].newsSentiment) }} />
                    News: {chartData[hoveredIdx].newsCount}
                  </div>
                  {chartData[hoveredIdx].newsHeadlines.length > 0 && (
                    <div className="mt-2 border-t border-gray-600 pt-2 space-y-1">
                      {chartData[hoveredIdx].newsHeadlines.slice(0, 3).map((h, i) => (
                        <div key={i} className="text-[10px] leading-tight text-gray-300">
                          <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: BIAS_COLORS[h.bias] || '#9ca3af' }} />
                          {h.title.length > 60 ? h.title.slice(0, 60) + '...' : h.title}
                        </div>
                      ))}
                      <div className="text-[9px] text-blue-400 mt-1">Click to view all {chartData[hoveredIdx].newsHeadlines.length} headlines</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* X-axis labels */}
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-5">
              {chartData.filter((_, i) => i % Math.max(1, Math.floor(chartData.length / 8)) === 0).map(d => (
                <span key={d.date}>{formatDate(d.date)}</span>
              ))}
            </div>
          </div>

          {/* Sentiment Legend */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Legend</h3>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500" /> Positive News</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-300" /> Mildly Positive</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400" /> Neutral</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-300" /> Mildly Negative</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> Negative News</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 rounded inline-block" /> Market Price</span>
              {data.benchmark && (
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-gray-400 rounded inline-block border-dashed" /> Benchmark</span>
              )}
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 opacity-80 inline-block" /> News Density (bottom strip)</span>
            </div>
          </div>

          {/* News Panel */}
          {selectedNews && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Headlines ({selectedNews.length})</h3>
                <button
                  onClick={() => setSelectedNews(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2">
                {selectedNews.map((n, i) => (
                  <a
                    key={i}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-l-3"
                    style={{ borderLeftColor: BIAS_COLORS[n.bias] || '#9ca3af', borderLeftWidth: '3px' }}
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span>{n.source}</span>
                      <span className="w-1 h-1 rounded-full" style={{ background: BIAS_COLORS[n.bias] || '#9ca3af' }} />
                      <span>{n.bias}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* News Timeline */}
          {chartData.some(d => d.newsCount > 0) && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">News Activity</h3>
              <div className="space-y-1">
                {chartData.filter(d => d.newsCount > 0).map(d => (
                  <button
                    key={d.date}
                    onClick={() => setSelectedNews(d.newsHeadlines)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                  >
                    <span className="text-xs text-gray-400 w-16 flex-shrink-0">{formatDate(d.date)}</span>
                    <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((d.newsCount / Math.max(...chartData.map(x => x.newsCount), 1)) * 100, 100)}%`,
                          background: sentimentColor(d.newsSentiment),
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-8 text-right">{d.newsCount}</span>
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: sentimentColor(d.newsSentiment) }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
