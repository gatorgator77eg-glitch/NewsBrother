import { useState, useEffect, useCallback, useRef } from 'react';
import CountrySelector from './CountrySelector';
import RecommendationCard from './RecommendationCard';

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

interface CountrySummary {
  code: string;
  name: string;
  block: 'g7' | 'brics' | 'hub';
  indexName: string;
  indexChange1d: number;
  indexChange1w: number;
  sentiment: number;
  sentimentTrend: 'improving' | 'stable' | 'deteriorating';
  articleCount: number;
  topBuy: { symbol: string; name: string; composite: number; signal: string; change1d: number; price: number }[];
  topSell: { symbol: string; name: string; composite: number; signal: string; change1d: number; price: number }[];
  computedAt: string | null;
}

interface CountryDetail {
  country: { code: string; name: string; indexName: string };
  indexChange1d: number;
  indexChange1w: number;
  countrySentiment: {
    avgTone: number;
    articleCount: number;
    positiveRatio: number;
    negativeRatio: number;
    trend: string;
    recentHeadlines: { title: string; tone: number; published_at: string }[];
  };
  topBuy: StockScore[];
  topSell: StockScore[];
  allScored: StockScore[];
  computedAt: string;
}

interface CompareData {
  [code: string]: {
    country: string;
    indexChange1d: number;
    indexChange1w: number;
    sentiment: number;
    sentimentTrend: string;
    topBuy: { symbol: string; composite: number; signal: string }[];
    topSell: { symbol: string; composite: number; signal: string }[];
    avgComposite: number;
    stockCount: number;
    buyRatio: number;
  } | null;
}

const FLAG: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}', UK: '\u{1F1EC}\u{1F1E7}', CA: '\u{1F1E8}\u{1F1E6}',
  FR: '\u{1F1EB}\u{1F1F7}', DE: '\u{1F1E9}\u{1F1EA}', IT: '\u{1F1EE}\u{1F1F9}',
  JP: '\u{1F1EF}\u{1F1F5}', CN: '\u{1F1E8}\u{1F1F3}', IN: '\u{1F1EE}\u{1F1F3}',
  BR: '\u{1F1E7}\u{1F1F7}', ZA: '\u{1F1FF}\u{1F1E6}', HK: '\u{1F1ED}\u{1F1F0}',
  SG: '\u{1F1F8}\u{1F1EC}', KR: '\u{1F1F0}\u{1F1F7}', TW: '\u{1F1F9}\u{1F1FC}',
  CH: '\u{1F1E8}\u{1F1ED}', AE: '\u{1F1E6}\u{1F1EA}', AU: '\u{1F1E6}\u{1F1FA}',
};

function signalColor(signal: string): string {
  if (signal === 'STRONG_BUY' || signal === 'BUY') return 'text-green-400';
  if (signal === 'SELL' || signal === 'STRONG_SELL') return 'text-red-400';
  return 'text-gray-400';
}

