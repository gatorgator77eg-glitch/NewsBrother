import { Router } from 'express';
import { getStockDb } from '../stocks/db';

export const mathCorrelationRoutes = Router();

async function getCloses(symbol: string, days = 252): Promise<number[]> {
  const db = await getStockDb();
  const rows = db.exec(`SELECT close FROM stock_prices WHERE symbol='${symbol}' AND close IS NOT NULL AND close > 0 ORDER BY date DESC LIMIT ${days}`);
  if (!rows.length) return [];
  return rows[0].values.map((r: any) => r[0] as number).reverse();
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const aa = a.slice(-n), bb = b.slice(-n);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += aa[i]; sb += bb[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = aa[i] - ma, db = bb[i] - mb; cov += da * db; va += da * da; vb += db * db; }
  return va && vb ? cov / Math.sqrt(va * vb) : 0;
}

function spearman(a: number[], b: number[]): number {
  const rank = (arr: number[]) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const ranks = new Array(arr.length);
    sorted.forEach((s, r) => ranks[s.i] = r + 1);
    return ranks;
  };
  return pearson(rank(a), rank(b));
}

mathCorrelationRoutes.get('/matrix', async (req, res) => {
  try {
    const symbols = ((req.query.symbols as string) || 'AAPL,MSFT,GOOGL,AMZN,META,TSLA,NVDA,JPM').split(',');
    const days = parseInt(req.query.days as string) || 252;
    const allData: Record<string, number[]> = {};
    for (const s of symbols) allData[s] = await getCloses(s, days);
    const matrix: Record<string, Record<string, number>> = {};
    for (const s1 of symbols) {
      matrix[s1] = {};
      for (const s2 of symbols) matrix[s1][s2] = s1 === s2 ? 1 : pearson(allData[s1] || [], allData[s2] || []);
    }
    res.json({ symbols, matrix, days });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathCorrelationRoutes.get('/spearman', async (req, res) => {
  try {
    const symbols = ((req.query.symbols as string) || 'AAPL,MSFT,GOOGL,AMZN,META').split(',');
    const days = parseInt(req.query.days as string) || 252;
    const allData: Record<string, number[]> = {};
    for (const s of symbols) allData[s] = await getCloses(s, days);
    const matrix: Record<string, Record<string, number>> = {};
    for (const s1 of symbols) {
      matrix[s1] = {};
      for (const s2 of symbols) matrix[s1][s2] = s1 === s2 ? 1 : spearman(allData[s1] || [], allData[s2] || []);
    }
    res.json({ symbols, matrix, days, type: 'spearman' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathCorrelationRoutes.get('/beta-alpha/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const benchmark = (req.query.benchmark as string) || 'SPY';
    const days = parseInt(req.query.days as string) || 252;
    const sr = await getCloses(symbol, days), br = await getCloses(benchmark, days);
    const minLen = Math.min(sr.length, br.length);
    if (minLen < 10) return res.status(404).json({ error: 'Insufficient data' });
    const sC = sr.slice(-minLen), bC = br.slice(-minLen);
    const sR: number[] = [], bR: number[] = [];
    for (let i = 1; i < minLen; i++) { sR.push((sC[i] - sC[i - 1]) / sC[i - 1]); bR.push((bC[i] - bC[i - 1]) / bC[i - 1]); }
    const n = sR.length;
    const mS = sR.reduce((a, b) => a + b, 0) / n, mB = bR.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varB = 0;
    for (let i = 0; i < n; i++) { cov += (sR[i] - mS) * (bR[i] - mB); varB += (bR[i] - mB) ** 2; }
    const beta = varB === 0 ? 0 : cov / varB;
    const alpha = (mS - beta * mB) * 252;
    const stockVol = Math.sqrt(sR.reduce((s, r) => s + (r - mS) ** 2, 0) / (n - 1)) * Math.sqrt(252);
    const benchVol = Math.sqrt(bR.reduce((s, r) => s + (r - mB) ** 2, 0) / (n - 1)) * Math.sqrt(252);
    const annStock = mS * 252, annBench = mB * 252;
    res.json({
      symbol, benchmark, beta, alpha, correlation: pearson(sR, bR),
      annualizedReturn: annStock, annualizedBenchReturn: annBench,
      stockVol, benchVol,
      sharpe: stockVol === 0 ? 0 : annStock / stockVol,
      treynor: beta === 0 ? 0 : annStock / beta,
      informationRatio: stockVol === 0 ? 0 : (annStock - annBench) / stockVol,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathCorrelationRoutes.get('/cointegration', async (req, res) => {
  try {
    const s1 = (req.query.s1 as string) || 'AAPL';
    const s2 = (req.query.s2 as string) || 'MSFT';
    const days = parseInt(req.query.days as string) || 252;
    const c1 = await getCloses(s1, days), c2 = await getCloses(s2, days);
    const n = Math.min(c1.length, c2.length);
    if (n < 20) return res.status(404).json({ error: 'Insufficient data' });
    const a = c1.slice(-n), b = c2.slice(-n);
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += a[i]; sy += b[i]; sxy += a[i] * b[i]; sxx += a[i] * a[i]; }
    const beta = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - beta * sx) / n;
    const residuals = a.map((v, i) => v - (beta * b[i] + intercept));
    let sumRes = 0;
    for (let i = 1; i < residuals.length; i++) sumRes += (residuals[i] - residuals[i - 1]) ** 2;
    let ssRes = 0;
    const rMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    for (const r of residuals) ssRes += (r - rMean) ** 2;
    const rho = sumRes === 0 ? 0 : 1 - (residuals.length * ssRes) / (sumRes * residuals.length);
    const stat = rho * Math.sqrt(n / (1 - rho * rho));
    res.json({ symbol1: s1, symbol2: s2, beta, intercept, engleGrangerStat: stat, isCointegrated: stat < -2.86, residuals: residuals.map((r, i) => ({ index: i, residual: r })) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathCorrelationRoutes.get('/granger/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const cause = (req.query.cause as string) || 'SPY';
    const days = parseInt(req.query.days as string) || 252;
    const maxLag = parseInt(req.query.lag as string) || 5;
    const tC = await getCloses(symbol, days), cC = await getCloses(cause, days);
    const n = Math.min(tC.length, cC.length);
    if (n < maxLag + 10) return res.status(404).json({ error: 'Insufficient data' });
    const tR: number[] = [], cR: number[] = [];
    for (let i = 1; i < n; i++) { tR.push((tC[i] - tC[i - 1]) / tC[i - 1]); cR.push((cC[i] - cC[i - 1]) / cC[i - 1]); }
    const results: { lag: number; fStat: number; significant: boolean }[] = [];
    for (let lag = 1; lag <= maxLag; lag++) {
      const nn = tR.length - lag;
      if (nn < lag + 5) continue;
      let rssR = 0, rssUR = 0;
      const tv = tR.slice(lag);
      for (let i = 0; i < nn; i++) {
        let predR = 0, predUR = 0;
        for (let j = 1; j <= lag; j++) { predR += tR[i + lag - j]; predUR += tR[i + lag - j] * 0.5; }
        predR /= lag;
        for (let j = 1; j <= lag; j++) predUR += cR[i + lag - j] * 0.5;
        rssR += (tv[i] - predR) ** 2;
        rssUR += (tv[i] - predUR) ** 2;
      }
      const fStat = rssUR > 0 ? ((rssR - rssUR) / lag) / (rssUR / (nn - 2 * lag)) : 0;
      results.push({ lag, fStat, significant: fStat > 3.84 });
    }
    const best = results.reduce((b, r) => r.fStat > b.fStat ? r : b, results[0]);
    res.json({ symbol, cause, results, bestLag: best?.lag, conclusion: best?.significant ? `${cause} Granger-causes ${symbol} at lag ${best?.lag}` : 'No Granger causality found' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
