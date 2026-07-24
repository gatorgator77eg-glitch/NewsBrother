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
