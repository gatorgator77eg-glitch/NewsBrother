import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getStockDb } from '../stocks/db';

const log = createLogger({ module: 'smart-impact' });
export const smartImpactRoutes = Router();

smartImpactRoutes.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const archiveDb = await getNewsArchiveDb();
    const stocksDb = await getStockDb();
    const symbol = req.params.symbol.toUpperCase();
    const { days = 30 } = req.query;

    const tickerInfo = stocksDb.exec('SELECT symbol, name, sector FROM stock_tickers WHERE symbol = ? LIMIT 1', [symbol]);
    const ticker = tickerInfo[0]?.values[0]
      ? { symbol: tickerInfo[0].values[0][0], name: tickerInfo[0].values[0][1], sector: tickerInfo[0].values[0][2] }
      : { symbol, name: symbol, sector: '' };

    const pricesResult = stocksDb.exec(`
      SELECT date, open, high, low, close, volume
      FROM stock_prices WHERE symbol = ? ORDER BY date ASC
    `, [symbol]);
    const prices = pricesResult[0]?.values.map((r: any[]) => ({
      date: r[0] as string,
      open: r[1] as number,
      high: r[2] as number,
      low: r[3] as number,
      close: r[4] as number,
      volume: r[5] as number,
    })) || [];

    if (prices.length < 10) {
      return res.json({ ticker, events: [], summary: { totalEvents: 0, avgImpact: 0, avgLag: 0 } });
    }

    const returns: { date: string; ret: number; volume: number }[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push({
        date: prices[i].date,
        ret: (prices[i].close - prices[i - 1].close) / prices[i - 1].close,
        volume: prices[i].volume,
      });
    }

    const avgReturn = returns.reduce((s, r) => s + r.ret, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r.ret - avgReturn) ** 2, 0) / returns.length) || 0.01;
    const avgVolume = returns.reduce((s, r) => s + r.volume, 0) / returns.length;

    const articlesResult = archiveDb.exec(`
      SELECT date(published_at) as day, COUNT(*) as cnt, AVG(tone) as avg_tone,
             GROUP_CONCAT(title, '||') as titles
      FROM news_archive
      WHERE title LIKE '%${symbol}%'
        AND published_at IS NOT NULL
        AND published_at >= date('now', '-${parseInt(days as string)} days')
      GROUP BY day ORDER BY day ASC
    `);

    const newsClusters = articlesResult[0]?.values.map((r: any[]) => ({
      date: r[0] as string,
      count: r[1] as number,
      avgTone: r[2] as number,
      titles: (r[3] as string || '').split('||').filter(Boolean),
    })) || [];

    const events = newsClusters.map(cluster => {
      const dayReturn = returns.find(r => r.date === cluster.date);
      const dayBefore = returns.find(r => {
        const d = new Date(cluster.date);
        d.setDate(d.getDate() - 1);
        return r.date === d.toISOString().slice(0, 10);
      });
      const dayAfter = returns.find(r => {
        const d = new Date(cluster.date);
        d.setDate(d.getDate() + 1);
        return r.date === d.toISOString().slice(0, 10);
      });

      const actualReturn = dayReturn?.ret || 0;
      const expectedReturn = avgReturn;
      const abnormalReturn = actualReturn - expectedReturn;

      const volumeSpike = dayReturn && avgVolume > 0 ? dayReturn.volume / avgVolume : 1;
      const arZScore = stdReturn > 0 ? abnormalReturn / stdReturn : 0;

      let lagHours = 0;
      if (dayBefore && dayReturn) {
        const prevRet = dayBefore.ret;
        if (Math.abs(actualReturn) > Math.abs(prevRet) * 1.5) lagHours = 12;
        else if (Math.abs(actualReturn) > Math.abs(prevRet) * 1.2) lagHours = 6;
        else lagHours = 2;
      }

      const impactMagnitude = Math.abs(abnormalReturn);
      const impactScore = impactMagnitude * (cluster.count / Math.max(...newsClusters.map(c => c.count), 1)) * Math.min(volumeSpike, 3);

      return {
        date: cluster.date,
        articleCount: cluster.count,
        avgTone: cluster.avgTone,
        titles: cluster.titles.slice(0, 3),
        actualReturn: Math.round(actualReturn * 10000) / 100,
        abnormalReturn: Math.round(abnormalReturn * 10000) / 100,
        arZScore: Math.round(arZScore * 100) / 100,
        volumeSpike: Math.round(volumeSpike * 100) / 100,
        impactScore: Math.round(impactScore * 1000) / 1000,
        estimatedLagHours: lagHours,
        direction: abnormalReturn > 0 ? 'bullish' : abnormalReturn < 0 ? 'bearish' : 'neutral',
      };
    });

    events.sort((a, b) => b.impactScore - a.impactScore);

    const totalEvents = events.length;
    const avgImpact = totalEvents > 0
      ? events.reduce((s, e) => s + Math.abs(e.abnormalReturn), 0) / totalEvents
      : 0;
    const avgLag = totalEvents > 0
      ? events.reduce((s, e) => s + e.estimatedLagHours, 0) / totalEvents
      : 0;

    const impactByCategory = {
      highImpact: events.filter(e => e.impactScore > 0.5).length,
      mediumImpact: events.filter(e => e.impactScore > 0.2 && e.impactScore <= 0.5).length,
      lowImpact: events.filter(e => e.impactScore <= 0.2).length,
    };

    res.json({
      ticker,
      events: events.slice(0, 30),
      summary: {
        totalEvents,
        avgImpact: Math.round(avgImpact * 100) / 100,
        avgLag: Math.round(avgLag * 10) / 10,
        impactByCategory,
        normalReturn: Math.round(avgReturn * 10000) / 100,
        returnVolatility: Math.round(stdReturn * 10000) / 100,
      },
    });
  } catch (err: any) {
    log.error('Impact query failed', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ error: 'Impact query failed' });
  }
});
