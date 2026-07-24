const API_BASE = '/api';

export async function searchTopics(query: string, page: number = 1, bias?: string) {
  const params = new URLSearchParams({ q: query, page: String(page) });
  if (bias) params.set('bias', bias);
  const res = await fetch(`${API_BASE}/search?${params}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getTopic(id: number) {
  const res = await fetch(`${API_BASE}/topics/${id}`);
  if (!res.ok) throw new Error('Failed to fetch topic');
  return res.json();
}

export async function getBlindspots() {
  const res = await fetch(`${API_BASE}/blindspots`);
  if (!res.ok) throw new Error('Failed to fetch blindspots');
  return res.json();
}

export async function getFeeds() {
  const res = await fetch(`${API_BASE}/feeds`);
  if (!res.ok) throw new Error('Failed to fetch feeds');
  return res.json();
}

export async function getBreakingNews() {
  const res = await fetch(`${API_BASE}/breaking`);
  if (!res.ok) throw new Error('Failed to fetch breaking news');
  return res.json();
}

export interface GraphNode {
  id: string;
  type: 'source' | 'article' | 'cluster';
  label: string;
  bias?: string;
  credibility?: number;
  articleCount?: number;
  blindspot?: string[];
  coverage?: Record<string, number>;
  publishedAt?: string;
  sourceId?: string;
  sourceName?: string;
  url?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'published_by' | 'contains';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getBreakingGraph(): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/graph/breaking`);
  if (!res.ok) throw new Error('Failed to fetch breaking graph');
  return res.json();
}

export async function searchGraph(query: string, bias?: string): Promise<GraphData> {
  const params = new URLSearchParams({ q: query });
  if (bias) params.set('bias', bias);
  const res = await fetch(`${API_BASE}/graph/search?${params}`);
  if (!res.ok) throw new Error('Failed to search graph');
  return res.json();
}

export async function getTopicGraph(topicId: number): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/graph/topic/${topicId}`);
  if (!res.ok) throw new Error('Failed to fetch topic graph');
  return res.json();
}

export interface GoogleNewsResult {
  query: string;
  page: number;
  pageSize: number;
  total: number;
  articles: GoogleNewsArticle[];
}

export interface GoogleNewsArticle {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet: string;
  imageUrl?: string;
}

export async function searchGoogleNews(
  query: string,
  page: number = 1,
  pageSize: number = 20,
  when?: string
): Promise<GoogleNewsResult> {
  const params = new URLSearchParams({ q: query, page: String(page), pageSize: String(pageSize) });
  if (when) params.set('when', when);
  const res = await fetch(`${API_BASE}/google-news?${params}`);
  if (!res.ok) throw new Error('Google News search failed');
  return res.json();
}

// ─── Event Radar Types ──────────────────────────────────────────────

export interface MarketEvent {
  id: string;
  title: string;
  summary: string;
  severity: 'critical' | 'high' | 'elevated' | 'moderate' | 'low';
  severityScore: number;
  category: string;
  goldsteinScale: number;
  tone: number;
  source: string;
  url: string;
  publishedAt: string;
  actors: string[];
  affectedSectors: {
    sector: string;
    direction: 'bullish' | 'bearish';
    tickers: string[];
    expectedMove: string;
  }[];
  signal: 'BUY' | 'SELL' | 'HOLD';
  signalTickers: string[];
}

export interface EventsResponse {
  events: MarketEvent[];
  summary: {
    total: number;
    critical: number;
    high: number;
    elevated: number;
    moderate: number;
    low: number;
    buySignals: number;
    sellSignals: number;
    categories: string[];
  };
  sectorImpact: Record<string, { direction: string; count: number; tickers: string[] }>;
  fetchedAt: string;
  hoursBack: number;
}

export async function getEvents(
  hours: number = 6,
  category?: string
): Promise<EventsResponse> {
  const params = new URLSearchParams({ hours: String(hours) });
  if (category) params.set('category', category);
  const res = await fetch(`${API_BASE}/events?${params}`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}

// ─── News Archive Types ──────────────────────────────────────────────

export interface NewsArchiveArticle {
  id: number;
  url: string;
  title: string;
  domain: string;
  source_country: string;
  language: string;
  published_at: string;
  image_url: string;
  tone: number;
  downloaded_at: string;
}

export interface NewsArchiveSearchResult {
  articles: NewsArchiveArticle[];
  total: number;
  page: number;
  limit: number;
}

export interface NewsArchiveStats {
  total: number;
  earliest: string | null;
  latest: string | null;
  topDomains: { domain: string; count: number }[];
  topCountries: { country: string; count: number }[];
  weeklyVolume: { week: string; count: number }[];
  dailyVolume: { date: string; count: number }[];
}

export interface NewsArchiveDownloadStatus {
  status: string;
  startDate: string;
  endDate: string;
  currentDate: string;
  totalDays: number;
  completedDays: number;
  totalArticles: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  pct: number;
  etaMin: number;
}

export async function searchNewsArchive(
  query: string,
  dateFrom?: string,
  dateTo?: string,
  page: number = 1,
  limit: number = 50
): Promise<NewsArchiveSearchResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (query) params.set('query', query);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const res = await fetch(`${API_BASE}/news-archive?${params}`);
  if (!res.ok) throw new Error('Failed to search archive');
  return res.json();
}

export async function getNewsArchiveStats(): Promise<NewsArchiveStats> {
  const res = await fetch(`${API_BASE}/news-archive/stats`);
  if (!res.ok) throw new Error('Failed to get archive stats');
  return res.json();
}

export async function getNewsArchiveDownloadStatus(): Promise<NewsArchiveDownloadStatus> {
  const res = await fetch(`${API_BASE}/news-archive/download/status`);
  if (!res.ok) throw new Error('Failed to get download status');
  return res.json();
}

export async function startNewsArchiveDownload(
  startDate: string,
  endDate: string,
  query?: string
): Promise<{ ok: boolean; totalDays?: number; error?: string }> {
  const res = await fetch(`${API_BASE}/news-archive/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, query }),
  });
  return res.json();
}

