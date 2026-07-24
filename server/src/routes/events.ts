import { Router, Request, Response } from 'express';
import Parser from 'rss-parser';
import { createLogger } from '../logger';

const log = createLogger({ module: 'events' });

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliticalNews/1.0)' },
});

export const eventsRoutes = Router();

interface MarketEvent {
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

// ─── Event-to-Asset Mapping ────────────────────────────────────────
const EVENT_SECTOR_MAP: Record<string, {
  bullish: { ticker: string; label: string; expectedMove: string }[];
  bearish: { ticker: string; label: string; expectedMove: string }[];
  sector: string;
}> = {
  CONFLICT: {
    bullish: [
      { ticker: 'ITA', label: 'iShares US Aerospace & Defense', expectedMove: '+3-8%' },
      { ticker: 'XLE', label: 'Energy Select SPDR', expectedMove: '+2-6%' },
      { ticker: 'GLD', label: 'SPDR Gold Shares', expectedMove: '+1-3%' },
      { ticker: 'LMT', label: 'Lockheed Martin', expectedMove: '+2-5%' },
      { ticker: 'RTX', label: 'RTX Corp', expectedMove: '+2-4%' },
      { ticker: 'NOC', label: 'Northrop Grumman', expectedMove: '+2-5%' },
    ],
    bearish: [
      { ticker: 'JETS', label: 'US Global Jets ETF', expectedMove: '-3-8%' },
      { ticker: 'XLY', label: 'Consumer Discretionary', expectedMove: '-1-3%' },
      { ticker: 'CCL', label: 'Carnival Corp', expectedMove: '-4-10%' },
    ],
    sector: 'Defense / Energy / Safe Haven',
  },
  TARIFF: {
    bullish: [
      { ticker: 'XLI', label: 'Industrial Select SPDR', expectedMove: '+1-3%' },
      { ticker: 'XLP', label: 'Consumer Staples', expectedMove: '+0.5-2%' },
      { ticker: 'XLU', label: 'Utilities Select SPDR', expectedMove: '+0.5-2%' },
    ],
    bearish: [
      { ticker: 'QQQ', label: 'Invesco QQQ (Nasdaq)', expectedMove: '-1-4%' },
      { ticker: 'SMH', label: 'VanEck Semiconductor', expectedMove: '-2-5%' },
      { ticker: 'FXI', label: 'China Large-Cap ETF', expectedMove: '-2-6%' },
      { ticker: 'XLK', label: 'Technology Select SPDR', expectedMove: '-1-3%' },
    ],
    sector: 'Trade / Tech / Industrials',
  },
  SANCTIONS: {
    bullish: [
      { ticker: 'CCJ', label: 'Cameco (Uranium)', expectedMove: '+2-5%' },
      { ticker: 'URA', label: 'Global Uranium ETF', expectedMove: '+2-4%' },
      { ticker: 'XLE', label: 'Energy Select SPDR', expectedMove: '+1-4%' },
    ],
    bearish: [
      { ticker: 'FXI', label: 'China Large-Cap ETF', expectedMove: '-1-4%' },
      { ticker: 'KWEB', label: 'KraneShares China Internet', expectedMove: '-2-5%' },
    ],
    sector: 'Energy / Resources / Geopolitics',
  },
  RATE_CUT: {
    bullish: [
      { ticker: 'QQQ', label: 'Invesco QQQ (Nasdaq)', expectedMove: '+2-5%' },
      { ticker: 'XLK', label: 'Technology Select SPDR', expectedMove: '+2-4%' },
      { ticker: 'VNQ', label: 'Vanguard Real Estate ETF', expectedMove: '+1-3%' },
      { ticker: 'ARKK', label: 'ARK Innovation ETF', expectedMove: '+3-6%' },
    ],
    bearish: [
      { ticker: 'XLF', label: 'Financial Select SPDR', expectedMove: '-0.5-2%' },
    ],
    sector: 'Growth / Tech / Real Estate',
  },
  RATE_HIKE: {
    bullish: [
      { ticker: 'XLF', label: 'Financial Select SPDR', expectedMove: '+1-3%' },
      { ticker: 'XLE', label: 'Energy Select SPDR', expectedMove: '+0.5-2%' },
    ],
    bearish: [
      { ticker: 'QQQ', label: 'Invesco QQQ (Nasdaq)', expectedMove: '-2-5%' },
      { ticker: 'TLT', label: 'iShares 20+ Year Treasury', expectedMove: '-2-4%' },
      { ticker: 'VNQ', label: 'Vanguard Real Estate ETF', expectedMove: '-1-3%' },
    ],
    sector: 'Bonds / Growth / Real Estate',
  },
  ELECTION: {
    bullish: [
      { ticker: 'GLD', label: 'SPDR Gold Shares', expectedMove: '+1-3%' },
      { ticker: 'VXX', label: 'VIX Short-Term Futures', expectedMove: '+5-15%' },
    ],
    bearish: [
      { ticker: 'SPY', label: 'S&P 500 ETF', expectedMove: '-1-3%' },
    ],
    sector: 'Volatility / Safe Haven',
  },
  REGULATION: {
    bullish: [],
    bearish: [],
    sector: 'Varies by regulation type',
  },
  SUPPLY_CHAIN: {
    bullish: [
      { ticker: 'XLI', label: 'Industrial Select SPDR', expectedMove: '+1-3%' },
      { ticker: 'FSTX', label: 'First Trust Industrials', expectedMove: '+1-2%' },
    ],
    bearish: [
      { ticker: 'SMH', label: 'VanEck Semiconductor', expectedMove: '-2-5%' },
      { ticker: 'SOXX', label: 'iShares Semiconductor', expectedMove: '-2-4%' },
    ],
    sector: 'Manufacturing / Semiconductors',
  },
  POLITICAL_CRISIS: {
    bullish: [
      { ticker: 'GLD', label: 'SPDR Gold Shares', expectedMove: '+1-4%' },
      { ticker: 'TLT', label: 'iShares 20+ Year Treasury', expectedMove: '+1-3%' },
      { ticker: 'UUP', label: 'US Dollar Bullish Fund', expectedMove: '+0.5-2%' },
    ],
    bearish: [
      { ticker: 'SPY', label: 'S&P 500 ETF', expectedMove: '-1-4%' },
      { ticker: 'EEM', label: 'Emerging Markets ETF', expectedMove: '-2-5%' },
    ],
    sector: 'Safe Haven / Volatility',
  },
};

// ─── Keyword-based event classification ─────────────────────────────
function classifyEvent(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase();

  const patterns: [RegExp, string][] = [
    [/\b(war|bomb|missile|strike|military|invasion|attack|armed|conflict|battle|troops|warship)\b/, 'CONFLICT'],
    [/\b(tariff|duty|import tax|trade war|trade barrier|customs|embargo|quotas)\b/, 'TARIFF'],
    [/\b(sanction|sanctions|blacklist|entity list|trade restriction|restrict.*trade)\b/, 'SANCTIONS'],
    [/\b(fed\s+cut|rate cut|interest rate cut|easing|dovish|monetary easing|lower.*rate)\b/, 'RATE_CUT'],
    [/\b(fed\s+hike|rate hike|interest rate hike|tightening|hawkish|raise.*rate|higher.*rate)\b/, 'RATE_HIKE'],
    [/\b(election|vote|ballot|poll|primary|caucus|candidate|campaign|midterm)\b/, 'ELECTION'],
    [/\b(supply chain|chip shortage|semiconductor shortage|port.*block|shipping.*disrupt)\b/, 'SUPPLY_CHAIN'],
    [/\b(coup|impeach|resign|protest|riot|unrest|coup|regime|overthrow|civil war)\b/, 'POLITICAL_CRISIS'],
    [/\b(regulat|antitrust|sec.*sue|fda.*approv|ban.*app|crypto.*regul)\b/, 'REGULATION'],
  ];

  for (const [regex, category] of patterns) {
    if (regex.test(text)) return category;
  }

  return 'POLITICAL_CRISIS';
}

// ─── Goldstein scale → severity ─────────────────────────────────────
function goldsteinToSeverity(scale: number): { severity: MarketEvent['severity']; score: number } {
  if (scale <= -7) return { severity: 'critical', score: 5 };
  if (scale <= -4) return { severity: 'high', score: 4 };
  if (scale <= -2) return { severity: 'elevated', score: 3 };
  if (scale <= 0) return { severity: 'moderate', score: 2 };
  return { severity: 'low', score: 1 };
}

// ─── Determine signal ───────────────────────────────────────────────
function determineSignal(
  severity: MarketEvent['severity'],
  category: string
): { signal: MarketEvent['signal']; tickers: string[] } {
  const mapping = EVENT_SECTOR_MAP[category];
  if (!mapping) return { signal: 'HOLD', tickers: [] };

  if (severity === 'critical' || severity === 'high') {
    const bullishTickers = mapping.bullish.map(t => t.ticker);
    const bearishTickers = mapping.bearish.map(t => t.ticker);
    if (bullishTickers.length > 0) return { signal: 'BUY', tickers: bullishTickers };
    if (bearishTickers.length > 0) return { signal: 'SELL', tickers: bearishTickers };
  }

  if (severity === 'elevated') {
    const all = [...mapping.bullish, ...mapping.bearish].map(t => t.ticker);
    return { signal: 'HOLD', tickers: all.slice(0, 3) };
  }

  return { signal: 'HOLD', tickers: [] };
}

// ─── GDELT DOC API fetch ────────────────────────────────────────────
async function fetchGDELTEvents(hoursBack: number = 6): Promise<any[]> {
  const queries = [
    'tariff OR sanctions OR war OR military OR "interest rate" OR fed OR election OR protest OR conflict OR supply chain',
  ];

  const allArticles: any[] = [];
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - hoursBack * 3600 * 1000);

