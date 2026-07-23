import { useState, useCallback, useEffect, useRef } from 'react';
import SearchBar from './components/SearchBar';
import FilterPills from './components/FilterPills';
import ThreeColumnLayout from './components/ThreeColumnLayout';
import KnowledgeGraph from './components/KnowledgeGraph';
import CompareDrawer from './components/CompareDrawer';
import BlindspotAlert from './components/BlindspotAlert';
import ThemeToggle from './components/ThemeToggle';
import Toast from './components/Toast';
import LoadingSkeleton from './components/LoadingSkeleton';
import TopicDetailModal from './components/TopicDetailModal';
import FeedManager from './components/FeedManager';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import CoverageDashboard from './components/CoverageDashboard';
import LiveSearch from './components/LiveSearch';
import EventRadar from './components/EventRadar';
import { searchTopics, getBreakingNews, getBreakingGraph, searchGraph, type GraphData } from './api';
import type { StoryNode } from '../../shared/types';

type CompareItem = {
  leftTitle: string;
  rightTitle: string;
  leftSource: string;
  rightSource: string;
  leftExcerpt?: string;
  rightExcerpt?: string;
};

export default function App() {
  const [results, setResults] = useState<StoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [compareItem, setCompareItem] = useState<CompareItem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [topicDetailId, setTopicDetailId] = useState<number | null>(null);
  const [showFeeds, setShowFeeds] = useState(false);
  const [viewMode, setViewMode] = useState<'columns' | 'graph'>('columns');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const resultsCountRef = useRef(0);

  useEffect(() => {
    resultsCountRef.current = results.length;
  }, [results.length]);

  useEffect(() => {
    if (viewMode === 'graph' && loaded && results.length > 0 && !graphData) {
      const loadGraph = async () => {
        setGraphLoading(true);
        try {
          if (query === 'Breaking News') {
            const graphResult = await getBreakingGraph();
            setGraphData(graphResult);
          } else {
            const graphResult = await searchGraph(query);
            setGraphData(graphResult);
          }
        } catch {
          console.error('Failed to load graph data');
        }
        setGraphLoading(false);
      };
      loadGraph();
    }
  }, [viewMode, loaded, results.length, graphData, query]);

  const handleSearch = async (q: string, pageNum: number = 1) => {
    setLoading(true);
    setError(null);
    setQuery(q);
    setGraphData(null);
    try {
      const data = await searchTopics(q, pageNum);
      if (pageNum === 1) {
        setResults(data.nodes);
      } else {
        setResults(prev => [...prev, ...data.nodes]);
      }
      setHasMore(data.nodes.length > 0 && (data.total || 0) > resultsCountRef.current + data.nodes.length);
      setPage(pageNum);
      setLoaded(true);

      if (viewMode === 'graph') {
        setGraphLoading(true);
        try {
          const graphResult = await searchGraph(q);
          setGraphData(graphResult);
        } catch {
          console.error('Failed to load graph data');
        }
        setGraphLoading(false);
      }
    } catch (err) {
      setError('Search failed. Please try again.');
      console.error('Search failed:', err);
    }
    setLoading(false);
  };

  const handleBreakingNews = async () => {
    setLoading(true);
    setError(null);
    setGraphData(null);
    try {
      const data = await getBreakingNews();
      setResults(data.nodes);
      setQuery('Breaking News');
      setLoaded(true);
      setHasMore(false);

      setGraphLoading(true);
      try {
        const graphResult = await getBreakingGraph();
        setGraphData(graphResult);
      } catch {
        console.error('Failed to load breaking graph');
      }
      setGraphLoading(false);
    } catch (err) {
      setError('Failed to load breaking news.');
      console.error('Failed to load breaking news:', err);
    }
    setLoading(false);
  };

  const handleSidebarAction = (action: string) => {
    switch (action) {
      case 'home':
        setResults([]);
        setLoaded(false);
        setQuery('');
        setGraphData(null);
        setShowSettings(false);
        setShowCoverage(false);
        setShowSearch(false);
        setShowEvents(false);
        break;
      case 'feeds':
        setShowFeeds(true);
        setShowSettings(false);
        setShowCoverage(false);
        setShowSearch(false);
        setShowEvents(false);
        break;
      case 'settings':
        setShowSettings(true);
        setShowFeeds(false);
        setShowCoverage(false);
        setShowSearch(false);
        setShowEvents(false);
        break;
      case 'coverage':
        setShowCoverage(true);
        setShowSettings(false);
        setShowFeeds(false);
        setShowSearch(false);
        setShowEvents(false);
        break;
      case 'search':
        setShowSearch(true);
        setShowSettings(false);
        setShowCoverage(false);
        setShowFeeds(false);
        setShowEvents(false);
        break;
      case 'events':
        setShowEvents(true);
        setShowSettings(false);
        setShowCoverage(false);
        setShowSearch(false);
        setShowFeeds(false);
        break;
    }
  };

  const handleCompare = (left: any, right?: any) => {
    if (right) {
      setCompareItem({
        leftTitle: left.title,
        rightTitle: right.title,
        leftSource: left.source_name || 'Unknown',
        rightSource: right.source_name || 'Unknown',
        leftExcerpt: left.excerpt,
        rightExcerpt: right.excerpt,
      });
    } else {
      const rightArticles = results.flatMap(n => n.articles['right'] || []);
      const bestMatch = rightArticles.find((r: any) => {
        const leftWords = left.title.toLowerCase().split(/\s+/);
        const rightWords = r.title.toLowerCase().split(/\s+/);
        return leftWords.some((w: string) => w.length > 4 && rightWords.includes(w));
      }) || rightArticles[0];

      if (bestMatch) {
        setCompareItem({
          leftTitle: left.title,
          rightTitle: bestMatch.title,
          leftSource: left.source_name || 'Unknown',
          rightSource: bestMatch.source_name || 'Unknown',
          leftExcerpt: left.excerpt,
          rightExcerpt: bestMatch.excerpt,
        });
      }
    }
  };

  const blindspotNodes = results.filter(n => n.blindspot && n.blindspot.length > 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}

      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40 transition-colors">
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
                aria-label="Toggle menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                <span className="text-blue-600">Political</span>
                <span className="text-gray-400 mx-1">|</span>
                <span className="text-gray-700 dark:text-gray-300">Map News</span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {loaded && (
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('columns')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      viewMode === 'columns'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Columns
                  </button>
                  <button
                    onClick={() => setViewMode('graph')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      viewMode === 'graph'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Graph
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowFeeds(!showFeeds)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showFeeds ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}
              >
                {showFeeds ? 'Hide Feeds' : 'RSS Sources'}
              </button>
              <ThemeToggle />
            </div>
          </div>
          <SearchBar onSearch={(q) => handleSearch(q, 1)} onBreaking={handleBreakingNews} loading={loading} />
          <FilterPills active={activeFilter} onSelect={setActiveFilter} />
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {showFeeds && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <FeedManager />
          </div>
        )}

        {showSettings ? (
          <Settings onBack={() => setShowSettings(false)} />
        ) : showCoverage ? (
          <CoverageDashboard
            onBack={() => setShowCoverage(false)}
            onTopicClick={setTopicDetailId}
          />
        ) : showSearch ? (
          <LiveSearch
            onBack={() => setShowSearch(false)}
            onCompare={handleCompare}
            onTopicClick={setTopicDetailId}
          />
        ) : showEvents ? (
          <EventRadar onBack={() => setShowEvents(false)} />
        ) : (
          <>
            {loading && page === 1 && <LoadingSkeleton />}

            {!loading && !loaded && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🗺️</div>
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  Search a topic or click "Breaking News" to see coverage across the political spectrum.
                </p>
                <div className="flex justify-center gap-6 mt-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-2">
                      <span className="text-2xl">🔍</span>
                    </div>
                    <p className="text-xs text-gray-400">Search Any Topic</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-2">
                      <span className="text-2xl">⚡</span>
                    </div>
                    <p className="text-xs text-gray-400">Breaking News</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-2">
                      <span className="text-2xl">👁️</span>
                    </div>
                    <p className="text-xs text-gray-400">Find Blindspots</p>
                  </div>
                </div>
              </div>
            )}

            {!loading && loaded && results.length === 0 && (
              <div className="text-center py-20">
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  No results found for "{query}". Try a different search term.
                </p>
              </div>
            )}

            {!loading && loaded && blindspotNodes.length > 0 && (
              <BlindspotAlert nodes={blindspotNodes} />
            )}

            {results.length > 0 && (
              <>
                {viewMode === 'columns' ? (
                  <ThreeColumnLayout
                    nodes={results}
                    activeFilter={activeFilter}
                    onCompare={handleCompare}
                    onTopicClick={setTopicDetailId}
                  />
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
                    {graphLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                      </div>
                    ) : graphData && graphData.nodes.length > 0 ? (
                      <KnowledgeGraph
                        data={graphData}
                        onNodeClick={(node) => {
                          if (node.type === 'cluster') {
                            const topicId = parseInt(node.id.replace('cluster-', ''));
                            if (!isNaN(topicId)) setTopicDetailId(topicId);
                          } else if (node.type === 'article' && node.url) {
                            window.open(node.url, '_blank');
                          }
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        No graph data available
                      </div>
                    )}
                  </div>
                )}

                {hasMore && !loading && (
                  <div className="text-center mt-6">
                    <button
                      onClick={() => handleSearch(query, page + 1)}
                      className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Load More Results
                    </button>
                  </div>
                )}

                {loading && page > 1 && (
                  <div className="text-center mt-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {compareItem && (
        <CompareDrawer item={compareItem} onClose={() => setCompareItem(null)} />
      )}

      {topicDetailId && (
        <TopicDetailModal
          topicId={topicDetailId}
          onClose={() => setTopicDetailId(null)}
          onCompare={handleCompare}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAction={handleSidebarAction}
      />
    </div>
  );
}