export async function abortNewsArchiveDownload(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/news-archive/download/abort`, { method: 'POST' });
  return res.json();
}

// ─── Janus Types ─────────────────────────────────────────────────────

export interface HeatmapEntry {
  country: string;
  articleCount: number;
  avgTone: number;
  tickerCount: number;
  totalMcap: number;
}

export interface DivergenceEntry {
  symbol: string;
  name: string;
  sector: string;
  country: string;
  marketCap: number;
  volatilityPct: number;
  priceRangePct: number;
  avgVolume: number;
  sectorNewsHeat: number;
  divergenceScore: number;
}

export interface EchoLeader {
  country: string;
  firstSeen: string;
  articleCount: number;
  avgTone: number;
}

export interface EchoDomain {
  domain: string;
  country: string;
  articles: number;
  tone: number;
}

export interface RadarTicker {
  symbol: string;
  name: string;
  sector: string;
  country: string;
  range7d: number;
  change7d: number;
  avgVolume: number;
  riskLevel: string;
}

export interface PolarizedDomain {
  domain: string;
  avgTone: number;
  toneSpread: number;
  articles: number;
}

export interface ShockwaveMover {
  symbol: string;
  name: string;
  sector: string;
  movePct: number;
  avgVolume: number;
}

export interface CredibilityEntry {
  symbol: string;
  name: string;
  sector: string;
  country: string;
  marketCap: number;
  totalReturn: number;
  maxDrawdown: number;
  ccr: number;
  rating: string;
}

export async function getJanusHeatmap(): Promise<{ heatmap: HeatmapEntry[] }> {
  const res = await fetch(`${API_BASE}/janus/heatmap`);
  if (!res.ok) throw new Error('Failed to fetch heatmap');
  return res.json();
}

export async function getJanusDivergence(limit = 20): Promise<{ divergence: DivergenceEntry[] }> {
  const res = await fetch(`${API_BASE}/janus/divergence?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch divergence');
  return res.json();
}

export async function getJanusEchoChamber(): Promise<{ leaders: EchoLeader[]; domains: EchoDomain[] }> {
  const res = await fetch(`${API_BASE}/janus/echo-chamber`);
  if (!res.ok) throw new Error('Failed to fetch echo chamber');
  return res.json();
}

