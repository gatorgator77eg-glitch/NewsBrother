================================================================================
POLITICAL | MAP NEWS — Code Architecture Documentation
Version: 1.0
Last Updated: 2026-07-23
================================================================================

This document provides a deep-dive into the codebase: how every file works,
how data flows through the system, and how to extend the application.

================================================================================
TABLE OF CONTENTS
================================================================================

 1.  System Overview (Data Flow Diagram)
 2.  Client Architecture
     2.1  App.tsx — The Shell
     2.2  api.ts — API Client
     2.3  Navigation Pattern
     2.4  Component Inventory
 3.  Server Architecture
     3.1  index.ts — Server Bootstrap
     3.2  db.ts — News Database Layer
     3.3  utils.ts — Result Conversion
     3.4  ingestor.ts — RSS Pipeline
     3.5  clustering.ts — Topic Grouping
     3.6  feeds.json — Source Registry
 4.  Stock Subsystem
     4.1  stocks/db.ts — Stock Database Layer
     4.2  stocks/downloader.ts — Node.js Downloaders
     4.3  stocks/batch_download.py — Python Batch Downloader
 5.  Route-by-Route Reference
 6.  Component Deep Dives
 7.  Database Schema Reference
 8.  Shared Types
 9.  Configuration & Scripts
10.  How to Extend

================================================================================
1. SYSTEM OVERVIEW (Data Flow)
================================================================================

  ┌─────────────────────────────────────────────────────────────┐
  │                      CLIENT (Vite)                          │
  │                                                             │
  │  App.tsx ──► Sidebar ──► Page Components                    │
  │     │            │              │                            │
  │     │            └──────────────┘                           │
  │     │         (state-based routing)                         │
  │     │                                                       │
  │     └──► api.ts ──► fetch('/api/...')                       │
  │                        │                                     │
  └────────────────────────┼────────────────────────────────────┘
                           │ HTTP (Vite proxy :3001)
  ┌────────────────────────┼────────────────────────────────────┐
  │                    SERVER (Express)                          │
  │                        │                                     │
  │  ┌─────────────────────┼─────────────────────────────┐      │
  │  │              Route Handlers                        │      │
  │  │  search │ topics │ breaking │ events │ stocks      │      │
  │  │  blindspots │ feeds │ graph │ googleNews          │      │
  │  │  marketAnalytics │ newsVsPrice │ stockHistory     │      │
  │  └─────────────────────┼─────────────────────────────┘      │
  │                        │                                     │
  │  ┌──────────┐  ┌───────┴──────┐  ┌─────────────────┐       │
  │  │ news.db  │  │  ingestor    │  │  stocks.db       │       │
  │  │ (sql.js) │  │  + clustering│  │  (sql.js + Python)│      │
  │  └──────────┘  └──────────────┘  └─────────────────┘       │
  │                        │                                     │
  │  ┌──────────┐  ┌───────┴──────┐  ┌─────────────────┐       │
  │  │ cron     │  │  GDELT API   │  │  Yahoo Finance  │       │
  │  │ (5 min)  │  │  Google News │  │  yfinance (Py)  │       │
  │  └──────────┘  └──────────────┘  └─────────────────┘       │
  └─────────────────────────────────────────────────────────────┘

================================================================================
2. CLIENT ARCHITECTURE
================================================================================

2.1 App.tsx — The Shell
────────────────────────
The single source of truth for which page is visible. All page visibility
is controlled by boolean state flags:

  showSettings, showCoverage, showSearch, showEvents, showStocks,
  showAnalytics, showNewsVsPrice

Page rendering uses a ternary chain:
  {showSettings ? <Settings /> : showCoverage ? <CoverageDashboard /> : ...}

State management is 100% via useState — no Redux, no Context, no router.
The handleSidebarAction() switch statement calls hideAll() first, then sets
the appropriate flag.

Key state pieces:
  results: StoryNode[]       — Search/breaking news results
  query: string              — Current search query
  viewMode: 'columns'|'graph' — View toggle
  graphData: GraphData|null  — Knowledge graph data
  compareItem: CompareItem|null — Side-by-side comparison drawer
  topicDetailId: number|null — Topic detail modal

2.2 api.ts — API Client
─────────────────────────
Centralized API client with typed interfaces. Every function:
  1. Constructs the URL with query params
  2. Calls fetch() with error handling
  3. Returns typed JSON

