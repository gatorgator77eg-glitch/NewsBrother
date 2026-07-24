import { useState, useEffect, useCallback } from 'react';
import {
  getJanusHeatmap, getJanusDivergence, getJanusEchoChamber,
  getJanusVolatilityRadar, getJanusShockwave, getJanusCredibility,
  type HeatmapEntry, type DivergenceEntry, type EchoLeader, type EchoDomain,
  type RadarTicker, type PolarizedDomain, type ShockwaveMover, type CredibilityEntry,
} from '../api';
import DeepResearch from './DeepResearch';

type Tab = 'command-center' | 'echo-chamber' | 'volatility-radar' | 'shockwave' | 'credibility' | 'deep-research';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'command-center', label: 'Command Center', icon: '🎯' },
  { id: 'echo-chamber', label: 'Echo Chamber', icon: '🔊' },
  { id: 'volatility-radar', label: 'Volatility Radar', icon: '⚡' },
  { id: 'shockwave', label: 'Shockwave Backtest', icon: '💥' },
  { id: 'credibility', label: 'Corporate Credibility', icon: '🏅' },
  { id: 'deep-research', label: 'Deep Research', icon: '🔬' },
];

function formatMcap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function toneLabel(t: number): string {
  if (t > 1) return 'positive';
  if (t < -1) return 'negative';
  return 'neutral';
}

