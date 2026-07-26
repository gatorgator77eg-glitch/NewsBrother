import { useState, useEffect, useRef } from 'react';
import {
  getCorrelationTicker, getCorrelationHeatmap, getNarrativeStrength,
  getExportCorrelationUrl, getExportDashboardSummaryUrl,
  type CorrelationResult, type CorrelationHeatmapEntry, type NarrativeStrengthResult,
} from '../api';

type Tab = 'ticker' | 'heatmap' | 'narrative';

interface Props { onBack: () => void; }

export default function CorrelationEngine({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('ticker');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Back</button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">📈 Narrative-to-Price Correlation</h2>
        <div />
      </div>

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {(['ticker', 'heatmap', 'narrative'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
            {t === 'ticker' ? '🎯 Ticker Analysis' : t === 'heatmap' ? '🗺️ Sector Heatmap' : '📊 Narrative Strength'}
          </button>
        ))}
      </div>

      {tab === 'ticker' && <TickerAnalysis />}
      {tab === 'heatmap' && <SectorHeatmap />}
      {tab === 'narrative' && <NarrativeStrength />}
    </div>
  );
}

function TickerAnalysis() {
  const [symbol, setSymbol] = useState('AAPL');
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lagCanvasRef = useRef<HTMLCanvasElement>(null);

  const load = async () => {
    if (!symbol.trim()) return;
    setLoading(true);
    try {
      const r = await getCorrelationTicker(symbol, days);
      setResult(r);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!result || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.parentElement?.clientWidth || 700;
    const H = canvas.height = 280;
    ctx.clearRect(0, 0, W, H);

    const data = result.aligned.filter(d => d.tone !== 0 || d.close !== 0);
    if (data.length < 2) return;

    const padL = 60, padR = 60, padT = 20, padB = 30;
    const cW = W - padL - padR, cH = H - padT - padB;

    const closes = data.map(d => d.close);
    const minC = Math.min(...closes), maxC = Math.max(...closes);
    const rangeC = maxC - minC || 1;

    const tones = data.map(d => d.tone).filter(t => t !== 0);
    const maxT = Math.max(Math.abs(Math.min(...tones, 0)), Math.abs(Math.max(...tones, 0)), 1);

    // Grid
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    // Price line (left axis)
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = padL + (i / (data.length - 1)) * cW;
      const y = padT + cH - ((closes[i] - minC) / rangeC) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Tone dots (right axis)
    const zeroY = padT + cH / 2;
    for (let i = 0; i < data.length; i++) {
      if (data[i].tone === 0) continue;
      const x = padL + (i / (data.length - 1)) * cW;
      const y = zeroY - (data[i].tone / maxT) * (cH / 2);
      ctx.fillStyle = data[i].tone > 0 ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Zero line
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(W - padR, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#3b82f6';
    ctx.fillText(`$${minC.toFixed(0)}`, 4, padT + cH + 4);
    ctx.fillText(`$${maxC.toFixed(0)}`, 4, padT + 10);

    // Legend
    ctx.fillStyle = '#3b82f6'; ctx.fillRect(padL, H - 14, 10, 10);
    ctx.fillStyle = '#6b7280'; ctx.fillText('Price', padL + 14, H - 5);
    ctx.fillStyle = 'rgba(34,197,94,0.6)'; ctx.beginPath(); ctx.arc(padL + 80, H - 9, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b7280'; ctx.fillText('Tone', padL + 88, H - 5);
  }, [result]);

  useEffect(() => {
    if (!result || !lagCanvasRef.current) return;
    const canvas = lagCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.parentElement?.clientWidth || 700;
    const H = canvas.height = 180;
    ctx.clearRect(0, 0, W, H);

    const lagged = result.lagged;
    const padL = 40, padR = 20, padT = 20, padB = 30;
    const cW = W - padL - padR, cH = H - padT - padB;

    const maxCorr = Math.max(...lagged.map(l => Math.abs(l.correlation)), 0.1);
    const barW = cW / lagged.length;

    // Zero line
    const zeroY = padT + cH / 2;
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(W - padR, zeroY); ctx.stroke();

    // Bars
    for (let i = 0; i < lagged.length; i++) {
      const x = padL + i * barW + barW * 0.15;
      const h = (Math.abs(lagged[i].correlation) / maxCorr) * (cH / 2);
      const y = lagged[i].correlation >= 0 ? zeroY - h : zeroY;
      ctx.fillStyle = lagged[i].lag === 0 ? '#8b5cf6' : lagged[i].correlation >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
      ctx.fillRect(x, y, barW * 0.7, h);
    }

    // Labels
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center';
    for (let i = 0; i < lagged.length; i++) {
      ctx.fillText(`${lagged[i].lag}d`, padL + i * barW + barW / 2, H - 8);
    }
    ctx.textAlign = 'left';
  }, [result]);

  const corrLabel = (c: number) => {
    const abs = Math.abs(c);
    if (abs > 0.7) return { text: 'Strong', color: 'text-green-600 dark:text-green-400' };
    if (abs > 0.3) return { text: 'Moderate', color: 'text-yellow-600 dark:text-yellow-400' };
    return { text: 'Weak', color: 'text-gray-500 dark:text-gray-400' };
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="flex gap-3 items-end mb-4">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Ticker Symbol</label>
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && load()}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Window</label>
            <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
            </select>
          </div>
          <button onClick={load} disabled={loading} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? '...' : 'Analyze'}
          </button>
          {result && (
            <a href={getExportCorrelationUrl(symbol, days)} target="_blank" rel="noopener"
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
              📥 CSV
            </a>
          )}
        </div>
      </div>

      {result && (
        <>
          {/* Correlation summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className={`text-2xl font-bold ${corrLabel(result.correlation).color}`}>{result.correlation.toFixed(3)}</div>
              <div className="text-[10px] text-gray-400 mt-1">Pearson r</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{result.sampleSize}</div>
              <div className="text-[10px] text-gray-400 mt-1">Data points</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{result.ticker.sector || 'N/A'}</div>
              <div className="text-[10px] text-gray-400 mt-1">Sector</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className="flex gap-2 justify-center">
                <span className="text-green-600 text-sm">+{result.toneBreakdown.positive}</span>
                <span className="text-red-500 text-sm">-{result.toneBreakdown.negative}</span>
                <span className="text-gray-400 text-sm">={result.toneBreakdown.neutral}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Tone breakdown</div>
            </div>
          </div>

          {/* Price + Tone chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Price vs Narrative Tone — {result.ticker.symbol}</h3>
            <canvas ref={canvasRef} className="w-full" />
          </div>

          {/* Lagged correlation */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Lag Analysis — Does tone lead price?</h3>
            <p className="text-xs text-gray-400 mb-3">Negative lag = tone leads price. Positive lag = price leads tone.</p>
            <canvas ref={lagCanvasRef} className="w-full" />
          </div>
        </>
      )}
    </div>
  );
}

function SectorHeatmap() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [heatmap, setHeatmap] = useState<CorrelationHeatmapEntry[]>([]);

  useEffect(() => {
    setLoading(true);
    getCorrelationHeatmap(days).then(r => { setHeatmap(r.heatmap); setLoading(false); }).catch(() => setLoading(false));
  }, [days]);

  const maxTone = Math.max(...heatmap.map(h => Math.abs(h.avgTone)), 1);
  const maxChange = Math.max(...heatmap.map(h => Math.abs(h.avgPriceChange)), 1);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-4">
        <label className="text-xs text-gray-500">Window:</label>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
        <a href={getExportDashboardSummaryUrl()} target="_blank" rel="noopener"
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200">
          📥 Export Summary
        </a>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="pb-3 pr-4">Sector</th>
                  <th className="pb-3 pr-4 text-center">Tone</th>
                  <th className="pb-3 pr-4 text-center">Price Δ</th>
                  <th className="pb-3 pr-4 text-center">Articles</th>
                  <th className="pb-3">Visual</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.map(h => {
                  const toneWidth = Math.abs(h.avgTone) / maxTone * 100;
                  const changeWidth = Math.abs(h.avgPriceChange) / maxChange * 100;
                  return (
                    <tr key={h.sector} className="border-t border-gray-50 dark:border-gray-700/50">
                      <td className="py-3 pr-4 font-medium text-gray-900 dark:text-gray-100">{h.sector}</td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`text-xs font-mono ${h.avgTone > 0 ? 'text-green-600' : h.avgTone < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {h.avgTone.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`text-xs font-mono ${h.avgPriceChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {h.avgPriceChange >= 0 ? '+' : ''}{h.avgPriceChange.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center text-xs text-gray-500">{h.articleCount}</td>
                      <td className="py-3">
                        <div className="flex gap-1 items-center">
                          <div className="w-16 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${h.avgTone >= 0 ? 'bg-green-400' : 'bg-red-400'}`} style={{ width: `${toneWidth}%` }} />
                          </div>
                          <div className="w-16 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${h.avgPriceChange >= 0 ? 'bg-blue-400' : 'bg-orange-400'}`} style={{ width: `${changeWidth}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-4 text-[10px] text-gray-400">
            <span>🟢 Green bar = Tone</span>
            <span>🔵 Blue/Orange bar = Price change</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NarrativeStrength() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NarrativeStrengthResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setLoading(true);
    getNarrativeStrength(days).then(r => { setData(r); setLoading(false); }).catch(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.parentElement?.clientWidth || 700;
    const H = canvas.height = 260;
    ctx.clearRect(0, 0, W, H);

    const daily = data.daily;
    if (daily.length === 0) return;

    const padL = 50, padR = 20, padT = 20, padB = 30;
    const cW = W - padL - padR, cH = H - padT - padB;
    const maxCount = Math.max(...daily.map(d => d.smoothedCount), 1);
    const tones = daily.map(d => d.smoothedTone);
    const maxTone = Math.max(Math.abs(Math.min(...tones, 0)), Math.abs(Math.max(...tones, 0)), 1);
    const zeroY = padT + cH / 2;

    // Grid
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    // Zero line
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(W - padR, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Volume bars
    const barW = Math.max(2, (cW / daily.length) - 1);
    for (let i = 0; i < daily.length; i++) {
      const x = padL + (i / daily.length) * cW;
      const h = (daily[i].smoothedCount / maxCount) * cH * 0.7;
      ctx.fillStyle = 'rgba(99,102,241,0.3)';
      ctx.fillRect(x, padT + cH - h, barW, h);
    }

    // Tone line
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < daily.length; i++) {
      const x = padL + (i / daily.length) * cW + barW / 2;
      const y = zeroY - (daily[i].smoothedTone / maxTone) * (cH / 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legend
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(99,102,241,0.5)'; ctx.fillRect(padL, H - 14, 10, 10);
    ctx.fillStyle = '#6b7280'; ctx.fillText('Volume (7d avg)', padL + 14, H - 5);
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(padL + 120, H - 9); ctx.lineTo(padL + 135, H - 9); ctx.stroke();
    ctx.fillStyle = '#6b7280'; ctx.fillText('Sentiment (7d avg)', padL + 140, H - 5);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-4">
        <label className="text-xs text-gray-500">Window:</label>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{data.summary.totalArticles}</div>
              <div className="text-[10px] text-gray-400 mt-1">Total articles</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className={`text-2xl font-bold ${data.summary.avgTone > 0 ? 'text-green-600' : data.summary.avgTone < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                {data.summary.avgTone.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Avg tone</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.summary.narrativeVolatility.toFixed(2)}</div>
              <div className="text-[10px] text-gray-400 mt-1">Volatility (σ)</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <div className={`text-2xl font-bold ${data.summary.volumeTrendPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {data.summary.volumeTrendPct >= 0 ? '+' : ''}{data.summary.volumeTrendPct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Volume trend</div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Narrative Volume & Sentiment</h3>
            <canvas ref={canvasRef} className="w-full" />
          </div>

          {data.extremes.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Extreme Sentiment Days</h3>
              <div className="space-y-2">
                {data.extremes.map(d => (
                  <div key={d.date} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-xs text-gray-500 font-mono w-24">{d.date}</span>
                    <span className={`text-sm font-bold ${d.avgTone > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {d.avgTone > 0 ? '+' : ''}{d.avgTone.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-400">{d.count} articles</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