export async function getJanusVolatilityRadar(limit = 20): Promise<{ polarizedDomains: PolarizedDomain[]; radar: RadarTicker[] }> {
  const res = await fetch(`${API_BASE}/janus/volatility-radar?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch volatility radar');
  return res.json();
}

export async function getJanusShockwave(topic?: string, limit = 10): Promise<{ topic: string; articleCount: number; recentArticles: any[]; volatilePeriods: any[]; topMovers: ShockwaveMover[] }> {
  const params = new URLSearchParams();
  if (topic) params.set('topic', topic);
  params.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/janus/shockwave?${params}`);
  if (!res.ok) throw new Error('Failed to fetch shockwave');
  return res.json();
}

export async function getJanusCredibility(sector?: string, limit = 30): Promise<{ credibility: CredibilityEntry[]; sectors: string[] }> {
  const params = new URLSearchParams();
  if (sector) params.set('sector', sector);
  params.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/janus/credibility?${params}`);
  if (!res.ok) throw new Error('Failed to fetch credibility');
  return res.json();
}

// ─── Sentiment Types ────────────────────────────────────────────────

export interface TimelinePoint {
  period: string;
  avgTone: number;
  articleCount: number;
  minTone: number;
  maxTone: number;
}

export interface WorldMapCountry {
  country: string;
  avgTone: number;
  articleCount: number;
  positiveCount: number;
  negativeCount: number;
}

export interface SourceBias {
  domain: string;
  avgTone: number;
  articleCount: number;
  minTone: number;
  maxTone: number;
  toneVariance: number;
  lean: 'left' | 'center' | 'right' | 'uncategorized';
}

export interface DistBucket {
  bucket: number;
  count: number;
  percentage: number;
}

export interface MoodPulseEntry {
  country: string;
  todayTone: number;
  todayCount: number;
  weekTone: number;
  sparkline: number[];
  trend: 'up' | 'down' | 'flat';
  totalArticles: number;
}

export interface WaveDay {
  date: string;
  countries: { country: string; tone: number; count: number }[];
}

export interface LeftRightEntry {
  category: 'left' | 'center' | 'right';
  avgTone: number;
  medianTone: number;
  totalArticles: number;
  domainCount: number;
  topDomains: string[];
  distribution: { bucket: number; count: number }[];
}

// ─── Sentiment API ──────────────────────────────────────────────────

export async function getSentimentTimeline(params?: { country?: string; domain?: string; granularity?: string }): Promise<{ timeline: TimelinePoint[]; granularity: string }> {
  const q = new URLSearchParams();
  if (params?.country) q.set('country', params.country);
  if (params?.domain) q.set('domain', params.domain);
  if (params?.granularity) q.set('granularity', params.granularity);
  const res = await fetch(`${API_BASE}/sentiment/timeline?${q}`);
  if (!res.ok) throw new Error('Failed to fetch sentiment timeline');
  return res.json();
}

export async function getSentimentWorldMap(month?: string): Promise<{ countries: WorldMapCountry[]; months: string[]; selectedMonth: string | null }> {
  const q = month ? `?month=${month}` : '';
  const res = await fetch(`${API_BASE}/sentiment/world-map${q}`);
  if (!res.ok) throw new Error('Failed to fetch world map');
  return res.json();
}

export async function getSentimentSourceBias(): Promise<{ sources: SourceBias[] }> {
  const res = await fetch(`${API_BASE}/sentiment/source-bias`);
  if (!res.ok) throw new Error('Failed to fetch source bias');
  return res.json();
}

export async function getSentimentDistribution(params?: { country?: string; domain?: string }): Promise<{ buckets: DistBucket[]; avgTone: number; totalArticles: number }> {
  const q = new URLSearchParams();
  if (params?.country) q.set('country', params.country);
  if (params?.domain) q.set('domain', params.domain);
  const res = await fetch(`${API_BASE}/sentiment/distribution?${q}`);
  if (!res.ok) throw new Error('Failed to fetch distribution');
  return res.json();
}

export async function getSentimentMoodPulse(): Promise<{ pulse: MoodPulseEntry[] }> {
  const res = await fetch(`${API_BASE}/sentiment/mood-pulse`);
  if (!res.ok) throw new Error('Failed to fetch mood pulse');
  return res.json();
}

export async function getSentimentWaves(days?: number): Promise<{ waves: WaveDay[]; countries: string[] }> {
  const q = days ? `?days=${days}` : '';
  const res = await fetch(`${API_BASE}/sentiment/waves${q}`);
  if (!res.ok) throw new Error('Failed to fetch waves');
  return res.json();
}

export async function getSentimentLeftRight(): Promise<{ leftRight: LeftRightEntry[]; uncategorized: { avgTone: number; totalArticles: number; domainCount: number } }> {
  const res = await fetch(`${API_BASE}/sentiment/left-right`);
  if (!res.ok) throw new Error('Failed to fetch left-right');
  return res.json();
}

// ─── LocalGPU Types ─────────────────────────────────────────────────

export interface GpuStatus {
  available: boolean;
  ollamaConnected: boolean;
  models: { name: string; size: number; parameter_size: string; quantization: string }[];
  activeModel: string | null;
  vram: { total: number; used: number; free: number };
  engines: {
    llm: { status: string; vramMb: number };
    sentiment: { status: string; vramMb: number };
    vectors: { status: string; vramMb: number };
    analytics: { status: string; vramMb: number };
  };
  activeJobs: any[];
}

export interface LocalGpuConfig {
  [key: string]: string;
}

export interface TopicCluster {
  id: number;
  label: string;
  articleCount: number;
  createdAt: string;
  articles?: { id: number; title: string; domain: string; country: string }[];
}

export interface AnalyticsResult {
  symbol: string;
  window: number;
  volatility: number;
  sharpe: number;
  max_drawdown: number;
  rsi: number;
  volume_change_pct: number;
  last_close: number;
}

// ─── LocalGPU API ───────────────────────────────────────────────────

export async function getLocalGpuStatus(): Promise<GpuStatus> {
  const res = await fetch(`${API_BASE}/localgpu/status`);
  if (!res.ok) throw new Error('Failed to fetch GPU status');
  return res.json();
}

export async function localGpuChat(messages: { role: string; content: string }[], model?: string): Promise<{ response: string; model: string }> {
  const res = await fetch(`${API_BASE}/localgpu/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model }),
  });
  if (!res.ok) throw new Error('Chat failed');
  return res.json();
}

