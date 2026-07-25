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
import StockHistory from './components/StockLibrary';
import MarketAnalytics from './components/MarketAnalytics';
import NewsVsPrice from './components/NewsVsPrice';
import NewsArchive from './components/NewsArchive';
import Janus from './components/Janus';
import Sentiment from './components/Sentiment';
import LocalGPU from './components/LocalGPU';
import CorrelationEngine from './components/CorrelationEngine';
import DailyBriefing from './components/DailyBriefing';
import Watchlist from './components/Watchlist';
import Alerts from './components/Alerts';
import TimelineExplorer from './components/TimelineExplorer';
import BiasComparator from './components/BiasComparator';
import SmartVelocityScanner from './components/SmartVelocityScanner';
import SmartPriceImpact from './components/SmartPriceImpact';
import SmartLeadLag from './components/SmartLeadLag';
import SmartHeatmap from './components/SmartHeatmap';
import MathRegression from './components/MathRegression';
import MathCorrelation from './components/MathCorrelation';
import MathDistribution from './components/MathDistribution';
import MathVolatility from './components/MathVolatility';
import MathTimeSeries from './components/MathTimeSeries';
import MathAdvanced from './components/MathAdvanced';
import SrsProducts from './components/SrsProducts';
import SrsDashboard from './components/SrsDashboard';
import SrsAdvisor from './components/SrsAdvisor';
import HelpGuide from './components/HelpGuide';
import HealthIndicator from './components/HealthIndicator';
import TickerSearch from './components/TickerSearch';
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
  const [showStocks, setShowStocks] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showNewsVsPrice, setShowNewsVsPrice] = useState(false);
  const [showNewsArchive, setShowNewsArchive] = useState(false);
  const [showJanus, setShowJanus] = useState(false);
  const [showSentiment, setShowSentiment] = useState(false);
  const [showLocalGpu, setShowLocalGpu] = useState(false);
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showBiasCompare, setShowBiasCompare] = useState(false);
  const [showSmartVelocity, setShowSmartVelocity] = useState(false);
  const [showSmartImpact, setShowSmartImpact] = useState(false);
  const [showSmartLeadLag, setShowSmartLeadLag] = useState(false);
  const [showSmartHeatmap, setShowSmartHeatmap] = useState(false);
  const [showMathRegression, setShowMathRegression] = useState(false);
  const [showMathCorrelation, setShowMathCorrelation] = useState(false);
  const [showMathDistribution, setShowMathDistribution] = useState(false);
  const [showMathVolatility, setShowMathVolatility] = useState(false);
  const [showMathTimeSeries, setShowMathTimeSeries] = useState(false);
  const [showMathAdvanced, setShowMathAdvanced] = useState(false);
  const [showSrs, setShowSrs] = useState(false);
  const [showSrsDashboard, setShowSrsDashboard] = useState(false);
  const [showSrsAdvisor, setShowSrsAdvisor] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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

  const hideAll = () => {
    setShowFeeds(false);
    setShowSettings(false);
    setShowCoverage(false);
    setShowSearch(false);
    setShowEvents(false);
    setShowStocks(false);
    setShowAnalytics(false);
    setShowNewsVsPrice(false);
    setShowNewsArchive(false);
    setShowJanus(false);
    setShowSentiment(false);
    setShowLocalGpu(false);
    setShowCorrelation(false);
    setShowBriefing(false);
    setShowWatchlist(false);
    setShowAlerts(false);
    setShowTimeline(false);
    setShowBiasCompare(false);
    setShowSmartVelocity(false);
    setShowSmartImpact(false);
    setShowSmartLeadLag(false);
    setShowSmartHeatmap(false);
    setShowMathRegression(false);
    setShowMathCorrelation(false);
    setShowMathDistribution(false);
    setShowMathVolatility(false);
    setShowMathTimeSeries(false);
    setShowMathAdvanced(false);
    setShowSrs(false);
    setShowSrsDashboard(false);
    setShowSrsAdvisor(false);
    setShowHelp(false);
  };

  const handleSidebarAction = (action: string) => {
    switch (action) {
      case 'home':
        setResults([]);
        setLoaded(false);
        setQuery('');
        setGraphData(null);
        hideAll();
        break;
      case 'feeds':
        hideAll();
        setShowFeeds(true);
        break;
      case 'settings':
        hideAll();
        setShowSettings(true);
        break;
      case 'coverage':
        hideAll();
        setShowCoverage(true);
        break;
      case 'search':
        hideAll();
        setShowSearch(true);
        break;
      case 'events':
        hideAll();
        setShowEvents(true);
        break;
      case 'stocks':
        hideAll();
        setShowStocks(true);
        break;
      case 'analytics':
        hideAll();
        setShowAnalytics(true);
        break;
      case 'news-vs-price':
        hideAll();
        setShowNewsVsPrice(true);
        break;
      case 'news-archive':
        hideAll();
        setShowNewsArchive(true);
        break;
      case 'janus-command':
      case 'janus-echo':
      case 'janus-volatility':
      case 'janus-shockwave':
      case 'janus-credibility':
      case 'janus-research':
        hideAll();
        setShowJanus(true);
        break;
      case 'sentiment':
        hideAll();
        setShowSentiment(true);
        break;
      case 'gpu-monitor':
      case 'llm-chat':
      case 'llm-sentiment':
      case 'llm-vectors':
      case 'llm-analytics':
      case 'llm-settings':
        hideAll();
        setShowLocalGpu(true);
        break;
      case 'correlation':
        hideAll();
        setShowCorrelation(true);
        break;
      case 'briefing':
        hideAll();
        setShowBriefing(true);
        break;
      case 'watchlist':
        hideAll();
        setShowWatchlist(true);
        break;
      case 'alerts':
        hideAll();
        setShowAlerts(true);
        break;
      case 'timeline':
        hideAll();
        setShowTimeline(true);
        break;
      case 'bias-compare':
        hideAll();
        setShowBiasCompare(true);
        break;
      case 'smart-velocity':
        hideAll();
        setShowSmartVelocity(true);
        break;
      case 'smart-impact':
        hideAll();
        setShowSmartImpact(true);
        break;
      case 'smart-leadlag':
        hideAll();
        setShowSmartLeadLag(true);
        break;
      case 'smart-heatmap':
        hideAll();
        setShowSmartHeatmap(true);
        break;
      case 'math-regression':
        hideAll();
        setShowMathRegression(true);
        break;
      case 'math-correlation':
        hideAll();
        setShowMathCorrelation(true);
        break;
      case 'math-distribution':
        hideAll();
        setShowMathDistribution(true);
        break;
      case 'math-volatility':
        hideAll();
        setShowMathVolatility(true);
        break;
      case 'math-timeseries':
        hideAll();
        setShowMathTimeSeries(true);
        break;
      case 'math-advanced':
        hideAll();
        setShowMathAdvanced(true);
        break;
      case 'srs':
        hideAll();
        setShowSrs(true);
        break;
      case 'srs-dashboard':
      case 'srs-signals':
        hideAll();
        setShowSrsDashboard(true);
        break;
      case 'srs-advisor':
        hideAll();
        setShowSrsAdvisor(true);
        break;
      case 'help':
        hideAll();
        setShowHelp(true);
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
  const isHomePage = !showSettings && !showCoverage && !showSearch && !showEvents && !showStocks && !showAnalytics && !showNewsVsPrice && !showNewsArchive && !showJanus && !showSentiment && !showLocalGpu && !showCorrelation && !showBriefing && !showWatchlist && !showAlerts && !showTimeline && !showBiasCompare && !showSmartVelocity && !showSmartImpact && !showSmartLeadLag && !showSmartHeatmap && !showMathRegression && !showMathCorrelation && !showMathDistribution && !showMathVolatility && !showMathTimeSeries && !showMathAdvanced && !showSrs && !showSrsDashboard && !showSrsAdvisor && !showHelp;

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
              <TickerSearch />
              {loaded && isHomePage && (
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
              {isHomePage && (
                <button
                  onClick={() => setShowFeeds(!showFeeds)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showFeeds ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}
                >
                  {showFeeds ? 'Hide Feeds' : 'RSS Sources'}
                </button>
              )}
              <ThemeToggle />
            </div>
          </div>
          {isHomePage && (
            <>
              <SearchBar onSearch={(q) => handleSearch(q, 1)} onBreaking={handleBreakingNews} loading={loading} />
              <FilterPills active={activeFilter} onSelect={setActiveFilter} />
            </>
          )}
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {isHomePage && !loaded && (
          <div className="mb-4 flex justify-center">
            <HealthIndicator />
          </div>
        )}

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
        ) : showStocks ? (
          <StockHistory onBack={() => setShowStocks(false)} />
        ) : showAnalytics ? (
          <MarketAnalytics onBack={() => setShowAnalytics(false)} />
        ) : showNewsVsPrice ? (
          <NewsVsPrice onBack={() => setShowNewsVsPrice(false)} />
        ) : showNewsArchive ? (
          <NewsArchive onBack={() => setShowNewsArchive(false)} />
        ) : showJanus ? (
          <Janus onBack={() => setShowJanus(false)} />
        ) : showSentiment ? (
          <Sentiment onBack={() => setShowSentiment(false)} />
        ) : showLocalGpu ? (
          <LocalGPU onBack={() => setShowLocalGpu(false)} />
        ) : showCorrelation ? (
          <CorrelationEngine onBack={() => setShowCorrelation(false)} />
        ) : showBriefing ? (
          <DailyBriefing onBack={() => setShowBriefing(false)} />
        ) : showWatchlist ? (
          <Watchlist onBack={() => setShowWatchlist(false)} />
        ) : showAlerts ? (
          <Alerts onBack={() => setShowAlerts(false)} />
        ) : showTimeline ? (
          <TimelineExplorer onBack={() => setShowTimeline(false)} />
        ) : showBiasCompare ? (
          <BiasComparator onBack={() => setShowBiasCompare(false)} />
        ) : showSmartVelocity ? (
          <SmartVelocityScanner onBack={() => setShowSmartVelocity(false)} />
        ) : showSmartImpact ? (
          <SmartPriceImpact onBack={() => setShowSmartImpact(false)} />
        ) : showSmartLeadLag ? (
          <SmartLeadLag onBack={() => setShowSmartLeadLag(false)} />
        ) : showSmartHeatmap ? (
          <SmartHeatmap onBack={() => setShowSmartHeatmap(false)} />
        ) : showMathRegression ? (
          <MathRegression onBack={() => setShowMathRegression(false)} />
        ) : showMathCorrelation ? (
          <MathCorrelation onBack={() => setShowMathCorrelation(false)} />
        ) : showMathDistribution ? (
          <MathDistribution onBack={() => setShowMathDistribution(false)} />
        ) : showMathVolatility ? (
          <MathVolatility onBack={() => setShowMathVolatility(false)} />
        ) : showMathTimeSeries ? (
          <MathTimeSeries onBack={() => setShowMathTimeSeries(false)} />
        ) : showMathAdvanced ? (
          <MathAdvanced onBack={() => setShowMathAdvanced(false)} />
        ) : showSrs ? (
          <SrsProducts onBack={() => setShowSrs(false)} />
        ) : showSrsDashboard ? (
          <SrsDashboard onBack={() => setShowSrsDashboard(false)} />
        ) : showSrsAdvisor ? (
          <SrsAdvisor onBack={() => setShowSrsAdvisor(false)} />
        ) : showHelp ? (
          <HelpGuide onBack={() => setShowHelp(false)} />
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
