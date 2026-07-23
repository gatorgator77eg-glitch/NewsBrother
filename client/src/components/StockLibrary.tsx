import { useState, useEffect, useCallback } from 'react';

interface Ticker {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: number;
}

interface StockData {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: number;
  history: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
}

interface DownloadStatus {
  status: string;
  tickerCount: number;
  stocksWithPrices: number;
  currentTicker: string;
  currentIndex: number;
  totalToFetch: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
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

export default function StockLibrary({ onBack }: Props) {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<StockData | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [stats, setStats] = useState({ totalTickers: 0, totalPriceRows: 0, stocksWithPrices: 0, totalExchanges: 0 });
  const limit = 50;

  const fetchTickers = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/stocks?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tickers');
      const data = await res.json();
      setTickers(data.tickers);
      setTotal(data.total);
      setStats(data.stats);
      setDownloadStatus(data.download);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  const pollDownloadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/stocks/download/status');
      if (res.ok) {
        const data = await res.json();
        setDownloadStatus(data);
        return data;
      }
    } catch {}
    return null;
  }, []);

  useEffect(() => {
    fetchTickers('', 1);
  }, [fetchTickers]);

  useEffect(() => {
    if (!downloadStatus) return;
    if (downloadStatus.status === 'downloading_prices' || downloadStatus.status === 'downloading_missing' || downloadStatus.status === 'updating_recent' || downloadStatus.status === 'fetching_tickers' || downloadStatus.status === 'saving_tickers' || downloadStatus.status === 'enriching_tickers' || downloadStatus.status === 'checking_existing') {
      const interval = setInterval(async () => {
        const status = await pollDownloadStatus();
        if (status && !['downloading_prices', 'downloading_missing', 'updating_recent', 'fetching_tickers', 'saving_tickers', 'enriching_tickers', 'checking_existing'].includes(status.status)) {
          clearInterval(interval);
          fetchTickers(search, page);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [downloadStatus, pollDownloadStatus, fetchTickers, search, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    fetchTickers(searchInput, 1);
  };

  const handleStartDownload = async () => {
    setShowDownloadConfirm(false);
    try {
      await fetch('/api/stocks/update', { method: 'POST' });
      pollDownloadStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAbortDownload = async () => {
    try {
      await fetch('/api/stocks/download/abort', { method: 'POST' });
    } catch {}
  };

  const handleSelectTicker = async (symbol: string) => {
    setSelectedLoading(true);
    try {
      const res = await fetch(`/api/stocks/${symbol}`);
      if (!res.ok) throw new Error('Failed to fetch ticker data');
      setSelected(await res.json());
    } catch (err) {
      console.error(err);
    }
    setSelectedLoading(false);
  };

  const handleDownloadCSV = () => {
    if (!selected) return;
    const header = 'Date,Open,High,Low,Close,Volume';
    const rows = selected.history.map(c =>
      `${c.date},${c.open},${c.high},${c.low},${c.close},${c.volume}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.symbol}_10y_history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isDownloading = downloadStatus?.status === 'downloading_prices' ||
    downloadStatus?.status === 'downloading_missing' ||
    downloadStatus?.status === 'updating_recent' ||
    downloadStatus?.status === 'fetching_tickers' ||
    downloadStatus?.status === 'saving_tickers' ||
    downloadStatus?.status === 'enriching_tickers' ||
    downloadStatus?.status === 'checking_existing';

  const downloadPct = downloadStatus && downloadStatus.totalToFetch > 0
    ? Math.round((downloadStatus.currentIndex / downloadStatus.totalToFetch) * 100)
    : 0;

  // ── Chart rendering ──
  const renderChart = (candles: StockData['history']) => {
    if (!candles || candles.length === 0) return null;
    const chartW = 800;
    const chartH = 320;
    const pad = { top: 20, right: 60, bottom: 40, left: 10 };
    const closes = candles.map(c => c.close);
    const minP = Math.min(...closes);
    const maxP = Math.max(...closes);
    const range = maxP - minP || 1;
    const plotW = chartW - pad.left - pad.right;
    const plotH = chartH - pad.top - pad.bottom;
    const getX = (i: number) => pad.left + (i / (candles.length - 1)) * plotW;
    const getY = (p: number) => pad.top + plotH - ((p - minP) / range) * plotH;
    const pathD = candles.map((c, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(c.close).toFixed(1)}`).join(' ');
    const areaD = pathD + ` L ${getX(candles.length - 1).toFixed(1)} ${pad.top + plotH} L ${getX(0).toFixed(1)} ${pad.top + plotH} Z`;
    const isUp = closes[closes.length - 1] >= closes[0];
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const areaColor = isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
    const priceTicks = Array.from({ length: 5 }, (_, i) => {
      const p = minP + (range * i) / 4;
      return { y: getY(p), label: p.toFixed(2) };
    });
    const dateTicks: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += step) {
      dateTicks.push({ x: getX(i), label: candles[i].date.slice(0, 7) });
    }
    const hovered = hoveredIdx != null && hoveredIdx < candles.length ? candles[hoveredIdx] : null;
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

  // ── Selected ticker view ──
  if (selected || selectedLoading) {
    if (selectedLoading) {
      return (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => { setSelected(null); setHoveredIdx(null); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        </div>
      );
    }

    const s = selected!;
    const closes = s.history.map(c => c.close);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const change = last - first;
    const changePct = (change / first) * 100;

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setSelected(null); setHoveredIdx(null); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{s.symbol}</h2>
              <span className="text-sm text-gray-400">{s.name}</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-500">{s.exchange}</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">${last.toFixed(2)}</span>
              <span className={`text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
              </span>
              <span className="text-xs text-gray-400">10Y</span>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={handleDownloadCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              CSV
            </button>
          </div>
        </div>

        {s.sector && (
          <div className="flex gap-2 mb-4">
            {s.sector && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">{s.sector}</span>}
            {s.industry && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">{s.industry}</span>}
            {s.country && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">{s.country}</span>}
            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">MCap: {formatMarketCap(s.market_cap)}</span>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm mb-6">
          <div className="w-full overflow-x-auto">{renderChart(s.history)}</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">Price History ({s.history.length} records)</h4>
            <button onClick={handleDownloadCSV} className="text-xs text-green-600 hover:text-green-700 font-medium">Download CSV</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
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
                {[...s.history].reverse().map((c, i) => (
                  <tr key={i} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-5 py-2 text-gray-900 dark:text-gray-100 font-medium">{c.date}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.open.toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.high.toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.low.toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium">{c.close.toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-right">{(c.volume / 1000000).toFixed(1)}M</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Main ticker grid view ──
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stock Library</h2>
            <p className="text-xs text-gray-400">{stats.totalTickers.toLocaleString()} tickers &middot; {stats.stocksWithPrices.toLocaleString()} with prices &middot; {stats.totalExchanges} exchanges</p>
          </div>
        </div>
        <button
          onClick={() => isDownloading ? handleAbortDownload() : setShowDownloadConfirm(true)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            isDownloading
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isDownloading ? `Stop (${downloadPct}%)` : 'Update All'}
        </button>
      </div>

      {/* Download progress banner */}
      {isDownloading && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {downloadStatus?.status === 'updating_recent' ? 'Updating recent data' : 'Downloading missing tickers'} {downloadStatus?.currentTicker || '...'} ({downloadStatus?.currentIndex || 0}/{downloadStatus?.totalToFetch || '?'})
            </span>
            <span className="text-xs text-blue-500">{downloadPct}%</span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${downloadPct}%` }} />
          </div>
          {downloadStatus?.startedAt && (
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">
              Started {new Date(downloadStatus.startedAt).toLocaleTimeString()} &middot; ETA: ~{Math.max(1, Math.round((downloadStatus.totalToFetch - downloadStatus.currentIndex) / 2.5 / 60))} min remaining
            </p>
          )}
        </div>
      )}

      {/* Download complete banner */}
      {downloadStatus?.status === 'completed' && downloadStatus?.completedAt && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 mb-6 flex items-center justify-between">
          <span className="text-sm text-green-700 dark:text-green-300">
            Download completed at {new Date(downloadStatus.completedAt).toLocaleString()}
          </span>
          <button onClick={() => fetchTickers(search, page)} className="text-xs text-green-600 hover:text-green-700 font-medium">Refresh</button>
        </div>
      )}

      {/* Error banner */}
      {downloadStatus?.error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-6">
          <span className="text-sm text-red-700 dark:text-red-300">Error: {downloadStatus.error}</span>
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search by symbol or company name..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors">
          Search
        </button>
      </form>

      {/* Ticker grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : tickers.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📈</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            {total === 0 && !search ? 'No stock data yet. Click "Update All" to start.' : 'No tickers found.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {tickers.map(t => (
              <button
                key={t.symbol}
                onClick={() => handleSelectTicker(t.symbol)}
                className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all text-left border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-900 dark:text-gray-100">{t.symbol}</span>
                  <span className="text-xs text-gray-400">{t.exchange}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">{t.name}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatMarketCap(t.market_cap)}</span>
                  {t.sector && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded-full truncate max-w-[100px]">{t.sector}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); fetchTickers(search, Math.max(1, page - 1)); }}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200"
              >
                Prev
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <button
                onClick={() => { setPage(p => p + 1); fetchTickers(search, page + 1); }}
                disabled={page >= Math.ceil(total / limit)}
                className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Data from Yahoo Finance. For informational purposes only — not financial advice.
      </p>

      {/* Download confirmation modal */}
      {showDownloadConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDownloadConfirm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Update All Stocks?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Downloads missing tickers and updates recent price data for existing ones.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                Missing tickers get full 10Y history. Existing tickers get data from their last date to today.
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              You can close this page — the update continues in the background.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDownloadConfirm(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button onClick={handleStartDownload} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                Start Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
