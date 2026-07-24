import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getStockDb, getTickerHistory, getTickerInfo } from '../stocks/db';

const log = createLogger({ module: 'correlation' });
export const correlationRoutes = Router();

// ═══════════════════════════════════════════
// 1. Correlation Analysis — tone vs price for a ticker
// ═══════════════════════════════════════════
correlationRoutes.get('/ticker/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days as string) || 90;
    const newsDb = await getNewsArchiveDb();
    const stocksDb = await getStockDb();

    const ticker = getTickerInfo(symbol);
    if (!ticker) {
      return res.status(404).json({ error: 'Ticker not found' });
    }

    const companyName = (ticker.name as string || symbol).replace(/['"]/g, '');
    const prices = getTickerHistory(symbol);

    if (prices.length === 0) {
      return res.status(404).json({ error: 'No price data found' });
    }

    // Filter prices to date range
    const cutoffDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const recentPrices = prices.filter(p => p.date >= cutoffDate);

    // Get tone data for articles mentioning this ticker
    const toneResult = newsDb.exec(
      `SELECT date(published_at) as day, AVG(tone) as avg_tone, COUNT(*) as cnt
       FROM news_archive
       WHERE (title LIKE '%${companyName}%' OR title LIKE '%${symbol}%')
         AND tone != 0
         AND published_at >= ?
       GROUP BY day ORDER BY day`,
      [cutoffDate]
    );

    const toneByDay: Record<string, { avgTone: number; count: number }> = {};
    for (const row of (toneResult[0]?.values || [])) {
      toneByDay[row[0] as string] = { avgTone: row[1] as number, count: row[2] as number };
    }

    // Build aligned series (date, tone, close, dailyReturn)
    const aligned: {
      date: string;
      tone: number;
      toneCount: number;
      close: number;
      dailyReturn: number;
    }[] = [];

    for (let i = 0; i < recentPrices.length; i++) {
      const p = recentPrices[i];
      const t = toneByDay[p.date];
      const prevClose = i > 0 ? recentPrices[i - 1].close : p.close;
      const dailyReturn = prevClose > 0 ? ((p.close - prevClose) / prevClose) * 100 : 0;

      aligned.push({
        date: p.date,
        tone: t?.avgTone || 0,
        toneCount: t?.count || 0,
        close: p.close,
        dailyReturn,
      });
    }

    // Compute Pearson correlation between tone and daily return
    const paired = aligned.filter(d => d.tone !== 0);
    let correlation = 0;
    let pValue = 0;

    if (paired.length >= 5) {
      const n = paired.length;
      const tones = paired.map(d => d.tone);
      const returns = paired.map(d => d.dailyReturn);

      const meanT = tones.reduce((a, b) => a + b, 0) / n;
      const meanR = returns.reduce((a, b) => a + b, 0) / n;

      let num = 0, denT = 0, denR = 0;
      for (let i = 0; i < n; i++) {
        const dt = tones[i] - meanT;
        const dr = returns[i] - meanR;
        num += dt * dr;
        denT += dt * dt;
        denR += dr * dr;
      }

      const den = Math.sqrt(denT * denR);
      correlation = den > 0 ? num / den : 0;

      // Approximate p-value using t-distribution
      if (Math.abs(correlation) < 1) {
        const tStat = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
        const df = n - 2;
        // Simple approximation
        pValue = Math.min(1, Math.exp(-0.717 * Math.abs(tStat) - 0.416 * tStat * tStat));
      } else {
        pValue = 0;
      }
    }

    // Compute lagged correlations (tone leads price by N days)
    const lagged: { lag: number; correlation: number }[] = [];
    for (let lag = -5; lag <= 5; lag++) {
      const lagPaired: { t: number; r: number }[] = [];
      for (let i = 0; i < aligned.length; i++) {
        const tIdx = i;
        const rIdx = i + lag;
        if (tIdx >= 0 && tIdx < aligned.length && rIdx >= 0 && rIdx < aligned.length) {
          if (aligned[tIdx].tone !== 0) {
            lagPaired.push({ t: aligned[tIdx].tone, r: aligned[rIdx].dailyReturn });
          }
        }
      }

      if (lagPaired.length >= 5) {
        const n = lagPaired.length;
        const meanT = lagPaired.reduce((a, b) => a + b.t, 0) / n;
        const meanR = lagPaired.reduce((a, b) => a + b.r, 0) / n;
        let num = 0, denT = 0, denR = 0;
        for (const p of lagPaired) {
          const dt = p.t - meanT;
          const dr = p.r - meanR;
          num += dt * dr;
          denT += dt * dt;
          denR += dr * dr;
        }
        const den = Math.sqrt(denT * denR);
        lagged.push({ lag, correlation: den > 0 ? num / den : 0 });
      } else {
        lagged.push({ lag, correlation: 0 });
      }
    }

    // Tone sentiment breakdown
    const toneBreakdown = newsDb.exec(
      `SELECT
         COUNT(CASE WHEN tone > 1 THEN 1 END) as positive,
         COUNT(CASE WHEN tone < -1 THEN 1 END) as negative,
         COUNT(CASE WHEN tone >= -1 AND tone <= 1 THEN 1 END) as neutral,
         COUNT(*) as total
       FROM news_archive
       WHERE (title LIKE '%${companyName}%' OR title LIKE '%${symbol}%')
         AND published_at >= ?`,
      [cutoffDate]
    );

    const tb = toneBreakdown[0]?.values[0];

    res.json({
      ticker: { symbol, name: ticker.name, sector: ticker.sector },
      correlation: Math.round(correlation * 1000) / 1000,
      pValue: Math.round(pValue * 1000) / 1000,
      sampleSize: paired.length,
      lagged,
      aligned,
      toneBreakdown: {
        positive: tb?.[0] ?? 0,
        negative: tb?.[1] ?? 0,
        neutral: tb?.[2] ?? 0,
        total: tb?.[3] ?? 0,
      },
      days,
    });
  } catch (err: any) {
    log.error('Correlation analysis failed', { symbol: req.params.symbol, error: err.message });
    res.status(500).json({ error: 'Correlation analysis failed' });
  }
});

