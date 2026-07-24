import { useState, useEffect } from 'react';
import { getHealth, type HealthStatus } from '../api';

export default function HealthIndicator() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      getHealth()
        .then(h => { if (mounted) { setHealth(h); setError(false); } })
        .catch(() => { if (mounted) setError(true); });
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (error) return null;
  if (!health || !health.news) return null;

  try {
    const latestArticle = health.news.latestArticle;
    const age = latestArticle
      ? Math.round((Date.now() - new Date(latestArticle).getTime()) / 3600000)
      : null;

    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="font-medium text-gray-700 dark:text-gray-300">Live</span>
        </div>
        <div className="h-3 w-px bg-gray-200 dark:bg-gray-600" />
        <span className="text-gray-500 dark:text-gray-400">
          {(health.news.articles || 0).toLocaleString()} articles
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="text-gray-500 dark:text-gray-400">
          {health.news.sources || 0} sources
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="text-gray-500 dark:text-gray-400">
          {(health.stocks?.tickers || 0).toLocaleString()} tickers
        </span>
        {age !== null && age >= 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className={`font-medium ${age < 6 ? 'text-green-600 dark:text-green-400' : age < 24 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400'}`}>
              {age < 1 ? '<1h' : age < 24 ? `${age}h` : `${Math.round(age / 24)}d`} ago
            </span>
          </>
        )}
      </div>
    );
  } catch {
    return null;
  }
}
