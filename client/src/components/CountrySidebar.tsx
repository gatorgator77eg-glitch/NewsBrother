import React, { useEffect, useState } from 'react';

interface CountryArticle {
  title: string;
  url: string;
  excerpt: string;
  published_at: string;
  source_name: string;
  bias: string;
  credibility_score: number;
}

const BIAS_BADGE: Record<string, string> = {
  left: 'bg-blue-500/20 text-blue-400',
  'lean-left': 'bg-sky-500/20 text-sky-400',
  center: 'bg-gray-500/20 text-gray-400',
  'lean-right': 'bg-orange-500/20 text-orange-400',
  right: 'bg-red-500/20 text-red-400',
};

const BIAS_LABEL: Record<string, string> = {
  left: 'Left',
  'lean-left': 'Lean Left',
  center: 'Center',
  'lean-right': 'Lean Right',
  right: 'Right',
};

interface CountrySidebarProps {
  country: string;
  onClose: () => void;
}

export default function CountrySidebar({ country, onClose }: CountrySidebarProps) {
  const [articles, setArticles] = useState<CountryArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/world-map/country/${encodeURIComponent(country)}`)
      .then(r => r.json())
      .then(data => {
        setArticles(data.articles || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [country]);

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{country}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {articles.length} recent articles
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Articles list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400 text-sm">Loading articles...</div>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400 text-sm">No articles found</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {articles.map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 mb-1.5">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                        {article.excerpt}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${BIAS_BADGE[article.bias] || BIAS_BADGE.center}`}>
                        {BIAS_LABEL[article.bias] || article.bias}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {article.source_name}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                        {timeAgo(article.published_at)}
                      </span>
                    </div>
                    {article.credibility_score != null && (
                      <div className="mt-1.5">
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${(article.credibility_score * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
