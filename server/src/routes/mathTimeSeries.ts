import { Router } from 'express';
import { getStockDb } from '../stocks/db';

export const mathTimeSeriesRoutes = Router();

async function getCloses(symbol: string, days = 500): Promise<number[]> {
  const db = await getStockDb();
  const rows = db.exec(`SELECT close FROM stock_prices WHERE symbol='${symbol}' AND close IS NOT NULL AND close > 0 ORDER BY date DESC LIMIT ${days}`);
  if (!rows.length) return [];
  return rows[0].values.map((r: any) => r[0] as number).reverse();
}

async function getReturns(symbol: string, days = 500): Promise<number[]> {
  const c = await getCloses(symbol, days + 1);
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  return r;
}

mathTimeSeriesRoutes.get('/acf/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 252;
    const maxLag = parseInt(req.query.lag as string) || 40;
    const data = await getReturns(symbol, days);
    if (data.length < maxLag + 10) return res.status(404).json({ error: 'Insufficient data' });
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
    const threshold = 1.96 / Math.sqrt(n);
    const acf = Array.from({ length: maxLag }, (_, lag) => {
      let sum = 0;
      for (let i = 0; i < n - lag - 1; i++) sum += (data[i] - mean) * (data[i + lag] - mean);
      const acfVal = variance === 0 ? 0 : sum / (n * variance);
      return { lag: lag + 1, acf: acfVal, significant: Math.abs(acfVal) > threshold };
    });
    res.json({ symbol, acf, n, significantThreshold: threshold });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathTimeSeriesRoutes.get('/hurst/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 500;
    const data = await getReturns(symbol, days);
    if (data.length < 50) return res.status(404).json({ error: 'Insufficient data' });
    const lags: number[] = [], rsList: number[] = [];
    for (let lag = 10; lag <= Math.min(data.length, 100); lag += 5) {
      const sub = data.slice(0, lag);
      const mean = sub.reduce((a, b) => a + b, 0) / lag;
      const cumDevs = sub.map((_, i) => sub.slice(0, i + 1).reduce((s, v) => s + v - mean, 0));
      const r = Math.max(...cumDevs) - Math.min(...cumDevs);
      const s = Math.sqrt(sub.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lag);
      if (s > 0 && r > 0) { lags.push(Math.log(lag)); rsList.push(Math.log(r / s)); }
    }
    let hurst = 0.5;
    if (lags.length >= 2) {
      const n = lags.length;
      const sx = lags.reduce((a, b) => a + b, 0), sy = rsList.reduce((a, b) => a + b, 0);
      const sxy = lags.reduce((s, x, i) => s + x * rsList[i], 0);
      const sxx = lags.reduce((s, x) => s + x * x, 0);
      hurst = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    }
    const rsValues = lags.map((l, i) => ({ n: Math.round(Math.exp(l)), rs: Math.exp(rsList[i]) }));
    res.json({ symbol, hurst, classification: hurst > 0.6 ? 'Trending' : hurst < 0.4 ? 'Mean-reverting' : 'Random walk', rsValues });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathTimeSeriesRoutes.get('/stationarity/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 500;
    const data = await getReturns(symbol, days);
    if (data.length < 20) return res.status(404).json({ error: 'Insufficient data' });
    const n = data.length;
    const diffs = data.slice(1).map((v, i) => v - data[i]);
    const yLag = data.slice(0, -1);
    const ny = diffs.length;
    const sumY = diffs.reduce((a, b) => a + b, 0);
    const sumYL = yLag.reduce((a, b) => a + b, 0);
    const sumYL2 = diffs.reduce((s, v, i) => s + v * yLag[i], 0);
    const sumLL = yLag.reduce((s, v) => s + v * v, 0);
    const slope = (ny * sumYL2 - sumYL * sumY) / (ny * sumLL - sumYL * sumYL);
    const intercept = (sumY - slope * sumYL) / ny;
    const residuals = diffs.map((v, i) => v - (slope * yLag[i] + intercept));
    const ssRes = residuals.reduce((s, r) => s + r * r, 0);
    const se = Math.sqrt(ssRes / (ny - 2));
    const slL = sumLL - sumYL ** 2 / ny;
    const adfStat = se === 0 ? 0 : slope / (se / Math.sqrt(slL));
    const criticalValues = { '1%': -3.43, '5%': -2.86, '10%': -2.57 };
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
    const half = Math.floor(n / 2);
    const m1 = data.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const m2 = data.slice(half).reduce((a, b) => a + b, 0) / (n - half);
    res.json({ symbol, adfStat, criticalValues, isStationary: adfStat < -2.86, conclusion: adfStat < -2.86 ? 'Stationary' : 'Non-stationary', stats: { mean, variance, n, firstHalfMean: m1, secondHalfMean: m2 } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathTimeSeriesRoutes.get('/entropy/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 500;
    const window = parseInt(req.query.window as string) || 60;
    const data = await getReturns(symbol, days);
    if (data.length < window + 10) return res.status(404).json({ error: 'Insufficient data' });
    const bins = 20;
    const min = Math.min(...data), max = Math.max(...data);
    const bw = (max - min) / bins;
    const binCounts = new Array(bins).fill(0);
    for (const r of data) { const idx = Math.min(Math.floor((r - min) / bw), bins - 1); binCounts[idx]++; }
    const totalEntropy = -binCounts.reduce((s, c) => { if (c === 0) return s; const p = c / data.length; return s + p * Math.log2(p); }, 0);
    const maxEntropy = Math.log2(bins);
    const rollingEntropy: { index: number; entropy: number }[] = [];
    for (let i = window; i < data.length; i++) {
      const sl = data.slice(i - window, i);
      const sMin = Math.min(...sl), sMax = Math.max(...sl);
      const sbw = (sMax - sMin) / bins;
      const counts = new Array(bins).fill(0);
      for (const r of sl) { const idx = sbw === 0 ? 0 : Math.min(Math.floor((r - sMin) / sbw), bins - 1); counts[idx]++; }
      rollingEntropy.push({ index: i, entropy: -counts.reduce((s, c) => { if (c === 0) return s; const p = c / window; return s + p * Math.log2(p); }, 0) });
    }
    const cur = rollingEntropy[rollingEntropy.length - 1]?.entropy ?? 0;
    res.json({
      symbol, totalEntropy, maxEntropy, normalizedEntropy: maxEntropy === 0 ? 0 : totalEntropy / maxEntropy,
      currentEntropy: cur, avgEntropy: rollingEntropy.length ? rollingEntropy.reduce((s, e) => s + e.entropy, 0) / rollingEntropy.length : 0,
      window, classification: totalEntropy / maxEntropy > 0.9 ? 'High entropy (noisy)' : totalEntropy / maxEntropy > 0.5 ? 'Moderate entropy' : 'Low entropy (predictable)',
      rollingEntropy,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
