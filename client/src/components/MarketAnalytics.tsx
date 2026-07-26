import { useState, useEffect, useCallback, useRef } from 'react';

type Tab = 'movers' | 'volume' | 'heatmap' | 'sectors' | 'seasonality' | 'correlation' | 'risk-reward' | 'compare' | 'events' | 'countries';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'movers', label: 'Top Movers', icon: '🏆' },
  { id: 'volume', label: 'Volume Spikes', icon: '📊' },
  { id: 'heatmap', label: 'Market Heatmap', icon: '🗺️' },
  { id: 'sectors', label: 'Sector Rotation', icon: '🔄' },
  { id: 'seasonality', label: 'Seasonality', icon: '📅' },
  { id: 'correlation', label: 'Correlations', icon: '🔗' },
  { id: 'risk-reward', label: 'Risk/Reward', icon: '⚖️' },
  { id: 'compare', label: 'Multi-Compare', icon: '📈' },
  { id: 'events', label: 'Event Timeline', icon: '🎯' },
  { id: 'countries', label: 'By Country', icon: '🌍' },
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pctColor(v: number, max = 10): string {
  if (v > 0) {
    const intensity = Math.min(v / max, 1);
    return `rgba(34,197,94,${0.15 + intensity * 0.85})`;
  } else {
    const intensity = Math.min(Math.abs(v) / max, 1);
    return `rgba(239,68,68,${0.15 + intensity * 0.85})`;
  }
}

function corrColor(v: number): string {
  if (v > 0) {
    return `rgba(59,130,246,${Math.abs(v) * 0.8})`;
  } else {
    return `rgba(249,115,22,${Math.abs(v) * 0.8})`;
  }
}

function formatMcap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

interface Props { onBack: () => void; }

export default function MarketAnalytics({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('movers');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTab = useCallback(async (t: Tab) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setData(null);
    try {
      let url = '';
      switch (t) {
        case 'movers': url = '/api/market-analytics/movers'; break;
        case 'volume': url = '/api/market-analytics/volume'; break;
        case 'heatmap': url = '/api/market-analytics/heatmap'; break;
        case 'sectors': url = '/api/market-analytics/sectors'; break;
        case 'seasonality': url = '/api/market-analytics/seasonality'; break;
        case 'correlation': url = '/api/market-analytics/correlation?symbols=AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA,XOM'; break;
        case 'risk-reward': url = '/api/market-analytics/risk-reward'; break;
        case 'countries': url = '/api/market-analytics/countries'; break;
        case 'compare': case 'events': setData(null); setLoading(false); return;
      }
      if (url) {
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) setData(await res.json());
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error(err);
    }
    if (!controller.signal.aborted) setLoading(false);
  }, []);

  useEffect(() => { fetchTab(tab); }, [tab, fetchTab]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Market Analytics</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-thin">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {!loading && tab === 'movers' && data?.movers && <MoversViz data={data.movers} />}
      {!loading && tab === 'volume' && data?.volume && <VolumeViz data={data.volume} />}
      {!loading && tab === 'heatmap' && data?.heatmap && <HeatmapViz data={data.heatmap} />}
      {!loading && tab === 'sectors' && data?.sectors && <SectorsViz data={data.sectors} />}
      {!loading && tab === 'seasonality' && data?.seasonality && <SeasonalityViz data={data.seasonality} />}
      {!loading && tab === 'correlation' && data?.correlation && <CorrelationViz data={data} />}
      {!loading && tab === 'risk-reward' && data?.risk_reward && <RiskRewardViz data={data.risk_reward} />}
      {!loading && tab === 'compare' && <CompareViz />}
      {!loading && tab === 'events' && <EventTimelineViz />}
      {!loading && tab === 'countries' && data?.countries && <CountriesViz data={data.countries} />}
    </div>
  );
}