export async function runLocalGpuSentiment(batchSize?: number, limit?: number): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/localgpu/sentiment/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchSize, limit }),
  });
  if (!res.ok) throw new Error('Sentiment job failed to start');
  return res.json();
}

export async function getLocalGpuSentimentStatus(jobId?: string): Promise<{ jobs?: any[]; id?: string; status?: string; progress?: number; result?: any }> {
  const q = jobId ? `?jobId=${jobId}` : '';
  const res = await fetch(`${API_BASE}/localgpu/sentiment/status${q}`);
  if (!res.ok) throw new Error('Failed to get sentiment status');
  return res.json();
}

export async function runLocalGpuVectors(clusters?: number, limit?: number): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/localgpu/vectors/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clusters, limit }),
  });
  if (!res.ok) throw new Error('Vector job failed to start');
  return res.json();
}

export async function getLocalGpuClusters(): Promise<{ clusters: TopicCluster[] }> {
  const res = await fetch(`${API_BASE}/localgpu/vectors/clusters`);
  if (!res.ok) throw new Error('Failed to fetch clusters');
  return res.json();
}

export async function getLocalGpuVectorStatus(jobId?: string): Promise<{ jobs?: any[]; id?: string; status?: string; progress?: number }> {
  const q = jobId ? `?jobId=${jobId}` : '';
  const res = await fetch(`${API_BASE}/localgpu/vectors/status${q}`);
  if (!res.ok) throw new Error('Failed to get vector status');
  return res.json();
}

export async function runLocalGpuAnalytics(window?: number, tickers?: string): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/localgpu/analytics/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ window, tickers }),
  });
  if (!res.ok) throw new Error('Analytics job failed to start');
  return res.json();
}

export async function getLocalGpuAnalyticsResults(): Promise<{ results: AnalyticsResult[] }> {
  const res = await fetch(`${API_BASE}/localgpu/analytics/results`);
  if (!res.ok) throw new Error('Failed to fetch analytics results');
  return res.json();
}

