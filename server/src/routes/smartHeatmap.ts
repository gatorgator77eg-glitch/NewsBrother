import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getStockDb } from '../stocks/db';

const log = createLogger({ module: 'smart-heatmap' });
export const smartHeatmapRoutes = Router();

smartHeatmapRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const archiveDb = await getNewsArchiveDb();
    const stocksDb = await getStockDb();

    const tickersResult = stocksDb.exec(`
      SELECT symbol, name, sector FROM stock_tickers
      WHERE sector != '' AND sector IS NOT NULL
      ORDER BY symbol LIMIT 500
    `);
    const allTickers = tickersResult[0]?.values.map((r: any[]) => ({
      symbol: r[0] as string, name: r[1] as string, sector: r[2] as string,
    })) || [];

    const sectorStats: Record<string, { totalArticles: number; tickerCount: number; tickers: Set<string> }> = {};

    const tickerArticlesResult = archiveDb.exec(`
      SELECT title, domain, published_at, tone FROM news_archive
      WHERE published_at IS NOT NULL AND published_at >= date('now', '-7 days')
    `);

    const allArticles = tickerArticlesResult[0]?.values || [];

    for (const ticker of allTickers) {
      const matching = allArticles.filter((r: any[]) =>
        (r[0] as string || '').toUpperCase().includes(ticker.symbol)
      );

      if (matching.length > 0) {
        if (!sectorStats[ticker.sector]) {
          sectorStats[ticker.sector] = { totalArticles: 0, tickerCount: 0, tickers: new Set() };
        }
        sectorStats[ticker.sector].totalArticles += matching.length;
        sectorStats[ticker.sector].tickers.add(ticker.symbol);
      }
    }

    const sectors = Object.entries(sectorStats)
      .map(([sector, data]) => ({
        sector,
        articleCount: data.totalArticles,
        tickerCount: data.tickers.size,
        velocityScore: Math.round((data.totalArticles / Math.max(data.tickers.size, 1)) * 100) / 100,
      }))
      .sort((a, b) => b.velocityScore - a.velocityScore);

    const tickerHeatmap = allTickers
      .map(ticker => {
        const articles = allArticles.filter((r: any[]) =>
          (r[0] as string || '').toUpperCase().includes(ticker.symbol)
        );
        return {
          symbol: ticker.symbol,
          name: ticker.name,
          sector: ticker.sector,
          articleCount: articles.length,
          avgTone: articles.length > 0
            ? articles.reduce((s: number, r: any[]) => s + (r[3] as number || 0), 0) / articles.length
            : 0,
          sourceCount: new Set(articles.map((r: any[]) => r[1])).size,
        };
      })
      .filter(t => t.articleCount > 0)
      .sort((a, b) => b.articleCount - a.articleCount)
      .slice(0, 100);

    const hourlyResult = archiveDb.exec(`
      SELECT strftime('%H', published_at) as hour,
             strftime('%w', published_at) as dow,
             COUNT(*) as cnt
      FROM news_archive
      WHERE published_at IS NOT NULL AND published_at >= date('now', '-14 days')
      GROUP BY hour, dow
      ORDER BY dow, hour
    `);
    const hourlyPattern = hourlyResult[0]?.values.map((r: any[]) => ({
      hour: parseInt(r[0] as string),
      dayOfWeek: parseInt(r[1] as string),
      count: r[2] as number,
    })) || [];

    const anomalies = tickerHeatmap
      .filter(t => t.articleCount >= 5)
      .map(t => {
        const sectorAvg = sectors.find(s => s.sector === t.sector);
        const expectedPerTicker = sectorAvg ? sectorAvg.articleCount / Math.max(sectorAvg.tickerCount, 1) : 0;
        const deviation = expectedPerTicker > 0 ? t.articleCount / expectedPerTicker : t.articleCount > 0 ? 3 : 0;
        return {
          symbol: t.symbol,
          name: t.name,
          sector: t.sector,
          articleCount: t.articleCount,
          expectedCount: Math.round(expectedPerTicker),
          deviation: Math.round(deviation * 100) / 100,
          isAnomaly: deviation >= 2,
        };
      })
      .filter(t => t.isAnomaly)
      .sort((a, b) => b.deviation - a.deviation);

    res.json({
      sectors,
      tickerHeatmap,
      hourlyPattern,
      anomalies,
      summary: {
        totalSectors: sectors.length,
        totalTickersWithNews: tickerHeatmap.length,
        totalAnomalies: anomalies.length,
        dateRange: { from: '7 days ago', to: 'now' },
      },
    });
  } catch (err: any) {
    log.error('Heatmap query failed', { error: err.message });
    res.status(500).json({ error: 'Heatmap query failed' });
  }
});
