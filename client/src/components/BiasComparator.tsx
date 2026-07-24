import { useState } from 'react';

interface ArticleGroup {
  count: number;
  avgTone: number;
  articles: { id: number; url: string; title: string; domain: string; country: string; tone: number; publishedAt: string }[];
}

interface ExclusiveWords {
  word: string;
  count: number;
}

interface BiasResult {
  topic: string;
  days: number;
  groups: { left: ArticleGroup; center: ArticleGroup; right: ArticleGroup };
  exclusiveWords: { leftOnly: ExclusiveWords[]; centerOnly: ExclusiveWords[]; rightOnly: ExclusiveWords[] };
  overlapWords: string[];
  narrativeGapScore: number;
  totalArticles: number;
}

function toneColor(t: number): string {
  if (t > 1) return 'text-green-600 dark:text-green-400';
  if (t < -1) return 'text-red-500 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

const leanConfig = {
  left: { label: 'Left', icon: '🔵', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', wordColor: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  center: { label: 'Center', icon: '⚪', color: 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700', wordColor: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  right: { label: 'Right', icon: '🔴', color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', wordColor: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
};

export default function BiasComparator({ onBack }: { onBack: () => void }) {
  const [topic, setTopic] = useState('');
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<BiasResult | null>(null);
  const [loading, setLoading] = useState(false);

  const search = () => {
    if (!topic.trim()) return;
    setLoading(true);
    const params = new URLSearchParams({ topic: topic.trim(), days: String(days) });
    fetch(`/api/bias/compare?${params}`)
      .then(r => r.json())
      .then(setResult)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const gapColor = result
    ? result.narrativeGapScore >= 50 ? 'text-red-600 dark:text-red-400' :
      result.narrativeGapScore >= 25 ? 'text-amber-600 dark:text-amber-400' :
      'text-green-600 dark:text-green-400'
    : '';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bias Comparator</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Compare how the same story is framed across the political spectrum</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Enter a topic (e.g. tariffs, inflation, election)"
          className="flex-1 min-w-[250px] px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button onClick={search} disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
          {loading ? 'Searching...' : 'Compare'}
        </button>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Total Articles</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{result.totalArticles}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Narrative Gap Score</p>
              <p className={`text-2xl font-bold ${gapColor}`}>{result.narrativeGapScore}%</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {result.narrativeGapScore >= 50 ? 'Highly polarized' : result.narrativeGapScore >= 25 ? 'Moderate gap' : 'Similar framing'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Left Articles</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{result.groups.left.count}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">Right Articles</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{result.groups.right.count}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {(['left', 'center', 'right'] as const).map(lean => {
              const g = result.groups[lean];
              const cfg = leanConfig[lean];
              const words = lean === 'left' ? result.exclusiveWords.leftOnly
                : lean === 'center' ? result.exclusiveWords.centerOnly
                : result.exclusiveWords.rightOnly;
              return (
                <div key={lean} className={`rounded-2xl border p-5 ${cfg.color}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{cfg.icon}</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{cfg.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{g.count} articles</span>
                  </div>
                  <div className="mb-3">
                    <span className="text-xs text-gray-500">Avg Tone: </span>
                    <span className={`text-sm font-medium ${toneColor(g.avgTone)}`}>{g.avgTone.toFixed(2)}</span>
                  </div>
                  {words.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1.5">Exclusive language:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {words.map(w => (
                          <span key={w.word} className={`text-[11px] px-2 py-0.5 rounded-full ${cfg.wordColor}`}>
                            {w.word} ({w.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {g.articles.slice(0, 10).map(a => (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                         className="block p-2 rounded-lg hover:bg-white/50 dark:hover:bg-gray-800/50 transition-colors">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{a.title}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{a.domain}</p>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {result.overlapWords.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Shared Language (all sides)</h3>
              <div className="flex flex-wrap gap-2">
                {result.overlapWords.map(w => (
                  <span key={w} className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="text-5xl mb-4">⚖️</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">Enter a topic to compare bias framing</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Shows how left, center, and right sources cover the same story</p>
        </div>
      )}
    </div>
  );
}
