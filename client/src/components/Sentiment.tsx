import { useState, useEffect, useCallback } from 'react';
import {
  getSentimentTimeline, getSentimentWorldMap, getSentimentSourceBias,
  getSentimentDistribution, getSentimentMoodPulse, getSentimentWaves,
  getSentimentLeftRight,
  type TimelinePoint, type WorldMapCountry, type SourceBias,
  type DistBucket, type MoodPulseEntry, type WaveDay, type LeftRightEntry,
} from '../api';

type Tab = 'timeline' | 'world-map' | 'source-bias' | 'distribution' | 'mood-pulse' | 'waves' | 'left-right';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'timeline', label: 'Tone Timeline', icon: '📈' },
  { id: 'world-map', label: 'World Map', icon: '🌍' },
  { id: 'source-bias', label: 'Source Bias', icon: '📰' },
  { id: 'distribution', label: 'Distribution', icon: '📊' },
  { id: 'mood-pulse', label: 'Mood Pulse', icon: '💓' },
  { id: 'waves', label: 'Sentiment Waves', icon: '🌊' },
  { id: 'left-right', label: 'Left vs Right', icon: '⚖️' },
];

function toneColor(t: number): string {
  if (t > 2) return '#16a34a';
  if (t > 0.5) return '#4ade80';
  if (t > -0.5) return '#94a3b8';
  if (t > -2) return '#fb923c';
  return '#ef4444';
}

function toneBg(t: number): string {
  if (t > 2) return 'bg-green-600';
  if (t > 0.5) return 'bg-green-400';
  if (t > -0.5) return 'bg-gray-400';
  if (t > -2) return 'bg-orange-400';
  return 'bg-red-500';
}

