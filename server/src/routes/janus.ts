import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getStockDb } from '../stocks/db';

const log = createLogger({ module: 'janus' });
export const janusRoutes = Router();

function query(db: any, sql: string, params: any[] = []): any[] {
  const result = db.exec(sql, params);
  if (!result[0]) return [];
  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    result[0].columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

// ─── 1. Command Center: Narrative Heatmap ────────────────────────────
janusRoutes.get('/heatmap', async (_req: Request, res: Response) => {
  try {
    const { getNewsArchiveDb } = require('../newsArchive/db');
    const [newsDb, sDb] = await Promise.all([getNewsArchiveDb(), getStockDb()]);

    const newsByCountry = newsDb.exec(`
      SELECT source_country as country, COUNT(*) as article_count, AVG(tone) as avg_tone
      FROM news_archive
      WHERE source_country != ''
      GROUP BY source_country
      ORDER BY article_count DESC
    `);

    const stockByCountry = query(sDb, `
      SELECT country, COUNT(*) as ticker_count, SUM(market_cap) as total_mcap
      FROM stock_tickers
      WHERE country IS NOT NULL AND country != ''
      GROUP BY country
    `);

    const stockMap = new Map(stockByCountry.map((s: any) => [s.country, s]));

    const rows = newsByCountry[0]?.values || [];
    const heatmap = rows.map((row: any[]) => {
      const country = row[0];
      const stockInfo = stockMap.get(country);
      return {
        country,
        articleCount: row[1],
        avgTone: Math.round((row[2] || 0) * 100) / 100,
        tickerCount: stockInfo?.ticker_count || 0,
        totalMcap: stockInfo?.total_mcap || 0,
      };
    });

    res.json({ heatmap });
    log.info('Built narrative heatmap', { countries: heatmap.length });
  } catch (err: any) {
    log.error('Failed to build heatmap', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. Command Center: Ticker Divergence ────────────────────────────
janusRoutes.get('/divergence', async (req: Request, res: Response) => {
  try {
    const { getNewsArchiveDb } = require('../newsArchive/db');
    const [newsDb, sDb] = await Promise.all([getNewsArchiveDb(), getStockDb()]);

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const newsDomains = newsDb.exec(`
      SELECT domain, COUNT(*) as mentions, AVG(tone) as avg_tone
      FROM news_archive
      WHERE domain != ''
      GROUP BY domain
      ORDER BY mentions DESC
      LIMIT 200
    `);

    const volatileTickers = query(sDb, `
      SELECT
        t.symbol, t.name, t.sector, t.country, t.market_cap,
        AVG(p.volume) as avg_volume,
        (MAX(p.close) - MIN(p.close)) / AVG(p.close) * 100 as price_range_pct,
        (MAX(p.high) - MIN(p.low)) / AVG(p.close) * 100 as volatility_pct
      FROM stock_tickers t
      JOIN stock_prices p ON t.symbol = p.symbol
      WHERE p.date >= date('now', '-30 days')
        AND t.sector IS NOT NULL AND t.sector != ''
      GROUP BY t.symbol
      HAVING price_range_pct > 0
      ORDER BY volatility_pct DESC
      LIMIT ${limit}
    `);

    const sectorNewsCount: Record<string, number> = {};
    for (const row of (newsDomains[0]?.values || [])) {
      const domain = String(row[0]);
      const mentions = row[1];
      for (const sector of ['tech', 'finance', 'energy', 'health', 'agri', 'auto', 'retail', 'crypto', 'bank']) {
        if (domain.includes(sector)) {
          sectorNewsCount[sector] = (sectorNewsCount[sector] || 0) + mentions;
        }
      }
    }

    const divergence = volatileTickers.map((t: any) => {
      const sectorKey = (t.sector || '').toLowerCase().slice(0, 8);
      const newsHeat = sectorNewsCount[sectorKey] || 0;
      const divergenceScore = Math.round((t.volatility_pct * 10) - (newsHeat * 0.1));
      return {
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        country: t.country,
        marketCap: t.market_cap,
        volatilityPct: Math.round(t.volatility_pct * 100) / 100,
        priceRangePct: Math.round(t.price_range_pct * 100) / 100,
        avgVolume: Math.round(t.avg_volume),
        sectorNewsHeat: newsHeat,
        divergenceScore,
      };
    });

    divergence.sort((a: any, b: any) => Math.abs(b.divergenceScore) - Math.abs(a.divergenceScore));

    res.json({ divergence: divergence.slice(0, limit) });
    log.info('Built divergence window', { tickers: divergence.length });
  } catch (err: any) {
    log.error('Failed to build divergence', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. Echo Chamber: Cross-Border Propagation ───────────────────────
janusRoutes.get('/echo-chamber', async (_req: Request, res: Response) => {
  try {
    const { getNewsArchiveDb } = require('../newsArchive/db');
    const newsDb = await getNewsArchiveDb();

    const propagation = newsDb.exec(`
      SELECT
        date(published_at) as day,
        source_country as country,
        domain,
        COUNT(*) as article_count,
        AVG(tone) as avg_tone
      FROM news_archive
      WHERE published_at IS NOT NULL AND source_country != ''
      GROUP BY day, source_country, domain
      ORDER BY day, article_count DESC
    `);

    const countryLeadTimes: Record<string, { firstSeen: string; articleCount: number; avgTone: number }> = {};

    for (const row of (propagation[0]?.values || [])) {
      const day = String(row[0]);
      const country = String(row[1]);
      if (!countryLeadTimes[country] || day < countryLeadTimes[country].firstSeen) {
        countryLeadTimes[country] = { firstSeen: day, articleCount: row[3], avgTone: row[4] };
      } else {
        countryLeadTimes[country].articleCount += row[3];
      }
    }

    const leaders = Object.entries(countryLeadTimes)
      .map(([country, data]) => ({ country, ...data }))
      .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));

    const domainCoverage = newsDb.exec(`
      SELECT domain, source_country, COUNT(*) as articles, AVG(tone) as tone
      FROM news_archive
      WHERE domain != '' AND source_country != ''
      GROUP BY domain
      ORDER BY articles DESC
      LIMIT 30
    `);

    const domains = (domainCoverage[0]?.values || []).map((r: any[]) => ({
      domain: r[0],
      country: r[1],
      articles: r[2],
      tone: Math.round((r[3] || 0) * 100) / 100,
    }));

    res.json({ leaders, domains });
    log.info('Built echo chamber analysis');
  } catch (err: any) {
    log.error('Failed to build echo chamber', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. Volatility Radar ─────────────────────────────────────────────
janusRoutes.get('/volatility-radar', async (req: Request, res: Response) => {
  try {
    const { getNewsArchiveDb } = require('../newsArchive/db');
    const [newsDb, sDb] = await Promise.all([getNewsArchiveDb(), getStockDb()]);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const toneVariance = newsDb.exec(`
      SELECT domain,
        AVG(tone) as avg_tone,
        MIN(tone) as min_tone,
        MAX(tone) as max_tone,
        COUNT(*) as articles
      FROM news_archive
      WHERE domain != '' AND tone != 0
      GROUP BY domain
      HAVING articles >= 3
      ORDER BY (MAX(tone) - MIN(tone)) DESC
      LIMIT 30
    `);

    const polarizedDomains = (toneVariance[0]?.values || []).map((r: any[]) => ({
      domain: r[0],
      avgTone: Math.round((r[1] || 0) * 100) / 100,
      toneSpread: Math.round(((r[3] || 0) - (r[2] || 0)) * 100) / 100,
      articles: r[4],
    }));

    const recentVolatile = query(sDb, `
      SELECT
        t.symbol, t.name, t.sector, t.country,
        (MAX(p.close) - MIN(p.close)) / AVG(p.close) * 100 as range_7d,
        AVG(p.volume) as avg_vol,
        (p2.close - p1.close) / p1.close * 100 as change_pct
      FROM stock_tickers t
      JOIN stock_prices p ON t.symbol = p.symbol
      LEFT JOIN stock_prices p1 ON t.symbol = p1.symbol AND p1.date = (SELECT MAX(date) FROM stock_prices WHERE symbol = t.symbol AND date <= date('now', '-7 days'))
      LEFT JOIN stock_prices p2 ON t.symbol = p2.symbol AND p2.date = (SELECT MAX(date) FROM stock_prices WHERE symbol = t.symbol)
      WHERE p.date >= date('now', '-7 days')
      GROUP BY t.symbol
      HAVING range_7d > 2
      ORDER BY range_7d DESC
      LIMIT ${limit}
    `);

    const radar = recentVolatile.map((s: any) => ({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      country: s.country,
      range7d: Math.round(s.range_7d * 100) / 100,
      change7d: Math.round((s.change_pct || 0) * 100) / 100,
      avgVolume: Math.round(s.avg_vol || 0),
      riskLevel: s.range_7d > 10 ? 'extreme' : s.range_7d > 5 ? 'high' : 'elevated',
    }));

    res.json({ polarizedDomains, radar });
    log.info('Built volatility radar', { tickers: radar.length });
  } catch (err: any) {
    log.error('Failed to build volatility radar', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. Shockwave Backtester ─────────────────────────────────────────
janusRoutes.get('/shockwave', async (req: Request, res: Response) => {
  try {
    const { getNewsArchiveDb } = require('../newsArchive/db');
    const [newsDb, sDb] = await Promise.all([getNewsArchiveDb(), getStockDb()]);

    const rawTopic = (req.query.topic as string) || 'tariff';
    const keywords = rawTopic.split(/\s+OR\s+/i).map(k => k.trim()).filter(Boolean);
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);

    const likeClauses = keywords.map(() => `title LIKE ?`).join(' OR ');
    const likeParams = keywords.map(k => `%${k}%`);

    const matchingArticles = newsDb.exec(`
      SELECT published_at, source_country, tone, title
      FROM news_archive
      WHERE ${likeClauses}
      ORDER BY published_at DESC
      LIMIT 100
    `, likeParams);

    const marketPerformance = query(sDb, `
      SELECT
        date,
        AVG(close) as avg_close,
        AVG(volume) as avg_volume,
        (MAX(high) - MIN(low)) / AVG(close) * 100 as daily_range
      FROM stock_prices
      WHERE symbol IN (SELECT symbol FROM stock_tickers WHERE exchange = 'NYQ' LIMIT 50)
        AND date >= date('now', '-90 days')
      GROUP BY date
      ORDER BY date
    `);

    const volatilePeriods = marketPerformance
      .filter((d: any) => d.daily_range > 2)
      .slice(0, 10)
      .map((d: any) => ({
        date: d.date,
        avgClose: Math.round(d.avg_close * 100) / 100,
        dailyRange: Math.round(d.daily_range * 100) / 100,
        avgVolume: Math.round(d.avg_volume),
      }));

    const topMovers = query(sDb, `
      SELECT
        t.symbol, t.name, t.sector,
        (MAX(p.close) - MIN(p.close)) / MIN(p.close) * 100 as move_pct,
        AVG(p.volume) as avg_vol
      FROM stock_tickers t
      JOIN stock_prices p ON t.symbol = p.symbol
      WHERE p.date >= date('now', '-90 days')
        AND t.sector IS NOT NULL
      GROUP BY t.symbol
      ORDER BY ABS(move_pct) DESC
      LIMIT ${limit}
    `);

    const recentArticles = (matchingArticles[0]?.values || []).slice(0, 5).map((r: any[]) => ({
      date: r[0], country: r[1], tone: r[2], title: r[3],
    }));

    res.json({
      topic: rawTopic,
      articleCount: (matchingArticles[0]?.values || []).length,
      recentArticles,
      volatilePeriods,
      topMovers: topMovers.map((m: any) => ({
        symbol: m.symbol,
        name: m.name,
        sector: m.sector,
        movePct: Math.round(m.move_pct * 100) / 100,
        avgVolume: Math.round(m.avg_vol),
      })),
    });
    log.info('Built shockwave backtester', { topic: rawTopic });
  } catch (err: any) {
    log.error('Failed to build shockwave', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. Corporate Credibility ────────────────────────────────────────
janusRoutes.get('/credibility', async (req: Request, res: Response) => {
  try {
    const sDb = await getStockDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);
    const sector = req.query.sector as string | undefined;

    const sectorFilter = sector ? `AND t.sector = '${sector.replace(/'/g, "''")}'` : '';

    const tickers = query(sDb, `
      SELECT
        t.symbol, t.name, t.sector, t.country, t.market_cap,
        AVG(p.close) as avg_price,
        (p_last.close - p_first.close) / p_first.close * 100 as total_return,
        (MAX(p.close) - MIN(p.close)) / MIN(p.close) * 100 as max_drawdown,
        AVG(p.volume) as avg_volume,
        COUNT(p.date) as trading_days
      FROM stock_tickers t
      JOIN stock_prices p ON t.symbol = p.symbol
      LEFT JOIN stock_prices p_first ON t.symbol = p_first.symbol AND p_first.date = (SELECT MIN(date) FROM stock_prices WHERE symbol = t.symbol)
      LEFT JOIN stock_prices p_last ON t.symbol = p_last.symbol AND p_last.date = (SELECT MAX(date) FROM stock_prices WHERE symbol = t.symbol)
      WHERE p.date >= date('now', '-365 days')
        AND t.market_cap > 0
        ${sectorFilter}
      GROUP BY t.symbol
      HAVING trading_days > 50
      ORDER BY total_return DESC
      LIMIT ${limit}
    `);

    const credibility = tickers.map((t: any) => {
      const returnScore = Math.min(100, Math.max(0, 50 + (t.total_return || 0) * 2));
      const drawdownPenalty = Math.min(50, Math.abs(t.max_drawdown || 0) * 2);
      const ccr = Math.round(Math.max(0, Math.min(100, returnScore - drawdownPenalty)));

      let rating: string;
      if (ccr >= 80) rating = 'A';
      else if (ccr >= 60) rating = 'B';
      else if (ccr >= 40) rating = 'C';
      else if (ccr >= 20) rating = 'D';
      else rating = 'F';

      return {
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        country: t.country,
        marketCap: t.market_cap,
        totalReturn: Math.round((t.total_return || 0) * 100) / 100,
        maxDrawdown: Math.round((t.max_drawdown || 0) * 100) / 100,
        ccr,
        rating,
      };
    });

    const sectors = query(sDb, `
      SELECT DISTINCT sector FROM stock_tickers
      WHERE sector IS NOT NULL AND sector != '' ORDER BY sector
    `).map((s: any) => s.sector);

    res.json({ credibility, sectors });
    log.info('Built credibility ratings', { tickers: credibility.length });
  } catch (err: any) {
    log.error('Failed to build credibility', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});
