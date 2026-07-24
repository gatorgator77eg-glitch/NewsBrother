import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getStockDb } from '../stocks/db';

const log = createLogger({ module: 'smart-velocity' });
export const smartVelocityRoutes = Router();

smartVelocityRoutes.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const stocksDb = await getStockDb();
    const symbol = req.params.symbol.toUpperCase();

    const tickerInfo = stocksDb.exec('SELECT symbol, name, sector FROM stock_tickers WHERE symbol = ? LIMIT 1', [symbol]);
    const ticker = tickerInfo[0]?.values[0]
      ? { symbol: tickerInfo[0].values[0][0], name: tickerInfo[0].values[0][1], sector: tickerInfo[0].values[0][2] }
      : { symbol, name: symbol, sector: '' };

    const articlesResult = db.exec(`
      SELECT date(published_at) as day, COUNT(*) as cnt, GROUP_CONCAT(DISTINCT domain) as domains
      FROM news_archive
      WHERE title LIKE '%${symbol}%' AND published_at IS NOT NULL
      GROUP BY day ORDER BY day DESC LIMIT 90
    `);

    const dailyData = articlesResult[0]?.values.map((r: any[]) => ({
      date: r[0] as string,
      count: r[1] as number,
      domains: (r[2] as string || '').split(','),
      sourceDiversity: (r[2] as string || '').split(',').filter(Boolean).length,
    })) || [];

    const todayCount = dailyData[0]?.count || 0;
    const last7 = dailyData.slice(0, 7);
    const prev7 = dailyData.slice(7, 14);
    const avgDaily7 = last7.length > 0 ? last7.reduce((s, d) => s + d.count, 0) / last7.length : 0;
    const avgDailyPrev = prev7.length > 0 ? prev7.reduce((s, d) => s + d.count, 0) / prev7.length : avgDaily7;
    const avgDaily30 = dailyData.slice(0, 30).length > 0
      ? dailyData.slice(0, 30).reduce((s, d) => s + d.count, 0) / Math.min(dailyData.length, 30)
      : 1;

    const velocityScore = avgDaily30 > 0 ? todayCount / avgDaily30 : todayCount > 0 ? 2 : 0;

    const trendSlope = last7.length >= 3
      ? (() => {
          const n = last7.length;
          const xMean = (n - 1) / 2;
          const yMean = last7.reduce((s, d) => s + d.count, 0) / n;
          let num = 0, den = 0;
          for (let i = 0; i < n; i++) {
            num += (i - xMean) * (last7[i].count - yMean);
            den += (i - xMean) * (i - xMean);
          }
          return den > 0 ? num / den : 0;
        })()
      : 0;

    const acceleration = avgDailyPrev > 0 ? (avgDaily7 / avgDailyPrev) : avgDaily7 > 0 ? 2 : 0;

    const todayDomains = dailyData[0]?.sourceDiversity || 0;
    const avgDomains7 = last7.length > 0 ? last7.reduce((s, d) => s + d.sourceDiversity, 0) / last7.length : 0;
    const sourceDiversityIndex = avgDomains7 > 0 ? todayDomains / avgDomains7 : todayDomains > 0 ? 2 : 0;

    const velocityAlert = velocityScore >= 3 ? 'spike' : velocityScore >= 2 ? 'elevated' : velocityScore >= 1 ? 'normal' : 'low';

    const hourlyResult = db.exec(`
      SELECT strftime('%H', published_at) as hour, COUNT(*) as cnt
      FROM news_archive
      WHERE title LIKE '%${symbol}%' AND published_at >= date('now', '-7 days')
      GROUP BY hour ORDER BY hour
    `);
    const hourlyDistribution = hourlyResult[0]?.values.map((r: any[]) => ({
      hour: parseInt(r[0] as string),
      count: r[1] as number,
    })) || [];

    res.json({
      ticker,
      velocityScore: Math.round(velocityScore * 100) / 100,
      velocityAlert,
      todayArticles: todayCount,
      avgDaily: Math.round(avgDaily7 * 10) / 10,
      trendSlope: Math.round(trendSlope * 100) / 100,
      trendDirection: trendSlope > 0.1 ? 'accelerating' : trendSlope < -0.1 ? 'decelerating' : 'flat',
      acceleration: Math.round(acceleration * 100) / 100,
      sourceDiversityIndex: Math.round(sourceDiversityIndex * 100) / 100,
      todaySourceCount: todayDomains,
      dailyHistory: dailyData.slice(0, 30),
      hourlyDistribution,
      totalArticles: dailyData.reduce((s, d) => s + d.count, 0),
    });
  } catch (err: any) {
    log.error('Velocity query failed', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ error: 'Velocity query failed' });
  }
});
