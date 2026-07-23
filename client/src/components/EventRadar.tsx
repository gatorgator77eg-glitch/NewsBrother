import { useState, useEffect, useCallback } from 'react';
import { getEvents } from '../api';
import type { EventsResponse, MarketEvent } from '../api';
import EventCard from './EventCard';
import ImpactDashboard from './ImpactDashboard';

const CATEGORIES = [
  { value: 'all', label: 'All Events' },
  { value: 'CONFLICT', label: 'Military' },
  { value: 'TARIFF', label: 'Tariffs' },
  { value: 'SANCTIONS', label: 'Sanctions' },
  { value: 'RATE_CUT', label: 'Rate Cuts' },
  { value: 'RATE_HIKE', label: 'Rate Hikes' },
  { value: 'ELECTION', label: 'Elections' },
  { value: 'SUPPLY_CHAIN', label: 'Supply Chain' },
  { value: 'POLITICAL_CRISIS', label: 'Crisis' },
  { value: 'REGULATION', label: 'Regulation' },
];

const TIME_OPTIONS = [
  { value: 3, label: 'Last 3h' },
  { value: 6, label: 'Last 6h' },
  { value: 12, label: 'Last 12h' },
  { value: 24, label: 'Last 24h' },
];

const SEVERITY_FILTER = ['all', 'critical', 'high', 'elevated', 'moderate', 'low'] as const;

interface Props {
  onBack: () => void;
}

export default function EventRadar({ onBack }: Props) {
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(6);
  const [category, setCategory] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEvents(hours, category === 'all' ? undefined : category);
      setData(result);
      setLastRefresh(new Date());
    } catch {
      setError('Failed to load events. GDELT may be slow — try again.');
    }
    setLoading(false);
  }, [hours, category]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredEvents = data?.events.filter(e =>
    severityFilter === 'all' || e.severity === severityFilter
  ) || [];

  const refreshLabel = () => {
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Event Radar
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Political event detection for market impact · Auto-refreshes every 5 min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Updated {refreshLabel()}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400 disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Time Range */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setHours(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                hours === opt.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm">
          {CATEGORIES.slice(0, 6).map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                category === cat.value
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {cat.label}
            </button>
          ))}
          {CATEGORIES.length > 6 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs font-medium bg-transparent text-gray-600 dark:text-gray-400 border-none focus:outline-none cursor-pointer"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm">
          {SEVERITY_FILTER.map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-all ${
                severityFilter === sev
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: 3-column layout */}
      <div className="flex gap-5 min-h-[calc(100vh-280px)]">
        {/* Left: Event Feed */}
        <div className="flex-1 min-w-0">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 mb-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {loading && !data && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 animate-pulse">
                  <div className="flex gap-3 mb-3">
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                  </div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {!loading && filteredEvents.length === 0 && !error && (
            <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm font-medium">No events detected</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                  Try expanding the time range or changing filters
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {filteredEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>

        {/* Right: Impact Dashboard */}
        <div className="w-72 flex-shrink-0">
          <ImpactDashboard data={data} loading={loading} />
        </div>
      </div>
    </div>
  );
}
