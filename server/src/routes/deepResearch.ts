import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getStockDb } from '../stocks/db';

const log = createLogger({ module: 'deep-research' });
export const deepResearchRoutes = Router();

// ═══════════════════════════════════════════
// 1. Deep Research Query — search news + prices simultaneously
// ═══════════════════════════════════════════
deepResearchRoutes.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, dateFrom, dateTo, sources, limit = 50 } = req.body as {
      query: string;
      dateFrom?: string;
      dateTo?: string;
      sources?: string[];
      limit?: number;
    };

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'query is required' });
    }

    const newsDb = await getNewsArchiveDb();
    const stocksDb = await getStockDb();

    // ── Search news archive ──
    const keywords = query.split(/\s+/).filter(w => w.length > 2);
    const likeConditions = keywords.map(k => `(title LIKE '%${k}%' OR domain LIKE '%${k}%')`);
    let newsWhere = `WHERE published_at IS NOT NULL AND (${likeConditions.join(' OR ')})`;
    const newsParams: any[] = [];

    if (dateFrom) {
      newsWhere += ` AND published_at >= ?`;
      newsParams.push(dateFrom);
    }
    if (dateTo) {
      newsWhere += ` AND published_at <= ?`;
      newsParams.push(dateTo);
    }
    if (sources && sources.length > 0) {
      const placeholders = sources.map(() => '?').join(',');
      newsWhere += ` AND domain IN (${placeholders})`;
      newsParams.push(...sources);
    }

    const newsResult = newsDb.exec(
      `SELECT id, url, title, domain, source_country, published_at, tone, goldsteinscale
       FROM news_archive ${newsWhere}
       ORDER BY published_at DESC LIMIT ?`,
      [...newsParams, limit]
    );

    const articles = newsResult[0]?.values.map((r: any[]) => ({
      id: r[0],
      url: r[1],
      title: r[2],
      domain: r[3],
      source_country: r[4],
      published_at: r[5],
      tone: r[6],
      goldsteinscale: r[7],
    })) || [];

    // ── Aggregate tone by date for timeline ──
    const toneTimeline = newsDb.exec(
      `SELECT date(published_at) as day, AVG(tone) as avg_tone, COUNT(*) as cnt
       FROM news_archive ${newsWhere}
       GROUP BY day ORDER BY day`,
      newsParams
    );

    const timeline = toneTimeline[0]?.values.map((r: any[]) => ({
      date: r[0],
      avgTone: r[1],
      count: r[2],
    })) || [];

    // ── Extract mentioned tickers from titles ──
    const tickerPattern = /\b([A-Z]{1,5})\b/g;
    const tickerMentions: Record<string, number> = {};
    for (const a of articles) {
      const matches = (a.title as string).match(tickerPattern) || [];
      for (const t of matches) {
        tickerMentions[t] = (tickerMentions[t] || 0) + 1;
      }
    }

    // Validate tickers against stock_tickers table
    const topMentioned = Object.entries(tickerMentions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const validatedTickers: { symbol: string; mentions: number; name: string; sector: string }[] = [];
    for (const [symbol, mentions] of topMentioned) {
      const info = stocksDb.exec(
        `SELECT symbol, name, sector FROM stock_tickers WHERE symbol = ? LIMIT 1`,
        [symbol]
      );
      if (info[0]?.values[0]) {
        validatedTickers.push({
          symbol,
          mentions,
          name: info[0].values[0][1] as string,
          sector: info[0].values[0][2] as string,
        });
      }
    }

    // ── Get price data for top mentioned tickers ──
    const priceData: Record<string, any[]> = {};
    for (const vt of validatedTickers.slice(0, 5)) {
      const prices = stocksDb.exec(
        `SELECT date, close, volume FROM stock_prices
         WHERE symbol = ? ORDER BY date DESC LIMIT 90`,
        [vt.symbol]
      );
      priceData[vt.symbol] = prices[0]?.values.map((r: any[]) => ({
        date: r[0],
        close: r[1],
        volume: r[2],
      })) || [];
    }

    // ── Domain distribution ──
    const domainDist = newsDb.exec(
      `SELECT domain, COUNT(*) as cnt FROM news_archive ${newsWhere}
       GROUP BY domain ORDER BY cnt DESC LIMIT 15`,
      newsParams
    );

    const domains = domainDist[0]?.values.map((r: any[]) => ({
      domain: r[0],
      count: r[1],
    })) || [];

    // ── Country distribution ──
    const countryDist = newsDb.exec(
      `SELECT source_country, COUNT(*) as cnt FROM news_archive ${newsWhere}
       WHERE source_country != ''
       GROUP BY source_country ORDER BY cnt DESC LIMIT 15`,
      newsParams
    );

    const countries = countryDist[0]?.values.map((r: any[]) => ({
      country: r[0],
      count: r[1],
    })) || [];

    // ── Tone stats ──
    const toneStats = newsDb.exec(
      `SELECT AVG(tone), MIN(tone), MAX(tone), COUNT(CASE WHEN tone > 0 THEN 1 END),
              COUNT(CASE WHEN tone < 0 THEN 1 END), COUNT(CASE WHEN tone = 0 THEN 1 END)
       FROM news_archive ${newsWhere}`,
      newsParams
    );

    const stats = toneStats[0]?.values[0];
    const toneOverview = {
      avg: stats?.[0] ?? 0,
      min: stats?.[1] ?? 0,
      max: stats?.[2] ?? 0,
      positive: stats?.[3] ?? 0,
      negative: stats?.[4] ?? 0,
      neutral: stats?.[5] ?? 0,
    };

    res.json({
      query,
      articles,
      timeline,
      tickers: validatedTickers,
      priceData,
      domains,
      countries,
      toneOverview,
      totalArticles: articles.length,
    });
  } catch (err: any) {
    log.error('Deep research query failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Deep research query failed' });
  }
});

// ═══════════════════════════════════════════
// 2. Suggested queries
// ═══════════════════════════════════════════
deepResearchRoutes.get('/suggestions', async (_req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();

    // Find trending topics (most mentioned in recent articles)
    const recentTopics = db.exec(`
      SELECT title, tone, published_at FROM news_archive
      WHERE published_at >= date('now', '-7 days')
      ORDER BY published_at DESC LIMIT 200
    `);

    const words: Record<string, number> = {};
    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'his', 'her', 'was', 'one', 'our', 'out', 'new', 'say', 'that', 'with', 'this', 'will', 'each', 'make', 'like', 'than', 'them', 'then', 'what', 'when', 'your', 'from', 'have', 'been', 'said', 'more', 'also', 'just', 'over', 'into', 'some', 'could', 'other', 'which', 'their', 'about', 'would', 'there', 'these', 'being', 'media', 'news', 'says', 'report']);

    for (const row of (recentTopics[0]?.values || [])) {
      const title = (row[0] as string || '').toLowerCase();
      const titleWords = title.split(/[^a-z0-9]+/).filter(w => w.length > 4 && !stopWords.has(w));
      for (const w of titleWords) {
        words[w] = (words[w] || 0) + 1;
      }
    }

    const trending = Object.entries(words)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);

    res.json({ suggestions: trending });
  } catch (err: any) {
    log.error('Failed to get suggestions', { error: err.message });
    res.json({ suggestions: ['tariffs', 'inflation', 'fed rate', 'china trade', 'oil prices', 'tech earnings', 'election', 'sanctions'] });
  }
});
