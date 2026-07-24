import { Router } from 'express';
import { getStockDb } from '../stocks/db';

export const mathRegressionRoutes = Router();

async function getCloseData(symbol: string, days?: number): Promise<{ date: string; close: number }[]> {
  const db = await getStockDb();
  const where = days
    ? `WHERE symbol='${symbol}' AND close IS NOT NULL AND close > 0 AND date >= date('now', '-${days} days')`
    : `WHERE symbol='${symbol}' AND close IS NOT NULL AND close > 0`;
  const rows = db.exec(`SELECT date, close FROM stock_prices ${where} ORDER BY date ASC`);
  if (!rows.length) return [];
  return rows[0].values.map((r: any) => ({ date: r[0] as string, close: r[1] as number }));
}

function linReg(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  let ssRes = 0, ssTot = 0;
  for (const p of points) { ssRes += (p.y - (slope * p.x + intercept)) ** 2; ssTot += (p.y - yMean) ** 2; }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const se = Math.sqrt(ssRes / (n - 2));
  const slopeSE = se / Math.sqrt(sxx - sx * sx / n);
  return { slope, intercept, r2, se, slopeSE, tStat: slopeSE === 0 ? 0 : slope / slopeSE, n };
}

mathRegressionRoutes.get('/linear/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = req.query.days ? parseInt(req.query.days as string) : undefined;
    const data = await getCloseData(symbol, days);
    if (data.length < 3) return res.status(404).json({ error: 'Insufficient data' });
    const points = data.map((d, i) => ({ x: i, y: d.close }));
    const result = linReg(points);
    if (!result) return res.status(500).json({ error: 'Regression failed' });
    const trendLine = data.map((d, i) => ({
      date: d.date, actual: d.close,
      predicted: result.slope * i + result.intercept,
    }));
    res.json({
      symbol, ...result,
      annualizedSlope: result.slope * 252,
      annualizedReturnPct: (result.slope * 252 / data[0].close) * 100,
      trendLine, startDate: data[0].date, endDate: data[data.length - 1].date,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathRegressionRoutes.get('/exponential/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = req.query.days ? parseInt(req.query.days as string) : undefined;
    const data = await getCloseData(symbol, days);
    if (data.length < 3) return res.status(404).json({ error: 'Insufficient data' });
    const logPoints = data.filter(d => d.close > 0).map((d, i) => ({ x: i, y: Math.log(d.close) }));
    const lr = linReg(logPoints);
    if (!lr) return res.status(500).json({ error: 'Regression failed' });
    const points = data.map(d => d.close);
    const yMean = points.reduce((a, b) => a + b, 0) / points.length;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < points.length; i++) {
      ssRes += (points[i] - Math.exp(lr.intercept + lr.slope * i)) ** 2;
      ssTot += (points[i] - yMean) ** 2;
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    const fitLine = data.map((d, i) => ({
      date: d.date, actual: d.close,
      predicted: Math.exp(lr.intercept + lr.slope * i),
    }));
    res.json({
      symbol, growthRate: lr.slope, baseValue: Math.exp(lr.intercept), r2, r2Log: lr.r2,
      fitLine, startDate: data[0].date, endDate: data[data.length - 1].date,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathRegressionRoutes.get('/polynomial/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = req.query.days ? parseInt(req.query.days as string) : undefined;
    const degree = parseInt(req.query.degree as string) || 3;
    const data = await getCloseData(symbol, days);
    if (data.length < degree + 1) return res.status(404).json({ error: 'Insufficient data' });
    const xs = data.map((_, i) => i);
    const ys = data.map(d => d.close);
    const n = xs.length;
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    const coefficients: number[] = [yMean];
    for (let d = 1; d <= degree; d++) {
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (xs[i] - xMean) ** d * (ys[i] - yMean); den += (xs[i] - xMean) ** (2 * d); }
      coefficients.push(den === 0 ? 0 : num / den);
    }
    const predict = (x: number) => { let y = coefficients[0]; for (let d = 1; d <= degree; d++) y += coefficients[d] * (x - xMean) ** d; return y; };
    const fitLine = data.map((d, i) => ({ date: d.date, actual: d.close, predicted: predict(i) }));
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) { ssRes += (ys[i] - predict(xs[i])) ** 2; ssTot += (ys[i] - yMean) ** 2; }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    res.json({ symbol, degree, r2, coefficients, fitLine, startDate: data[0].date, endDate: data[data.length - 1].date });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathRegressionRoutes.get('/trend/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const window = parseInt(req.query.window as string) || 20;
    const data = await getCloseData(symbol);
    if (data.length < window + 2) return res.status(404).json({ error: 'Insufficient data' });
    const slopes: { date: string; slope: number; r2: number }[] = [];
    for (let i = window; i < data.length; i++) {
      const pts = [];
      for (let j = i - window; j <= i; j++) pts.push({ x: j - (i - window), y: data[j].close });
      const lr = linReg(pts);
      if (lr) slopes.push({ date: data[i].date, slope: lr.slope, r2: lr.r2 });
    }
    const vals = slopes.map(s => s.slope);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
    const cur = slopes[slopes.length - 1]?.slope ?? 0;
    const trend = cur > avg + std ? 'strong_up' : cur > avg ? 'up' : cur > avg - std ? 'neutral' : cur > avg - 2 * std ? 'down' : 'strong_down';
    res.json({ symbol, window, trendSlopes: slopes, currentSlope: cur, avgSlope: avg, stdSlope: std, trend });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
