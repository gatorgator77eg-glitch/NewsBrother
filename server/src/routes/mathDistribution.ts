import { Router } from 'express';
import { getStockDb } from '../stocks/db';

export const mathDistributionRoutes = Router();

async function getLogReturns(symbol: string, days = 252): Promise<number[]> {
  const db = await getStockDb();
  const rows = db.exec(`SELECT close FROM stock_prices WHERE symbol='${symbol}' AND close IS NOT NULL AND close > 0 ORDER BY date DESC LIMIT ${days + 1}`);
  if (!rows.length || rows[0].values.length < 2) return [];
  const closes = rows[0].values.map(r => r[0] as number).reverse();
  const ret: number[] = [];
  for (let i = 1; i < closes.length; i++) ret.push(Math.log(closes[i] / closes[i - 1]));
  return ret;
}

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const result = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? result : -result;
}

mathDistributionRoutes.get('/returns/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 252;
    const returns = await getLogReturns(symbol, days);
    if (returns.length < 10) return res.status(404).json({ error: 'Insufficient data' });
    const n = returns.length;
    const mean = returns.reduce((a: number, b: number) => a + b, 0) / n;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1));
    const min = Math.min(...returns), max = Math.max(...returns);
    const bins = 50;
    const binWidth = (max - min) / bins;
    const histogram = Array.from({ length: bins }, (_, i) => {
      const lo = min + i * binWidth;
      const center = lo + binWidth / 2;
      const count = returns.filter(r => r >= lo && r < lo + binWidth).length;
      return { bin: lo, count, center, normalDensity: (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((center - mean) / std) ** 2) * n * binWidth };
    });
    const skewness = returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n;
    const kurtosis = returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n - 3;
    res.json({
      symbol, mean, std, variance: std ** 2, skewness, kurtosis, n,
      positivePct: (returns.filter(r => r > 0).length / n) * 100,
      bestDay: Math.max(...returns), worstDay: Math.min(...returns),
      annualizedReturn: mean * 252, annualizedVol: std * Math.sqrt(252),
      histogram,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathDistributionRoutes.get('/normality/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 252;
    const returns = await getLogReturns(symbol, days);
    if (returns.length < 20) return res.status(404).json({ error: 'Insufficient data' });
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1));
    const sorted = [...returns].sort((a, b) => a - b);
    const skewness = returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n;
    const kurtosis = returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n;
    const jb = (n / 6) * (skewness ** 2 + (kurtosis - 3) ** 2 / 4);
    const adSum = returns.reduce((s, r) => {
      const z = (r - mean) / std;
      const cdf = 0.5 * (1 + erf(z / Math.SQRT2));
      const rank = sorted.indexOf(r) + 1;
      return s + (cdf - (2 * rank - 1) / (2 * n)) ** 2;
    }, 0);
    const moments = { mean, std, variance: std ** 2, skewness, kurtosis, excessKurtosis: kurtosis - 3 };
    const percentiles = [1, 5, 10, 25, 50, 75, 90, 95, 99].map(p => ({ percentile: p, value: sorted[Math.floor(p / 100 * (n - 1))] }));
    res.json({
      symbol, moments, percentiles, n,
      jarqueBera: { statistic: jb, isNormal: jb < 5.99 },
      andersonDarling: { statistic: -n - adSum, isNormal: (-n - adSum) > -0.752 },
      conclusion: jb < 5.99 ? 'Normal' : 'Non-normal (fat tails or skewed)',
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathDistributionRoutes.get('/skewness-kurtosis/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const window = parseInt(req.query.window as string) || 60;
    const returns = await getLogReturns(symbol, 1000);
    if (returns.length < window + 2) return res.status(404).json({ error: 'Insufficient data' });
    const series: { index: number; skewness: number; kurtosis: number }[] = [];
    for (let i = window; i < returns.length; i++) {
      const sl = returns.slice(i - window, i);
      const m = sl.reduce((a, b) => a + b, 0) / window;
      const s = Math.sqrt(sl.reduce((sum, r) => sum + (r - m) ** 2, 0) / window);
      series.push({
        index: i,
        skewness: s === 0 ? 0 : sl.reduce((sum, r) => sum + ((r - m) / s) ** 3, 0) / window,
        kurtosis: (s === 0 ? 0 : sl.reduce((sum, r) => sum + ((r - m) / s) ** 4, 0) / window) - 3,
      });
    }
    const avgSkew = series.reduce((s, d) => s + d.skewness, 0) / series.length;
    const avgKurt = series.reduce((s, d) => s + d.kurtosis, 0) / series.length;
    const cur = series[series.length - 1];
    res.json({
      symbol, window, series, avgSkew, avgKurt,
      currentSkew: cur?.skewness ?? 0, currentKurt: cur?.kurtosis ?? 0,
      interpretation: {
        skewness: avgSkew > 0.5 ? 'Right-skewed' : avgSkew < -0.5 ? 'Left-skewed' : 'Symmetric',
        kurtosis: avgKurt > 1 ? 'Leptokurtic (fat tails)' : avgKurt < -1 ? 'Platykurtic (thin tails)' : 'Mesokurtic',
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
