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
