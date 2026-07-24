import { useState, useEffect, useRef, useCallback } from 'react';
import {
  searchNewsArchive,
  getNewsArchiveStats,
  getNewsArchiveDownloadStatus,
  startNewsArchiveDownload,
  abortNewsArchiveDownload,
  type NewsArchiveArticle,
  type NewsArchiveStats,
  type NewsArchiveDownloadStatus,
} from '../api';

interface Props {
  onBack: () => void;
}

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const DEFAULT_QUERY = '(tariff OR sanctions OR war OR military OR "interest rate" OR fed OR election OR protest OR conflict OR supply chain OR trade OR recession OR inflation)';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function NewsArchive({ onBack }: Props) {
  const [dlStatus, setDlStatus] = useState<NewsArchiveDownloadStatus | null>(null);
  const [startDate, setStartDate] = useState(() => daysAgo(30));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stats, setStats] = useState<NewsArchiveStats | null>(null);
  const [articles, setArticles] = useState<NewsArchiveArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'articles' | 'timeline' | 'domains' | 'countries'>('articles');
  const [dlExpanded, setDlExpanded] = useState(true);
  const limit = 50;

  const hasData = (stats?.total ?? 0) > 0;
  const isRunning = dlStatus?.status === 'running';

  // ─── Init: poll status + load stats ───
  useEffect(() => {
    pollStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const s = await getNewsArchiveDownloadStatus();
      setDlStatus(s);
      if (s.status === 'running') {
        if (!pollRef.current) {
          pollRef.current = setInterval(pollStatus, 2000);
        }
      } else {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        if (s.status === 'completed') loadStats();
      }
    } catch {}
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await getNewsArchiveStats();
      setStats(s);
    } catch {}
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ─── Auto-load articles + collapse download when data exists ───
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (hasData && !autoLoadedRef.current && !isRunning) {
      autoLoadedRef.current = true;
      setDlExpanded(false);
      handleSearch(1);
    }
  }, [hasData, isRunning]);

  // ─── Auto-expand download manager when running ───
  useEffect(() => {
    if (isRunning) setDlExpanded(true);
  }, [isRunning]);

  const handleStartDownload = async (sd?: string, ed?: string, q?: string) => {
    const s = sd || startDate;
    const e = ed || endDate;
    const qu = q || query;
    const res = await startNewsArchiveDownload(s, e, qu);
    if (res.ok) {
      pollStatus();
    } else if (res.error) {
      alert(res.error);
    }
  };

  const handlePreset = (days: number) => {
    const s = daysAgo(days);
    const e = new Date().toISOString().slice(0, 10);
    setStartDate(s);
    setEndDate(e);
    handleStartDownload(s, e);
  };

  const handleAbortDownload = async () => {
    await abortNewsArchiveDownload();
    pollStatus();
  };

  const handleSearch = async (page: number = 1) => {
    setLoading(true);
    setSearchPage(page);
    try {
      const result = await searchNewsArchive(searchQuery, searchDateFrom || undefined, searchDateTo || undefined, page, limit);
      setArticles(result.articles);
      setSearchTotal(result.total);
    } catch {}
    setLoading(false);
  };

  // ─── Empty state: no data and not downloading ───
  if (!hasData && !isRunning) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
        <button onClick={onBack} className="mb-4 px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded border border-gray-700">
          ← Back
        </button>

        {/* Hero */}
        <div className="text-center py-16 mb-8">
          <div className="text-6xl mb-4">🗄️</div>
          <h1 className="text-3xl font-bold mb-3">News Archive</h1>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            Build a searchable archive of political and economic news from GDELT.
            Download articles by date range, then search, browse, and analyze coverage patterns.
          </p>
          <div className="flex justify-center gap-3 mb-10">
            {PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => handlePreset(p.days)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Download form */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 max-w-3xl mx-auto">
          <h2 className="text-lg font-semibold mb-3">Custom Download</h2>
          <div className="flex flex-wrap gap-4 items-end mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
            </div>
            <button onClick={() => handleStartDownload()}
              className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
              Download
            </button>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Query (GDELT search terms)</label>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Has data or downloading ───
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <button onClick={onBack} className="mb-4 px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded border border-gray-700">
        ← Back
      </button>
      <h1 className="text-2xl font-bold mb-5">News Archive</h1>

      {/* Inline progress bar — always visible when running */}
      {isRunning && (
        <div className="bg-gray-900 border border-blue-800/40 rounded-lg p-4 mb-5">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span className="text-blue-400 font-medium">
              Downloading... {dlStatus?.currentDate || '...'}
            </span>
            <span>{dlStatus?.completedDays}/{dlStatus?.totalDays} days ({dlStatus?.pct}%) · ~{dlStatus?.etaMin || '?'} min left</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 mb-1.5">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${dlStatus?.pct || 0}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{dlStatus?.totalArticles || 0} articles saved</span>
            <button onClick={handleAbortDownload} className="text-red-400 hover:text-red-300">Cancel</button>
          </div>
        </div>
      )}

      {/* Stats cards */}
      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard label="Total Articles" value={stats!.total.toLocaleString()} />
          <StatCard label="Date Range" value={`${stats!.earliest?.slice(0, 10) || '?'} → ${stats!.latest?.slice(0, 10) || '?'}`} />
          <StatCard label="Top Source" value={stats!.topDomains[0]?.domain || '-'} sub={`${stats!.topDomains[0]?.count || 0} articles`} />
          <StatCard label="Top Country" value={stats!.topCountries[0]?.country || '-'} sub={`${stats!.topCountries[0]?.count || 0} articles`} />
        </div>
      )}

      {/* Collapsible download manager */}
      {hasData && !isRunning && (
        <div className="mb-5">
          <button
            onClick={() => setDlExpanded(!dlExpanded)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 bg-gray-900 border border-gray-800 rounded-lg transition-colors"
          >
            <span className={`transition-transform ${dlExpanded ? 'rotate-180' : ''}`}>▼</span>
            Download More
          </button>
          {dlExpanded && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mt-2">
              <div className="flex flex-wrap gap-3 items-end mb-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Start</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">End</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
                </div>
                <div className="flex gap-2">
                  {PRESETS.map(p => (
                    <button key={p.days} onClick={() => handlePreset(p.days)}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 border border-gray-700">
                      {p.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => handleStartDownload()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">
                  Download
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Query</label>
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analysis tabs */}
      {hasData && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex gap-2 mb-4 border-b border-gray-800 pb-3">
            {(['articles', 'timeline', 'domains', 'countries'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'articles' && articles.length === 0 && !loading) handleSearch(1);
                }}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {tab === 'articles' ? 'Articles' : tab === 'timeline' ? 'Timeline' : tab === 'domains' ? 'By Source' : 'By Country'}
              </button>
            ))}
          </div>

          {activeTab === 'timeline' && <TimelineChart dailyVolume={stats!.dailyVolume} weeklyVolume={stats!.weeklyVolume} />}
          {activeTab === 'domains' && <DomainsBarChart domains={stats!.topDomains} />}
          {activeTab === 'countries' && <CountriesBarChart countries={stats!.topCountries} />}

          {activeTab === 'articles' && (
            <div>
              <div className="flex flex-wrap gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Search archive..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch(1)}
                  className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                />
                <input type="date" value={searchDateFrom} onChange={e => setSearchDateFrom(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
                <input type="date" value={searchDateTo} onChange={e => setSearchDateTo(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm" />
                <button onClick={() => handleSearch(1)} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm">Search</button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : articles.length > 0 ? (
                <>
                  <div className="text-xs text-gray-500 mb-3">{searchTotal.toLocaleString()} results</div>
                  <div className="space-y-2">
                    {articles.map(a => (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                         className="block bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded p-3 transition">
                        <div className="text-sm font-medium text-blue-400 hover:underline line-clamp-2">{a.title}</div>
                        <div className="text-xs text-gray-500 mt-1 flex gap-3">
                          <span>{a.domain}</span>
                          {a.source_country && <span>{a.source_country}</span>}
                          {a.published_at && <span>{a.published_at.slice(0, 10)}</span>}
                          {a.tone !== 0 && (
                            <span className={a.tone > 0 ? 'text-green-400' : 'text-red-400'}>
                              tone: {a.tone.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                  {searchTotal > limit && (
                    <div className="flex justify-center gap-2 mt-4">
                      <button onClick={() => handleSearch(searchPage - 1)} disabled={searchPage <= 1}
                        className="px-3 py-1 bg-gray-800 rounded text-sm disabled:opacity-40">Prev</button>
                      <span className="text-sm text-gray-500 py-1">Page {searchPage} of {Math.ceil(searchTotal / limit)}</span>
                      <button onClick={() => handleSearch(searchPage + 1)} disabled={articles.length < limit}
                        className="px-3 py-1 bg-gray-800 rounded text-sm disabled:opacity-40">Next</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {searchQuery || searchDateFrom || searchDateTo ? 'No results found' : 'Loading articles...'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function TimelineChart({ dailyVolume }: { dailyVolume: { date: string; count: number }[]; weeklyVolume: { week: string; count: number }[] }) {
  const data = dailyVolume.filter(d => d.date);
  if (data.length === 0) return <div className="text-gray-500 text-sm text-center py-8">No timeline data</div>;

  const chartW = 860;
  const chartH = 260;
  const pad = { top: 20, right: 20, bottom: 50, left: 50 };
  const plotW = chartW - pad.left - pad.right;
  const plotH = chartH - pad.top - pad.bottom;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barW = Math.max(1, Math.floor(plotW / data.length) - 1);

  const bars = data.map((d, i) => {
    const x = pad.left + (i / data.length) * plotW;
    const h = (d.count / maxCount) * plotH;
    const y = pad.top + plotH - h;
    return { x, y, w: barW, h, date: d.date, count: d.count };
  });

  const tickDates = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 8)) === 0);

  return (
    <div>
      <div className="text-sm font-medium mb-2">Daily Article Volume</div>
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const v = Math.round(maxCount * frac);
          const y = pad.top + plotH - frac * plotH;
          return (
            <g key={frac}>
              <line x1={pad.left} y1={y} x2={chartW - pad.right} y2={y} stroke="#374151" strokeWidth={0.5} />
              <text x={pad.left - 5} y={y + 3} textAnchor="end" fill="#6b7280" fontSize={9}>{v}</text>
            </g>
          );
        })}
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="#3b82f6" rx={1}>
            <title>{b.date}: {b.count} articles</title>
          </rect>
        ))}
        {tickDates.map((d, i) => {
          const idx = data.indexOf(d);
          const x = pad.left + (idx / data.length) * plotW;
          return (
            <text key={i} x={x} y={chartH - 5} textAnchor="middle" fill="#6b7280" fontSize={8} transform={`rotate(-30, ${x}, ${chartH - 5})`}>
              {d.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function DomainsBarChart({ domains }: { domains: { domain: string; count: number }[] }) {
  if (domains.length === 0) return <div className="text-gray-500 text-sm text-center py-8">No data</div>;
  const maxCount = domains[0]?.count || 1;
  return (
    <div>
      <div className="text-sm font-medium mb-3">Top Sources</div>
      <div className="space-y-2">
        {domains.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-40 text-xs text-gray-400 text-right truncate" title={d.domain}>{d.domain}</div>
            <div className="flex-1 bg-gray-800 rounded h-5 relative">
              <div className="bg-blue-500 h-5 rounded" style={{ width: `${(d.count / maxCount) * 100}%` }} />
              <span className="absolute right-2 top-0.5 text-xs text-gray-300">{d.count.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CountriesBarChart({ countries }: { countries: { country: string; count: number }[] }) {
  if (countries.length === 0) return <div className="text-gray-500 text-sm text-center py-8">No data</div>;
  const maxCount = countries[0]?.count || 1;
  return (
    <div>
      <div className="text-sm font-medium mb-3">Top Countries</div>
      <div className="space-y-2">
        {countries.map((c, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-40 text-xs text-gray-400 text-right truncate">{c.country}</div>
            <div className="flex-1 bg-gray-800 rounded h-5 relative">
              <div className="bg-green-500 h-5 rounded" style={{ width: `${(c.count / maxCount) * 100}%` }} />
              <span className="absolute right-2 top-0.5 text-xs text-gray-300">{c.count.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