function toneTextClass(t: number): string {
  if (t > 0.5) return 'text-green-600 dark:text-green-400';
  if (t < -0.5) return 'text-red-500 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

// Mini SVG sparkline (inline, no lib needed)
function Sparkline({ data, width = 80, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(' ');
  const lastVal = data[data.length - 1];
  const dotColor = lastVal > 0 ? '#4ade80' : lastVal < 0 ? '#f87171' : '#94a3b8';

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={pts} fill="none" stroke={dotColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * step} cy={height - ((lastVal - min) / range) * height} r="2.5" fill={dotColor} />
    </svg>
  );
}

// Simple world map SVG paths (simplified country outlines)
const COUNTRY_PATHS: Record<string, { d: string; x: number; y: number }> = {
  US: { d: 'M13,38 L28,38 L30,35 L28,32 L24,30 L18,30 L14,32 L12,35 Z', x: 20, y: 35 },
  GB: { d: 'M44,28 L47,26 L48,28 L47,30 L44,30 Z', x: 46, y: 28 },
  DE: { d: 'M48,30 L52,30 L53,33 L50,34 L48,33 Z', x: 50, y: 31 },
  FR: { d: 'M44,32 L48,32 L48,36 L44,37 L42,34 Z', x: 45, y: 34 },
  CN: { d: 'M75,32 L85,32 L88,38 L82,42 L75,40 L72,36 Z', x: 80, y: 36 },
  JP: { d: 'M88,34 L90,32 L92,34 L90,38 L88,38 Z', x: 90, y: 35 },
  IN: { d: 'M68,38 L74,38 L76,44 L72,48 L68,44 Z', x: 71, y: 42 },
  BR: { d: 'M28,50 L36,48 L40,52 L38,58 L30,60 L26,54 Z', x: 33, y: 54 },
  AU: { d: 'M82,56 L92,56 L94,60 L90,64 L82,62 Z', x: 88, y: 59 },
  CA: { d: 'M10,22 L32,22 L34,28 L28,32 L14,30 L8,26 Z', x: 22, y: 26 },
  RU: { d: 'M52,20 L80,18 L90,22 L88,30 L80,32 L60,32 L52,28 Z', x: 70, y: 24 },
  KR: { d: 'M86,34 L88,34 L88,36 L86,37 Z', x: 87, y: 35 },
  IT: { d: 'M48,34 L50,34 L52,38 L50,40 L48,38 Z', x: 49, y: 37 },
  ES: { d: 'M42,36 L46,36 L46,39 L42,40 Z', x: 44, y: 37 },
  MX: { d: 'M10,40 L18,38 L20,42 L16,46 L10,44 Z', x: 15, y: 42 },
  NG: { d: 'M48,44 L52,44 L52,48 L48,48 Z', x: 50, y: 46 },
  ZA: { d: 'M52,58 L58,58 L58,62 L52,62 Z', x: 55, y: 60 },
  EG: { d: 'M52,36 L56,36 L56,40 L52,40 Z', x: 54, y: 38 },
  TR: { d: 'M54,32 L60,32 L60,34 L54,34 Z', x: 57, y: 33 },
  AR: { d: 'M24,58 L30,56 L32,60 L28,68 L24,66 Z', x: 28, y: 62 },
  SA: { d: 'M58,36 L64,36 L66,40 L60,42 Z', x: 61, y: 38 },
  PL: { d: 'M50,28 L54,28 L54,31 L50,31 Z', x: 52, y: 29 },
  SE: { d: 'M50,22 L52,20 L54,22 L52,26 L50,26 Z', x: 52, y: 23 },
  NO: { d: 'M48,18 L50,16 L52,18 L50,22 L48,22 Z', x: 50, y: 19 },
  NL: { d: 'M46,28 L48,28 L48,30 L46,30 Z', x: 47, y: 29 },
  SG: { d: 'M76,46 L77,46 L77,47 L76,47 Z', x: 76.5, y: 46.5 },
  IE: { d: 'M42,28 L44,28 L44,30 L42,30 Z', x: 43, y: 29 },
};

// ── COUNTRY CODE MAP (name → ISO) ──
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'United States': 'US', 'USA': 'US', 'US': 'US',
  'United Kingdom': 'GB', 'UK': 'GB', 'Great Britain': 'GB',
  'Germany': 'DE', 'France': 'FR', 'China': 'CN', 'Japan': 'JP',
  'India': 'IN', 'Brazil': 'BR', 'Australia': 'AU', 'Canada': 'CA',
  'Russia': 'RU', 'South Korea': 'KR', 'Korea': 'KR',
  'Italy': 'IT', 'Spain': 'ES', 'Mexico': 'MX',
  'Nigeria': 'NG', 'South Africa': 'ZA', 'Egypt': 'EG',
  'Turkey': 'TR', 'Türkiye': 'TR', 'Argentina': 'AR',
  'Saudi Arabia': 'SA', 'Poland': 'PL', 'Sweden': 'SE',
  'Norway': 'NO', 'Netherlands': 'NL', 'Singapore': 'SG',
  'Ireland': 'IE',
};

function isoForCountry(name: string): string | null {
  if (COUNTRY_PATHS[name]) return name;
  return COUNTRY_NAME_TO_ISO[name] || null;
}

interface Props { onBack: () => void; }