Exported functions:
  searchTopics(q, page, bias?)     → GET /api/search
  getTopic(id)                     → GET /api/topics/:id
  getBlindspots()                  → GET /api/blindspots
  getFeeds()                       → GET /api/feeds
  getBreakingNews()                → GET /api/breaking
  getBreakingGraph()               → GET /api/graph/breaking
  searchGraph(q, bias?)            → GET /api/graph/search
  getTopicGraph(topicId)           → GET /api/graph/topic/:id
  searchGoogleNews(q, page, pageSize, when?) → GET /api/google-news
  getEvents(hours, category?)      → GET /api/events

Stock-related fetches are done inline in StockLibrary.tsx and NewsVsPrice.tsx
(direct fetch() calls) rather than going through api.ts.

2.3 Navigation Pattern
───────────────────────
  1. User clicks sidebar item
  2. Sidebar calls onAction(action_string)
  3. App.tsx handleSidebarAction() runs hideAll() + sets target flag
  4. Ternary chain in JSX renders the correct page component
  5. Page component receives onBack() prop to return to home

2.4 Component Inventory
────────────────────────
  App.tsx              — Main shell (440 lines)
  Sidebar.tsx          — Dynamic navigation menu (121 lines)
  SearchBar.tsx        — Home page search bar
  FilterPills.tsx      — Topic filter buttons
  ThreeColumnLayout.tsx — Bias-sorted article columns
  ArticleCard.tsx      — Individual article with source badge
  CompareDrawer.tsx    — Side-by-side headline comparison
  BlindspotAlert.tsx   — Missing coverage warnings
  TopicDetailModal.tsx — Full topic detail overlay
  KnowledgeGraph.tsx   — Force-directed graph (D3-free SVG)
  ThemeToggle.tsx      — Dark/light mode switcher
  Toast.tsx            — Error notification
  LoadingSkeleton.tsx  — Loading placeholder
  FeedManager.tsx      — RSS source list
  Settings.tsx         — Preferences (180 lines)
  CoverageDashboard.tsx — Bias analysis (301 lines)
  LiveSearch.tsx       — Google News search (342 lines)
  EventRadar.tsx       — Event detection UI (228 lines)
  EventCard.tsx        — Single event display
  ImpactDashboard.tsx  — Event summary sidebar
  StockLibrary.tsx     — Stock browser + chart (512 lines)
  MarketAnalytics.tsx  — 10-tab analytics (814 lines)
  NewsVsPrice.tsx      — News/price overlay (371 lines)

================================================================================
3. SERVER ARCHITECTURE
================================================================================

3.1 index.ts — Server Bootstrap (75 lines)
───────────────────────────────────────────
Startup sequence:
  1. getDb() — Initialize news.db (create tables if needed)
  2. app.listen(3001)
  3. ingestAll() → clusterArticles() — Initial data load
  4. Cron: ingestAll() → clusterArticles() every 5 minutes

Middleware stack:
  morgan('dev') — Request logging
  cors() — Cross-origin requests
  express.json() — JSON body parsing
  express-rate-limit — 100 req/min on /api

All 11 route modules mounted at /api prefix.

3.2 db.ts — News Database Layer (197 lines)
────────────────────────────────────────────
sql.js wrapper with:
  getDb() — Lazy initialization, loads from file or creates new
  flushDb() — Export in-memory DB to file
  scheduleDbSave() — 1-second debounce timer for writes
  initSchema() — CREATE TABLE IF NOT EXISTS for sources/articles/clusters

Exported functions:
  insertSource(source)      — INSERT OR REPLACE source
  insertArticle(article)    — INSERT OR IGNORE article (returns changes count)
  createCluster(label)      — INSERT cluster, return ID
  assignArticleToCluster(id, clusterId) — UPDATE article.cluster_id
  getAllArticles()           — SELECT * ORDER BY published_at DESC
  getArticlesByCluster(id)  — SELECT with JOIN on sources
  searchArticles(q, bias, page, limit) — LIKE search with pagination
  getAllClusters()           — SELECT * ORDER BY created_at DESC
  getAllSources()            — SELECT * ORDER BY bias, name
  getUnclusteredArticles()  — WHERE cluster_id IS NULL

3.3 utils.ts — Result Conversion (12 lines)
────────────────────────────────────────────
  resultToObjects(result) — Converts sql.js exec result to array of objects.
  Takes [{columns: [...], values: [[...], ...]}] and returns [{col: val}, ...]

3.4 ingestor.ts — RSS Pipeline (93 lines)
──────────────────────────────────────────
  loadFeeds() — Seeds DB from feeds.json if sources table is empty
  fetchFeed(feed) — Parses RSS URL, inserts up to 20 articles per feed
  ingestAll() — Processes all feeds in batches of 5 (parallel)

