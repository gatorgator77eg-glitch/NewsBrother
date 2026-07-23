import { useState, useEffect } from 'react';

interface Props {
  topicId: number;
  onClose: () => void;
  onCompare: (left: any, right: any) => void;
}

const BIAS_COLUMNS = ['left', 'lean-left', 'center', 'lean-right', 'right'] as const;
const BIAS_STYLES: Record<string, { bg: string; badge: string; label: string }> = {
  left: { bg: 'bg-blue-50/70 dark:bg-blue-950/20', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', label: 'LEFT' },
  'lean-left': { bg: 'bg-green-50/50 dark:bg-green-950/20', badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', label: 'LEAN LEFT' },
  center: { bg: 'bg-gray-50/70 dark:bg-gray-800/30', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', label: 'CENTER' },
  'lean-right': { bg: 'bg-orange-50/50 dark:bg-orange-950/20', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', label: 'LEAN RIGHT' },
  right: { bg: 'bg-red-50/70 dark:bg-red-950/20', badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', label: 'RIGHT' },
};

export default function TopicDetailModal({ topicId, onClose, onCompare }: Props) {
  const [topic, setTopic] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/topics/${topicId}`)
      .then(r => r.json())
      .then(data => { setTopic(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [topicId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-auto p-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl p-8 text-center">
          <p className="text-gray-500">Topic not found</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[80vh] overflow-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">{topic.topicLabel}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{topic.totalArticles} articles across the spectrum</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {topic.blindspot.length > 0 && (
          <div className="mx-6 mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2">
            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              Blindspot: Missing coverage from {topic.blindspot.join(', ')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-5 gap-3 p-6">
          {BIAS_COLUMNS.map((bias) => {
            const style = BIAS_STYLES[bias];
            const articles = topic.articles[bias] || [];
            return (
              <div key={bias} className={`${style.bg} rounded-xl p-3`}>
                <h3 className={`text-center text-[10px] font-bold uppercase tracking-wider mb-3 px-2 py-1 rounded-full ${style.badge}`}>
                  {style.label}
                </h3>
                <div className="space-y-2">
                  {articles.length === 0 && (
                    <p className="text-xs text-gray-400 italic text-center py-4">No coverage</p>
                  )}
                  {articles.map((article: any) => (
                    <div key={article.id} className="bg-white dark:bg-gray-800 rounded-lg p-2.5 shadow-sm text-xs">
                      <a href={article.url} target="_blank" rel="noopener noreferrer" className="no-underline">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 leading-snug hover:text-blue-600 dark:hover:text-blue-400 line-clamp-3">
                          {article.title}
                        </h4>
                      </a>
                      <p className="text-gray-400 mt-1 font-medium">{article.source_name}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
