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

const BLOCK_LABELS: Record<string, string> = { g7: 'G7', brics: 'BRICS', hub: 'Financial Hubs' };
const BLOCK_ORDER = ['g7', 'brics', 'hub'];

const FLAG: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}', UK: '\u{1F1EC}\u{1F1E7}', CA: '\u{1F1E8}\u{1F1E6}',
  FR: '\u{1F1EB}\u{1F1F7}', DE: '\u{1F1E9}\u{1F1EA}', IT: '\u{1F1EE}\u{1F1F9}',
  JP: '\u{1F1EF}\u{1F1F5}', CN: '\u{1F1E8}\u{1F1F3}', IN: '\u{1F1EE}\u{1F1F3}',
  BR: '\u{1F1E7}\u{1F1F7}', ZA: '\u{1F1FF}\u{1F1E6}', HK: '\u{1F1ED}\u{1F1F0}',
  SG: '\u{1F1F8}\u{1F1EC}', KR: '\u{1F1F0}\u{1F1F7}', TW: '\u{1F1F9}\u{1F1FC}',
  CH: '\u{1F1E8}\u{1F1ED}', AE: '\u{1F1E6}\u{1F1EA}', AU: '\u{1F1E6}\u{1F1FA}',
};

function trendIcon(trend: string): string {
  if (trend === 'improving') return '\u{1F4C8}';
  if (trend === 'deteriorating') return '\u{1F4C9}';
  return '\u{2796}';
}

function signalColor(signal: string): string {
  if (signal === 'STRONG_BUY') return 'text-green-400';
  if (signal === 'BUY') return 'text-green-300';
  if (signal === 'SELL') return 'text-red-300';
  if (signal === 'STRONG_SELL') return 'text-red-400';
  return 'text-gray-400';
}

interface Props {
  countries: CountrySummary[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export default function CountrySelector({ countries, selectedCode, onSelect }: Props) {
  const grouped = BLOCK_ORDER.map(block => ({
    block,
    label: BLOCK_LABELS[block],
    items: countries.filter(c => c.block === block),
  }));

  return (
    <div className="space-y-4">
      {grouped.map(({ block, label, items }) => (
        <div key={block}>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{label}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {items.map(c => {
              const selected = c.code === selectedCode;
              return (
                <button
                  key={c.code}
                  onClick={() => onSelect(c.code)}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    selected
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 ring-1 ring-blue-400/50'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-lg">{FLAG[c.code] || '\u{1F310}'}</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{c.code}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">{c.indexName}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className={`text-xs font-semibold ${c.indexChange1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {c.indexChange1d >= 0 ? '+' : ''}{c.indexChange1d.toFixed(1)}%
                    </span>
                    <span className="text-[10px]">{trendIcon(c.sentimentTrend)}</span>
                  </div>
                  {c.computedAt && (
                    <div className="mt-1 flex gap-0.5">
                      {c.topBuy.slice(0, 3).map(s => (
                        <span key={s.symbol} className={`text-[8px] font-bold ${signalColor(s.signal)}`}>{s.symbol.slice(0, 3)}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
