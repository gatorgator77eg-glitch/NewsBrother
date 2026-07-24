import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getStockDb } from '../stocks/db';

const log = createLogger({ module: 'smart-leadlag' });
export const smartLeadLagRoutes = Router();

smartLeadLagRoutes.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const archiveDb = await getNewsArchiveDb();
    const stocksDb = await getStockDb();
    const symbol = req.params.symbol.toUpperCase();
    const { maxLag = 48 } = req.query;

    const tickerInfo = stocksDb.exec('SELECT symbol, name, sector FROM stock_tickers WHERE symbol = ? LIMIT 1', [symbol]);
    const ticker = tickerInfo[0]?.values[0]
      ? { symbol: tickerInfo[0].values[0][0], name: tickerInfo[0].values[0][1], sector: tickerInfo[0].values[0][2] }
      : { symbol, name: symbol, sector: '' };

    const pricesResult = stocksDb.exec(`
      SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date ASC
    `, [symbol]);
    const prices = pricesResult[0]?.values.map((r: any[]) => ({
      date: r[0] as string,
      close: r[1] as number,
    })) || [];

    const dailyReturns: Record<string, number> = {};
    for (let i = 1; i < prices.length; i++) {
      dailyReturns[prices[i].date] = (prices[i].close - prices[i - 1].close) / prices[i - 1].close;
    }

    const toneResult = archiveDb.exec(`
      SELECT date(published_at) as day, AVG(tone) as avg_tone, COUNT(*) as cnt
      FROM news_archive
      WHERE title LIKE '%${symbol}%' AND published_at IS NOT NULL AND tone != 0
      GROUP BY day ORDER BY day ASC
    `);
    const toneByDay: { date: string; tone: number; count: number }[] =
      toneResult[0]?.values.map((r: any[]) => ({
        date: r[0] as string,
        tone: r[1] as number,
        count: r[2] as number,
      })) || [];

    const alignedDates = toneByDay
      .filter(t => dailyReturns[t.date] !== undefined)
      .map(t => ({ ...t, ret: dailyReturns[t.date] }));

    const meanTone = alignedDates.length > 0
      ? alignedDates.reduce((s, d) => s + d.tone, 0) / alignedDates.length : 0;
    const meanReturn = alignedDates.length > 0
      ? alignedDates.reduce((s, d) => s + d.ret, 0) / alignedDates.length : 0;
    const stdTone = alignedDates.length > 0
      ? Math.sqrt(alignedDates.reduce((s, d) => s + (d.tone - meanTone) ** 2, 0) / alignedDates.length) || 1 : 1;
    const stdReturn = alignedDates.length > 0
      ? Math.sqrt(alignedDates.reduce((s, d) => s + (d.ret - meanReturn) ** 2, 0) / alignedDates.length) || 1 : 1;

    const lagCorrelations: { lag: number; correlation: number; pValue: number }[] = [];
    const maxLagNum = parseInt(maxLag as string);

    for (let lag = -Math.min(5, maxLagNum); lag <= maxLagNum; lag++) {
      if (lag === 0) {
        const n = alignedDates.length;
        if (n < 5) { lagCorrelations.push({ lag: 0, correlation: 0, pValue: 1 }); continue; }
        const cov = alignedDates.reduce((s, d) => s + (d.tone - meanTone) * (d.ret - meanReturn), 0) / n;
        const corr = cov / (stdTone * stdReturn);
        const tStat = corr * Math.sqrt((n - 2) / (1 - corr * corr || 0.001));
        const pValue = Math.min(1, 2 * Math.exp(-0.717 * Math.abs(tStat) - 0.416 * tStat * tStat));
        lagCorrelations.push({ lag: 0, correlation: Math.round(corr * 1000) / 1000, pValue: Math.round(pValue * 1000) / 1000 });
      } else if (lag > 0) {
        const n = alignedDates.length - lag;
        if (n < 5) { lagCorrelations.push({ lag, correlation: 0, pValue: 1 }); continue; }
        let sumXY = 0, sumX2 = 0, sumY2 = 0;
        for (let i = 0; i < n; i++) {
          const x = alignedDates[i].tone - meanTone;
          const y = alignedDates[i + lag].ret - meanReturn;
          sumXY += x * y;
          sumX2 += x * x;
          sumY2 += y * y;
        }
        const corr = sumXY / (Math.sqrt(sumX2 * sumY2) || 1);
        const tStat = corr * Math.sqrt((n - 2) / (1 - corr * corr || 0.001));
        const pValue = Math.min(1, 2 * Math.exp(-0.717 * Math.abs(tStat) - 0.416 * tStat * tStat));
        lagCorrelations.push({ lag, correlation: Math.round(corr * 1000) / 1000, pValue: Math.round(pValue * 1000) / 1000 });
      } else {
        const n = alignedDates.length + lag;
        if (n < 5) { lagCorrelations.push({ lag, correlation: 0, pValue: 1 }); continue; }
        let sumXY = 0, sumX2 = 0, sumY2 = 0;
        for (let i = -lag; i < n; i++) {
          const x = alignedDates[i].tone - meanTone;
          const y = alignedDates[i + lag].ret - meanReturn;
          sumXY += x * y;
          sumX2 += x * x;
          sumY2 += y * y;
        }
        const corr = sumXY / (Math.sqrt(sumX2 * sumY2) || 1);
        const tStat = corr * Math.sqrt((n - 2) / (1 - corr * corr || 0.001));
        const pValue = Math.min(1, 2 * Math.exp(-0.717 * Math.abs(tStat) - 0.416 * tStat * tStat));
        lagCorrelations.push({ lag, correlation: Math.round(corr * 1000) / 1000, pValue: Math.round(pValue * 1000) / 1000 });
      }
    }

    const bestPositiveLag = lagCorrelations
      .filter(l => l.lag > 0 && l.pValue < 0.1)
      .sort((a, b) => b.correlation - a.correlation)[0];
    const bestNegativeLag = lagCorrelations
      .filter(l => l.lag < 0 && l.pValue < 0.1)
      .sort((a, b) => b.correlation - a.correlation)[0];

    const signalDecay: { hours: number; correlation: number }[] = [];
    for (let h = 0; h <= 48; h += 6) {
      const dayLag = Math.ceil(h / 24);
      const entry = lagCorrelations.find(l => l.lag === dayLag);
      signalDecay.push({ hours: h, correlation: entry?.correlation || 0 });
    }

    const grangerResult = (() => {
      if (alignedDates.length < 20) return { significant: false, fStat: 0, pValue: 1, optimalLag: 0 };
      let bestLag = 1;
      let bestCorr = 0;
      for (let lag = 1; lag <= Math.min(5, Math.floor(alignedDates.length / 4)); lag++) {
        let sumXY = 0, sumX2 = 0, sumY2 = 0;
        const n = alignedDates.length - lag;
        for (let i = 0; i < n; i++) {
          const x = alignedDates[i].tone - meanTone;
          const y = alignedDates[i + lag].ret - meanReturn;
          sumXY += x * y;
          sumX2 += x * x;
          sumY2 += y * y;
        }
        const corr = sumXY / (Math.sqrt(sumX2 * sumY2) || 1);
        if (Math.abs(corr) > Math.abs(bestCorr)) {
          bestCorr = corr;
          bestLag = lag;
        }
      }
      const n = alignedDates.length - bestLag;
      const fStat = n > 2 ? (bestCorr * bestCorr * (n - 2)) / (1 - bestCorr * bestCorr || 0.001) : 0;
      const pValue = Math.min(1, Math.exp(-fStat / 3));
      return {
        significant: pValue < 0.1,
        fStat: Math.round(fStat * 100) / 100,
        pValue: Math.round(pValue * 1000) / 1000,
        optimalLag: bestLag,
      };
    })();

    res.json({
      ticker,
      lagCorrelations,
      signalDecay,
      granger: grangerResult,
      bestPredictiveLag: bestPositiveLag ? { lag: bestPositiveLag.lag, correlation: bestPositiveLag.correlation, pValue: bestPositiveLag.pValue } : null,
      dataPoints: alignedDates.length,
    });
  } catch (err: any) {
    log.error('Lead-lag query failed', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ error: 'Lead-lag query failed' });
  }
});