Each article is INSERT OR IGNORE'd by URL uniqueness constraint.

3.5 clustering.ts — Topic Grouping (127 lines)
───────────────────────────────────────────────
  normalizeTitle() — lowercase, remove punctuation, collapse whitespace
  getWords() — Filter to words > 3 chars
  clusterArticles() — Main clustering loop:
    1. Get unclustered articles
    2. Get recent articles from existing clusters (limit 500)
    3. For each unclustered article:
       - Compare against all cluster articles using string-similarity
       - If best match >= 0.55 similarity: assign to existing cluster
       - Otherwise: create new cluster
    Returns count of clustered articles.

  buildStoryNodes() — Builds structured response:
    For each cluster with articles:
      - Group articles by bias (left/lean-left/center/lean-right/right)
      - Identify blindspot biases (empty columns)
      - Return StoryNode with articles, blindspot, topicLabel

3.6 feeds.json — Source Registry
─────────────────────────────────
Array of 52 feed objects:
  { id, name, url, rssUrl, bias, credibilityScore, tags[] }

Bias categories: left, lean-left, center, lean-right, right

================================================================================
4. STOCK SUBSYSTEM
================================================================================

4.1 stocks/db.ts — Stock Database Layer (283 lines)
────────────────────────────────────────────────────
Separate sql.js instance for stock data. Same pattern as news db.ts.

Schema: stock_tickers, stock_prices, stock_meta

Exported functions:
  getStockDb()                     — Initialize/load stock DB
  upsertTicker(info)               — INSERT OR REPLACE into stock_tickers
  insertPrices(symbol, prices[])   — Batch INSERT OR REPLACE into stock_prices
  getTickerList(search, exchange, page, limit) — Paginated ticker query
  getTickerHistory(symbol)         — All OHLCV data for a ticker
  getTickerInfo(symbol)            — Ticker metadata
  getDownloadStatus()              — Merges stock_meta + progress JSON
  getAllLastPriceDates()            — Map of symbol → last price date
  setMeta(key, value)              — Set metadata key-value pair
  getExchanges()                   — Distinct exchange list
  getSectors()                     — Distinct sector list
  getStockStats()                  — Aggregate counts

IMPORTANT: getDownloadStatus() reads both from stock_meta (sql.js in-memory)
AND from stock-progress.json (written by Python). Python progress takes
priority when a batch download is active. This bridges the two processes.

4.2 stocks/downloader.ts — Node.js Downloaders (474 lines)
──────────────────────────────────────────────────────────
Uses yahoo-finance2 v4 with:
  const yf = new YahooFinance({ validation: { logErrors: false },
                                 suppressNotices: ['ripHistorical'] });

Key functions:
  loadTickerSymbols() — Read tickers from tickers_world_stock.txt
  enrichTickerInfo(symbol) — yf.quote() for metadata
  downloadTickerHistory(symbol) — yf.chart() for 10Y daily OHLCV
  downloadRecentHistory(symbol, fromDate) — yf.chart() from specific date

  runFullDownload() — Full 10Y download for all missing tickers
    States: loading_tickers → checking_existing → enriching_tickers →
            downloading_prices → completed
    Resume: Skips tickers that already have price data
    Progress: Writes to stock-progress.json every 25 tickers

  runSmartUpdate() — Intelligent incremental update
    Phase 1: Download full 10Y for tickers with no price data
    Phase 2: Download recent days for tickers with stale data
    Uses getAllLastPriceDates() to determine staleness

  isDownloading() / abortDownload() — Concurrency control

4.3 stocks/batch_download.py — Python Batch Downloader (371 lines)
───────────────────────────────────────────────────────────────────
Standalone Python script that:
  1. Loads ticker symbols from tickers_world_stock.txt
  2. Opens stocks.db directly via Python sqlite3
  3. Downloads metadata for new tickers (10 at a time via yf.Ticker.info)
  4. Downloads prices in batches of 50 via yf.download() (parallel threads)
  5. Saves directly to SQLite
  6. Reports progress to stock-progress.json

Modes (CLI flags):
  Default (no flag)  — Download missing tickers only (10Y period)
  --all              — Download all tickers (10Y period)
  --update           — Update stale tickers (3mo period)
  --tickers AAPL,MSFT — Specific tickers (10Y period)
  --batch-size N     — Custom batch size (default: 50)

Data flow:
  Python writes to stocks.db file → stock-progress.json
  Node.js reads from stock-progress.json in getDownloadStatus()
  Client polls GET /api/stocks/download/status every 3 seconds

