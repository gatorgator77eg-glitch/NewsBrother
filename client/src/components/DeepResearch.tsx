import { useState, useEffect, useRef } from 'react';
import { runDeepResearch, getDeepResearchSuggestions, type DeepResearchResult } from '../api';

interface Props { onBack: () => void; }

export default function DeepResearch({ onBack }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeepResearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getDeepResearchSuggestions().then(r => setSuggestions(r.suggestions)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!result || !chartRef.current) return;
    const canvas = chartRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.parentElement?.clientWidth || 700;
    const H = canvas.height = 260;
    ctx.clearRect(0, 0, W, H);

    const timeline = result.timeline;
    if (timeline.length === 0) return;

    const padL = 50, padR = 20, padT = 20, padB = 30;
    const cW = W - padL - padR, cH = H - padT - padB;
    const maxCount = Math.max(...timeline.map(t => t.count), 1);
    const tones = timeline.map(t => t.avgTone).filter(t => t !== 0);
    const maxTone = Math.max(Math.abs(Math.min(...tones, 0)), Math.abs(Math.max(...tones, 0)), 1);

    // Grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    // Zero line for tone
    const zeroY = padT + cH / 2;
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(W - padR, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Bar chart (article count)
    const barW = Math.max(2, (cW / timeline.length) - 1);
    for (let i = 0; i < timeline.length; i++) {
      const x = padL + (i / timeline.length) * cW;
      const h = (timeline[i].count / maxCount) * cH * 0.8;
      ctx.fillStyle = 'rgba(59,130,246,0.4)';
      ctx.fillRect(x, padT + cH - h, barW, h);
    }

    // Line chart (tone)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].avgTone === 0) continue;
      const x = padL + (i / timeline.length) * cW + barW / 2;
      const y = zeroY - (timeline[i].avgTone / maxTone) * (cH / 2);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legend
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(padL, H - 14, 10, 10);
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Article count', padL + 14, H - 5);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(padL + 110, H - 9); ctx.lineTo(padL + 125, H - 9); ctx.stroke();
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Avg tone', padL + 130, H - 5);
  }, [result]);

  const handleSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    try {
      const r = await runDeepResearch(q, dateFrom || undefined, dateTo || undefined);
      setResult(r);
    } catch {
      setError('Query failed. Try a different search term.');
    }
    setLoading(false);
  };

  const handleExport = () => {
    if (!result) return;
    const params = new URLSearchParams({ query: result.query });
    window.open(`/api/export/deep-research?${params}`, '_blank');
  };

  const timeline = result?.timeline || [];
  const toneOverview = result?.toneOverview || { avg: 0, min: 0, max: 0, positive: 0, negative: 0, neutral: 0 };
  const tickers = result?.tickers || [];
  const priceData = result?.priceData || {};
  const domains = result?.domains || [];
  const countries = result?.countries || [];
  const articles = result?.articles || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Back</button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">🔬 Deep Research Sandbox</h2>
        {result && (
          <button onClick={handleExport} className="px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800/40">
            📥 Export CSV
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="flex gap-3 mb-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch(query)}
            placeholder="Search news, topics, tickers across all data sources..."
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 text-sm"
          />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs" />
          <button onClick={() => handleSearch(query)} disabled={loading} className="px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {loading ? '...' : 'Research'}
          </button>
        </div>
        {suggestions.length > 0 && !result && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button key={s} onClick={() => { setQuery(s); handleSearch(s); }} className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      {result && (
        <>
          {/* Tone overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Articles', value: toneOverview.positive + toneOverview.negative + toneOverview.neutral, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Avg Tone', value: toneOverview.avg.toFixed(2), color: toneOverview.avg > 0 ? 'text-green-600' : toneOverview.avg < 0 ? 'text-red-500' : 'text-gray-500' },
              { label: 'Positive', value: toneOverview.positive, color: 'text-green-600 dark:text-green-400' },
              { label: 'Negative', value: toneOverview.negative, color: 'text-red-500 dark:text-red-400' },
              { label: 'Domains', value: domains?.length || 0, color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Countries', value: countries?.length || 0, color: 'text-amber-600 dark:text-amber-400' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tone + Volume chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Narrative Timeline</h3>
            <canvas ref={chartRef} className="w-full" />
          </div>

          {/* Ticker mentions + price */}
          {tickers && tickers.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Mentioned Tickers</h3>
              <div className="space-y-3">
                {tickers.slice(0, 5).map(t => (
                  <div key={t.symbol} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div className="w-16 text-center">
                      <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{t.symbol}</div>
                      <div className="text-[10px] text-gray-400">{t.mentions}×</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{t.name}</div>
                      <div className="text-[10px] text-gray-400">{t.sector}</div>
                    </div>
                    {priceData[t.symbol] && priceData[t.symbol].length > 1 && (
                      <MiniChart data={priceData[t.symbol]} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Domains + Countries */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Top Domains</h3>
              <div className="space-y-1.5">
                {domains?.slice(0, 10).map(d => (
                  <div key={d.domain} className="flex items-center gap-2">
                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{d.domain}</div>
                    <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(d.count / (domains[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <div className="text-[10px] text-gray-400 w-6 text-right">{d.count}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Countries</h3>
              <div className="space-y-1.5">
                {countries?.slice(0, 10).map(c => (
                  <div key={c.country} className="flex items-center gap-2">
                    <div className="text-xs text-gray-600 dark:text-gray-400 flex-1">{c.country}</div>
                    <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(c.count / (countries[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <div className="text-[10px] text-gray-400 w-6 text-right">{c.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Articles list */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Articles ({articles.length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {articles.slice(0, 50).map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className={`text-xs font-mono w-12 text-center mt-0.5 ${a.tone > 1 ? 'text-green-600' : a.tone < -1 ? 'text-red-500' : 'text-gray-400'}`}>
                    {a.tone.toFixed(1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <a href={a.url} target="_blank" rel="noopener" className="text-sm text-gray-900 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 line-clamp-2">
                      {a.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span>{a.domain}</span>
                      <span>•</span>
                      <span>{a.source_country}</span>
                      <span>•</span>
                      <span>{a.published_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MiniChart({ data }: { data: { date: string; close: number }[] }) {
  const sorted = [...data].reverse().slice(0, 30);
  if (sorted.length < 2) return null;
  const min = Math.min(...sorted.map(d => d.close));
  const max = Math.max(...sorted.map(d => d.close));
  const range = max - min || 1;
  const w = 80, h = 24;
  const points = sorted.map((d, i) => `${(i / (sorted.length - 1)) * w},${h - ((d.close - min) / range) * h}`).join(' ');
  const change = ((sorted[sorted.length - 1].close - sorted[0].close) / sorted[0].close) * 100;

  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} className="flex-shrink-0">
        <polyline points={points} fill="none" stroke={change >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
      </svg>
      <span className={`text-[10px] font-medium ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
      </span>
    </div>
  );
}
