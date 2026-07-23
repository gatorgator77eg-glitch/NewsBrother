import { useState, useEffect, useCallback, useRef } from 'react';
import { searchGoogleNews, getBreakingNews } from '../api';
import type { GoogleNewsArticle } from '../api';
import type { StoryNode } from '../../../shared/types';

const RECENT_KEY = 'politicalNewsRecentSearches';
const MAX_RECENT = 5;
const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

const WHEN_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'day', label: 'Past 24h' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
];

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface Props {
  onBack: () => void;
  onCompare: (left: any, right?: any) => void;
  onTopicClick: (topicId: number) => void;
}

export default function LiveSearch({ onBack, onCompare, onTopicClick }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<GoogleNewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trending, setTrending] = useState<{ id: number; label: string; count: number }[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [query, setQuery] = useState('');
  const [when, setWhen] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}

    const loadTrending = async () => {
      try {
        const data = await getBreakingNews();
        const nodes = (data.nodes || []).slice(0, 5);
        setTrending(nodes.map((n: StoryNode) => ({
          id: n.id,
          label: n.topicLabel,
          count: n.totalArticles,
        })));
      } catch {}
    };
    loadTrending();
  }, []);

  const saveRecent = useCallback((q: string) => {
    setRecentSearches(prev => {
      const updated = [q, ...prev.filter(r => r !== q)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const doSearch = useCallback(async (q: string, pageNum: number = 1, timeFilter?: string) => {
    if (!q.trim()) return;
    if (pageNum === 1) setLoading(true);
    setError(null);
    setHasSearched(true);
    setQuery(q);
    latestQueryRef.current = q;

    if (pageNum === 1) saveRecent(q.trim());

    try {
      const data = await searchGoogleNews(q, pageNum, 20, timeFilter);
      if (latestQueryRef.current !== q) return;

      if (pageNum === 1) {
        setResults(data.articles);
      } else {
        setResults(prev => [...prev, ...data.articles]);
      }
      setTotal(data.total);
      setPage(pageNum);
    } catch {
      setError('Search failed. Please try again.');
    }
    setLoading(false);
  }, [saveRecent]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (inputValue.trim().length < MIN_CHARS) {
      setResults([]);
      setHasSearched(false);
      setQuery('');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    debounceRef.current = setTimeout(() => {
      doSearch(inputValue, 1, when || undefined);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [inputValue, when, doSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    doSearch(inputValue, 1, when || undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
      doSearch(inputValue, 1, when || undefined);
    }
  };

  return (
    <div className="flex gap-6 min-h-[calc(100vh-200px)]">
      <div className="w-72 flex-shrink-0 space-y-6">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search news..."
              className="w-full px-4 py-3 pr-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              autoFocus
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => { setInputValue(''); setResults([]); setHasSearched(false); }}
                className="absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400 disabled:opacity-30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </form>

        {recentSearches.length > 0 && !hasSearched && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Recent</h3>
            <div className="space-y-1">
              {recentSearches.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setInputValue(q)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="truncate">{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {trending.length > 0 && !hasSearched && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Trending</h3>
            <div className="space-y-1">
              {trending.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setInputValue(t.label)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                  <span className="truncate flex-1 text-left">{t.label}</span>
                  <span className="text-[10px] text-gray-300 dark:text-gray-600">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {hasSearched && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Time range</h3>
            <div className="space-y-1">
              {WHEN_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setWhen(opt.value)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    when === opt.value
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {hasSearched && query && (
          <div className="mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {loading ? (
                'Searching Google News...'
              ) : (
                <>About {total} results for "<span className="font-medium text-gray-700 dark:text-gray-300">{query}</span>"</>
              )}
            </p>
          </div>
        )}

        {!hasSearched && (
          <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">Start typing to search Google News</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Real-time results as you type</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        )}

        {!loading && hasSearched && results.length === 0 && !error && query && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No results found for "{query}". Try a different search term.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {results.map((article, idx) => (
            <a
              key={`${article.link}-${idx}`}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 hover:shadow-md dark:hover:shadow-gray-900/50 transition-all group"
            >
              <div className="flex gap-4">
                {article.imageUrl && (
                  <img
                    src={article.imageUrl}
                    alt=""
                    className="w-28 h-20 object-cover rounded-xl flex-shrink-0 hidden sm:block"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 mb-1">
                    {article.title}
                  </h3>
                  {article.snippet && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                      {article.snippet}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
                    <span className="font-medium text-gray-600 dark:text-gray-300">{article.source}</span>
                    {article.publishedAt && (
                      <span>{timeAgo(article.publishedAt)}</span>
                    )}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>

        {!loading && results.length > 0 && results.length < total && (
          <div className="text-center mt-6">
            <button
              onClick={() => doSearch(query, page + 1, when || undefined)}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