function toneColor(t: number): string {
  if (t > 1) return 'text-green-600 dark:text-green-400';
  if (t < -1) return 'text-red-500 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

function riskBadge(level: string): { color: string; bg: string } {
  switch (level) {
    case 'extreme': return { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/40' };
    case 'high':     return { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' };
    default:         return { color: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-100 dark:bg-yellow-900/40' };
  }
}

function ratingBadge(r: string): { color: string; bg: string } {
  switch (r) {
    case 'A': return { color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' };
    case 'B': return { color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' };
    case 'C': return { color: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-100 dark:bg-yellow-900/40' };
    case 'D': return { color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' };
    default:  return { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/40' };
  }
}

interface Props { onBack: () => void; }

export default function Janus({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('command-center');
  const [loading, setLoading] = useState(false);

  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [divergence, setDivergence] = useState<DivergenceEntry[]>([]);
  const [echoLeaders, setEchoLeaders] = useState<EchoLeader[]>([]);
  const [echoDomains, setEchoDomains] = useState<EchoDomain[]>([]);
  const [radarTickers, setRadarTickers] = useState<RadarTicker[]>([]);
  const [polarizedDomains, setPolarizedDomains] = useState<PolarizedDomain[]>([]);
  const [shockwaveTopic, setShockwaveTopic] = useState('tariff OR sanctions OR war');
  const [shockwaveData, setShockwaveData] = useState<any>(null);
  const [credibility, setCredibility] = useState<CredibilityEntry[]>([]);
  const [credSectors, setCredSectors] = useState<string[]>([]);
  const [credSector, setCredSector] = useState<string>('');

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      switch (t) {
        case 'command-center': {
          const [h, d] = await Promise.all([getJanusHeatmap(), getJanusDivergence(25)]);
          setHeatmap(h.heatmap);
          setDivergence(d.divergence);
          break;
        }
        case 'echo-chamber': {
          const e = await getJanusEchoChamber();
          setEchoLeaders(e.leaders);
          setEchoDomains(e.domains);
          break;
        }
        case 'volatility-radar': {
          const v = await getJanusVolatilityRadar(25);
          setRadarTickers(v.radar);
          setPolarizedDomains(v.polarizedDomains);
          break;
        }
        case 'shockwave': {
          const s = await getJanusShockwave(shockwaveTopic, 15);
          setShockwaveData(s);
          break;
        }
        case 'credibility': {
          const c = await getJanusCredibility(credSector || undefined, 30);
          setCredibility(c.credibility);
          setCredSectors(c.sectors);
          break;
        }
        case 'deep-research': break;
      }
    } catch (err) { console.error('Janus load error:', err); }
    setLoading(false);
  }, [shockwaveTopic, credSector]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const handleShockwaveSearch = async () => {
    setLoading(true);
    try {
      const s = await getJanusShockwave(shockwaveTopic, 15);
      setShockwaveData(s);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Project Janus</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Predictive Global Intelligence Engine</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-thin">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      )}

      {!loading && tab === 'command-center' && <CommandCenterViz heatmap={heatmap} divergence={divergence} />}
      {!loading && tab === 'echo-chamber' && <EchoChamberViz leaders={echoLeaders} domains={echoDomains} />}
      {!loading && tab === 'volatility-radar' && <VolatilityRadarViz radar={radarTickers} domains={polarizedDomains} />}
      {!loading && tab === 'shockwave' && (
        <ShockwaveViz
          data={shockwaveData}
          topic={shockwaveTopic}
          onTopicChange={setShockwaveTopic}
          onSearch={handleShockwaveSearch}
        />
      )}
      {!loading && tab === 'credibility' && (
        <CredibilityViz
          data={credibility}
          sectors={credSectors}
          sector={credSector}
          onSectorChange={setCredSector}
        />
      )}
      {!loading && tab === 'deep-research' && <DeepResearch onBack={() => setTab('command-center')} />}
    </div>
  );
}

// ═══════════════════════════════════════════
// 1. COMMAND CENTER
// ═══════════════════════════════════════════
function CommandCenterViz({ heatmap, divergence }: { heatmap: HeatmapEntry[]; divergence: DivergenceEntry[] }) {
  const maxArticles = Math.max(...heatmap.map(h => h.articleCount), 1);
  const maxMcap = Math.max(...heatmap.map(h => h.totalMcap), 1);

  return (
    <div className="space-y-6">
      {/* Narrative Heatmap */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Narrative Heatmap — News Volume × Stock Presence</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {heatmap.slice(0, 20).map(h => {
            const intensity = Math.round((h.articleCount / maxArticles) * 100);
            const mcapRatio = h.totalMcap / maxMcap;
            return (
              <div key={h.country}
                className="rounded-xl p-3 border transition-all hover:scale-[1.02]"
                style={{
                  borderColor: `rgba(147,51,234,${0.15 + mcapRatio * 0.6})`,
                  background: `linear-gradient(135deg, rgba(147,51,234,${0.05 + intensity * 0.004}), rgba(59,130,246,${0.05 + mcapRatio * 0.15}))`,
                }}>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-1">{h.country}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{h.articleCount} articles</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{h.tickerCount} tickers</div>
                <div className={`text-[10px] font-medium ${toneColor(h.avgTone)}`}>
                  tone: {h.avgTone > 0 ? '+' : ''}{h.avgTone}
                </div>
              </div>
            );
          })}
        </div>
        {heatmap.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Download news archive data to see narrative heatmap</p>
        )}
      </div>

      {/* Ticker Divergence */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ticker Divergence — Volatility vs News Heat</h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Tickers with high volatility but low news coverage may be mispriced</p>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Ticker</th>
                <th className="px-4 py-2 text-left font-medium">Sector</th>
                <th className="px-4 py-2 text-right font-medium">Volatility</th>
                <th className="px-4 py-2 text-right font-medium">Price Range</th>
                <th className="px-4 py-2 text-right font-medium">News Heat</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {divergence.map((d, i) => (
                <tr key={d.symbol} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{d.symbol}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[120px]">{d.name}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{d.sector || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-medium ${d.volatilityPct > 8 ? 'text-red-500' : d.volatilityPct > 4 ? 'text-orange-500' : 'text-gray-600 dark:text-gray-300'}`}>
                      {d.volatilityPct}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{d.priceRangePct}%</td>
                  <td className="px-4 py-2 text-right">
                    <span className={d.sectorNewsHeat === 0 ? 'text-gray-300' : 'text-purple-600 dark:text-purple-400'}>
                      {d.sectorNewsHeat}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-bold ${d.divergenceScore > 0 ? 'text-green-600' : d.divergenceScore < -10 ? 'text-red-500' : 'text-gray-500'}`}>
                      {d.divergenceScore > 0 ? '+' : ''}{d.divergenceScore}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {divergence.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">Download stock data to see divergence analysis</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 2. ECHO CHAMBER
// ═══════════════════════════════════════════
function EchoChamberViz({ leaders, domains }: { leaders: EchoLeader[]; domains: EchoDomain[] }) {
  return (
    <div className="space-y-6">
      {/* Country leaders */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Cross-Border Propagation Leaders</h3>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">Countries that first break stories (earliest first-seen dates)</p>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {leaders.slice(0, 15).map((l, i) => (
            <div key={l.country} className="flex-shrink-0 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/40 p-3 min-w-[130px]">
              <div className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-0.5">#{i + 1} {l.country}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{l.articleCount} articles</div>
              <div className="text-[10px] text-gray-400">first: {l.firstSeen}</div>
              <div className={`text-[10px] font-medium ${toneColor(l.avgTone)}`}>
                tone: {l.avgTone > 0 ? '+' : ''}{(l.avgTone || 0).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        {leaders.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No data available — download news archive first</p>}
      </div>

      {/* Domain coverage */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Domain Coverage Map</h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Domains by article volume and tone distribution</p>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2 text-left font-medium">Domain</th>
                <th className="px-4 py-2 text-left font-medium">Country</th>
                <th className="px-4 py-2 text-right font-medium">Articles</th>
                <th className="px-4 py-2 text-right font-medium">Tone</th>
                <th className="px-4 py-2 text-right font-medium">Tone Bar</th>
              </tr>
            </thead>
            <tbody>
              {domains.map(d => {
                const toneWidth = Math.min(100, Math.abs(d.tone) * 20);
                return (
                  <tr key={d.domain} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100 text-xs">{d.domain}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{d.country}</td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{d.articles}</td>
                    <td className={`px-4 py-2 text-right text-xs font-medium ${toneColor(d.tone)}`}>
                      {d.tone > 0 ? '+' : ''}{d.tone}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${d.tone >= 0 ? 'bg-green-500' : 'bg-red-400'}`}
                            style={{ width: `${toneWidth}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {domains.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No domain data available</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 3. VOLATILITY RADAR
// ═══════════════════════════════════════════
function VolatilityRadarViz({ radar, domains }: { radar: RadarTicker[]; domains: PolarizedDomain[] }) {
  return (
    <div className="space-y-6">
      {/* Radar tickers */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">7-Day Volatility Radar</h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Tickers with highest recent price swings</p>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Ticker</th>
                <th className="px-4 py-2 text-left font-medium">Sector</th>
                <th className="px-4 py-2 text-right font-medium">7D Range</th>
                <th className="px-4 py-2 text-right font-medium">7D Change</th>
                <th className="px-4 py-2 text-right font-medium">Avg Vol</th>
                <th className="px-4 py-2 text-center font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {radar.map((r, i) => {
                const badge = riskBadge(r.riskLevel);
                return (
                  <tr key={r.symbol} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{r.symbol}</div>
                      <div className="text-xs text-gray-400 truncate max-w-[100px]">{r.name}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.sector || '—'}</td>
                    <td className="px-4 py-2 text-right font-medium text-red-500">{r.range7d}%</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${r.change7d >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {r.change7d >= 0 ? '+' : ''}{r.change7d}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500 text-xs">{r.avgVolume.toLocaleString()}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badge.color} ${badge.bg}`}>
                        {r.riskLevel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {radar.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No volatile tickers found in the last 7 days</p>}
      </div>

      {/* Polarized domains */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tone-Polarized Domains</h3>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">Sources with widest tone spread — likely driving narrative polarization</p>
        <div className="space-y-2">
          {domains.slice(0, 10).map(d => {
            const barWidth = Math.min(100, d.toneSpread * 5);
            return (
              <div key={d.domain} className="flex items-center gap-3">
                <div className="w-32 text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-shrink-0">{d.domain}</div>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-400 via-yellow-300 to-green-400 rounded-full" style={{ width: `${barWidth}%` }} />
                </div>
                <div className="w-16 text-right text-[10px] text-gray-500">{d.toneSpread.toFixed(1)} spread</div>
                <div className="w-10 text-right text-[10px] text-gray-400">{d.articles} art.</div>
              </div>
            );
          })}
        </div>
        {domains.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No polarization data available</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 4. SHOCKWAVE BACKTESTER
// ═══════════════════════════════════════════
function ShockwaveViz({ data, topic, onTopicChange, onSearch }: {
  data: any; topic: string; onTopicChange: (v: string) => void; onSearch: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Shockwave Pattern Search</h3>
        <div className="flex gap-2">
          <input
            value={topic}
            onChange={e => onTopicChange(e.target.value)}
            placeholder="e.g. tariff OR sanctions OR war OR rate cut"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            onClick={onSearch}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Backtest
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Use OR to separate keywords. Results show historical market reaction patterns.</p>
      </div>

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.articleCount}</div>
              <div className="text-xs text-gray-500 mt-1">Matching Articles</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-orange-500 dark:text-orange-400">{data.volatilePeriods?.length || 0}</div>
              <div className="text-xs text-gray-500 mt-1">Volatile Periods</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-red-500 dark:text-red-400">{data.topMovers?.length || 0}</div>
              <div className="text-xs text-gray-500 mt-1">Top Movers</div>
            </div>
          </div>

          {/* Recent matching articles */}
          {data.recentArticles?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Matching Articles</h3>
              <div className="space-y-2">
                {data.recentArticles.map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.tone > 0 ? 'bg-green-500' : a.tone < 0 ? 'bg-red-400' : 'bg-gray-300'}`} />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{a.title}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{a.date} · {a.country}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Volatile periods */}
          {data.volatilePeriods?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Volatile Market Periods (90-day lookback)</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr className="text-xs text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Avg Close</th>
                    <th className="px-4 py-2 text-right font-medium">Daily Range</th>
                    <th className="px-4 py-2 text-right font-medium">Avg Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {data.volatilePeriods.map((p: any, i: number) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-gray-700/50">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100 text-xs font-medium">{p.date}</td>
                      <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">${p.avgClose}</td>
                      <td className="px-4 py-2 text-right font-medium text-orange-500">{p.dailyRange}%</td>
                      <td className="px-4 py-2 text-right text-gray-500 text-xs">{p.avgVolume.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top movers */}
          {data.topMovers?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Movers (90-day lookback)</h3>
              </div>
              <div className="max-h-[350px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                    <tr className="text-xs text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-2 text-left font-medium">Ticker</th>
                      <th className="px-4 py-2 text-left font-medium">Name</th>
                      <th className="px-4 py-2 text-left font-medium">Sector</th>
                      <th className="px-4 py-2 text-right font-medium">Move %</th>
                      <th className="px-4 py-2 text-right font-medium">Avg Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topMovers.map((m: ShockwaveMover) => (
                      <tr key={m.symbol} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{m.symbol}</td>
                        <td className="px-4 py-2 text-xs text-gray-400 truncate max-w-[120px]">{m.name}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{m.sector || '—'}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-medium ${m.movePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {m.movePct >= 0 ? '+' : ''}{m.movePct}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500 text-xs">{m.avgVolume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 5. CORPORATE CREDIBILITY
// ═══════════════════════════════════════════
function CredibilityViz({ data, sectors, sector, onSectorChange }: {
  data: CredibilityEntry[]; sectors: string[]; sector: string; onSectorChange: (s: string) => void;
}) {
  const [sortField, setSortField] = useState<'ccr' | 'totalReturn' | 'maxDrawdown' | 'marketCap'>('ccr');

  const sorted = [...data].sort((a, b) => {
    if (sortField === 'marketCap') return b.marketCap - a.marketCap;
    if (sortField === 'maxDrawdown') return Math.abs(a.maxDrawdown) - Math.abs(b.maxDrawdown);
    return b[sortField] - a[sortField];
  });

  const avgCcr = data.length ? Math.round(data.reduce((s, d) => s + d.ccr, 0) / data.length) : 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Corporate Credibility Rating</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Avg CCR:</span>
            <span className={`text-sm font-bold ${avgCcr >= 60 ? 'text-green-600' : avgCcr >= 40 ? 'text-yellow-500' : 'text-red-500'}`}>
              {avgCcr}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onSectorChange('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!sector ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
          >
            All Sectors
          </button>
          {sectors.slice(0, 10).map(s => (
            <button
              key={s}
              onClick={() => onSectorChange(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sector === s ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* CCR Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Ticker</th>
                <th className="px-4 py-2 text-center font-medium">
                  <button onClick={() => setSortField('ccr')} className={sortField === 'ccr' ? 'text-purple-600' : ''}>CCR</button>
                </th>
                <th className="px-4 py-2 text-left font-medium">Sector</th>
                <th className="px-4 py-2 text-right font-medium">
                  <button onClick={() => setSortField('totalReturn')} className={sortField === 'totalReturn' ? 'text-purple-600' : ''}>Return</button>
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  <button onClick={() => setSortField('maxDrawdown')} className={sortField === 'maxDrawdown' ? 'text-purple-600' : ''}>Drawdown</button>
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  <button onClick={() => setSortField('marketCap')} className={sortField === 'marketCap' ? 'text-purple-600' : ''}>MCap</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const badge = ratingBadge(c.rating);
                return (
                  <tr key={c.symbol} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{c.symbol}</div>
                      <div className="text-xs text-gray-400 truncate max-w-[100px]">{c.name}</div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-500"
                            style={{ width: `${c.ccr}%` }}
                          />
                        </div>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badge.color} ${badge.bg}`}>
                          {c.rating} {c.ccr}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{c.sector || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${c.totalReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {c.totalReturn >= 0 ? '+' : ''}{c.totalReturn}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-red-500 font-medium">
                      {c.maxDrawdown.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300 text-xs">
                      {formatMcap(c.marketCap)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No stock data available — download prices first</p>}
      </div>
    </div>
  );
}