NOTE: After batch download completes, restart the Node.js server to reload
the in-memory sql.js database with the new data.

================================================================================
5. ROUTE-BY-ROUTE REFERENCE
================================================================================

routes/search.ts (78 lines)
  GET /api/search?q=&page=&limit=&bias=
  - Sanitizes input, searches articles via db.searchArticles()
  - Groups results into StoryNodes by cluster_id
  - Falls back to unbundled results if no clusters match
  - Returns: { nodes: StoryNode[], total, page, limit }

routes/topics.ts (38 lines)
  GET /api/topics — List all clusters
  GET /api/topics/:id — Get topic detail
  - Fetches articles by cluster, groups by bias
  - Returns blindspot array (missing bias columns)

routes/blindspots.ts (10 lines)
  GET /api/blindspots — Topics with missing bias coverage
  - Filters nodes where blindspot.length > 0 && totalArticles >= 2

routes/feeds.ts (9 lines)
  GET /api/feeds — Returns all sources from DB

routes/breaking.ts (10 lines)
  GET /api/breaking — Top 20 story nodes by article count

routes/graph.ts (224 lines)
  GET /api/graph/breaking — Top 10 clusters + their articles → graph
  GET /api/graph/search?q= — Search articles → graph
  GET /api/graph/topic/:id — Topic articles → graph
  buildGraphFromArticles() constructs source/article/cluster nodes + edges

routes/googleNews.ts (67 lines)
  GET /api/google-news?q=&page=&pageSize=&when=
  - Proxies Google News RSS: news.google.com/rss/search
  - when param adds +when:1d/7d/1m to query
  - Returns paginated articles

routes/events.ts (412 lines)
  GET /api/events?hours=&category=
  - fetchGDELTEvents() — GDELT DOC API with geopolitical queries
  - fetchRSSPoliticalNews() — Google News RSS for political topics
  - processArticles() — Classify + map to assets + determine signals
  - EVENT_SECTOR_MAP — Comprehensive event→ticker mapping (9 categories)
  - Returns: { events[], summary, sectorImpact, fetchedAt, hoursBack }

routes/stocks.ts (169 lines)
  Stock library CRUD + download management:
  - GET /stocks — Paginated list with search/exchange filters
  - GET /stocks/:symbol — Ticker info + history
  - GET /stocks/download/status — Merged Node.js + Python progress
  - POST /stocks/batch-download — Spawns Python batch_download.py
  - POST /stocks/batch-download/abort — Kills Python process
  - POST /stocks/download — Starts Node.js full download
  - POST /stocks/update — Starts Node.js smart update
  - POST /stocks/download/abort — Aborts Node.js download

routes/marketAnalytics.ts (385 lines)
  8 analytics endpoints, all querying stock_prices table:
  - /movers — Price comparison (1D/1W/1M)
  - /volume — Volume vs 20-day average
  - /sectors — Sector returns across 5 timeframes
  - /seasonality — Monthly returns averaged across top 200 stocks
  - /correlation — Pearson correlation matrix (configurable symbols)
  - /risk-reward — Annualized vol vs return + Sharpe ratio
  - /heatmap — Latest price change + market cap for treemap
  - /countries — Country-level aggregates from top 50 per country

routes/newsVsPrice.ts (116 lines)
  GET /api/news-vs-price/:symbol?days=
  - Gets ticker info + history from SQLite
  - Fetches Google News RSS (by company name)
  - Fetches GDELT DOC API (by company name + ticker symbol)
  - Deduplicates by normalized title
  - Filters by date server-side
  - Returns: { ticker, prices[], news[] }

routes/stockHistory.ts (89 lines)
  GET /api/stock-history?symbol=&range=&interval=
  - Live Yahoo Finance API call (not from DB)
  - Returns OHLCV candles for charting

================================================================================
6. COMPONENT DEEP DIVES
================================================================================

StockLibrary.tsx (512 lines)
─────────────────────────────
Two views: ticker grid and selected ticker detail.

Grid view:
  - Fetches paginated tickers via /api/stocks
  - Shows stats: total tickers, stocks with prices, exchanges
  - "Update All" button → confirmation modal → POST /api/stocks/batch-download
  - Progress banner polls /api/stocks/download/status every 3s
  - Detects batch states: batch_starting, batch_downloading

Detail view (when ticker selected):
  - Fetches /api/stocks/:symbol for info + history
  - SVG line chart with hover tooltip (date, close, volume)
  - OHLCV table (reversed order, newest first)
  - CSV download generates client-side Blob

