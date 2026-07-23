import type { MarketEvent } from '../api';

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', label: 'CRITICAL', emoji: '🔴' },
  high:     { color: 'bg-orange-500', ring: 'ring-orange-500/30', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', label: 'HIGH', emoji: '🟠' },
  elevated: { color: 'bg-yellow-500', ring: 'ring-yellow-500/30', text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: 'ELEVATED', emoji: '🟡' },
  moderate: { color: 'bg-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'MODERATE', emoji: '🔵' },
  low:      { color: 'bg-gray-400', ring: 'ring-gray-400/30', text: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800', label: 'LOW', emoji: '⚪' },
};

const SIGNAL_CONFIG = {
  BUY:  { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
  SELL: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' },
  HOLD: { color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700' },
};

const CATEGORY_LABELS: Record<string, string> = {
  CONFLICT: 'Military / Conflict',
  TARIFF: 'Tariff / Trade',
  SANCTIONS: 'Sanctions',
  RATE_CUT: 'Rate Cut',
  RATE_HIKE: 'Rate Hike',
  ELECTION: 'Election',
  REGULATION: 'Regulation',
  SUPPLY_CHAIN: 'Supply Chain',
  POLITICAL_CRISIS: 'Political Crisis',
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  event: MarketEvent;
}

export default function EventCard({ event }: Props) {
  const sev = SEVERITY_CONFIG[event.severity];
  const sig = SIGNAL_CONFIG[event.signal];
  const bullishSectors = event.affectedSectors.filter(s => s.direction === 'bullish');
  const bearishSectors = event.affectedSectors.filter(s => s.direction === 'bearish');

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-l-4 ${sev.ring.replace('ring-', 'border-')} p-5 transition-all hover:shadow-md`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${sev.bg} ${sev.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sev.color} animate-pulse`} />
              {sev.label}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {CATEGORY_LABELS[event.category] || event.category}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
            {event.title}
          </h3>
          {event.summary && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {event.summary}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(event.publishedAt)}</span>
        </div>
      </div>

      {/* Affected Sectors */}
      <div className="flex gap-3 mb-3">
        {bullishSectors.length > 0 && (
          <div className="flex-1">
            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5">
              ▲ Bullish
            </div>
            <div className="flex flex-wrap gap-1">
              {bullishSectors.map((sector, i) =>
                sector.tickers.map(ticker => (
                  <span
                    key={`${ticker}-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium"
                  >
                    {ticker}
                  </span>
                ))
              )}
            </div>
          </div>
        )}
        {bearishSectors.length > 0 && (
          <div className="flex-1">
            <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1.5">
              ▼ Bearish
            </div>
            <div className="flex flex-wrap gap-1">
              {bearishSectors.map((sector, i) =>
                sector.tickers.map(ticker => (
                  <span
                    key={`${ticker}-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-[11px] font-medium"
                  >
                    {ticker}
                  </span>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Signal + Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/50">
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${sig.bg} ${sig.border}`}>
          <span className={`text-xs font-bold ${sig.color}`}>
            {event.signal === 'BUY' ? '▲' : event.signal === 'SELL' ? '▼' : '●'} {event.signal}
          </span>
          {event.signalTickers.length > 0 && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {event.signalTickers.slice(0, 3).join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {event.source}
          </span>
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Source ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