export async function getLocalGpuAnalyticsStatus(jobId?: string): Promise<{ jobs?: any[]; id?: string; status?: string; progress?: number }> {
  const q = jobId ? `?jobId=${jobId}` : '';
  const res = await fetch(`${API_BASE}/localgpu/analytics/status${q}`);
  if (!res.ok) throw new Error('Failed to get analytics status');
  return res.json();
}

export async function getLocalGpuConfig(): Promise<{ config: LocalGpuConfig }> {
  const res = await fetch(`${API_BASE}/localgpu/config`);
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}

export async function setLocalGpuConfig(updates: Record<string, string>): Promise<{ config: LocalGpuConfig }> {
  const res = await fetch(`${API_BASE}/localgpu/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save config');
  return res.json();
}

// ─── Deep Research Types & API ──────────────────────────────────────

export interface DeepResearchResult {
  query: string;
  articles: { id: number; url: string; title: string; domain: string; source_country: string; published_at: string; tone: number; goldsteinscale: number }[];
  timeline: { date: string; avgTone: number; count: number }[];
  tickers: { symbol: string; mentions: number; name: string; sector: string }[];
  priceData: Record<string, { date: string; close: number; volume: number }[]>;
  domains: { domain: string; count: number }[];
  countries: { country: string; count: number }[];
  toneOverview: { avg: number; min: number; max: number; positive: number; negative: number; neutral: number };
  totalArticles: number;
}

export async function runDeepResearch(query: string, dateFrom?: string, dateTo?: string, sources?: string[], limit?: number): Promise<DeepResearchResult> {
  const res = await fetch(`${API_BASE}/deep-research/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dateFrom, dateTo, sources, limit }),
  });
  if (!res.ok) throw new Error('Deep research query failed');
  return res.json();
}

export async function getDeepResearchSuggestions(): Promise<{ suggestions: string[] }> {
  const res = await fetch(`${API_BASE}/deep-research/suggestions`);
  if (!res.ok) throw new Error('Failed to get suggestions');
  return res.json();
}

// ─── Correlation Types & API ────────────────────────────────────────

export interface CorrelationResult {
  ticker: { symbol: string; name: string; sector: string };
  correlation: number;
  pValue: number;
  sampleSize: number;
  lagged: { lag: number; correlation: number }[];
  aligned: { date: string; tone: number; toneCount: number; close: number; dailyReturn: number }[];
  toneBreakdown: { positive: number; negative: number; neutral: number; total: number };
  days: number;
}

export interface CorrelationHeatmapEntry {
  sector: string;
  avgTone: number;
  avgPriceChange: number;
  articleCount: number;
  correlation: number;
}

export interface NarrativeStrengthResult {
  daily: { date: string; count: number; avgTone: number; smoothedCount: number; smoothedTone: number }[];
  summary: { totalArticles: number; avgTone: number; narrativeVolatility: number; volumeTrendPct: number; days: number };
  extremes: { date: string; avgTone: number; count: number }[];
}

export async function getCorrelationTicker(symbol: string, days?: number): Promise<CorrelationResult> {
  const q = days ? `?days=${days}` : '';
  const res = await fetch(`${API_BASE}/correlation/ticker/${symbol}${q}`);
  if (!res.ok) throw new Error('Failed to get correlation');
  return res.json();
}

export async function getCorrelationHeatmap(days?: number): Promise<{ heatmap: CorrelationHeatmapEntry[]; days: number }> {
  const q = days ? `?days=${days}` : '';
  const res = await fetch(`${API_BASE}/correlation/heatmap${q}`);
  if (!res.ok) throw new Error('Failed to get correlation heatmap');
  return res.json();
}

export async function getNarrativeStrength(days?: number): Promise<NarrativeStrengthResult> {
  const q = days ? `?days=${days}` : '';
  const res = await fetch(`${API_BASE}/correlation/narrative-strength${q}`);
  if (!res.ok) throw new Error('Failed to get narrative strength');
  return res.json();
}

// ─── Health API ─────────────────────────────────────────────────────

export interface HealthStatus {
  status: string;
  timestamp: string;
  news: { articles: number; latestArticle: string | null; sources: number };
  archive: { articles: number; latestArticle: string | null };
  stocks: { tickers: number; priceRows: number };
  lastIngest: string | null;
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed to get health');
  return res.json();
}

// ─── Export URLs ────────────────────────────────────────────────────

