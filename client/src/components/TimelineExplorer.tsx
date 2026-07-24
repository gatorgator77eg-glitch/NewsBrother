import { useState, useEffect, useRef } from 'react';

interface TimelineBucket {
  date: string;
  count: number;
  avgTone: number;
  minTone: number;
  maxTone: number;
  positive: number;
  negative: number;
  domains: number;
  countries: number;
}

interface TimelineDetail {
  date: string;
  articles: { id: number; url: string; title: string; domain: string; country: string; tone: number; publishedAt: string }[];
  count: number;
}

const GRANULARITIES = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

function toneToColor(tone: number): string {
  if (tone > 3) return '#22c55e';
  if (tone > 1) return '#86efac';
  if (tone > -1) return '#9ca3af';
  if (tone > -3) return '#fca5a5';
  return '#ef4444';
}

export default function TimelineExplorer({ onBack }: { onBack: () => void }) {
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const [granularity, setGranularity] = useState('day');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [detail, setDetail] = useState<TimelineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ granularity, from: dateFrom, to: dateTo });
    fetch(`/api/timeline?${params}`)
      .then(r => r.json())
      .then(d => setBuckets(d.buckets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [granularity, dateFrom, dateTo]);

  const showDetail = (date: string) => {
    fetch(`/api/timeline/detail?date=${date}`)
      .then(r => r.json())
      .then(setDetail)
      .catch(() => {});
  };

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const svgWidth = Math.max(buckets.length * 28, 400);
  const svgHeight = 200;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Timeline Explorer</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{buckets.length} buckets · {buckets.reduce((s, b) => s + b.count, 0).toLocaleString()} articles</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {GRANULARITIES.map(g => (
          <button key={g.value} onClick={() => setGranularity(g.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              granularity === g.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}>
            {g.label}
          </button>
        ))}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300" />
        <span className="text-gray-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : buckets.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <p className="text-gray-400">No data for this date range.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm overflow-x-auto">
          <svg ref={svgRef} width={svgWidth} height={svgHeight + 40} className="select-none">
            {[0, 0.25, 0.5, 0.75, 1].map(pct => {
              const y = svgHeight - pct * svgHeight;
              return (
                <g key={pct}>
                  <line x1="0" y1={y} x2={svgWidth} y2={y} stroke="currentColor" className="text-gray-100 dark:text-gray-700" />
                  <text x="0" y={y - 4} className="fill-gray-400 dark:text-gray-500" fontSize="10">
                    {Math.round(maxCount * pct)}
                  </text>
                </g>
              );
            })}
            {buckets.map((b, i) => {
              const barWidth = Math.max((svgWidth - 40) / buckets.length - 2, 4);
              const x = 30 + i * (barWidth + 2);
              const barHeight = (b.count / maxCount) * svgHeight;
              const y = svgHeight - barHeight;
              return (
                <g key={b.date} onClick={() => showDetail(b.date)} className="cursor-pointer">
                  <rect x={x} y={y} width={barWidth} height={barHeight} rx="3"
                    fill={toneToColor(b.avgTone)} opacity="0.85"
                    onMouseEnter={e => (e.target as SVGRectElement).setAttribute('opacity', '1')}
                    onMouseLeave={e => (e.target as SVGRectElement).setAttribute('opacity', '0.85')} />
                  <title>{`${b.date}: ${b.count} articles, tone ${b.avgTone.toFixed(1)}`}</title>
                  {buckets.length <= 40 && (
                    <text x={x + barWidth / 2} y={svgHeight + 12} textAnchor="middle"
                      className="fill-gray-400 dark:fill-gray-500" fontSize="8" transform={`rotate(-45, ${x + barWidth / 2}, ${svgHeight + 12})`}>
                      {b.date.slice(5)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: '#22c55e' }} />
              Positive
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: '#9ca3af' }} />
              Neutral
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: '#ef4444' }} />
              Negative
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Articles for {detail.date}
            </h2>
            <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {detail.articles.map(a => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="block p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                  <span>{a.domain}</span>
                  <span>·</span>
                  <span className={a.tone > 0 ? 'text-green-500' : a.tone < 0 ? 'text-red-400' : ''}>
                    tone {a.tone.toFixed(1)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