export default function StockAdvisor({ onBack, aiEnabled }: { onBack: () => void; aiEnabled?: boolean }) {
  const [summaries, setSummaries] = useState<CountrySummary[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<'composite' | 'change1d' | 'marketCap'>('composite');
  const [error, setError] = useState<string | null>(null);

  // Comparison mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelections, setCompareSelections] = useState<Set<string>>(new Set());
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Progress
  const [progress, setProgress] = useState<{ running: boolean; current: number; total: number; country: string } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummaries(data.countries || []);
    } catch (err: any) {
      console.error('Failed to load recommendations', err);
      setError(err.message || 'Failed to load recommendations');
    }
    setLoading(false);
  }, []);

  const fetchDetail = useCallback(async (code: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/recommendations/${code}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data);
    } catch (err: any) {
      console.error('Failed to load country detail', err);
      setError(err.message || 'Failed to load country detail');
    }
    setDetailLoading(false);
  }, []);

  useEffect(() => { fetchSummaries(); }, [fetchSummaries]);
  useEffect(() => { if (selectedCode) fetchDetail(selectedCode); }, [selectedCode, fetchDetail]);

  // SSE progress listener
  useEffect(() => {
    try {
      const es = new EventSource('/api/recommendations/stream/progress');
      eventSourceRef.current = es;
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setProgress(data);
          if (!data.running && data.total > 0) {
            fetchSummaries();
          }
        } catch {}
      };
      es.onerror = () => es.close();
    } catch {}
    return () => { eventSourceRef.current?.close(); };
  }, [fetchSummaries]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/recommendations/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh');
    }
    setRefreshing(false);
  };

  const handleSelectCountry = (code: string) => {
    if (compareMode) {
      setCompareSelections(prev => {
        const next = new Set(prev);
        if (next.has(code)) next.delete(code);
        else if (next.size < 6) next.add(code);
        return next;
      });
      return;
    }
    setSelectedCode(selectedCode === code ? null : code);
  };

  const handleCompare = async () => {
    if (compareSelections.size < 2) return;
    setCompareLoading(true);
    setError(null);
    try {
      const codes = Array.from(compareSelections).join(',');
      const res = await fetch(`/api/recommendations/compare/${codes}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompareData(data.comparison);
    } catch (err: any) {
      setError(err.message || 'Failed to compare');
    }
    setCompareLoading(false);
  };

  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setCompareSelections(new Set());
    setCompareData(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stock Advisor</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Data-driven buy/sell recommendations across 18 markets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleCompareMode}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                compareMode
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {compareMode ? `Compare (${compareSelections.size}/6)` : 'Compare'}
            </button>
            {compareMode && compareSelections.size >= 2 && (
              <button
                onClick={handleCompare}
                disabled={compareLoading}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {compareLoading ? 'Loading...' : 'Run Compare'}
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing || (progress?.running ?? false)}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {progress?.running ? `${progress.country} (${progress.current}/${progress.total})` : refreshing ? 'Starting...' : 'Refresh All'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
          </div>
        )}

        {/* Progress Bar */}
        {progress?.running && (
          <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Computing {progress.country}... ({progress.current}/{progress.total})
              </span>
              <span className="text-[10px] text-gray-400">
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Country Selector */}
        <CountrySelector countries={summaries} selectedCode={selectedCode} onSelect={handleSelectCountry} />

        {/* Compare Results */}
        {compareData && (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Cross-Country Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <th className="pb-2 pr-3">Country</th>
                    <th className="pb-2 pr-3">1D</th>
                    <th className="pb-2 pr-3">1W</th>
                    <th className="pb-2 pr-3">Sentiment</th>
                    <th className="pb-2 pr-3">Trend</th>
                    <th className="pb-2 pr-3">Avg Score</th>
                    <th className="pb-2 pr-3">Buy %</th>
                    <th className="pb-2">Stocks</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(compareData).filter(([, v]) => v).map(([code, data]) => (
                    <tr key={code} className="border-b border-gray-50 dark:border-gray-750">
                      <td className="py-2 pr-3 font-medium text-gray-900 dark:text-gray-100">
                        {FLAG[code] || ''} {data!.country}
                      </td>
                      <td className={`py-2 pr-3 font-medium ${data!.indexChange1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {data!.indexChange1d >= 0 ? '+' : ''}{data!.indexChange1d.toFixed(2)}%
                      </td>
                      <td className={`py-2 pr-3 font-medium ${data!.indexChange1w >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {data!.indexChange1w >= 0 ? '+' : ''}{data!.indexChange1w.toFixed(2)}%
                      </td>
                      <td className={`py-2 pr-3 font-medium ${data!.sentiment > 0 ? 'text-green-400' : data!.sentiment < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {data!.sentiment.toFixed(2)}
                      </td>
                      <td className={`py-2 pr-3 ${data!.sentimentTrend === 'improving' ? 'text-green-400' : data!.sentimentTrend === 'deteriorating' ? 'text-red-400' : 'text-gray-400'}`}>
                        {data!.sentimentTrend}
                      </td>
                      <td className={`py-2 pr-3 font-bold ${data!.avgComposite >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {data!.avgComposite}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">{data!.buyRatio}%</td>
                      <td className="py-2 text-gray-500">{data!.stockCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detail View */}
        {selectedCode && !compareMode && (
          <div className="mt-6">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                <span className="ml-3 text-sm text-gray-400">Analyzing {selectedCode} market...</span>
              </div>
            ) : detail ? (
              <div className="space-y-4">
                {/* Country Header */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{FLAG[selectedCode] || '\u{1F310}'}</span>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{detail.country.name}</h2>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{detail.country.indexName}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex gap-3">
                        <div>
                          <p className="text-[10px] text-gray-400">1D</p>
                          <p className={`text-sm font-bold ${detail.indexChange1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {detail.indexChange1d >= 0 ? '+' : ''}{detail.indexChange1d.toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">1W</p>
                          <p className={`text-sm font-bold ${detail.indexChange1w >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {detail.indexChange1w >= 0 ? '+' : ''}{detail.indexChange1w.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sentiment Bar */}
                  <div className="mt-4 flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">News Sentiment:</span>
                      <span className={`font-semibold ${detail.countrySentiment.avgTone > 0 ? 'text-green-400' : detail.countrySentiment.avgTone < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {detail.countrySentiment.avgTone.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Trend:</span>
                      <span className={`font-semibold ${
                        detail.countrySentiment.trend === 'improving' ? 'text-green-400' :
                        detail.countrySentiment.trend === 'deteriorating' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {detail.countrySentiment.trend}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Articles (7d):</span>
                      <span className="font-semibold text-gray-300">{detail.countrySentiment.articleCount}</span>
                    </div>
                  </div>
                </div>

                {/* Top Buy + Top Sell */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* BUY */}
                  <div>
                    <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      Top 3 BUY
                    </h3>
                    <div className="space-y-2">
                      {detail.topBuy.length > 0 ? detail.topBuy.map(s => (
                        <RecommendationCard key={s.symbol} stock={s} countryCode={selectedCode} countryName={detail.country.name} aiEnabled={aiEnabled} />
                      )) : (
                        <p className="text-xs text-gray-500 py-4 text-center">No buy signals detected</p>
                      )}
                    </div>
                  </div>

                  {/* SELL */}
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      Top 3 SELL
                    </h3>
                    <div className="space-y-2">
                      {detail.topSell.length > 0 ? detail.topSell.map(s => (
                        <RecommendationCard key={s.symbol} stock={s} countryCode={selectedCode} countryName={detail.country.name} aiEnabled={aiEnabled} />
                      )) : (
                        <p className="text-xs text-gray-500 py-4 text-center">No sell signals detected</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recent Headlines */}
                {detail.countrySentiment.recentHeadlines.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Headlines</h3>
                    <div className="space-y-2">
                      {detail.countrySentiment.recentHeadlines.map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`shrink-0 w-6 text-center font-mono ${
                            h.tone > 0 ? 'text-green-400' : h.tone < 0 ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {h.tone.toFixed(1)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-700 dark:text-gray-300 truncate">{h.title}</p>
                            <p className="text-[10px] text-gray-400">{new Date(h.published_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Ranking */}
                {detail.allScored.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Full Ranking ({detail.allScored.length} stocks)</h3>
                      <div className="flex gap-1">
                        {(['composite', 'change1d', 'marketCap'] as const).map(f => (
                          <button key={f} onClick={() => setSortField(f)}
                            className={`text-[10px] px-2 py-1 rounded ${sortField === f ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600'}`}>
                            {f === 'composite' ? 'Score' : f === 'change1d' ? '1D%' : 'Mkt Cap'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {[...detail.allScored]
                        .sort((a, b) => sortField === 'marketCap' ? b.marketCap - a.marketCap : sortField === 'change1d' ? b.change1d - a.change1d : b.composite - a.composite)
                        .map(s => (
                          <RecommendationCard key={s.symbol} stock={s} compact />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Dashboard View (no country selected) */}
        {!selectedCode && !loading && summaries.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.filter(s => s.computedAt).map(c => {
              const isSelected = compareMode && compareSelections.has(c.code);
              return (
                <div key={c.code}
                  onClick={() => handleSelectCountry(c.code)}
                  className={`bg-white dark:bg-gray-800 rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${
                    isSelected
                      ? 'border-yellow-400 dark:border-yellow-600 ring-1 ring-yellow-400/50 bg-yellow-50 dark:bg-yellow-900/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{FLAG[c.code] || '\u{1F310}'}</span>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{c.name}</h3>
                      <p className="text-[10px] text-gray-400">{c.indexName}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className={`text-xs font-bold ${c.indexChange1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {c.indexChange1d >= 0 ? '+' : ''}{c.indexChange1d.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] font-semibold text-green-400 mb-1">TOP BUY</p>
                      {c.topBuy.slice(0, 3).map((s, i) => (
                        <div key={i} className="flex justify-between text-[10px] py-0.5">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{s.symbol}</span>
                          <span className={signalColor(s.signal)}>{s.composite > 0 ? '+' : ''}{s.composite}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-red-400 mb-1">TOP SELL</p>
                      {c.topSell.slice(0, 3).map((s, i) => (
                        <div key={i} className="flex justify-between text-[10px] py-0.5">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{s.symbol}</span>
                          <span className={signalColor(s.signal)}>{s.composite > 0 ? '+' : ''}{s.composite}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-[9px] text-gray-400">
                      {c.articleCount} articles \u00B7 {c.sentimentTrend}
                    </span>
                    <span className="text-[9px] text-gray-400">
                      Updated {c.computedAt ? new Date(c.computedAt).toLocaleTimeString() : 'never'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            <span className="ml-3 text-sm text-gray-400">Loading market data...</span>
          </div>
        )}
      </div>
    </div>
  );
}