MarketAnalytics.tsx (814 lines)
───────────────────────────────
10 tab components, each a self-contained function component:

  MoversViz — Sortable table with 3 sort options + 3 filter options
  VolumeViz — Horizontal bars with color coding (red > 3x, amber > 2x)
  HeatmapViz — Squarify treemap algorithm implemented inline
  SectorsViz — Simple table with colored percentage cells
  SeasonalityViz — 10×12 heatmap grid with year/month averages
  CorrelationViz — SVG matrix with labels, blue=positive, orange=negative
  RiskRewardViz — Scatter plot with sector-colored dots, hover detail
  CompareViz — Multi-line normalized chart (base=100)
  EventTimelineViz — Price chart + vertical dashed lines for events
  CountriesViz — Country cards with progress bars + return stats

NewsVsPrice.tsx (371 lines)
────────────────────────────
  - Debounced ticker search (300ms) from /api/stocks?search=
  - Fetches /api/news-vs-price/:symbol?days=N on selection
  - SVG chart: line (green=up, red=down) + area fill + news dots
  - News dots: blue=Google News, orange=GDELT (hover highlights)
  - Configurable news window: 7d/30d/90d/1y
  - Scrollable news feed with source badges + hover sync

================================================================================
7. DATABASE SCHEMA REFERENCE
================================================================================

See specs.txt Section 8 for complete schema definitions.

Key relationships:
  articles.source_id → sources.id
  articles.cluster_id → clusters.id
  stock_prices.symbol → stock_tickers.symbol

Performance indexes:
  idx_articles_cluster, idx_articles_source, idx_articles_published
  idx_stock_prices_symbol, idx_stock_prices_date, idx_stock_tickers_cap

================================================================================
8. SHARED TYPES
================================================================================

shared/types.ts (57 lines)

  BiasCategory = 'left' | 'lean-left' | 'center' | 'lean-right' | 'right'
  BIAS_COLUMNS = readonly array of above

  Source { id, name, url, rss_url, bias, credibility_score, tags[] }
  Article { id, source_id, title, excerpt, url, published_at, cluster_id,
            created_at, source_name?, credibility_score?, bias?, tags? }
  StoryNode { id, topicLabel, articles: ArticleByBias, blindspot, createdAt,
              totalArticles }
  ArticleByBias { left[], lean-left[], center[], lean-right[], right[] }
  SearchResult { nodes: StoryNode[], total }
  FeedInfo { source, lastFetched, articleCount }

================================================================================
9. CONFIGURATION & SCRIPTS
================================================================================

package.json scripts (root):
  npm run dev         — Start both client + server
  npm run dev:client  — Vite dev server only
  npm run dev:server  — Node.js server only
  npm run build       — Build both client + server
  npm run start       — Production start

server/package.json scripts:
  npm run dev              — ts-node-dev with watch
  npm run build            — tsc compilation
  npm run start            — node dist/index.js
  npm run download-stocks  — Standalone stock download

Environment:
  PORT — Server port (default: 3001)
  Vite proxies /api to localhost:3001 in development

Dependencies:
  Server: express, cors, morgan, rss-parser, node-cron, sql.js,
          string-similarity, yahoo-finance2, express-rate-limit
  Client: react, react-dom, vite, tailwindcss, typescript
  Python: yfinance, pandas

================================================================================
10. HOW TO EXTEND
================================================================================

Adding a new page:
  1. Create component in client/src/components/
  2. Add show{Page} state in App.tsx
  3. Add case to handleSidebarAction()
  4. Add ternary entry in JSX render chain
  5. Add menu item to Sidebar.tsx MENU_ITEMS

Adding a new API endpoint:
  1. Create route file in server/src/routes/ (or add to existing)
  2. Define Router() and export
  3. Import and mount in server/src/index.ts with app.use('/api', routes)
  4. Add API function in client/src/api.ts

Adding a new stock analytics tab:
  1. Add GET endpoint in routes/marketAnalytics.ts
  2. Add tab to MarketAnalytics.tsx TABS array
  3. Create visualization component function
  4. Wire up in the fetchTab() switch and render logic

Adding a new event category:
  1. Add regex pattern to classifyEvent() in routes/events.ts
  2. Add entry to EVENT_SECTOR_MAP with bullish/bearish tickers
  3. Add category button to EventRadar.tsx CATEGORIES array
  4. Add color to eventCategoryColors in MarketAnalytics EventTimelineViz

================================================================================
END OF ARCHITECTURE DOCUMENTATION
================================================================================
