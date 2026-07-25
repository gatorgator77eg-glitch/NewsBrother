import { useState, useEffect } from 'react';

interface BriefingStory {
  title: string;
  domain: string;
  country: string;
  tone: number;
  publishedAt: string;
  url: string;
}

interface SentimentShift {
  country: string;
  todayTone: number;
  yesterdayTone: number;
  change: number;
  count: number;
}

interface Narrative {
  title: string;
  domain: string;
  tone: number;
  publishedAt: string;
}

interface CoverageEntry {
  country: string;
  count: number;
  avgTone: number;
}

interface BreakingNews {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface BriefingData {
  generatedAt: string;
  archiveDateRange?: { anchor: string } | null;
  topStories: BriefingStory[];
  sentimentShifts: SentimentShift[];
  emergingNarratives: Narrative[];
  coverageByCountry: CoverageEntry[];
  breakingNews: BreakingNews[];
  stats: { articlesToday: number; articlesYesterday: number };
}

const toneColor = (t: number) => t > 1 ? 'text-green-600 dark:text-green-400' : t < -1 ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';
const toneBadge = (t: number) => t > 1 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : t < -1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';

function hoursAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (diff < 1) return '<1h';
  if (diff < 24) return `${Math.round(diff)}h`;
  return `${Math.round(diff / 24)}d`;
}

export default function DailyBriefing({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReason, setAiReason] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/briefing/daily')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data) return;
    setAiLoading(true);
    fetch('/api/briefing/ai-summary', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.summary) setAiSummary(d.summary);
        else if (d.reason) setAiReason(d.reason);
      })
      .catch(() => setAiReason('Failed to generate AI summary.'))
      .finally(() => setAiLoading(false));
  }, [data]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Daily Briefing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {data?.archiveDateRange?.anchor
              ? `Archive date: ${data.archiveDateRange.anchor}`
              : data?.generatedAt
                ? `Generated ${new Date(data.generatedAt).toLocaleString()}`
                : 'Loading...'}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* AI Executive Summary */}
            {(aiLoading || aiSummary || aiReason) && (
              <div className={`rounded-2xl p-6 shadow-sm ${
                aiSummary
                  ? 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800'
                  : 'bg-white dark:bg-gray-800'
              }`}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="text-blue-500">🤖</span> AI Executive Summary
                  {aiLoading && (
                    <span className="ml-2 flex items-center gap-1.5 text-xs text-blue-500 font-normal">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      Generating...
                    </span>
                  )}
                </h2>
                {aiLoading && !aiSummary && (
                  <div className="space-y-2">
                    <div className="h-3 bg-blue-100 dark:bg-blue-900/30 rounded-full w-full animate-pulse" />
                    <div className="h-3 bg-blue-100 dark:bg-blue-900/30 rounded-full w-4/5 animate-pulse" />
                    <div className="h-3 bg-blue-100 dark:bg-blue-900/30 rounded-full w-3/5 animate-pulse" />
                  </div>
                )}
                {aiSummary && (
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                    {aiSummary}
                  </div>
                )}
                {aiReason && !aiSummary && !aiLoading && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">{aiReason}</p>
                )}
              </div>
            )}

            {data.breakingNews.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <span className="text-red-500">⚡</span> Breaking from RSS
                </h2>
                <div className="space-y-3">
                  {data.breakingNews.map((b, i) => (
                    <a key={i} href={b.url} target="_blank" rel="noopener noreferrer"
                       className="block p-3 rounded-xl bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{b.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{b.source} · {hoursAgo(b.publishedAt)}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <span className="text-blue-500">📰</span> Top Stories
              </h2>
              {data.topStories.length === 0 ? (
                <p className="text-sm text-gray-400">No stories found in the last 24 hours.</p>
              ) : (
                <div className="space-y-3">
                  {data.topStories.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                       className="block p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-gray-400">{s.domain}</span>
                        <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${toneBadge(s.tone)}`}>
                          tone {s.tone.toFixed(1)}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {data.emergingNarratives.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <span className="text-amber-500">🔥</span> Emerging Narratives
                </h2>
                <div className="space-y-2">
                  {data.emergingNarratives.map((n, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${n.tone > 0 ? 'bg-green-500' : n.tone < 0 ? 'bg-red-500' : 'bg-gray-400'}`} />
                      <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{n.title}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{n.domain}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Today's Stats</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.stats.articlesToday}</p>
                  <p className="text-xs text-gray-500 mt-1">Articles Today</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">{data.stats.articlesYesterday}</p>
                  <p className="text-xs text-gray-500 mt-1">Yesterday</p>
                </div>
              </div>
            </div>

            {data.sentimentShifts.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Sentiment Shifts</h2>
                <div className="space-y-3">
                  {data.sentimentShifts.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.country}</span>
                      <span className={`text-sm font-bold ${s.change > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {s.change > 0 ? '+' : ''}{s.change.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.coverageByCountry.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Coverage by Country</h2>
                <div className="space-y-2">
                  {data.coverageByCountry.map((c, i) => {
                    const maxCount = Math.max(...data.coverageByCountry.map(x => x.count));
                    const pct = maxCount > 0 ? (c.count / maxCount) * 100 : 0;
                    return (
                      <div key={i} className="relative">
                        <div className="flex items-center justify-between text-sm py-1.5 px-2 relative z-10">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{c.country}</span>
                          <span className="text-gray-500 dark:text-gray-400">{c.count}</span>
                        </div>
                        <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/20 rounded-lg" style={{ width: `${pct}%` }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
