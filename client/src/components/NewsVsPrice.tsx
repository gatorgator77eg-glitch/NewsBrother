import { useState, useEffect, useCallback, useRef } from 'react';

interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
  market_cap: number;
}

interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface NewsArticle {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet: string;
  source_type: 'google' | 'gdelt';
}

interface NewsVsPriceData {
  ticker: { symbol: string; name: string; exchange: string; sector: string; industry: string; country: string; market_cap: number };
  prices: PricePoint[];
  news: NewsArticle[];
}

interface Props {
  onBack: () => void;
}

function formatMarketCap(val: number): string {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toLocaleString()}`;
}

const NEWS_WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

export default function NewsVsPrice({ onBack }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<TickerResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [data, setData] = useState<NewsVsPriceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [newsDays, setNewsDays] = useState(30);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredNewsIdx, setHoveredNewsIdx] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const chartW = 900;
  const chartH = 360;
  const pad = { top: 20, right: 60, bottom: 40, left: 10 };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearchInput = (val: string) => {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks?search=${encodeURIComponent(val)}&limit=10`);
        if (res.ok) {
          const d = await res.json();
          setSearchResults(d.tickers || []);
          setShowDropdown(true);
        }
      } catch {}
    }, 300);
  };

  const handleSelectTicker = async (symbol: string) => {
    setSelectedSymbol(symbol);
    setSearchInput(symbol);
    setShowDropdown(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/news-vs-price/${symbol}?days=${newsDays}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {}
    setLoading(false);
  };

  const handleDaysChange = async (days: number) => {
    setNewsDays(days);
    if (!selectedSymbol) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/news-vs-price/${selectedSymbol}?days=${days}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {}
    setLoading(false);
  };

  const renderChart = () => {
    if (!data || data.prices.length === 0) return null;
    const prices = data.prices;
    const closes = prices.map(p => p.close);
    const minP = Math.min(...closes);
    const maxP = Math.max(...closes);
    const range = maxP - minP || 1;
    const plotW = chartW - pad.left - pad.right;
    const plotH = chartH - pad.top - pad.bottom;
    const getX = (i: number) => pad.left + (i / (prices.length - 1)) * plotW;
    const getY = (p: number) => pad.top + plotH - ((p - minP) / range) * plotH;

    const pathD = prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.close).toFixed(1)}`).join(' ');
    const areaD = pathD + ` L ${getX(prices.length - 1).toFixed(1)} ${pad.top + plotH} L ${getX(0).toFixed(1)} ${pad.top + plotH} Z`;
    const isUp = closes[closes.length - 1] >= closes[0];
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const areaColor = isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';

    const priceTicks = Array.from({ length: 5 }, (_, i) => {
      const p = minP + (range * i) / 4;
      return { y: getY(p), label: p.toFixed(2) };
    });
    const dateTicks: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(prices.length / 6));
    for (let i = 0; i < prices.length; i += step) {
      dateTicks.push({ x: getX(i), label: prices[i].date.slice(0, 7) });
    }

    const newsDates = new Map<string, number[]>();
    data.news.forEach((article, idx) => {
      const d = article.publishedAt.slice(0, 10);
      if (!newsDates.has(d)) newsDates.set(d, []);
      newsDates.get(d)!.push(idx);
    });

    const hovered = hoveredIdx != null && hoveredIdx < prices.length ? prices[hoveredIdx] : null;
    const hoverX = hoveredIdx != null ? getX(hoveredIdx) : null;

    return (
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto" onMouseLeave={() => setHoveredIdx(null)}>
        {priceTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} y1={t.y} x2={chartW - pad.right} y2={t.y} stroke="#e5e7eb" strokeWidth={0.5} className="dark:stroke-gray-700" />
            <text x={chartW - pad.right + 5} y={t.y + 4} className="fill-gray-400" fontSize={10}>{t.label}</text>
          </g>
        ))}
        {dateTicks.map((t, i) => (
          <text key={i} x={t.x} y={chartH - 8} textAnchor="middle" className="fill-gray-400" fontSize={9}>{t.label}</text>
        ))}
        <path d={areaD} fill={areaColor} />
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
        {Array.from(newsDates.entries()).map(([dateStr, indices]) => {
          const priceIdx = prices.findIndex(p => p.date === dateStr);
          if (priceIdx < 0) return null;
          const cx = getX(priceIdx);
          const cy = getY(prices[priceIdx].close);
          const hasGdelt = indices.some(i => data.news[i].source_type === 'gdelt');
          const fillColor = hasGdelt ? '#f59e0b' : '#3b82f6';
          return (
            <g key={dateStr}>
              <circle cx={cx} cy={cy} r={4} fill={fillColor} stroke="white" strokeWidth={1.5} className="cursor-pointer"
                onMouseEnter={() => setHoveredNewsIdx(indices[0])}
                onMouseLeave={() => setHoveredNewsIdx(null)}
              />
              <circle cx={cx} cy={cy} r={8} fill={fillColor} opacity={0.15} />
            </g>
          );
        })}
        {hovered && hoverX != null && (
          <>
            <line x1={hoverX} y1={pad.top} x2={hoverX} y2={pad.top + plotH} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4,4" />
            <circle cx={hoverX} cy={getY(hovered.close)} r={3} fill={lineColor} stroke="white" strokeWidth={2} />
            <rect x={hoverX < chartW / 2 ? hoverX + 8 : hoverX - 130} y={pad.top + 5} width={122} height={56} rx={6} fill="white" stroke="#e5e7eb" className="dark:fill-gray-800 dark:stroke-gray-600" />
            <text x={hoverX < chartW / 2 ? hoverX + 14 : hoverX - 124} y={pad.top + 22} className="fill-gray-900 dark:fill-gray-100" fontSize={10} fontWeight={600}>{hovered.date}</text>
            <text x={hoverX < chartW / 2 ? hoverX + 14 : hoverX - 124} y={pad.top + 36} className="fill-gray-500 dark:fill-gray-400" fontSize={9}>Close: ${hovered.close.toFixed(2)}</text>
            <text x={hoverX < chartW / 2 ? hoverX + 14 : hoverX - 124} y={pad.top + 48} className="fill-gray-500 dark:fill-gray-400" fontSize={9}>Vol: {(hovered.volume / 1000000).toFixed(1)}M</text>
          </>
        )}
      </svg>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">News vs Price</h2>
          <p className="text-xs text-gray-400">Overlay news articles on a stock price chart</p>
        </div>
      </div>

      <div className="relative mb-6" ref={dropdownRef}>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="Search ticker (e.g. AAPL, TSLA, MSFT)..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 max-h-64 overflow-y-auto">
                {searchResults.map(t => (
                  <button
                    key={t.symbol}
                    onClick={() => handleSelectTicker(t.symbol)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{t.symbol}</span>
                      <span className="text-xs text-gray-400 ml-2">{t.name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{t.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {!loading && !data && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">📰</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            Select a ticker to see news overlaid on its price chart.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Blue dots = Google News · Orange dots = GDELT historical
          </p>
        </div>
      )}

      {!loading && data && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.ticker.symbol}</h3>
                <span className="text-sm text-gray-400">{data.ticker.name}</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-500">{data.ticker.exchange}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-500">MCap: {formatMarketCap(data.ticker.market_cap)}</span>
                {data.ticker.sector && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{data.ticker.sector}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">News window:</span>
            {NEWS_WINDOWS.map(w => (
              <button
                key={w.days}
                onClick={() => handleDaysChange(w.days)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  newsDays === w.days
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {w.label}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-2">{data.news.length} articles</span>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm mb-6">
            <div className="w-full overflow-x-auto">{renderChart()}</div>
          </div>

          <div className="flex items-center gap-4 mb-4 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              Google News
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              GDELT (historical)
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">Related News ({data.news.length})</h4>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {data.news.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No news articles found for this ticker.</div>
              ) : (
                data.news.map((article, i) => {
                  const dateStr = article.publishedAt.slice(0, 10);
                  const isHighlighted = hoveredNewsIdx === i;
                  return (
                    <a
                      key={i}
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseEnter={() => setHoveredNewsIdx(i)}
                      onMouseLeave={() => setHoveredNewsIdx(null)}
                      className={`block px-5 py-3.5 border-b border-gray-50 dark:border-gray-700/50 transition-colors ${
                        isHighlighted
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          article.source_type === 'google'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        }`}>
                          {article.source_type === 'google' ? 'Google News' : 'GDELT'}
                        </span>
                        <span className="text-[11px] text-gray-400">{article.source}</span>
                        {dateStr && <span className="text-[11px] text-gray-400 ml-auto">{dateStr}</span>}
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{article.title}</p>
                      {article.snippet && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{article.snippet}</p>
                      )}
                    </a>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Data from Yahoo Finance and Google News. For informational purposes only — not financial advice.
      </p>
    </div>
  );
}