  const startStr = startDate.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const endStr = endDate.toISOString().replace(/[-:T]/g, '').slice(0, 14);

  for (const query of queries) {
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&startdatetime=${startStr}&enddatetime=${endStr}&maxrecords=75&format=json&sort=DateDesc`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      if (data.articles) {
        allArticles.push(...data.articles.map((a: any) => ({
          ...a,
          _query: query,
        })));
      }
    } catch {
      // GDELT might be slow, continue with other queries
    }
  }

  return allArticles;
}

// ─── RSS fallback for more political news ────────────────────────────
async function fetchRSSPoliticalNews(): Promise<any[]> {
  const feeds = [
    'https://news.google.com/rss/search?q=tariff+trade+war+2026&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=sanctions+geopolitical+crisis&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=fed+interest+rate+decision&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=military+conflict+war+news&hl=en-US&gl=US&ceid=US:en',
  ];

  const allArticles: any[] = [];

  const results = await Promise.allSettled(
    feeds.map(url => parser.parseURL(url))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const item of result.value.items.slice(0, 15)) {
        allArticles.push({
          title: item.title || '',
          url: item.link || '',
          source: item.creator || item.source || 'Google News',
          seendate: item.isoDate || item.pubDate || '',
          snippet: item.contentSnippet?.slice(0, 300) || '',
          domain: item.link ? new URL(item.link).hostname : '',
          socialimage: item.enclosure?.url || '',
          _rssSource: true,
        });
      }
    }
  }

  return allArticles;
}

// ─── Process raw articles into MarketEvents ─────────────────────────
function processArticles(articles: any[]): MarketEvent[] {
  const seen = new Set<string>();
  const events: MarketEvent[] = [];

  for (const article of articles) {
    const title = article.title || '';
    const snippet = article.snippet || article.summary || '';
    const dedupKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);

    if (seen.has(dedupKey) || !title || title.length < 15) continue;
    seen.add(dedupKey);

    const category = classifyEvent(title, snippet);
    const mapping = EVENT_SECTOR_MAP[category];

    // Estimate Goldstein from keywords
    let goldsteinScale = -3;
    const text = `${title} ${snippet}`.toLowerCase();
    if (/\b(war|bomb|missile|invasion|attack|strike)\b/.test(text)) goldsteinScale = -8;
    else if (/\b(sanctions|tariff|embargo)\b/.test(text)) goldsteinScale = -5;
    else if (/\b(conflict|tensions|threat|protest)\b/.test(text)) goldsteinScale = -3;
    else if (/\b(negotiate|talk|pause|ceasefire)\b/.test(text)) goldsteinScale = -1;

    const { severity, score } = goldsteinToSeverity(goldsteinScale);
    const { signal, tickers } = determineSignal(severity, category);

    const affectedSectors = mapping
      ? [
          ...(mapping.bullish.length > 0
            ? [{
                sector: mapping.sector,
                direction: 'bullish' as const,
                tickers: mapping.bullish.map(t => t.ticker),
                expectedMove: mapping.bullish.map(t => `${t.ticker} ${t.expectedMove}`).join(', '),
              }]
            : []),
          ...(mapping.bearish.length > 0
            ? [{
                sector: mapping.sector,
                direction: 'bearish' as const,
                tickers: mapping.bearish.map(t => t.ticker),
                expectedMove: mapping.bearish.map(t => `${t.ticker} ${t.expectedMove}`).join(', '),
              }]
            : []),
        ]
      : [];

    events.push({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      summary: snippet.slice(0, 200),
      severity,
      severityScore: score,
      category,
      goldsteinScale,
      tone: 0,
      source: article.source || article.domain || 'Unknown',
      url: article.url || '',
      publishedAt: article.seendate || new Date().toISOString(),
      actors: [],
      affectedSectors,
      signal,
      signalTickers: tickers,
    });
  }

  // Sort by severity (highest first), then by recency
  events.sort((a, b) => {
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  return events;
}

// ─── API Route ──────────────────────────────────────────────────────
eventsRoutes.get('/events', async (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt(req.query.hours as string) || 6;
    const category = req.query.category as string;

    // Fetch from both GDELT and RSS
    const [gdeltArticles, rssArticles] = await Promise.all([
      fetchGDELTEvents(hoursBack).catch(() => []),
      fetchRSSPoliticalNews().catch(() => []),
    ]);

    const allArticles = [...gdeltArticles, ...rssArticles];
    let events = processArticles(allArticles);

    // Filter by category if specified
    if (category && category !== 'all') {
      events = events.filter(e => e.category === category);
    }

    // Limit to top 30
    events = events.slice(0, 30);

    // Build summary stats
    const summary = {
      total: events.length,
      critical: events.filter(e => e.severity === 'critical').length,
      high: events.filter(e => e.severity === 'high').length,
      elevated: events.filter(e => e.severity === 'elevated').length,
      moderate: events.filter(e => e.severity === 'moderate').length,
      low: events.filter(e => e.severity === 'low').length,
      buySignals: events.filter(e => e.signal === 'BUY').length,
      sellSignals: events.filter(e => e.signal === 'SELL').length,
      categories: [...new Set(events.map(e => e.category))],
    };

    // Build sector impact summary
    const sectorImpact: Record<string, { direction: string; count: number; tickers: string[] }> = {};
    for (const event of events) {
      for (const sector of event.affectedSectors) {
        const key = `${sector.sector}-${sector.direction}`;
        if (!sectorImpact[key]) {
          sectorImpact[key] = { direction: sector.direction, count: 0, tickers: [] };
        }
        sectorImpact[key].count++;
        sectorImpact[key].tickers.push(...sector.tickers);
      }
    }

    // Deduplicate sector tickers
    for (const key of Object.keys(sectorImpact)) {
      sectorImpact[key].tickers = [...new Set(sectorImpact[key].tickers)];
    }

    res.json({
      events,
      summary,
      sectorImpact,
      fetchedAt: new Date().toISOString(),
      hoursBack,
    });
  } catch (err: any) {
    log.error('Events fetch failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});