export default function Sentiment({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [loading, setLoading] = useState(false);

  // Timeline state
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [tlGranularity, setTlGranularity] = useState<'daily' | 'weekly'>('daily');
  const [tlCountry, setTlCountry] = useState('');
  const [tlCountries, setTlCountries] = useState<string[]>([]);

  // World map state
  const [wmCountries, setWmCountries] = useState<WorldMapCountry[]>([]);
  const [wmMonths, setWmMonths] = useState<string[]>([]);
  const [wmMonth, setWmMonth] = useState('');

  // Source bias state
  const [sources, setSources] = useState<SourceBias[]>([]);

  // Distribution state
  const [distBuckets, setDistBuckets] = useState<DistBucket[]>([]);
  const [distAvg, setDistAvg] = useState(0);
  const [distTotal, setDistTotal] = useState(0);

  // Mood pulse state
  const [pulse, setPulse] = useState<MoodPulseEntry[]>([]);

  // Waves state
  const [waves, setWaves] = useState<WaveDay[]>([]);
  const [waveCountries, setWaveCountries] = useState<string[]>([]);

  // Left-right state
  const [leftRight, setLeftRight] = useState<LeftRightEntry[]>([]);
  const [lrUncat, setLrUncat] = useState({ avgTone: 0, totalArticles: 0, domainCount: 0 });

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      switch (t) {
        case 'timeline': {
          const d = await getSentimentTimeline({ country: tlCountry || undefined, granularity: tlGranularity });
          setTimeline(d.timeline);
          // Extract unique countries from timeline for filter
          if (tlCountries.length === 0) {
            const countriesResult = await getSentimentWorldMap();
            setTlCountries(countriesResult.countries.map(c => c.country).filter(Boolean));
          }
          break;
        }
        case 'world-map': {
          const d = await getSentimentWorldMap(wmMonth || undefined);
          setWmCountries(d.countries);
          setWmMonths(d.months);
          if (!wmMonth && d.months.length > 0) setWmMonth(d.months[0]);
          break;
        }
        case 'source-bias': {
          const d = await getSentimentSourceBias();
          setSources(d.sources);
          break;
        }
        case 'distribution': {
          const d = await getSentimentDistribution();
          setDistBuckets(d.buckets);
          setDistAvg(d.avgTone);
          setDistTotal(d.totalArticles);
          break;
        }
        case 'mood-pulse': {
          const d = await getSentimentMoodPulse();
          setPulse(d.pulse);
          break;
        }
        case 'waves': {
          const d = await getSentimentWaves(21);
          setWaves(d.waves);
          setWaveCountries(d.countries);
          break;
        }
        case 'left-right': {
          const d = await getSentimentLeftRight();
          setLeftRight(d.leftRight);
          setLrUncat(d.uncategorized);
          break;
        }
      }
    } catch (err) { console.error('Sentiment load error:', err); }
    setLoading(false);
  }, [tab, tlGranularity, tlCountry, wmMonth]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sentiment Analysis</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">GDELT tone data across news sources</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-thin">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {!loading && tab === 'timeline' && (
        <TimelineViz
          data={timeline}
          granularity={tlGranularity}
          onGranularityChange={setTlGranularity}
          country={tlCountry}
          onCountryChange={setTlCountry}
          countries={tlCountries}
        />
      )}
      {!loading && tab === 'world-map' && (
        <WorldMapViz countries={wmCountries} months={wmMonths} month={wmMonth} onMonthChange={setWmMonth} />
      )}
      {!loading && tab === 'source-bias' && <SourceBiasViz sources={sources} />}
      {!loading && tab === 'distribution' && <DistributionViz buckets={distBuckets} avgTone={distAvg} total={distTotal} />}
      {!loading && tab === 'mood-pulse' && <MoodPulseViz pulse={pulse} />}
      {!loading && tab === 'waves' && <WavesViz waves={waves} countries={waveCountries} />}
      {!loading && tab === 'left-right' && <LeftRightViz data={leftRight} uncat={lrUncat} />}
    </div>
  );
}

