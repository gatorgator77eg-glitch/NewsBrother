import { useState, useRef, useCallback } from 'react';

interface Candle {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number;
}

interface StockData {
  symbol: string;
  currency: string;
  exchange: string;
  range: string;
  interval: string;
  candles: Candle[];
  fetchedAt: string;
}

const RANGES = [
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '3M', range: '3mo', interval: '1d' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1d' },
  { label: '2Y', range: '2y', interval: '1wk' },
  { label: '5Y', range: '5y', interval: '1wk' },
];

interface Props {
  onBack: () => void;
}

export default function StockHistory({ onBack }: Props) {
  const [symbol, setSymbol] = useState('');
  const [activeRange, setActiveRange] = useState(3);
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async (sym: string, rangeIdx: number) => {
    if (!sym.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = RANGES[rangeIdx];
      const res = await fetch(`/api/stock-history?symbol=${encodeURIComponent(sym.trim())}&range=${r.range}&interval=${r.interval}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch (${res.status})`);
      }
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
      setData(null);
    }
    setLoading(false);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(symbol, activeRange);
  };

  const handleRangeChange = (idx: number) => {
    setActiveRange(idx);
    if (data) fetchData(data.symbol, idx);
  };

  const handleDownloadCSV = () => {
    if (!data) return;
    const header = 'Date,Open,High,Low,Close,Volume';
    const rows = data.candles.map(c =>
      `${c.date},${c.open ?? ''},${c.high ?? ''},${c.low ?? ''},${c.close ?? ''},${c.volume}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.symbol}_${data.range}_history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartWidth = 900;
  const chartHeight = 350;
  const padding = { top: 20, right: 60, bottom: 40, left: 10 };

  const renderChart = () => {
    if (!data || data.candles.length === 0) return null;

    const closes = data.candles.map(c => c.close!).filter(v => v != null);
    const minPrice = Math.min(...closes);
    const maxPrice = Math.max(...closes);
    const priceRange = maxPrice - minPrice || 1;

    const plotW = chartWidth - padding.left - padding.right;
    const plotH = chartHeight - padding.top - padding.bottom;

    const getX = (i: number) => padding.left + (i / (data.candles.length - 1)) * plotW;
    const getY = (price: number) => padding.top + plotH - ((price - minPrice) / priceRange) * plotH;

    const pathD = data.candles
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(c.close!).toFixed(1)}`)
      .join(' ');

    const areaD = pathD + ` L ${getX(data.candles.length - 1).toFixed(1)} ${padding.top + plotH} L ${getX(0).toFixed(1)} ${padding.top + plotH} Z`;

    const firstClose = closes[0];
    const lastClose = closes[closes.length - 1];
    const isUp = lastClose >= firstClose;
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const areaColor = isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';

    const tickCount = 5;
    const priceTicks = Array.from({ length: tickCount }, (_, i) => {
      const price = minPrice + (priceRange * i) / (tickCount - 1);
      return { y: getY(price), price: price.toFixed(2) };
    });

    const dateTicks: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(data.candles.length / 6));
    for (let i = 0; i < data.candles.length; i += step) {
      dateTicks.push({ x: getX(i), label: data.candles[i].date.slice(5) });
    }

    const hovered = hoveredIdx != null && hoveredIdx < data.candles.length ? data.candles[hoveredIdx] : null;
    const hoverX = hoveredIdx != null ? getX(hoveredIdx) : null;

    return (
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto" onMouseLeave={() => setHoveredIdx(null)}>
        {priceTicks.map((t, i) => (
          <g key={i}>
            <line x1={padding.left} y1={t.y} x2={chartWidth - padding.right} y2={t.y} stroke="#e5e7eb" strokeWidth={0.5} className="dark:stroke-gray-700" />
            <text x={chartWidth - padding.right + 5} y={t.y + 4} className="fill-gray-400" fontSize={11}>{t.price}</text>
          </g>
        ))}
        {dateTicks.map((t, i) => (
          <text key={i} x={t.x} y={chartHeight - 8} textAnchor="middle" className="fill-gray-400" fontSize={10}>{t.label}</text>
        ))}
        <path d={areaD} fill={areaColor} />
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
        {hovered && hoverX != null && (
          <>
            <line x1={hoverX} y1={padding.top} x2={hoverX} y2={padding.top + plotH} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4,4" />
            <circle cx={hoverX} cy={getY(hovered.close!)} r={4} fill={lineColor} stroke="white" strokeWidth={2} />
            <rect x={hoverX < chartWidth / 2 ? hoverX + 10 : hoverX - 140} y={padding.top + 5} width={130} height={72} rx={6} fill="white" stroke="#e5e7eb" className="dark:fill-gray-800 dark:stroke-gray-600" />
            <text x={hoverX < chartWidth / 2 ? hoverX + 18 : hoverX - 132} y={padding.top + 24} className="fill-gray-900 dark:fill-gray-100" fontSize={12} fontWeight={600}>{hovered.date}</text>
            <text x={hoverX < chartWidth / 2 ? hoverX + 18 : hoverX - 132} y={padding.top + 40} className="fill-gray-500 dark:fill-gray-400" fontSize={10}>Close: {hovered.close?.toFixed(2)}</text>
            <text x={hoverX < chartWidth / 2 ? hoverX + 18 : hoverX - 132} y={padding.top + 52} className="fill-gray-500 dark:fill-gray-400" fontSize={10}>Vol: {(hovered.volume / 1000000).toFixed(1)}M</text>
          </>
        )}
      </svg>
    );
  };

  const stats = data && data.candles.length > 0 ? (() => {
    const closes = data.candles.map(c => c.close!).filter(v => v != null);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const change = last - first;
    const changePct = (change / first) * 100;
    const high = Math.max(...closes);
    const low = Math.min(...closes);
    const avgVol = data.candles.reduce((s, c) => s + c.volume, 0) / data.candles.length;
    return { first, last, change, changePct, high, low, avgVol };
  })() : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stock Price History</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">Powered by Yahoo Finance</span>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          ref={inputRef}
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g. AAPL, MSFT, SPY, XLE)"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !symbol.trim()}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Loading...' : 'Fetch'}
        </button>
      </form>

      <div className="flex gap-2 mb-6">
        {RANGES.map((r, i) => (
          <button
            key={r.range}
            onClick={() => handleRangeChange(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeRange === i
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300 text-sm mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {!loading && data && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.symbol}</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{data.exchange}</span>
                  <span className="text-xs text-gray-400">{data.currency}</span>
                </div>
                {stats && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">${stats.last.toFixed(2)}</span>
                    <span className={`text-sm font-medium ${stats.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(2)} ({stats.changePct >= 0 ? '+' : ''}{stats.changePct.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Download CSV
              </button>
            </div>
            <div className="w-full overflow-x-auto">{renderChart()}</div>
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Period High', value: `$${stats.high.toFixed(2)}`, color: 'text-green-600' },
                { label: 'Period Low', value: `$${stats.low.toFixed(2)}`, color: 'text-red-500' },
                { label: 'Avg Volume', value: `${(stats.avgVol / 1000000).toFixed(1)}M`, color: 'text-blue-600' },
                { label: 'Data Points', value: String(data.candles.length), color: 'text-gray-600 dark:text-gray-400' },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">Price History ({data.candles.length} records)</h4>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Open</th>
                    <th className="px-3 py-2 font-medium">High</th>
                    <th className="px-3 py-2 font-medium">Low</th>
                    <th className="px-3 py-2 font-medium">Close</th>
                    <th className="px-3 py-2 font-medium text-right">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.candles].reverse().map((c, i) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-5 py-2 text-gray-900 dark:text-gray-100 font-medium">{c.date}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.open?.toFixed(2) ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.high?.toFixed(2) ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.low?.toFixed(2) ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium">{c.close?.toFixed(2) ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-right">{(c.volume / 1000000).toFixed(1)}M</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
            Data provided by Yahoo Finance. For informational purposes only — not financial advice.
          </p>
        </>
      )}

      {!loading && !data && !error && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📈</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">Look up any stock ticker's price history</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">Try: AAPL, MSFT, SPY, TSLA, XLE, GLD, BTC-USD</p>
        </div>
      )}
    </div>
  );
}