export function getExportNewsArchiveUrl(query?: string, dateFrom?: string, dateTo?: string): string {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  return `${API_BASE}/export/news-archive?${params}`;
}

export function getExportStockPricesUrl(symbol: string, days?: number): string {
  const q = days ? `?days=${days}` : '';
  return `${API_BASE}/export/stock-prices/${symbol}${q}`;
}

export function getExportCorrelationUrl(symbol: string, days?: number): string {
  const q = days ? `?days=${days}` : '';
  return `${API_BASE}/export/correlation/${symbol}${q}`;
}

export function getExportDashboardSummaryUrl(): string {
  return `${API_BASE}/export/dashboard-summary`;
}

// ─── Briefing API ────────────────────────────────────────────────────

export async function getDailyBriefing(): Promise<{
  generatedAt: string;
  topStories: { title: string; domain: string; country: string; tone: number; publishedAt: string; url: string }[];
  sentimentShifts: { country: string; todayTone: number; yesterdayTone: number; change: number; count: number }[];
  emergingNarratives: { title: string; domain: string; tone: number; publishedAt: string }[];
  coverageByCountry: { country: string; count: number; avgTone: number }[];
  breakingNews: { title: string; source: string; url: string; publishedAt: string }[];
  stats: { articlesToday: number; articlesYesterday: number };
}> {
  const res = await fetch(`${API_BASE}/briefing/daily`);
  if (!res.ok) throw new Error('Failed to fetch daily briefing');
  return res.json();
}

// ─── Timeline API ────────────────────────────────────────────────────

export async function getTimeline(from?: string, to?: string, granularity = 'day', country?: string, domain?: string): Promise<{
  buckets: { date: string; count: number; avgTone: number; minTone: number; maxTone: number; positive: number; negative: number; domains: number; countries: number }[];
  granularity: string;
  totalCount: number;
  avgTone: number;
  dateRange: { from: string | null; to: string | null };
}> {
  const params = new URLSearchParams({ granularity });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (country) params.set('country', country);
  if (domain) params.set('domain', domain);
  const res = await fetch(`${API_BASE}/timeline?${params}`);
  if (!res.ok) throw new Error('Failed to fetch timeline');
  return res.json();
}

export async function getTimelineDetail(date: string): Promise<{ date: string; articles: any[]; count: number }> {
  const res = await fetch(`${API_BASE}/timeline/detail?date=${date}`);
  if (!res.ok) throw new Error('Failed to fetch timeline detail');
  return res.json();
}

// ─── Bias Compare API ────────────────────────────────────────────────

export async function getBiasCompare(topic: string, days = 30): Promise<{
  topic: string;
  days: number;
  groups: {
    left: { count: number; avgTone: number; articles: any[] };
    center: { count: number; avgTone: number; articles: any[] };
    right: { count: number; avgTone: number; articles: any[] };
  };
  exclusiveWords: { leftOnly: { word: string; count: number }[]; centerOnly: { word: string; count: number }[]; rightOnly: { word: string; count: number }[] };
  overlapWords: string[];
  narrativeGapScore: number;
  totalArticles: number;
}> {
  const params = new URLSearchParams({ topic, days: String(days) });
  const res = await fetch(`${API_BASE}/bias/compare?${params}`);
  if (!res.ok) throw new Error('Failed to compare bias');
  return res.json();
}

// ─── Alerts API ──────────────────────────────────────────────────────

export interface AlertConfig {
  sentimentThreshold: number;
  volumeThreshold: number;
  toneShiftThreshold: number;
  enabled: boolean;
}

export async function getAlertConfig(): Promise<{ config: AlertConfig }> {
  const res = await fetch(`${API_BASE}/alerts/config`);
  if (!res.ok) throw new Error('Failed to fetch alert config');
  return res.json();
}

