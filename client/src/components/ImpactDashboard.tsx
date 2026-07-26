import type { EventsResponse } from '../api';

const SECTOR_ICONS: Record<string, string> = {
  'Defense / Energy / Safe Haven': '🛡️',
  'Trade / Tech / Industrials': '🏭',
  'Energy / Resources / Geopolitics': '⛽',
  'Growth / Tech / Real Estate': '📈',
  'Bonds / Growth / Real Estate': '📉',
  'Volatility / Safe Haven': '⚡',
  'Manufacturing / Semiconductors': '🔧',
  'Safe Haven / Volatility': '🏦',
  'Varies by regulation type': '⚖️',
};

interface Props {
  data: EventsResponse | null;
  loading: boolean;
}

export default function ImpactDashboard({ data, loading }: Props) {
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700/50 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, sectorImpact, events } = data;

  // Compute sector direction summary
  const sectorSummary: Record<string, { bullish: number; bearish: number; tickers: string[] }> = {};
  for (const [key, val] of Object.entries(sectorImpact)) {
    const sectorName = key.split('-')[0];
    if (!sectorSummary[sectorName]) {
      sectorSummary[sectorName] = { bullish: 0, bearish: 0, tickers: [] };
    }
    if (val.direction === 'bullish') {
      sectorSummary[sectorName].bullish += val.count;
    } else {
      sectorSummary[sectorName].bearish += val.count;
    }
    sectorSummary[sectorName].tickers.push(...val.tickers);
  }

  // Deduplicate tickers per sector
  for (const key of Object.keys(sectorSummary)) {
    sectorSummary[key].tickers = [...new Set(sectorSummary[key].tickers)].slice(0, 6);
  }

  // Sort sectors by total activity
  const sortedSectors = Object.entries(sectorSummary)
    .sort((a, b) => (b[1].bullish + b[1].bearish) - (a[1].bullish + a[1].bearish));

  return (
    <div className="space-y-4">
      {/* Signal Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Signal Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{summary.buySignals}</div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">BUY</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-red-50 dark:bg-red-900/20">
            <div className="text-lg font-bold text-red-600 dark:text-red-400">{summary.sellSignals}</div>
            <div className="text-[10px] text-red-600 dark:text-red-400 font-medium">SELL</div>
          </div>
          <div className="text-center p-2 rounded-xl bg-gray-50 dark:bg-gray-700/50">
            <div className="text-lg font-bold text-gray-600 dark:text-gray-300">
              {summary.total - summary.buySignals - summary.sellSignals}
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">HOLD</div>
          </div>
        </div>
      </div>

      {/* Severity Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Severity Breakdown
        </h3>
        <div className="space-y-1.5">
          {[
            { label: 'Critical', count: summary.critical, color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
            { label: 'High', count: summary.high, color: 'bg-orange-500', textColor: 'text-orange-600 dark:text-orange-400' },
            { label: 'Elevated', count: summary.elevated, color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400' },
            { label: 'Moderate', count: summary.moderate, color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' },
            { label: 'Low', count: summary.low, color: 'bg-gray-400', textColor: 'text-gray-500 dark:text-gray-400' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${item.color} flex-shrink-0`} />
              <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">{item.label}</span>
              <span className={`text-xs font-semibold ${item.textColor}`}>{item.count}</span>
              {summary.total > 0 && (
                <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all`}
                    style={{ width: `${(item.count / summary.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sector Impact Heatmap */}
      {sortedSectors.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Sector Impact
          </h3>
          <div className="space-y-2">
            {sortedSectors.map(([sector, data]) => {
              const total = data.bullish + data.bearish;
              const bullPct = total > 0 ? (data.bullish / total) * 100 : 50;
              const icon = SECTOR_ICONS[sector] || '📊';
              return (
                <div key={sector} className="p-2 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm">{icon}</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
                      {sector}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{total} events</span>
                  </div>
                  {/* Direction bar */}
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-600">
                    <div
                      className="bg-emerald-500 transition-all"
                      style={{ width: `${bullPct}%` }}
                    />
                    <div
                      className="bg-red-500 transition-all"
                      style={{ width: `${100 - bullPct}%` }}
                    />
                  </div>
                  {/* Tickers */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {data.tickers.slice(0, 4).map(ticker => (
                      <span
                        key={ticker}
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-[10px] font-medium text-gray-600 dark:text-gray-300"
                      >
                        {ticker}
                      </span>
                    ))}
                    {data.tickers.length > 4 && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        +{data.tickers.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-3 border border-amber-200 dark:border-amber-800/30">
        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
          <strong>Not financial advice.</strong> Signals are based on historical patterns and rule-based event classification.
          Past performance does not predict future results. Always do your own research before trading.
        </p>
      </div>
    </div>
  );
}
