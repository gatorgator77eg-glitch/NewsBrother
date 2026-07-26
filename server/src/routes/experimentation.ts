import { Router, Request, Response } from 'express';
import { getStockDb, getTickerInfo, getTickerHistory, getTickerList } from '../stocks/db';
import { getDb } from '../db';
import { createLogger } from '../logger';

const log = createLogger({ module: 'experimentation' });

export const experimentationRoutes = Router();

interface TimelinePoint {
  date: string;
  close: number;
  normalized: number;
  volume: number;
  newsCount: number;
  newsSentiment: number;
  newsHeadlines: { title: string; source: string; bias: string; url: string }[];
}

interface TickerOption {
  symbol: string;
  name: string;
  exchange: string;
  country: string;
  hasData: boolean;
}

const POPULAR_TICKERS: TickerOption[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', country: 'US', hasData: false },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', country: 'US', hasData: false },
  { symbol: 'GOOGL', name: 'Alphabet', exchange: 'NASDAQ', country: 'US', hasData: false },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', country: 'US', hasData: false },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ', country: 'US', hasData: false },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', country: 'US', hasData: false },
  { symbol: 'META', name: 'Meta Platforms', exchange: 'NASDAQ', country: 'US', hasData: false },
  { symbol: 'JPM', name: 'JPMorgan Chase', exchange: 'NYSE', country: 'US', hasData: false },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE', country: 'US', hasData: false },
  { symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', country: 'US', hasData: false },
  { symbol: 'MC.PA', name: 'LVMH', exchange: 'Euronext Paris', country: 'FR', hasData: false },
  { symbol: 'OR.PA', name: 'L\'Oréal', exchange: 'Euronext Paris', country: 'FR', hasData: false },
  { symbol: 'SAN.PA', name: 'Sanofi', exchange: 'Euronext Paris', country: 'FR', hasData: false },
  { symbol: 'BNS.TO', name: 'Bank of Nova Scotia', exchange: 'TSX', country: 'CA', hasData: false },
  { symbol: 'NESN.SW', name: 'Nestlé', exchange: 'SIX', country: 'CH', hasData: false },
  { symbol: 'SIE.DE', name: 'Siemens', exchange: 'XETRA', country: 'DE', hasData: false },
  { symbol: 'SAP.DE', name: 'SAP', exchange: 'XETRA', country: 'DE', hasData: false },
  { symbol: 'TM', name: 'Toyota Motor', exchange: 'NYSE', country: 'JP', hasData: false },
  { symbol: 'HSBA.L', name: 'HSBC Holdings', exchange: 'LSE', country: 'GB', hasData: false },
  { symbol: 'SHEL', name: 'Shell plc', exchange: 'NYSE', country: 'GB', hasData: false },
  { symbol: '005930.KS', name: 'Samsung Electronics', exchange: 'KRX', country: 'KR', hasData: false },
  { symbol: 'BABA', name: 'Alibaba Group', exchange: 'NYSE', country: 'CN', hasData: false },
];

function parseArticleDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function articleDateKey(raw: string): string {
  const d = parseArticleDate(raw);
  return d ? d.toISOString().slice(0, 10) : '';
}

async function getNewsForDateRange(startDate: string, endDate: string) {
  const db = await getDb();
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const articles: any[] = [];

  try {
    const rssResult = db.exec(`
      SELECT a.title, a.url, a.published_at, s.name as source_name, s.bias
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      ORDER BY a.published_at ASC
    `);

    if (rssResult.length) {
      for (const row of rssResult[0].values) {
        const pubDate = parseArticleDate(row[2] as string);
        if (!pubDate) continue;
        const ms = pubDate.getTime();
        if (ms < startMs || ms > endMs) continue;
        articles.push({
          title: row[0],
          url: row[1],
          published_at: row[2],
          source: row[3] || 'RSS',
          bias: row[4] || 'center',
          type: 'rss',
        });
      }
    }
  } catch (e) {
    log.warn('RSS news query failed', { error: (e as Error).message });
  }

  try {
    const gdeltResult = db.exec(`
      SELECT title, url, published_at, domain, tone
      FROM news_archive
      WHERE title != ''
      ORDER BY published_at ASC
      LIMIT 2000
    `);

    if (gdeltResult.length) {
      for (const row of gdeltResult[0].values) {
        const pubDate = parseArticleDate(row[2] as string);
        if (!pubDate) continue;
        const ms = pubDate.getTime();
        if (ms < startMs || ms > endMs) continue;
        const tone = row[4] as number || 0;
        const bias = tone > 0.5 ? 'left' : tone > 0.1 ? 'lean-left' : tone < -0.5 ? 'right' : tone < -0.1 ? 'lean-right' : 'center';
        articles.push({
          title: row[0],
          url: row[1],
          published_at: row[2],
          source: row[3] || 'GDELT',
          bias,
          tone,
          type: 'gdelt',
        });
      }
    }
  } catch (e) {
    log.warn('GDELT news query failed', { error: (e as Error).message });
  }

  articles.sort((a, b) => {
    const da = parseArticleDate(a.published_at)?.getTime() || 0;
    const db2 = parseArticleDate(b.published_at)?.getTime() || 0;
    return da - db2;
  });

  return articles;
}