// ═══════════════════════════════════════════
// 1. TONE TIMELINE
// ═══════════════════════════════════════════
function TimelineViz({ data, granularity, onGranularityChange, country, onCountryChange, countries }: {
  data: TimelinePoint[]; granularity: string; onGranularityChange: (g: 'daily' | 'weekly') => void;
  country: string; onCountryChange: (c: string) => void; countries: string[];
}) {
  if (data.length === 0) return <EmptyState message="No tone data available. Re-download the news archive to populate sentiment." />;

  const W = 900, H = 300, PAD = 50;
  const chartW = W - PAD * 2, chartH = H - PAD * 2;
  const tones = data.map(d => d.avgTone);
  const minT = Math.min(...tones, -2);
  const maxT = Math.max(...tones, 2);
  const rangeT = maxT - minT || 1;
  const counts = data.map(d => d.articleCount);
  const maxC = Math.max(...counts, 1);

  const scaleX = (i: number) => PAD + (i / Math.max(1, data.length - 1)) * chartW;
  const scaleY = (v: number) => PAD + (1 - (v - minT) / rangeT) * chartH;
  const scaleC = (v: number) => PAD + (1 - v / maxC) * chartH;

  // Build area path for tone
  const tonePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i)},${scaleY(d.avgTone)}`).join(' ');
  const areaPath = `${tonePath} L${scaleX(data.length - 1)},${PAD + chartH} L${scaleX(0)},${PAD + chartH} Z`;

  // Zero line Y
  const zeroY = scaleY(0);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 flex gap-3 items-center flex-wrap">
        <div className="flex gap-1">
          <button onClick={() => onGranularityChange('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${granularity === 'daily' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
            Daily
          </button>
          <button onClick={() => onGranularityChange('weekly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${granularity === 'weekly' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
            Weekly
          </button>
        </div>
        <select value={country} onChange={e => onCountryChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto text-xs text-gray-400">{data.length} data points</div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" style={{ height: 'auto' }}>
          {/* Grid lines */}
          {[-4, -2, 0, 2, 4].map(v => {
            if (v < minT || v > maxT) return null;
            return (
              <g key={v}>
                <line x1={PAD} y1={scaleY(v)} x2={W - PAD} y2={scaleY(v)} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray={v === 0 ? 'none' : '4,4'} />
                <text x={PAD - 8} y={scaleY(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text>
              </g>
            );
          })}

          {/* Positive/negative zones */}
          {maxT > 0 && <rect x={PAD} y={scaleY(Math.min(maxT, maxT))} width={chartW} height={scaleY(0) - scaleY(Math.min(maxT, maxT))} fill="rgba(34,197,94,0.04)" />}
          {minT < 0 && <rect x={PAD} y={scaleY(0)} width={chartW} height={scaleY(minT) - scaleY(0)} fill="rgba(239,68,68,0.04)" />}

          {/* Article count bars (behind line) */}
          {data.map((d, i) => {
            const barH = (d.articleCount / maxC) * chartH * 0.3;
            return (
              <rect key={i}
                x={scaleX(i) - 2} y={PAD + chartH - barH}
                width={4} height={barH}
                fill="#c7d2fe" opacity="0.5" rx="1"
              />
            );
          })}

          {/* Tone line */}
          <path d={areaPath} fill="url(#toneGradient)" opacity="0.3" />
          <path d={tonePath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {data.map((d, i) => (
            <circle key={i} cx={scaleX(i)} cy={scaleY(d.avgTone)} r="3" fill={toneColor(d.avgTone)} stroke="white" strokeWidth="1" />
          ))}

          {/* X-axis labels */}
          {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 8)) === 0).map((d, _, arr) => {
            const i = data.indexOf(d);
            return (
              <text key={i} x={scaleX(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#9ca3af">
                {d.period.length > 7 ? d.period.slice(5) : d.period}
              </text>
            );
          })}

          <defs>
            <linearGradient id="toneGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Avg Tone" value={`${data.reduce((s, d) => s + d.avgTone, 0) / data.length > 0 ? '+' : ''}${(data.reduce((s, d) => s + d.avgTone, 0) / data.length).toFixed(2)}`} color={toneTextClass(data.reduce((s, d) => s + d.avgTone, 0) / data.length)} />
        <StatCard label="Total Articles" value={data.reduce((s, d) => s + d.articleCount, 0).toLocaleString()} />
        <StatCard label="Peak Positive" value={`${Math.max(...tones).toFixed(1)}`} color="text-green-600 dark:text-green-400" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 2. WORLD SENTIMENT MAP
// ═══════════════════════════════════════════
function WorldMapViz({ countries, months, month, onMonthChange }: {
  countries: WorldMapCountry[]; months: string[]; month: string; onMonthChange: (m: string) => void;
}) {
  if (countries.length === 0) return <EmptyState message="No world sentiment data. Download news archive to see the global sentiment map." />;

  const countryToneMap = new Map(countries.map(c => [c.country, c]));
  const selected = countries.find(c => c.country === month) || null;

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 flex gap-3 items-center">
        <span className="text-xs text-gray-500">Month:</span>
        <div className="flex gap-1 overflow-x-auto scrollbar-thin">
          {months.map(m => (
            <button key={m} onClick={() => onMonthChange(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${month === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <div className="relative">
          <svg viewBox="0 0 100 70" className="w-full" style={{ maxHeight: '400px' }}>
            {/* Ocean background */}
            <rect x="0" y="0" width="100" height="70" fill="#1e293b" rx="2" />

            {/* Country shapes */}
            {Object.entries(COUNTRY_PATHS).map(([iso, { d }]) => {
              const countryEntry = countries.find(c => isoForCountry(c.country) === iso);
              const tone = countryEntry?.avgTone ?? null;
              const fill = tone !== null ? toneColor(tone) : '#334155';
              const opacity = tone !== null ? 0.8 : 0.3;

              return (
                <g key={iso}>
                  <path d={d} fill={fill} opacity={opacity} stroke="#475569" strokeWidth="0.3" />
                  {countryEntry && (
                    <text x={COUNTRY_PATHS[iso].x} y={COUNTRY_PATHS[iso].y}
                      textAnchor="middle" fontSize="3" fill="white" fontWeight="bold">
                      {countryEntry.avgTone > 0 ? '+' : ''}{countryEntry.avgTone.toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Legend */}
            <g transform="translate(2, 60)">
              <rect x="0" y="0" width="30" height="3" rx="1" fill="url(#legendGrad)" />
              <text x="0" y="7" fontSize="2" fill="#94a3b8">-10</text>
              <text x="15" y="7" fontSize="2" fill="#94a3b8" textAnchor="middle">0</text>
              <text x="30" y="7" fontSize="2" fill="#94a3b8" textAnchor="end">+10</text>
            </g>
            <defs>
              <linearGradient id="legendGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Country table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Country Sentiment Breakdown</h3>
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-2 text-left font-medium">Country</th>
                <th className="px-4 py-2 text-right font-medium">Avg Tone</th>
                <th className="px-4 py-2 text-right font-medium">Articles</th>
                <th className="px-4 py-2 text-right font-medium">Positive</th>
                <th className="px-4 py-2 text-right font-medium">Negative</th>
              </tr>
            </thead>
            <tbody>
              {countries.map(c => (
                <tr key={c.country} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{c.country}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-bold ${toneTextClass(c.avgTone)}`}>
                      {c.avgTone > 0 ? '+' : ''}{c.avgTone}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">{c.articleCount}</td>
                  <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">{c.positiveCount}</td>
                  <td className="px-4 py-2 text-right text-red-500 dark:text-red-400">{c.negativeCount}</td>
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
// 3. SOURCE BIAS SPECTRUM
// ═══════════════════════════════════════════
function SourceBiasViz({ sources }: { sources: SourceBias[] }) {
  if (sources.length === 0) return <EmptyState message="No source bias data. Download news archive with tone data." />;

  const maxArticles = Math.max(...sources.map(s => s.articleCount), 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Source Bias Spectrum</h3>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Each source positioned on the negative-positive tone scale</p>
      </div>
      <div className="max-h-[600px] overflow-y-auto p-4">
        <div className="space-y-1.5">
          {sources.map(s => {
            const barX = ((s.avgTone + 10) / 20) * 100;
            const barWidth = (s.articleCount / maxArticles) * 60;
            const leanColor = s.lean === 'left' ? 'bg-blue-500' : s.lean === 'right' ? 'bg-red-500' : s.lean === 'center' ? 'bg-gray-400' : 'bg-purple-400';

            return (
              <div key={s.domain} className="flex items-center gap-2 group">
                <div className="w-36 text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-shrink-0 text-right">{s.domain}</div>
                <div className="flex-1 relative h-6 bg-gray-50 dark:bg-gray-700/50 rounded overflow-hidden">
                  {/* Center line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
                  {/* Bar */}
                  <div
                    className={`absolute top-0.5 bottom-0.5 rounded ${leanColor} opacity-70`}
                    style={{
                      left: `${Math.min(barX, 50)}%`,
                      width: `${barWidth}%`,
                    }}
                  />
                  {/* Dot */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white dark:border-gray-800 shadow-sm"
                    style={{ left: `${barX}%`, backgroundColor: toneColor(s.avgTone) }}
                  />
                </div>
                <div className="w-16 text-right">
                  <span className={`text-xs font-bold ${toneTextClass(s.avgTone)}`}>
                    {s.avgTone > 0 ? '+' : ''}{s.avgTone}
                  </span>
                </div>
                <div className="w-10 text-right text-[10px] text-gray-400">{s.articleCount}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex gap-4 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Left</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Center</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Right</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Uncategorized</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 4. SENTIMENT DISTRIBUTION
// ═══════════════════════════════════════════
function DistributionViz({ buckets, avgTone, total }: { buckets: DistBucket[]; avgTone: number; total: number }) {
  if (buckets.length === 0) return <EmptyState message="No distribution data available." />;

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const W = 800, H = 300, PAD = 50;
  const chartW = W - PAD * 2, chartH = H - PAD * 2;
  const barW = chartW / buckets.length;

  const avgX = PAD + ((avgTone + 10) / 20) * chartW;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]" style={{ height: 'auto' }}>
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <g key={f}>
              <line x1={PAD} y1={PAD + chartH * (1 - f)} x2={W - PAD} y2={PAD + chartH * (1 - f)} stroke="#e5e7eb" strokeWidth="0.5" />
              <text x={PAD - 8} y={PAD + chartH * (1 - f) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
                {Math.round(maxCount * f)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {buckets.map((b, i) => {
            const barH = (b.count / maxCount) * chartH;
            return (
              <g key={b.bucket}>
                <rect
                  x={PAD + i * barW + 1}
                  y={PAD + chartH - barH}
                  width={barW - 2}
                  height={barH}
                  fill={toneColor(b.bucket)}
                  opacity="0.75"
                  rx="2"
                />
                {barW > 20 && (
                  <text x={PAD + i * barW + barW / 2} y={PAD + chartH + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">
                    {b.bucket}
                  </text>
                )}
              </g>
            );
          })}

          {/* Average line */}
          <line x1={avgX} y1={PAD} x2={avgX} y2={PAD + chartH} stroke="#6366f1" strokeWidth="2" strokeDasharray="4,3" />
          <text x={avgX} y={PAD - 6} textAnchor="middle" fontSize="9" fill="#6366f1" fontWeight="bold">
            avg: {avgTone > 0 ? '+' : ''}{avgTone}
          </text>

          {/* X label */}
          <text x={W / 2} y={H - 5} textAnchor="middle" fontSize="10" fill="#6b7280">Tone Score</text>
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Avg Tone" value={`${avgTone > 0 ? '+' : ''}${avgTone}`} color={toneTextClass(avgTone)} />
        <StatCard label="Total Articles" value={total.toLocaleString()} />
        <StatCard label="Peak Bucket" value={`${buckets.reduce((max, b) => b.count > max.count ? b : max, buckets[0]).bucket}`} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 5. MOOD PULSE
// ═══════════════════════════════════════════
function MoodPulseViz({ pulse }: { pulse: MoodPulseEntry[] }) {
  if (pulse.length === 0) return <EmptyState message="No mood pulse data. Download recent news archive data." />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {pulse.map(p => (
        <div key={p.country} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{p.country}</span>
            <span className={`text-lg ${p.trend === 'up' ? 'text-green-500' : p.trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
              {p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : '→'}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-2xl font-bold ${toneTextClass(p.todayTone)}`}>
              {p.todayTone > 0 ? '+' : ''}{p.todayTone}
            </span>
            <span className="text-xs text-gray-400">today</span>
          </div>
          <div className="flex items-center gap-3">
            <Sparkline data={p.sparkline} width={100} height={28} />
            <div className="text-[10px] text-gray-400">
              <div>week: <span className={toneTextClass(p.weekTone)}>{p.weekTone > 0 ? '+' : ''}{p.weekTone}</span></div>
              <div>{p.totalArticles} articles</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// 6. SENTIMENT WAVES
// ═══════════════════════════════════════════
function WavesViz({ waves, countries }: { waves: WaveDay[]; countries: string[] }) {
  if (waves.length === 0) return <EmptyState message="No wave data available. Download news archive with multiple days." />;

  const W = 900, H = Math.max(200, countries.length * 22 + 80), PAD = 60;
  const chartW = W - PAD - 20, chartH = H - PAD - 20;
  const cellW = chartW / Math.max(1, waves.length);
  const cellH = Math.min(20, chartH / Math.max(1, countries.length));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 overflow-x-auto">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sentiment Wave Cascade</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" style={{ height: 'auto' }}>
        {/* Day headers */}
        {waves.map((w, i) => (
          <text key={i} x={PAD + i * cellW + cellW / 2} y={12} textAnchor="middle" fontSize="8" fill="#9ca3af">
            {w.date.slice(5)}
          </text>
        ))}

        {/* Rows per country */}
        {countries.map((country, ci) => (
          <g key={country}>
            <text x={PAD - 4} y={PAD + ci * cellH + cellH / 2 + 3} textAnchor="end" fontSize="8" fill="#6b7280">
              {country.length > 8 ? country.slice(0, 7) + '.' : country}
            </text>
            {waves.map((w, wi) => {
              const entry = w.countries.find(c => c.country === country);
              if (!entry) return null;
              const fill = toneColor(entry.tone);
              const opacity = Math.min(1, Math.abs(entry.tone) / 5 + 0.2);

              return (
                <rect key={wi}
                  x={PAD + wi * cellW + 1}
                  y={PAD + ci * cellH}
                  width={cellW - 2}
                  height={cellH - 1}
                  fill={fill}
                  opacity={opacity}
                  rx="2"
                >
                  <title>{`${country}: ${entry.tone > 0 ? '+' : ''}${entry.tone} (${entry.count} articles)`}</title>
                </rect>
              );
            })}
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${PAD}, ${H - 12})`}>
          <text x="0" y="0" fontSize="8" fill="#9ca3af">Negative</text>
          <rect x="55" y="-6" width="80" height="8" rx="2" fill="url(#waveLegend)" />
          <text x="140" y="0" fontSize="8" fill="#9ca3af">Positive</text>
        </g>
        <defs>
          <linearGradient id="waveLegend" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════
// 7. LEFT VS RIGHT BIAS
// ═══════════════════════════════════════════
function LeftRightViz({ data, uncat }: { data: LeftRightEntry[]; uncat: { avgTone: number; totalArticles: number; domainCount: number } }) {
  if (data.length === 0) return <EmptyState message="No left/right bias data available." />;

  const maxBucketCount = Math.max(...data.flatMap(d => d.distribution.map(b => b.count)), 1);
  const COLORS = { left: '#3b82f6', center: '#94a3b8', right: '#ef4444' };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {data.map(d => (
          <div key={d.category} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: COLORS[d.category] }}>
              {d.category}
            </div>
            <div className={`text-2xl font-bold ${toneTextClass(d.avgTone)}`}>
              {d.avgTone > 0 ? '+' : ''}{d.avgTone}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{d.totalArticles} articles · {d.domainCount} sources</div>
          </div>
        ))}
      </div>

      {/* Comparison distributions */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Tone Distribution by Political Lean</h3>
        <div className="flex gap-4 overflow-x-auto">
          {data.map(d => (
            <div key={d.category} className="flex-1 min-w-[200px]">
              <div className="text-xs font-bold mb-2" style={{ color: COLORS[d.category] }}>
                {d.category.toUpperCase()} ({d.totalArticles} articles)
              </div>
              <div className="flex items-end gap-px" style={{ height: '120px' }}>
                {d.distribution.map(b => {
                  const barH = (b.count / maxBucketCount) * 110;
                  return (
                    <div key={b.bucket} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${Math.max(1, barH)}px`,
                          backgroundColor: COLORS[d.category],
                          opacity: 0.6 + (b.count / maxBucketCount) * 0.4,
                        }}
                        title={`${b.bucket}: ${b.count}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[8px] text-gray-400 mt-1">
                <span>-10</span>
                <span>0</span>
                <span>+10</span>
              </div>
              <div className="text-center text-[10px] text-gray-500 mt-1">
                Median: <span className={toneTextClass(d.medianTone)}>{d.medianTone > 0 ? '+' : ''}{d.medianTone}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top sources per category */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Top Sources by Category</h3>
        <div className="grid grid-cols-3 gap-4">
          {data.map(d => (
            <div key={d.category}>
              <div className="text-xs font-bold mb-2" style={{ color: COLORS[d.category] }}>{d.category}</div>
              <div className="space-y-1">
                {d.topDomains.map((dom, i) => (
                  <div key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[d.category] }} />
                    {dom}
                  </div>
                ))}
                {d.topDomains.length === 0 && <div className="text-xs text-gray-400 italic">No data</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Uncategorized note */}
      {uncat.totalArticles > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3 text-xs text-gray-400">
          {uncat.domainCount} uncategorized sources · {uncat.totalArticles.toLocaleString()} articles · avg tone: {uncat.avgTone > 0 ? '+' : ''}{uncat.avgTone}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════
function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 text-center">
      <div className="text-3xl mb-3">📭</div>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-md mx-auto">{message}</p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