export async function setAlertConfig(config: Partial<AlertConfig>): Promise<{ config: AlertConfig }> {
  const res = await fetch(`${API_BASE}/alerts/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to update alert config');
  return res.json();
}

export async function scanAlerts(): Promise<{
  alerts: { id: string; type: string; message: string; severity: string; timestamp: string; metadata: any }[];
  scannedAt: string;
  config: AlertConfig;
}> {
  const res = await fetch(`${API_BASE}/alerts/scan`);
  if (!res.ok) throw new Error('Failed to scan alerts');
  return res.json();
}

// ─── Smart API ───────────────────────────────────────────────────────

export async function getSmartVelocity(symbol: string): Promise<any> {
  const res = await fetch(`${API_BASE}/smart/velocity/${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch velocity');
  return res.json();
}

export async function getSmartImpact(symbol: string, days?: number): Promise<any> {
  const q = days ? `?days=${days}` : '';
  const res = await fetch(`${API_BASE}/smart/impact/${symbol}${q}`);
  if (!res.ok) throw new Error('Failed to fetch impact');
  return res.json();
}

export async function getSmartLeadLag(symbol: string): Promise<any> {
  const res = await fetch(`${API_BASE}/smart/lead-lag/${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch lead-lag');
  return res.json();
}

export async function getSmartHeatmap(): Promise<any> {
  const res = await fetch(`${API_BASE}/smart/heatmap`);
  if (!res.ok) throw new Error('Failed to fetch heatmap');
  return res.json();
}

// ─── Math API ────────────────────────────────────────────────────────

export async function getMathLinearRegression(symbol: string, days?: number): Promise<any> {
  const q = days ? `?days=${days}` : '';
  const res = await fetch(`${API_BASE}/math/regression/linear/${symbol}${q}`);
  if (!res.ok) throw new Error('Failed to fetch linear regression');
  return res.json();
}

export async function getMathExponentialRegression(symbol: string, days?: number): Promise<any> {
  const q = days ? `?days=${days}` : '';
  const res = await fetch(`${API_BASE}/math/regression/exponential/${symbol}${q}`);
  if (!res.ok) throw new Error('Failed to fetch exponential regression');
  return res.json();
}

export async function getMathPolynomialRegression(symbol: string, days?: number, degree = 3): Promise<any> {
  const q = new URLSearchParams();
  if (days) q.set('days', String(days));
  q.set('degree', String(degree));
  const res = await fetch(`${API_BASE}/math/regression/polynomial/${symbol}?${q}`);
  if (!res.ok) throw new Error('Failed to fetch polynomial regression');
  return res.json();
}

export async function getMathTrend(symbol: string, window = 20): Promise<any> {
  const res = await fetch(`${API_BASE}/math/regression/trend/${symbol}?window=${window}`);
  if (!res.ok) throw new Error('Failed to fetch trend');
  return res.json();
}

export async function getMathCorrelationMatrix(symbols: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/correlation/matrix?symbols=${symbols}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch correlation matrix');
  return res.json();
}

export async function getMathSpearman(symbols: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/correlation/spearman?symbols=${symbols}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch spearman');
  return res.json();
}

export async function getMathBetaAlpha(symbol: string, benchmark = 'SPY', days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/correlation/beta-alpha/${symbol}?benchmark=${benchmark}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch beta-alpha');
  return res.json();
}

export async function getMathCointegration(s1: string, s2: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/correlation/cointegration?s1=${s1}&s2=${s2}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch cointegration');
  return res.json();
}

export async function getMathGranger(symbol: string, cause = 'SPY', days = 252, lag = 5): Promise<any> {
  const res = await fetch(`${API_BASE}/math/correlation/granger/${symbol}?cause=${cause}&days=${days}&lag=${lag}`);
  if (!res.ok) throw new Error('Failed to fetch granger');
  return res.json();
}

export async function getMathReturns(symbol: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/distribution/returns/${symbol}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch returns');
  return res.json();
}

export async function getMathNormality(symbol: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/distribution/normality/${symbol}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch normality');
  return res.json();
}

export async function getMathSkewnessKurtosis(symbol: string, window = 60): Promise<any> {
  const res = await fetch(`${API_BASE}/math/distribution/skewness-kurtosis/${symbol}?window=${window}`);
  if (!res.ok) throw new Error('Failed to fetch skewness-kurtosis');
  return res.json();
}

export async function getMathHistoricalVol(symbol: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/volatility/historical/${symbol}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch historical vol');
  return res.json();
}

export async function getMathVaR(symbol: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/volatility/var/${symbol}?days=${days}&confidence=0.95`);
  if (!res.ok) throw new Error('Failed to fetch VaR');
  return res.json();
}

export async function getMathMonteCarlo(symbol: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/volatility/monte-carlo/${symbol}?days=${days}&simulations=100&horizon=252`);
  if (!res.ok) throw new Error('Failed to fetch Monte Carlo');
  return res.json();
}

export async function getMathDrawdown(symbol: string, days = 500): Promise<any> {
  const res = await fetch(`${API_BASE}/math/volatility/drawdown/${symbol}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch drawdown');
  return res.json();
}

export async function getMathACF(symbol: string, days = 252, lag = 40): Promise<any> {
  const res = await fetch(`${API_BASE}/math/time-series/acf/${symbol}?days=${days}&lag=${lag}`);
  if (!res.ok) throw new Error('Failed to fetch ACF');
  return res.json();
}

export async function getMathHurst(symbol: string, days = 500): Promise<any> {
  const res = await fetch(`${API_BASE}/math/time-series/hurst/${symbol}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch Hurst');
  return res.json();
}

export async function getMathStationarity(symbol: string, days = 500): Promise<any> {
  const res = await fetch(`${API_BASE}/math/time-series/stationarity/${symbol}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch stationarity');
  return res.json();
}

export async function getMathEntropy(symbol: string, days = 500, window = 60): Promise<any> {
  const res = await fetch(`${API_BASE}/math/time-series/entropy/${symbol}?days=${days}&window=${window}`);
  if (!res.ok) throw new Error('Failed to fetch entropy');
  return res.json();
}

export async function getMathFourier(symbol: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/advanced/fourier/${symbol}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch Fourier');
  return res.json();
}

export async function getMathZScore(symbol: string, days = 500, window = 20): Promise<any> {
  const res = await fetch(`${API_BASE}/math/advanced/zscore/${symbol}?days=${days}&window=${window}`);
  if (!res.ok) throw new Error('Failed to fetch Z-score');
  return res.json();
}

export async function getMathPortfolio(symbols: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/advanced/portfolio?symbols=${symbols}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

export async function getMathFrontier(symbol: string, benchmark = 'SPY', days = 502): Promise<any> {
  const res = await fetch(`${API_BASE}/math/advanced/efficient-frontier/${symbol}?benchmark=${benchmark}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch efficient frontier');
  return res.json();
}

export async function getMathPCA(symbols: string, days = 252): Promise<any> {
  const res = await fetch(`${API_BASE}/math/advanced/pca?symbols=${symbols}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch PCA');
  return res.json();
}

export async function searchTickers(q: string): Promise<any[]> {
  if (!q || q.length < 1) return [];
  const res = await fetch(`${API_BASE}/stocks/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

// ── SRS Portfolio & Signals ───────────────────────────────────────────────

export async function getSrsPortfolio(): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/portfolio`);
  if (!res.ok) throw new Error('Failed to fetch SRS portfolio');
  return res.json();
}

export async function updateSrsCash(balance: number): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/portfolio/cash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance }),
  });
  if (!res.ok) throw new Error('Failed to update cash balance');
  return res.json();
}

export async function buySrsHolding(productId: string, productName: string, quantity: number, price: number): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/portfolio/holdings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, productName, quantity, price }),
  });
  if (!res.ok) throw new Error('Failed to buy holding');
  return res.json();
}

export async function sellSrsHolding(holdingId: number, quantity: number, price: number): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/portfolio/holdings`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdingId, quantity, price }),
  });
  if (!res.ok) throw new Error('Failed to sell holding');
  return res.json();
}

export async function getSrsTransactions(limit = 50): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/portfolio/transactions?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export async function getSrsSignals(): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/signals`);
  if (!res.ok) throw new Error('Failed to fetch signals');
  return res.json();
}

export async function refreshSrsSignals(): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/signals/refresh`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to refresh signals');
  return res.json();
}

export async function getSrsSignalHistory(limit = 50): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/signals/history?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch signal history');
  return res.json();
}

export async function getSrsMacro(): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/macro`);
  if (!res.ok) throw new Error('Failed to fetch macro rates');
  return res.json();
}

export async function refreshSrsMacro(): Promise<any> {
  const res = await fetch(`${API_BASE}/srs/macro/refresh`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to refresh macro data');
  return res.json();
}