// ═══════════════════════════════════════════
// 2. Cross-market correlation heatmap
// ═══════════════════════════════════════════
correlationRoutes.get('/heatmap', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const newsDb = await getNewsArchiveDb();
    const stocksDb = await getStockDb();
    const cutoffDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Get top 15 sectors with most articles
    const sectorResult = stocksDb.exec(
      `SELECT sector, COUNT(*) as cnt FROM stock_tickers
       WHERE sector != '' AND sector IS NOT NULL
       GROUP BY sector ORDER BY cnt DESC LIMIT 15`
    );

    const sectors = (sectorResult[0]?.values || []).map(r => ({
      sector: r[0] as string,
      tickerCount: r[1] as number,
    }));

    // For each sector, get average tone and average price change
    const heatmap: {
      sector: string;
      avgTone: number;
      avgPriceChange: number;
      articleCount: number;
      correlation: number;
    }[] = [];

    for (const s of sectors) {
      // Get tickers in this sector
      const tickers = stocksDb.exec(
        `SELECT symbol FROM stock_tickers WHERE sector = ? LIMIT 10`,
        [s.sector]
      );
      const tickerList = (tickers[0]?.values || []).map(r => r[0] as string);

      // Get avg tone for articles mentioning any of these tickers
      const toneConditions = tickerList.map(t => `title LIKE '%${t}%'`).join(' OR ');
      const toneResult = newsDb.exec(
        `SELECT AVG(tone) as avg_tone, COUNT(*) as cnt
         FROM news_archive
         WHERE (${toneConditions}) AND tone != 0 AND published_at >= ?`,
        [cutoffDate]
      );

      const avgTone = (toneResult[0]?.values[0]?.[0] as number) || 0;
      const articleCount = (toneResult[0]?.values[0]?.[1] as number) || 0;

      // Get avg price change for tickers in this sector
      let totalChange = 0;
      let changeCount = 0;
      for (const sym of tickerList.slice(0, 5)) {
        const prices = stocksDb.exec(
          `SELECT close FROM stock_prices WHERE symbol = ? AND date >= ? ORDER BY date ASC LIMIT 1`,
          [sym, cutoffDate]
        );
        const oldPrices = stocksDb.exec(
          `SELECT close FROM stock_prices WHERE symbol = ? AND date < ? ORDER BY date DESC LIMIT 1`,
          [sym, cutoffDate]
        );
        const newClose = prices[0]?.values[0]?.[0] as number;
        const oldClose = oldPrices[0]?.values[0]?.[0] as number;
        if (newClose && oldClose) {
          totalChange += ((newClose - oldClose) / oldClose) * 100;
          changeCount++;
        }
      }
      const avgPriceChange = changeCount > 0 ? totalChange / changeCount : 0;

      heatmap.push({
        sector: s.sector,
        avgTone: Math.round(avgTone * 100) / 100,
        avgPriceChange: Math.round(avgPriceChange * 100) / 100,
        articleCount,
        correlation: 0,
      });
    }

    res.json({ heatmap, days });
  } catch (err: any) {
    log.error('Heatmap generation failed', { error: err.message });
    res.status(500).json({ error: 'Heatmap generation failed' });
  }
});

