import { useState, useEffect } from 'react';

const BIAS_COLORS: Record<string, string> = {
  left: 'bg-blue-100 text-blue-800',
  'lean-left': 'bg-green-100 text-green-800',
  center: 'bg-gray-100 text-gray-600',
  'lean-right': 'bg-orange-100 text-orange-800',
  right: 'bg-red-100 text-red-800',
};

export default function FeedManager() {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/feeds')
      .then(r => r.json())
      .then(data => { setFeeds(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter ? feeds.filter(f => f.bias === filter) : feeds;
  const biasCounts = feeds.reduce((acc: Record<string, number>, f: any) => {
    acc[f.bias] = (acc[f.bias] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-gray-100">RSS Sources</h3>
        <span className="text-sm text-gray-400">{feeds.length} feeds</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${!filter ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}
        >
          All ({feeds.length})
        </button>
        {Object.entries(biasCounts).map(([bias, count]) => (
          <button
            key={bias}
            onClick={() => setFilter(filter === bias ? null : bias)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filter === bias ? 'bg-gray-800 text-white' : `${BIAS_COLORS[bias]} hover:opacity-80`}`}
          >
            {bias.replace('-', ' ')} ({count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto">
          {filtered.map((feed) => (
            <div key={feed.id} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${BIAS_COLORS[feed.bias]}`}>
                {feed.bias.replace('-', ' ').toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{feed.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{feed.url}</p>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-10 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(feed.credibility_score || 0.5) * 100}%` }} />
                </div>
                <span className="text-[9px] text-gray-400">{Math.round((feed.credibility_score || 0.5) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
