import { Router } from 'express';
import { getStockDb } from '../stocks/db';

export const marketAnalyticsRoutes = Router();

function query(db: any, sql: string, params: any[] = []): any[] {
  const result = db.exec(sql, params);
  if (!result[0]) return [];
  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    result[0].columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

function getLatestPrice(db: any, symbol: string): number | null {
  const r = db.exec(`SELECT close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 1`, [symbol]);
  return r[0]?.values[0]?.[0] as number ?? null;
}

function getPreviousClose(db: any, symbol: string): number | null {
  const r = db.exec(`SELECT close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 1 OFFSET 1`, [symbol]);
  return r[0]?.values[0]?.[0] as number ?? null;
}

function getCloseOnDate(db: any, symbol: string, daysAgo: number): number | null {
  const r = db.exec(
    `SELECT close FROM stock_prices WHERE symbol = ? AND date <= date('now', '-' || ? || ' days') ORDER BY date DESC LIMIT 1`,
    [symbol, daysAgo]
  );
  return r[0]?.values[0]?.[0] as number ?? null;
}

// ── 1. Top Movers ──
marketAnalyticsRoutes.get('/market-analytics/movers', async (_req, res) => {
  try {
    const db = await getStockDb();
    const tickers = query(db, `SELECT symbol, name, sector, exchange, market_cap FROM stock_tickers WHERE market_cap > 0 ORDER BY market_cap DESC LIMIT 500`);

    const results = tickers.map(t => {
      const latest = getLatestPrice(db, t.symbol);
      const prev = getPreviousClose(db, t.symbol);
      const weekAgo = getCloseOnDate(db, t.symbol, 7);
      const monthAgo = getCloseOnDate(db, t.symbol, 30);
      if (!latest || !prev) return null;
      return {
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        exchange: t.exchange,
        market_cap: t.market_cap,
        price: latest,
        change_1d: Math.round(((latest - prev) / prev) * 10000) / 100,
        change_1w: weekAgo ? Math.round(((latest - weekAgo) / weekAgo) * 10000) / 100 : null,
        change_1m: monthAgo ? Math.round(((latest - monthAgo) / monthAgo) * 10000) / 100 : null,
      };
    }).filter(Boolean);

    res.json({ movers: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 2. Volume Spikes ──
marketAnalyticsRoutes.get('/market-analytics/volume', async (_req, res) => {
  try {
    const db = await getStockDb();
    const tickers = query(db, `SELECT symbol, name, sector FROM stock_tickers WHERE market_cap > 5000000000 ORDER BY market_cap DESC LIMIT 200`);

    const results = tickers.map(t => {
      const avgVol = query(db,
        `SELECT AVG(volume) as avg_vol FROM (SELECT volume FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 20)`,
        [t.symbol]
      );
      const latestVol = query(db,
        `SELECT volume, date FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 1`,
        [t.symbol]
      );
      const avg = avgVol[0]?.avg_vol || 0;
      const vol = latestVol[0]?.volume || 0;
      if (avg === 0) return null;
      return {
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        date: latestVol[0]?.date,
        volume: vol,
        avg_volume: Math.round(avg),
        ratio: Math.round((vol / avg) * 100) / 100,
      };
    }).filter(Boolean);

    results.sort((a: any, b: any) => b.ratio - a.ratio);
    res.json({ volume: results.slice(0, 50) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 3. Sector Performance ──
marketAnalyticsRoutes.get('/market-analytics/sectors', async (_req, res) => {
  try {
    const db = await getStockDb();
    const sectors = query(db, `SELECT DISTINCT sector FROM stock_tickers WHERE sector != '' AND sector != 'N/A'`);

    const timeframes = [
      { label: '1W', days: 7 },
      { label: '1M', days: 30 },
      { label: '3M', days: 90 },
      { label: '6M', days: 180 },
      { label: '1Y', days: 365 },
    ];

    const results = sectors.map(s => {
      const sectorTickers = query(db, `SELECT symbol FROM stock_tickers WHERE sector = ?`, [s.sector]);
      const symbols = sectorTickers.map((t: any) => t.symbol).slice(0, 30);

      const timeframeData: Record<string, number> = {};
      for (const tf of timeframes) {
        let totalReturn = 0;
        let count = 0;
        for (const sym of symbols) {
          const now = getLatestPrice(db, sym);
          const then = getCloseOnDate(db, sym, tf.days);
          if (now && then && then > 0) {
            totalReturn += ((now - then) / then) * 100;
            count++;
          }
        }
        timeframeData[tf.label] = count > 0 ? Math.round((totalReturn / count) * 100) / 100 : 0;
      }

      return { sector: s.sector, tickerCount: symbols.length, ...timeframeData };
    });

    results.sort((a: any, b: any) => (b['1Y'] || 0) - (a['1Y'] || 0));
    res.json({ sectors: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 4. Seasonality ──
marketAnalyticsRoutes.get('/market-analytics/seasonality', async (req, res) => {
  try {
    const db = await getStockDb();
    const symbol = (req.query.symbol as string) || 'SPY';
    const limit = parseInt(req.query.limit as string) || 200;

    const tickers = query(db, `SELECT symbol FROM stock_tickers ORDER BY market_cap DESC LIMIT ${limit}`);
    const symbols = tickers.map(t => t.symbol);

    const monthReturns: Record<number, Record<number, number>> = {};
    for (let y = 0; y < 10; y++) {
      for (let m = 0; m < 12; m++) {
        monthReturns[y] = monthReturns[y] || {};
        monthReturns[y][m] = 0;
      }
    }

    for (const sym of symbols) {
      const prices = query(db, `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date ASC`, [sym]);
      const monthCloses: Record<string, number> = {};
      for (const p of prices) {
        const ym = (p.date as string).slice(0, 7);
        monthCloses[ym] = p.close as number;
      }

      const months = Object.keys(monthCloses).sort();
      for (let i = 1; i < months.length; i++) {
        const prev = monthCloses[months[i - 1]];
        const curr = monthCloses[months[i]];
        if (prev > 0) {
          const year = parseInt(months[i].slice(0, 4)) - 2016;
          const month = parseInt(months[i].slice(5, 7)) - 1;
          if (year >= 0 && year < 10 && month >= 0) {
            monthReturns[year][month] += ((curr - prev) / prev) * 100 / symbols.length;
          }
        }
      }
    }

    const data = [];
    for (let y = 0; y < 10; y++) {
      data.push({
        year: 2016 + y,
        months: Array.from({ length: 12 }, (_, m) => Math.round((monthReturns[y]?.[m] || 0) * 100) / 100),
      });
    }

    res.json({ seasonality: data, symbols_used: symbols.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 5. Correlation Matrix ──
marketAnalyticsRoutes.get('/market-analytics/correlation', async (req, res) => {
  try {
    const db = await getStockDb();
    const symbolsParam = (req.query.symbols as string) || '';
    let symbols = symbolsParam
      ? symbolsParam.split(',').map(s => s.trim().toUpperCase())
      : query(db, `SELECT symbol FROM stock_tickers WHERE sector = 'Technology' ORDER BY market_cap DESC LIMIT 8`).map((t: any) => t.symbol);

    if (symbols.length < 2) {
      res.json({ correlation: [], symbols: [] });
      return;
    }

    const priceMap: Record<string, Record<string, number>> = {};
    for (const sym of symbols) {
      const rows = query(db, `SELECT date, close FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 252`, [sym]);
      priceMap[sym] = {};
      for (const r of rows) {
        priceMap[sym][r.date as string] = r.close as number;
      }
    }

    const commonDates = Object.keys(priceMap[symbols[0]] || {}).filter(d =>
      symbols.every(s => priceMap[s]?.[d] != null)
    ).slice(0, 252).reverse();

    const returns: Record<string, number[]> = {};
    for (const sym of symbols) {
      returns[sym] = [];
      for (let i = 1; i < commonDates.length; i++) {
        const prev = priceMap[sym][commonDates[i - 1]];
        const curr = priceMap[sym][commonDates[i]];
        if (prev > 0) returns[sym].push((curr - prev) / prev);
      }
    }

    const matrix: number[][] = [];
    for (const s1 of symbols) {
      const row: number[] = [];
      for (const s2 of symbols) {
        if (s1 === s2) { row.push(1); continue; }
        const n = returns[s1].length;
        if (n < 10) { row.push(0); continue; }
        const mean1 = returns[s1].reduce((a, b) => a + b, 0) / n;
        const mean2 = returns[s2].reduce((a, b) => a + b, 0) / n;
        let cov = 0, std1 = 0, std2 = 0;
        for (let i = 0; i < n; i++) {
          const d1 = returns[s1][i] - mean1;
          const d2 = returns[s2][i] - mean2;
          cov += d1 * d2;
          std1 += d1 * d1;
          std2 += d2 * d2;
        }
        const corr = std1 > 0 && std2 > 0 ? cov / Math.sqrt(std1 * std2) : 0;
        row.push(Math.round(corr * 1000) / 1000);
      }
      matrix.push(row);
    }

    res.json({ correlation: matrix, symbols, dates_used: commonDates.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 6. Risk/Reward Scatter ──
marketAnalyticsRoutes.get('/market-analytics/risk-reward', async (_req, res) => {
  try {
    const db = await getStockDb();
    const tickers = query(db, `SELECT symbol, name, sector, market_cap FROM stock_tickers WHERE market_cap > 10000000000 ORDER BY market_cap DESC LIMIT 200`);

    const results = tickers.map(t => {
      const prices = query(db, `SELECT close FROM stock_prices WHERE symbol = ? ORDER BY date ASC`, [t.symbol]);
      if (prices.length < 50) return null;

      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1].close as number;
        const curr = prices[i].close as number;
        if (prev > 0) returns.push((curr - prev) / prev);
      }

      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
      const dailyVol = Math.sqrt(variance);
      const annualVol = dailyVol * Math.sqrt(252);
      const annualReturn = mean * 252;

      const first = prices[0].close as number;
      const last = prices[prices.length - 1].close as number;
      const totalReturn = first > 0 ? ((last - first) / first) * 100 : 0;

      return {
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        market_cap: t.market_cap,
        volatility: Math.round(annualVol * 100) / 100,
        return_1y: Math.round(annualReturn * 10000) / 100,
        total_return: Math.round(totalReturn * 100) / 100,
        sharpe: annualVol > 0 ? Math.round((annualReturn / annualVol) * 100) / 100 : 0,
      };
    }).filter(Boolean);

    res.json({ risk_reward: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 7. Market Heatmap (sector->stocks) ──
marketAnalyticsRoutes.get('/market-analytics/heatmap', async (_req, res) => {
  try {
    const db = await getStockDb();
    const tickers = query(db, `SELECT symbol, name, sector, exchange, market_cap FROM stock_tickers WHERE market_cap > 0 ORDER BY market_cap DESC LIMIT 500`);

    const results = tickers.map(t => {
      const latest = getLatestPrice(db, t.symbol);
      const prev = getPreviousClose(db, t.symbol);
      if (!latest || !prev) return null;
      return {
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        exchange: t.exchange,
        market_cap: t.market_cap,
        change_pct: Math.round(((latest - prev) / prev) * 10000) / 100,
      };
    }).filter(Boolean);

    res.json({ heatmap: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 8. Country Performance ──
marketAnalyticsRoutes.get('/market-analytics/countries', async (_req, res) => {
  try {
    const db = await getStockDb();
    const countries = query(db, `SELECT DISTINCT country FROM stock_tickers WHERE country != '' AND country != 'N/A'`);

    const results = countries.map(c => {
      const countryTickers = query(db, `SELECT symbol FROM stock_tickers WHERE country = ? ORDER BY market_cap DESC LIMIT 50`, [c.country]);
      const symbols = countryTickers.map((t: any) => t.symbol);

      let totalMarketCap = 0;
      const returns: { d1: number; d1m: number; d1y: number }[] = [];

      for (const sym of symbols) {
        const info = query(db, `SELECT market_cap FROM stock_tickers WHERE symbol = ?`, [sym]);
        totalMarketCap += (info[0]?.market_cap as number) || 0;

        const latest = getLatestPrice(db, sym);
        const prev = getPreviousClose(db, sym);
        const monthAgo = getCloseOnDate(db, sym, 30);
        const yearAgo = getCloseOnDate(db, sym, 365);

        if (latest && prev) {
          returns.push({
            d1: ((latest - prev) / prev) * 100,
            d1m: monthAgo ? ((latest - monthAgo) / monthAgo) * 100 : 0,
            d1y: yearAgo ? ((latest - yearAgo) / yearAgo) * 100 : 0,
          });
        }
      }

      const avg = (field: string) => returns.length > 0
        ? Math.round(returns.reduce((s, r) => s + (r as any)[field], 0) / returns.length * 100) / 100
        : 0;

      return {
        country: c.country,
        tickerCount: symbols.length,
        total_market_cap: totalMarketCap,
        avg_change_1d: avg('d1'),
        avg_change_1m: avg('d1m'),
        avg_change_1y: avg('d1y'),
      };
    });

    results.sort((a: any, b: any) => b.total_market_cap - a.total_market_cap);
    res.json({ countries: results.filter((c: any) => c.tickerCount >= 3) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