// ═══════════════════════════════════════════
// 3. Market-wide narrative strength
// ═══════════════════════════════════════════
correlationRoutes.get('/narrative-strength', async (req: Request, res: Response) => {
  try {
    const newsDb = await getNewsArchiveDb();
    const days = parseInt(req.query.days as string) || 30;
    const cutoffDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Daily article volume and average tone
    const dailyResult = newsDb.exec(
      `SELECT date(published_at) as day, COUNT(*) as cnt, AVG(tone) as avg_tone
       FROM news_archive
       WHERE published_at >= ? AND tone != 0
       GROUP BY day ORDER BY day`,
      [cutoffDate]
    );

    const daily = (dailyResult[0]?.values || []).map(r => ({
      date: String(r[0] ?? ''),
      count: Number(r[1] ?? 0),
      avgTone: Number(r[2] ?? 0),
    }));

    // Compute 7-day moving averages
    const smoothed = daily.map((d, i) => {
      const windowStart = Math.max(0, i - 6);
      const window = daily.slice(windowStart, i + 1);
      const avgCount = window.reduce((a, b) => a + b.count, 0) / window.length;
      const avgTone = window.reduce((a, b) => a + b.avgTone, 0) / window.length;
      return {
        ...d,
        smoothedCount: Math.round(avgCount),
        smoothedTone: Math.round(avgTone * 100) / 100,
      };
    });

    // Narrative volatility (std dev of daily tone)
    const tones = daily.map(d => d.avgTone);
    const meanTone = tones.reduce((a, b) => a + b, 0) / (tones.length || 1);
    const variance = tones.reduce((a, b) => a + (b - meanTone) ** 2, 0) / (tones.length || 1);
    const narrativeVolatility = Math.sqrt(variance);

    // Volume trend
    const firstHalf = daily.slice(0, Math.floor(daily.length / 2));
    const secondHalf = daily.slice(Math.floor(daily.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b.count, 0) / (firstHalf.length || 1);
    const secondAvg = secondHalf.reduce((a, b) => a + b.count, 0) / (secondHalf.length || 1);
    const volumeTrend = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

    // Sentiment extremes (days with highest |tone|)
    const extremes = [...daily]
      .sort((a, b) => Math.abs(b.avgTone) - Math.abs(a.avgTone))
      .slice(0, 5)
      .map(d => ({ date: d.date, avgTone: d.avgTone, count: d.count }));

    res.json({
      daily: smoothed,
      summary: {
        totalArticles: daily.reduce((a, b) => a + b.count, 0),
        avgTone: Math.round(meanTone * 100) / 100,
        narrativeVolatility: Math.round(narrativeVolatility * 100) / 100,
        volumeTrendPct: Math.round(volumeTrend * 10) / 10,
        days,
      },
      extremes,
    });
  } catch (err: any) {
    log.error('Narrative strength failed', { error: err.message });
    res.status(500).json({ error: 'Narrative strength failed' });
  }
});
