import { Router } from 'express';
import { getStockDb } from '../stocks/db';

export const mathVolatilityRoutes = Router();

async function getData(symbol: string, days = 500): Promise<{ dates: string[]; closes: number[]; returns: number[] }> {
  const db = await getStockDb();
  const rows = db.exec(`SELECT date, close FROM stock_prices WHERE symbol='${symbol}' AND close IS NOT NULL AND close > 0 ORDER BY date DESC LIMIT ${days + 1}`);
  if (!rows.length || rows[0].values.length < 2) return { dates: [], closes: [], returns: [] };
  const data = rows[0].values.map((r: any) => ({ date: r[0] as string, close: r[1] as number })).reverse();
  const dates = data.map(d => d.date), closes = data.map(d => d.close);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  return { dates, closes, returns };
}

mathVolatilityRoutes.get('/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 252;
    const windows = (req.query.windows as string || '10,20,60').split(',').map(Number);
    const { dates, returns } = await getData(symbol, days);
    if (returns.length < Math.max(...windows) + 1) return res.status(404).json({ error: 'Insufficient data' });
    const series: Record<string, { date: string; volatility: number }[]> = {};
    for (const w of windows) {
      series[`vol_${w}`] = [];
      for (let i = w; i < returns.length; i++) {
        const sl = returns.slice(i - w, i);
        const mean = sl.reduce((a: number, b: number) => a + b, 0) / w;
        series[`vol_${w}`].push({ date: dates[i], volatility: Math.sqrt(sl.reduce((s: number, r: number) => s + (r - mean) ** 2, 0) / (w - 1)) * Math.sqrt(252) });
      }
    }
    const latest = returns.slice(-Math.min(20, returns.length));
    const lm = latest.reduce((a: number, b: number) => a + b, 0) / latest.length;
    res.json({
      symbol, series, windows, period: days,
      latestVol: Math.sqrt(latest.reduce((s: number, r: number) => s + (r - lm) ** 2, 0) / (latest.length - 1)) * Math.sqrt(252),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathVolatilityRoutes.get('/var/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 252;
    const confidence = parseFloat(req.query.confidence as string) || 0.95;
    const { returns } = await getData(symbol, days);
    if (returns.length < 30) return res.status(404).json({ error: 'Insufficient data' });
    const sorted = [...returns].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = returns.reduce((a: number, b: number) => a + b, 0) / n;
    const std = Math.sqrt(returns.reduce((s: number, r: number) => s + (r - mean) ** 2, 0) / (n - 1));
    const idx = Math.floor((1 - confidence) * n);
    const histVaR = -sorted[idx];
    const paramVaR = -(mean - 1.645 * std);
    const histCVaR = -sorted.slice(0, idx).reduce((a: number, b: number) => a + b, 0) / idx;
    const holding = parseInt(req.query.holding as string) || 1;
    const portfolio = parseFloat(req.query.portfolio as string) || 100000;
    res.json({
      symbol, confidence, holdingPeriod: holding, portfolioValue: portfolio,
      historicalVaR: histVaR, parametricVaR: paramVaR, historicalCVaR: histCVaR,
      historicalVaRDollar: histVaR * portfolio, parametricVaRDollar: paramVaR * portfolio,
      hpVaR: histVaR * Math.sqrt(holding), hpVaRDollar: histVaR * Math.sqrt(holding) * portfolio,
      stats: { mean, std, n, min: sorted[0], max: sorted[n - 1] },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathVolatilityRoutes.get('/monte-carlo/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 252;
    const sims = Math.min(parseInt(req.query.simulations as string) || 1000, 100);
    const horizon = parseInt(req.query.horizon as string) || 252;
    const { closes, returns } = await getData(symbol, days);
    if (returns.length < 30) return res.status(404).json({ error: 'Insufficient data' });
    const lastPrice = closes[closes.length - 1];
    const mean = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s: number, r: number) => s + (r - mean) ** 2, 0) / (returns.length - 1));
    const paths: number[][] = [];
    for (let s = 0; s < sims; s++) {
      const path = [lastPrice];
      for (let d = 0; d < horizon; d++) {
        let u1 = 0, u2 = 0;
        while (u1 === 0) u1 = Math.random();
        while (u2 === 0) u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        path.push(path[path.length - 1] * Math.exp(mean + std * z));
      }
      paths.push(path);
    }
    const finals = paths.map(p => p[p.length - 1]).sort((a, b) => a - b);
    const yearPts = Array.from({ length: horizon + 1 }, (_, i) => i);
    const percentiles = yearPts.map(d => {
      const vals = paths.map(p => p[d]).sort((a, b) => a - b);
      return { day: d, p5: vals[Math.floor(0.05 * vals.length)], p25: vals[Math.floor(0.25 * vals.length)], p50: vals[Math.floor(0.5 * vals.length)], p75: vals[Math.floor(0.75 * vals.length)], p95: vals[Math.floor(0.95 * vals.length)] };
    });
    const meanF = finals.reduce((a: number, b: number) => a + b, 0) / finals.length;
    res.json({
      symbol, lastPrice, horizon, simulations: sims, paths, percentiles,
      stats: { mean: meanF, median: finals[Math.floor(finals.length / 2)], p5: finals[Math.floor(0.05 * finals.length)], p95: finals[Math.floor(0.95 * finals.length)], probUp: (finals.filter(p => p > lastPrice).length / finals.length) * 100, expectedReturn: ((meanF - lastPrice) / lastPrice) * 100 },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathVolatilityRoutes.get('/drawdown/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 500;
    const { dates, closes } = await getData(symbol, days);
    if (closes.length < 2) return res.status(404).json({ error: 'Insufficient data' });
    let peak = closes[0];
    const drawdowns: { date: string; drawdown: number; peak: number }[] = [];
    let maxDD = 0, maxStart = 0, maxEnd = 0, curStart = 0;
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] > peak) { peak = closes[i]; curStart = i; }
      const dd = (closes[i] - peak) / peak;
      drawdowns.push({ date: dates[i], drawdown: dd, peak });
      if (dd < maxDD) { maxDD = dd; maxStart = curStart; maxEnd = i; }
    }
    let recoveryDays = 0;
    for (let i = maxEnd; i < closes.length; i++) { if (closes[i] >= peak) { recoveryDays = i - maxEnd; break; } }
    const underwater = drawdowns.map(dd => ({ date: dd.date, underwater: dd.drawdown }));
    const top10 = [...drawdowns].sort((a, b) => a.drawdown - b.drawdown).slice(0, 10);
    res.json({
      symbol, maxDrawdown: maxDD, maxDDDuration: maxEnd - maxStart, recoveryDays,
      maxDDStart: dates[maxStart], maxDDEnd: dates[maxEnd], underwater, top10Drawdowns: top10,
      stats: { totalDays: closes.length, peakPrice: peak, currentPrice: closes[closes.length - 1], currentDrawdown: drawdowns[drawdowns.length - 1]?.drawdown },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