experimentationRoutes.get('/experimentation/tickers', async (_req: Request, res: Response) => {
  try {
    await getStockDb();
    const { tickers } = getTickerList(undefined, undefined, 1, 5000);

    const symbolsWithData = new Set<string>();
    try {
      const db = await getStockDb();
      const result = db.exec(`SELECT DISTINCT symbol FROM stock_prices`);
      if (result.length) {
        for (const row of result[0].values) {
          symbolsWithData.add(row[0] as string);
        }
      }
    } catch {}

    const symbolSet = new Set<string>();
    const merged: TickerOption[] = [];

    for (const t of POPULAR_TICKERS) {
      if (!symbolSet.has(t.symbol)) {
        symbolSet.add(t.symbol);
        merged.push({ ...t, hasData: symbolsWithData.has(t.symbol) });
      }
    }
    for (const t of tickers) {
      if (!symbolSet.has(t.symbol)) {
        symbolSet.add(t.symbol);
        merged.push({
          symbol: t.symbol,
          name: t.name,
          exchange: t.exchange,
          country: t.country,
          hasData: symbolsWithData.has(t.symbol),
        });
      }
    }

    res.json({ tickers: merged });
  } catch (err: any) {
    log.error('Failed to load tickers', { error: err.message });
    res.json({ tickers: POPULAR_TICKERS.map(t => ({ ...t, hasData: false })) });
  }
});

experimentationRoutes.get('/experimentation/timeline', async (req: Request, res: Response) => {
  try {
    await getStockDb();
    const symbol = (req.query.symbol as string || 'AAPL').toUpperCase();
    const days = Math.min(parseInt(req.query.days as string || '90'), 365);
    const benchmark = (req.query.benchmark as string || '').toUpperCase();

    const allPrices = getTickerHistory(symbol);
    if (!allPrices.length) {
      return res.status(404).json({
        error: `No price data for "${symbol}". Go to Stock Library to download prices first.`,
      });
    }

    const tickerInfo = getTickerInfo(symbol);
    const ticker = tickerInfo || {
      symbol,
      name: symbol,
      exchange: '',
      country: '',
      sector: '',
      industry: '',
      market_cap: 0,
    };

    const cutoffDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const filteredPrices = allPrices.filter(p => p.date >= cutoffDate);

    if (!filteredPrices.length) {
      return res.status(404).json({
        error: `No price data for "${symbol}" in the last ${days} days. Try a longer period or different ticker.`,
      });
    }

    const startDate = filteredPrices[0].date;
    const endDate = filteredPrices[filteredPrices.length - 1].date;

    const newsArticles = await getNewsForDateRange(startDate + 'T00:00:00', endDate + 'T23:59:59');

    const newsByDate: Record<string, any[]> = {};
    for (const article of newsArticles) {
      const dateKey = articleDateKey(article.published_at);
      if (!dateKey) continue;
      if (!newsByDate[dateKey]) newsByDate[dateKey] = [];
      newsByDate[dateKey].push(article);
    }

    const basePrice = filteredPrices[0].close || 1;

    const timeline: TimelinePoint[] = filteredPrices.map(p => {
      const dayNews = newsByDate[p.date] || [];
      const sentimentMap: Record<string, number> = { left: 1, 'lean-left': 0.5, center: 0, 'lean-right': -0.5, right: -1 };
      const avgSentiment = dayNews.length > 0
        ? dayNews.reduce((sum: number, a: any) => sum + (sentimentMap[a.bias] || 0), 0) / dayNews.length
        : 0;

      return {
        date: p.date,
        close: p.close,
        normalized: (p.close / basePrice) * 100,
        volume: p.volume,
        newsCount: dayNews.length,
        newsSentiment: Math.round(avgSentiment * 100) / 100,
        newsHeadlines: dayNews.slice(0, 5).map((a: any) => ({
          title: a.title,
          source: a.source,
          bias: a.bias,
          url: a.url,
        })),
      };
    });

    let benchmarkData: { symbol: string; name: string; timeline: { date: string; normalized: number }[] } | null = null;

    if (benchmark) {
      const benchPrices = getTickerHistory(benchmark);
      if (benchPrices.length) {
        const benchInfo = getTickerInfo(benchmark);
        const benchFiltered = benchPrices.filter(p => p.date >= cutoffDate);
        if (benchFiltered.length) {
          const benchBase = benchFiltered[0].close || 1;
          benchmarkData = {
            symbol: benchmark,
            name: benchInfo ? String(benchInfo.name) : benchmark,
            timeline: benchFiltered.map(p => ({
              date: p.date,
              normalized: (p.close / benchBase) * 100,
            })),
          };
        }
      }
    }

    const totalNews = timeline.reduce((sum, t) => sum + t.newsCount, 0);
    const lastPrice = timeline[timeline.length - 1]?.close || 0;
    const firstPrice = timeline[0]?.close || 0;
    const priceChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const maxClose = Math.max(...timeline.map(t => t.close));
    const minClose = Math.min(...timeline.map(t => t.close));
    const maxNewsDay = timeline.reduce((max, t) => t.newsCount > max.newsCount ? t : max, timeline[0]);
    const avgDailyNews = totalNews / Math.max(timeline.length, 1);

    res.json({
      ticker,
      timeline,
      benchmark: benchmarkData,
      stats: {
        totalNews,
        priceChange: Math.round(priceChange * 100) / 100,
        high: maxClose,
        low: minClose,
        maxNewsDay: maxNewsDay.date,
        maxNewsCount: maxNewsDay.newsCount,
        avgDailyNews: Math.round(avgDailyNews * 10) / 10,
        volatility: Math.round((maxClose - minClose) / firstPrice * 100 * 100) / 100,
      },
    });
  } catch (err: any) {
    log.error('Experimentation timeline failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});