// ═══════════════════════════════════════════
// 1. TOP MOVERS
// ═══════════════════════════════════════════
function MoversViz({ data }: { data: any[] }) {
  const [sortField, setSortField] = useState<'change_1d' | 'change_1w' | 'change_1m'>('change_1d');
  const [filter, setFilter] = useState<'gainers' | 'losers' | 'all'>('all');

  let filtered = [...data];
  if (filter === 'gainers') filtered = filtered.filter(m => m[sortField] > 0);
  if (filter === 'losers') filtered = filtered.filter(m => m[sortField] < 0);
  filtered.sort((a, b) => Math.abs(b[sortField] || 0) - Math.abs(a[sortField] || 0));
  filtered = filtered.slice(0, 50);

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['change_1d', 'change_1w', 'change_1m'] as const).map(f => (
          <button key={f} onClick={() => setSortField(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${sortField === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
            {f === 'change_1d' ? '1 Day' : f === 'change_1w' ? '1 Week' : '1 Month'}
          </button>
        ))}
        <div className="w-px bg-gray-200 dark:bg-gray-700" />
        {(['all', 'gainers', 'losers'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${filter === f ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Ticker</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">1D</th>
                <th className="px-4 py-2 text-right font-medium">1W</th>
                <th className="px-4 py-2 text-right font-medium">1M</th>
                <th className="px-4 py-2 text-right font-medium">MCap</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m: any, i: number) => (
                <tr key={m.symbol} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{m.symbol}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[120px]">{m.name}</div>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 font-medium">${m.price?.toFixed(2)}</td>
                  {['change_1d', 'change_1w', 'change_1m'].map(f => (
                    <td key={f} className="px-4 py-2 text-right">
                      {m[f] != null ? (
                        <span className={`font-medium ${m[f] >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {m[f] >= 0 ? '+' : ''}{m[f].toFixed(2)}%
                        </span>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right text-xs text-gray-500">{formatMcap(m.market_cap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 2. VOLUME SPIKES
// ═══════════════════════════════════════════
function VolumeViz({ data }: { data: any[] }) {
  const maxRatio = Math.max(...data.map((d: any) => d.ratio), 1);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-4">Stocks with unusual volume vs 20-day average — often signals news-driven activity</p>
      <div className="max-h-[500px] overflow-y-auto space-y-2">
        {data.map((v: any) => (
          <div key={v.symbol} className="flex items-center gap-3">
            <div className="w-16 text-xs font-medium text-gray-900 dark:text-gray-100">{v.symbol}</div>
            <div className="flex-1">
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                <div className={`h-5 rounded-full transition-all ${v.ratio >= 3 ? 'bg-red-500' : v.ratio >= 2 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((v.ratio / maxRatio) * 100, 100)}%` }} />
              </div>
            </div>
            <div className="w-20 text-right text-xs">
              <span className={`font-bold ${v.ratio >= 3 ? 'text-red-500' : v.ratio >= 2 ? 'text-amber-500' : 'text-blue-600'}`}>
                {v.ratio}x
              </span>
            </div>
            <div className="w-16 text-right text-xs text-gray-400">{(v.volume / 1000000).toFixed(1)}M</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 3. MARKET HEATMAP (Treemap)
// ═══════════════════════════════════════════
function HeatmapViz({ data }: { data: any[] }) {
  const [hovered, setHovered] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const sectors: Record<string, any[]> = {};
  data.forEach(d => {
    if (!sectors[d.sector]) sectors[d.sector] = [];
    sectors[d.sector].push(d);
  });

  const sectorList = Object.entries(sectors)
    .map(([name, stocks]) => ({ name, totalCap: stocks.reduce((s, st) => s + st.market_cap, 0), stocks }))
    .sort((a, b) => b.totalCap - a.totalCap);

  const totalCap = sectorList.reduce((s, sec) => s + sec.totalCap, 0);
  const W = 900, H = 500;

  function squarify(items: any[], x: number, y: number, w: number, h: number): { rect: any; children: any[] }[] {
    if (items.length === 0 || w <= 0 || h <= 0) return [];
    const total = items.reduce((s, i) => s + i.totalCap, 0);
    if (total <= 0) return [];
    const results: { rect: any; children: any[] }[] = [];
    let cx = x, cy = y, cw = w, ch = h;
    let remaining = [...items];
    const horizontal = w >= h;

    while (remaining.length > 0) {
      const ratio = horizontal ? ch / cw : cw / ch;
      let rowCap = remaining[0].totalCap;
      let row = [remaining[0]];
      let bestWorst = 0;
      for (let i = 1; i < remaining.length; i++) {
        const testCap = rowCap + remaining[i].totalCap;
        const testRow = [...row, remaining[i]];
        const worst = Math.max(
          ...testRow.map(t => (t.totalCap / testCap) * (horizontal ? cw : ch)),
          (testCap / total * (horizontal ? cw : ch)) / testRow.length
        );
        const prevWorst = Math.max(
          ...row.map(t => (t.totalCap / rowCap) * (horizontal ? cw : ch)),
          (rowCap / total * (horizontal ? cw : ch)) / row.length
        );
        if (worst <= prevWorst * 1.1 || i === remaining.length - 1) {
          rowCap = testCap;
          row = testRow;
          bestWorst = worst;
        } else break;
      }

      const fraction = rowCap / total;
      if (horizontal) {
        const rowW = fraction * cw;
        let rowY = cy;
        for (const item of row) {
          const itemH = (item.totalCap / rowCap) * ch;
          results.push({ rect: { x: cx, y: rowY, w: rowW, h: itemH, ...item }, children: [] });
          rowY += itemH;
        }
        cx += rowW;
        cw -= rowW;
      } else {
        const rowH = fraction * ch;
        let rowX = cx;
        for (const item of row) {
          const itemW = (item.totalCap / rowCap) * cw;
          results.push({ rect: { x: rowX, y: cy, w: itemW, h: rowH, ...item }, children: [] });
          rowX += itemW;
        }
        cy += rowH;
        ch -= rowH;
      }

      remaining = remaining.slice(row.length);
    }
    return results;
  }

  const rects = squarify(sectorList, 0, 0, W, H);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-3">Size = market cap, color = 1-day change. Hover for details.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg overflow-hidden"
        onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}>
        {rects.map((r, i) => (
          <g key={i} onMouseEnter={() => setHovered(r.rect)} onMouseLeave={() => setHovered(null)}>
            <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={r.rect.h} fill={pctColor(r.rect.change_pct)} stroke="white" strokeWidth={1.5} className="dark:stroke-gray-800" rx={2} />
            {r.rect.w > 40 && r.rect.h > 20 && (
              <>
                <text x={r.rect.x + 4} y={r.rect.y + 14} className="fill-gray-900 dark:fill-gray-100" fontSize={Math.min(12, r.rect.w / 6)} fontWeight={700}>{r.rect.symbol}</text>
                {r.rect.h > 30 && r.rect.w > 50 && (
                  <text x={r.rect.x + 4} y={r.rect.y + 26} className="fill-gray-600 dark:fill-gray-400" fontSize={9}>{r.rect.change_pct >= 0 ? '+' : ''}{r.rect.change_pct}%</text>
                )}
              </>
            )}
          </g>
        ))}
        {hovered && (
          <foreignObject x={Math.min(mousePos.x + 10, W - 200)} y={Math.max(mousePos.y - 80, 0)} width={190} height={75}>
            <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs p-2 rounded-lg shadow-lg">
              <div className="font-bold">{hovered.symbol}</div>
              <div className="opacity-70 text-[10px] truncate">{hovered.name}</div>
              <div>{hovered.change_pct >= 0 ? '+' : ''}{hovered.change_pct}% · {formatMcap(hovered.market_cap)}</div>
              <div className="opacity-70">{hovered.sector}</div>
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════
// 4. SECTOR ROTATION
// ═══════════════════════════════════════════
function SectorsViz({ data }: { data: any[] }) {
  const timeframes = ['1W', '1M', '3M', '6M', '1Y'];
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-4">Sector relative strength across timeframes — which sectors are leading/lagging</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 dark:text-gray-400">
              <th className="text-left px-3 py-2 font-medium">Sector</th>
              <th className="text-center px-3 py-2 font-medium">Tickers</th>
              {timeframes.map(tf => <th key={tf} className="text-center px-3 py-2 font-medium">{tf}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((s: any) => (
              <tr key={s.sector} className="border-t border-gray-50 dark:border-gray-700/50">
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{s.sector}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-400">{s.tickerCount}</td>
                {timeframes.map(tf => {
                  const val = s[tf] || 0;
                  return (
                    <td key={tf} className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${val >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                        style={{ backgroundColor: pctColor(val, 20) }}>
                        {val >= 0 ? '+' : ''}{val.toFixed(1)}%
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 5. SEASONALITY HEATMAP
// ═══════════════════════════════════════════
function SeasonalityViz({ data }: { data: any[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-4">Average monthly return across top stocks — reveals seasonal patterns like "Sell in May"</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Year</th>
              {MONTHS.map(m => <th key={m} className="text-center px-2 py-2 text-xs font-medium text-gray-500">{m}</th>)}
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">Avg</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: any) => {
              const avg = row.months.reduce((s: number, v: number) => s + v, 0) / 12;
              return (
                <tr key={row.year} className="border-t border-gray-50 dark:border-gray-700/50">
                  <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100">{row.year}</td>
                  {row.months.map((val: number, i: number) => (
                    <td key={i} className="text-center px-1 py-1.5">
                      <div className="rounded text-[10px] font-medium py-0.5 px-1"
                        style={{ backgroundColor: pctColor(val, 8), color: Math.abs(val) > 4 ? 'white' : undefined }}>
                        {val > 0 ? '+' : ''}{val.toFixed(1)}
                      </div>
                    </td>
                  ))}
                  <td className="text-center px-2 py-1.5">
                    <span className={`text-xs font-bold ${avg >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {avg >= 0 ? '+' : ''}{avg.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-gray-300 dark:border-gray-600">
              <td className="px-3 py-2 font-bold text-xs text-gray-500">AVG</td>
              {MONTHS.map((_, i) => {
                const avg = data.reduce((s, row) => s + row.months[i], 0) / data.length;
                return (
                  <td key={i} className="text-center px-1 py-2">
                    <span className={`text-[10px] font-bold ${avg >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {avg >= 0 ? '+' : ''}{avg.toFixed(1)}
                    </span>
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 6. CORRELATION MATRIX
// ═══════════════════════════════════════════
function CorrelationViz({ data }: { data: { correlation: number[][]; symbols: string[]; dates_used: number } }) {
  const { correlation, symbols, dates_used } = data;
  const size = symbols.length;
  const cellW = Math.min(70, 500 / size);
  const totalW = cellW * size + 80;
  const totalH = cellW * size + 40;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-2">Correlation matrix based on {dates_used} trading days. Blue = move together, orange = move inversely.</p>
      <div className="overflow-x-auto flex justify-center">
        <svg viewBox={`0 0 ${totalW} ${totalH}`} className="w-full h-auto" style={{ maxWidth: totalW }}>
          {symbols.map((s, i) => (
            <text key={`h${i}`} x={80 + i * cellW + cellW / 2} y={12} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" fontSize={Math.min(10, cellW / 5)} transform={`rotate(-45 ${80 + i * cellW + cellW / 2} 12)`}>{s}</text>
          ))}
          {correlation.map((row, i) => (
            <g key={i}>
              <text x={75} y={35 + i * cellW + cellW / 2 + 3} textAnchor="end" className="fill-gray-500 dark:fill-gray-400" fontSize={Math.min(10, cellW / 5)}>{symbols[i]}</text>
              {row.map((val, j) => (
                <g key={j}>
                  <rect x={80 + j * cellW} y={25 + i * cellW} width={cellW - 1} height={cellW - 1} fill={corrColor(val)} rx={2} />
                  {cellW > 25 && (
                    <text x={80 + j * cellW + cellW / 2} y={25 + i * cellW + cellW / 2 + 3} textAnchor="middle"
                      className="fill-gray-700 dark:fill-gray-300" fontSize={Math.min(9, cellW / 6)} fontWeight={i === j ? 700 : 400}>
                      {val.toFixed(2)}
                    </text>
                  )}
                </g>
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 7. RISK/REWARD SCATTER
// ═══════════════════════════════════════════
function RiskRewardViz({ data }: { data: any[] }) {
  const [hovered, setHovered] = useState<any>(null);
  const W = 800, H = 450;
  const pad = { top: 30, right: 30, bottom: 50, left: 60 };

  const vols = data.map(d => d.volatility);
  const rets = data.map(d => d.return_1y);
  const minV = Math.max(0, Math.min(...vols) - 5);
  const maxV = Math.max(...vols) + 5;
  const minR = Math.min(...rets) - 5;
  const maxR = Math.max(...rets) + 5;

  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const getX = (v: number) => pad.left + ((v - minV) / (maxV - minV)) * plotW;
  const getY = (r: number) => pad.top + plotH - ((r - minR) / (maxR - minR)) * plotH;

  const sectorColors: Record<string, string> = {};
  const sectors = [...new Set(data.map(d => d.sector))].sort();
  const palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#84cc16','#6366f1'];
  sectors.forEach((s, i) => { sectorColors[s] = palette[i % palette.length]; });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-3">Annualized volatility vs return — each dot is a stock, colored by sector</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, 1, 2, 3, 4, 5].map(i => {
          const v = minV + (maxV - minV) * i / 5;
          return <g key={i}><line x1={getX(v)} y1={pad.top} x2={getX(v)} y2={pad.top + plotH} stroke="#e5e7eb" className="dark:stroke-gray-700" /><text x={getX(v)} y={H - 8} textAnchor="middle" className="fill-gray-400" fontSize={9}>{v.toFixed(0)}%</text></g>;
        })}
        {[0, 1, 2, 3, 4].map(i => {
          const r = minR + (maxR - minR) * i / 4;
          return <g key={i}><line x1={pad.left} y1={getY(r)} x2={pad.left + plotW} y2={getY(r)} stroke="#e5e7eb" className="dark:stroke-gray-700" /><text x={pad.left - 5} y={getY(r) + 3} textAnchor="end" className="fill-gray-400" fontSize={9}>{r.toFixed(0)}%</text></g>;
        })}
        <line x1={pad.left} y1={getY(0)} x2={pad.left + plotW} y2={getY(0)} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4,4" />
        <text x={W / 2} y={H - 2} textAnchor="middle" className="fill-gray-400" fontSize={10}>Volatility →</text>
        <text x={12} y={H / 2} textAnchor="middle" className="fill-gray-400" fontSize={10} transform={`rotate(-90 12 ${H / 2})`}>Return →</text>
        {data.map((d: any) => (
          <circle key={d.symbol} cx={getX(d.volatility)} cy={getY(d.return_1y)} r={Math.max(3, Math.min(8, Math.sqrt(d.market_cap / 1e11)))}
            fill={sectorColors[d.sector] || '#9ca3af'} opacity={0.7} stroke="white" strokeWidth={0.5}
            onMouseEnter={() => setHovered(d)} onMouseLeave={() => setHovered(null)} className="cursor-pointer" />
        ))}
      </svg>
      {hovered && (
        <div className="mt-2 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-xs">
          <span className="font-bold text-gray-900 dark:text-gray-100">{hovered.symbol}</span>
          <span className="text-gray-400 mx-2">·</span>
          <span className="text-gray-500">{hovered.name}</span>
          <span className="mx-2">|</span>
          <span>Vol: <b>{hovered.volatility}%</b></span>
          <span className="mx-2">|</span>
          <span>Return: <b className={hovered.return_1y >= 0 ? 'text-green-600' : 'text-red-500'}>{hovered.return_1y}%</b></span>
          <span className="mx-2">|</span>
          <span>Sharpe: <b>{hovered.sharpe}</b></span>
          <span className="mx-2">|</span>
          <span style={{ color: sectorColors[hovered.sector] }}>{hovered.sector}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {sectors.slice(0, 10).map(s => (
          <div key={s} className="flex items-center gap-1 text-[10px] text-gray-500">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sectorColors[s] }} />{s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 8. MULTI-STOCK COMPARE
// ═══════════════════════════════════════════
function CompareViz() {
  const [input, setInput] = useState('AAPL,MSFT,GOOGL,AMZN,NVDA');
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<Record<string, { date: string; close: number }[]>>({});
  const [error, setError] = useState('');

  const load = async () => {
    const symbols = input.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length < 1) return;
    setLoading(true);
    setError('');
    const newSeries: Record<string, { date: string; close: number }[]> = {};
    try {
      for (const sym of symbols) {
        const res = await fetch(`/api/stocks/${sym}`);
        if (!res.ok) { setError(`${sym} not found`); continue; }
        const data = await res.json();
        newSeries[sym] = data.history || [];
      }
      setSeries(newSeries);
    } catch { setError('Failed to load'); }
    setLoading(false);
  };

  const W = 800, H = 400;
  const pad = { top: 20, right: 80, bottom: 40, left: 10 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const colors = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316'];

  const allDates = new Set<string>();
  Object.values(series).forEach(s => s.forEach(p => allDates.add(p.date)));
  const dates = [...allDates].sort();
  if (dates.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
        <div className="flex gap-3 mb-4">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="AAPL,MSFT,GOOGL (comma separated)"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Loading...' : 'Compare'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <p className="text-gray-400 text-sm">Enter comma-separated tickers to compare their normalized performance over 10 years.</p>
      </div>
    );
  }

  const normalized: Record<string, number[]> = {};
  const symbols = Object.keys(series);
  for (const sym of symbols) {
    const base = series[sym][0]?.close || 1;
    normalized[sym] = dates.map(d => {
      const p = series[sym].find(pp => pp.date === d);
      return p ? (p.close / base) * 100 : NaN;
    });
  }

  let minN = 100, maxN = 100;
  for (const sym of symbols) {
    for (const v of normalized[sym]) {
      if (!isNaN(v)) { minN = Math.min(minN, v); maxN = Math.max(maxN, v); }
    }
  }
  minN -= 5; maxN += 5;
  const getX = (i: number) => pad.left + (i / Math.max(dates.length - 1, 1)) * plotW;
  const getY = (v: number) => pad.top + plotH - ((v - minN) / (maxN - minN)) * plotH;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <div className="flex gap-3 mb-4">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="AAPL,MSFT,GOOGL"
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Loading...' : 'Compare'}
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, 1, 2, 3, 4].map(i => {
          const idx = Math.floor(i * (dates.length - 1) / 4);
          return <text key={i} x={getX(idx)} y={H - 8} textAnchor="middle" className="fill-gray-400" fontSize={9}>{dates[idx]?.slice(0, 7)}</text>;
        })}
        <line x1={pad.left} y1={getY(100)} x2={pad.left + plotW} y2={getY(100)} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4,4" />
        <text x={pad.left + plotW + 4} y={getY(100) + 3} className="fill-gray-400" fontSize={8}>100</text>
        {symbols.map((sym, si) => {
          const pts = normalized[sym].map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${isNaN(v) ? getY(100).toFixed(1) : getY(v).toFixed(1)}`).join(' ');
          const lastVal = normalized[sym].filter(v => !isNaN(v)).slice(-1)[0] || 100;
          return (
            <g key={sym}>
              <path d={pts} fill="none" stroke={colors[si % colors.length]} strokeWidth={2} strokeLinejoin="round" />
              <text x={pad.left + plotW + 4} y={getY(lastVal) + 3} fill={colors[si % colors.length]} fontSize={9} fontWeight={600}>{sym}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════
// 9. EVENT TIMELINE
// ═══════════════════════════════════════════
function EventTimelineViz() {
  const [ticker, setTicker] = useState('XLE');
  const [loading, setLoading] = useState(false);
  const [priceData, setPriceData] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [stockRes, eventsRes] = await Promise.all([
        fetch(`/api/stocks/${ticker.toUpperCase()}`),
        fetch(`/api/events?hours=168`),
      ]);
      if (!stockRes.ok) { setError(`${ticker} not found`); setLoading(false); return; }
      const stock = await stockRes.json();
      setPriceData(stock.history || []);
      if (eventsRes.ok) {
        const ev = await eventsRes.json();
        setEvents(ev.events || []);
      }
    } catch { setError('Failed to load'); }
    setLoading(false);
  };

  const W = 800, H = 350;
  const pad = { top: 20, right: 60, bottom: 40, left: 10 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const displayData = priceData.slice(-120);
  if (displayData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
        <div className="flex gap-3 mb-4">
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="Ticker (e.g. XLE, GLD, LMT)"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <p className="text-gray-400 text-sm">Overlay political events from Event Radar onto a stock price chart to see market impact.</p>
      </div>
    );
  }

  const closes = displayData.map(d => d.close);
  const minP = Math.min(...closes) * 0.98;
  const maxP = Math.max(...closes) * 1.02;
  const getX = (i: number) => pad.left + (i / Math.max(displayData.length - 1, 1)) * plotW;
  const getY = (p: number) => pad.top + plotH - ((p - minP) / (maxP - minP)) * plotH;

  const pathD = displayData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(d.close).toFixed(1)}`).join(' ');
  const isUp = closes[closes.length - 1] >= closes[0];
  const lineColor = isUp ? '#22c55e' : '#ef4444';

  const eventCategoryColors: Record<string, string> = {
    CONFLICT: '#ef4444', TARIFF: '#f59e0b', SANCTIONS: '#8b5cf6',
    RATE_CUT: '#22c55e', RATE_HIKE: '#ef4444', ELECTION: '#3b82f6',
    SUPPLY_CHAIN: '#f97316', POLITICAL_CRISIS: '#dc2626', REGULATION: '#6366f1',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <div className="flex gap-3 mb-4">
        <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="Ticker"
          className="w-32 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          Load
        </button>
        <div className="flex-1" />
        {Object.entries(eventCategoryColors).slice(0, 5).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1 text-[10px] text-gray-500">
            <div className="w-2 h-4 rounded-sm" style={{ backgroundColor: color }} />{cat}
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, 1, 2, 3, 4].map(i => {
          const idx = Math.floor(i * (displayData.length - 1) / 4);
          return <text key={i} x={getX(idx)} y={H - 8} textAnchor="middle" className="fill-gray-400" fontSize={9}>{displayData[idx]?.date?.slice(5)}</text>;
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const p = minP + (maxP - minP) * f;
          return <g key={i}><line x1={pad.left} y1={getY(p)} x2={pad.left + plotW} y2={getY(p)} stroke="#e5e7eb" className="dark:stroke-gray-700" /><text x={pad.left + plotW + 4} y={getY(p) + 3} className="fill-gray-400" fontSize={9}>{p.toFixed(0)}</text></g>;
        })}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
        {events.slice(0, 5).map((ev: any, i: number) => {
          const color = eventCategoryColors[ev.category] || '#9ca3af';
          const xPos = pad.left + plotW * (0.15 + (i * 0.15));
          return (
            <g key={i}>
              <line x1={xPos} y1={pad.top} x2={xPos} y2={pad.top + plotH} stroke={color} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7} />
              <rect x={xPos - 60} y={pad.top + 5 + i * 18} width={120} height={16} rx={4} fill={color} opacity={0.9} />
              <text x={xPos} y={pad.top + 16 + i * 18} textAnchor="middle" fill="white" fontSize={8} fontWeight={600}>{ev.category}</text>
            </g>
          );
        })}
      </svg>
      {events.length > 0 && (
        <div className="mt-3 space-y-1">
          {events.slice(0, 5).map((ev: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: eventCategoryColors[ev.category] || '#9ca3af' }} />
              <span className="text-gray-400">{ev.publishedAt?.slice(0, 10)}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{ev.title}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ev.signal === 'BUY' ? 'bg-green-100 text-green-700' : ev.signal === 'SELL' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                {ev.signal}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 10. COUNTRY PERFORMANCE
// ═══════════════════════════════════════════
function CountriesViz({ data }: { data: any[] }) {
  const maxCap = Math.max(...data.map((d: any) => d.total_market_cap), 1);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-4">Average stock performance by country — shows which global markets are leading</p>
      <div className="space-y-3">
        {data.map((c: any) => (
          <div key={c.country} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-medium text-gray-900 dark:text-gray-100">{c.country}</span>
                <span className="text-xs text-gray-400 ml-2">{c.tickerCount} stocks</span>
              </div>
              <span className="text-xs text-gray-500">{formatMcap(c.total_market_cap)}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 mb-2">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(c.total_market_cap / maxCap) * 100}%` }} />
            </div>
            <div className="flex gap-4 text-xs">
              {[
                { label: '1D', val: c.avg_change_1d },
                { label: '1M', val: c.avg_change_1m },
                { label: '1Y', val: c.avg_change_1y },
              ].map(t => (
                <div key={t.label} className="flex items-center gap-1">
                  <span className="text-gray-400">{t.label}:</span>
                  <span className={`font-medium ${t.val >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {t.val >= 0 ? '+' : ''}{t.val}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
