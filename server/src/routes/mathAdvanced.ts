import { Router } from 'express';
import { getStockDb } from '../stocks/db';

export const mathAdvancedRoutes = Router();

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

mathAdvancedRoutes.get('/fourier/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 252;
    const data = await getCloses(symbol, days);
    if (data.length < 16) return res.status(404).json({ error: 'Insufficient data' });
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const detrended = data.map(d => d - mean);
    const maxK = Math.min(Math.floor(n / 2), 128);
    const spectrum: { freq: number; period: number; magnitude: number; power: number }[] = [];
    for (let k = 1; k <= maxK; k++) {
      let real = 0, imag = 0;
      for (let t = 0; t < n; t++) { const angle = (2 * Math.PI * k * t) / n; real += detrended[t] * Math.cos(angle); imag += detrended[t] * Math.sin(angle); }
      const mag = Math.sqrt(real * real + imag * imag) / n;
      spectrum.push({ freq: k / n, period: n / k, magnitude: mag, power: mag * mag });
    }
    const totalPower = spectrum.reduce((s, f) => s + f.power, 0);
    const topCycles = [...spectrum].sort((a, b) => b.power - a.power).slice(0, 5).map(c => ({ ...c, pctPower: totalPower === 0 ? 0 : (c.power / totalPower) * 100 }));
    res.json({ symbol, spectrum, topCycles, dominantCycleDays: Math.round(topCycles[0]?.period ?? 0) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathAdvancedRoutes.get('/zscore/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 500;
    const window = parseInt(req.query.window as string) || 20;
    const db = await getStockDb();
    const rows = db.exec(`SELECT date, close FROM stock_prices WHERE symbol='${symbol}' AND close > 0 ORDER BY date DESC LIMIT ${days}`);
    if (!rows.length || rows[0].values.length < window + 5) return res.status(404).json({ error: 'Insufficient data' });
    const data = rows[0].values.map((r: any) => ({ date: r[0] as string, close: r[1] as number })).reverse();
    const series: { date: string; close: number; zScore: number; signal: string }[] = [];
    for (let i = window; i < data.length; i++) {
      const sl = data.slice(i - window, i).map(d => d.close);
      const mean = sl.reduce((a: number, b: number) => a + b, 0) / window;
      const std = Math.sqrt(sl.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / (window - 1));
      const z = std === 0 ? 0 : (data[i].close - mean) / std;
      const signal = z > 2 ? 'strong_sell' : z > 1 ? 'sell' : z < -2 ? 'strong_buy' : z < -1 ? 'buy' : 'neutral';
      series.push({ date: data[i].date, close: data[i].close, zScore: z, signal });
    }
    const cur = series[series.length - 1];
    const meanZ = series.reduce((s, d) => s + d.zScore, 0) / series.length;
    res.json({
      symbol, window, series,
      current: cur ? { zScore: cur.zScore, signal: cur.signal, date: cur.date } : null,
      stats: { meanZ, maxZ: Math.max(...series.map(s => s.zScore)), minZ: Math.min(...series.map(s => s.zScore)) },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathAdvancedRoutes.get('/portfolio', async (req, res) => {
  try {
    const symbols = ((req.query.symbols as string) || 'AAPL,MSFT,GOOGL,AMZN,META').split(',');
    const days = parseInt(req.query.days as string) || 252;
    const allR: Record<string, number[]> = {};
    for (const s of symbols) allR[s] = await getReturns(s, days);
    const minLen = Math.min(...symbols.map(s => allR[s].length));
    if (minLen < 30) return res.status(404).json({ error: 'Insufficient data' });
    const trimmed: Record<string, number[]> = {};
    for (const s of symbols) trimmed[s] = allR[s].slice(-minLen);
    const means: Record<string, number> = {};
    const covMatrix: Record<string, Record<string, number>> = {};
    for (const s of symbols) {
      means[s] = trimmed[s].reduce((a, b) => a + b, 0) / minLen;
      covMatrix[s] = {};
      for (const s2 of symbols) {
        let cov = 0;
        for (let i = 0; i < minLen; i++) cov += (trimmed[s][i] - means[s]) * (trimmed[s2][i] - means[s2]);
        covMatrix[s][s2] = cov / (minLen - 1);
      }
    }
    const annM: Record<string, number> = {}, annV: Record<string, number> = {};
    for (const s of symbols) { annM[s] = means[s] * 252; annV[s] = Math.sqrt(covMatrix[s][s]) * Math.sqrt(252); }
    const portfolios: { weights: Record<string, number>; return: number; vol: number; sharpe: number }[] = [];
    for (let p = 0; p < 500; p++) {
      let wArr = symbols.map(() => Math.random());
      const wSum = wArr.reduce((a, b) => a + b, 0);
      wArr = wArr.map(w => w / wSum);
      const weights: Record<string, number> = {};
      symbols.forEach((s, i) => weights[s] = wArr[i]);
      let portRet = 0, portVar = 0;
      for (const s of symbols) portRet += weights[s] * annM[s];
      for (const s of symbols) for (const s2 of symbols) portVar += weights[s] * weights[s2] * covMatrix[s][s2] * 252;
      const vol = Math.sqrt(Math.max(portVar, 0));
      portfolios.push({ weights, return: portRet, vol, sharpe: vol === 0 ? 0 : portRet / vol });
    }
    const maxSharpe = portfolios.reduce((best, p) => p.sharpe > best.sharpe ? p : best, portfolios[0]);
    const minVol = portfolios.reduce((best, p) => p.vol < best.vol ? p : best, portfolios[0]);
    const corrMatrix: Record<string, Record<string, number>> = {};
    for (const s of symbols) { corrMatrix[s] = {}; for (const s2 of symbols) corrMatrix[s][s2] = (annV[s] * annV[s2]) === 0 ? 0 : covMatrix[s][s2] * 252 / (annV[s] * annV[s2]); }
    res.json({ symbols, means: annM, vols: annV, correlation: corrMatrix, optimalPortfolio: { ...maxSharpe, label: 'Max Sharpe' }, minVariance: { ...minVol, label: 'Min Variance' }, frontier: portfolios.map(p => ({ vol: p.vol, ret: p.return, sharpe: p.sharpe })) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathAdvancedRoutes.get('/efficient-frontier/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 502;
    const benchmark = (req.query.benchmark as string) || 'SPY';
    const sr = await getReturns(symbol, days), br = await getReturns(benchmark, days);
    const n = Math.min(sr.length, br.length);
    if (n < 30) return res.status(404).json({ error: 'Insufficient data' });
    const sR = sr.slice(-n), bR = br.slice(-n);
    const mS = sR.reduce((a, b) => a + b, 0) / n * 252;
    const mB = bR.reduce((a, b) => a + b, 0) / n * 252;
    const vS = Math.sqrt(sR.reduce((s, r) => s + (r - mS / 252) ** 2, 0) / (n - 1)) * Math.sqrt(252);
    const vB = Math.sqrt(bR.reduce((s, r) => s + (r - mB / 252) ** 2, 0) / (n - 1)) * Math.sqrt(252);
    let cov = 0;
    for (let i = 0; i < n; i++) cov += (sR[i] - mS / 252) * (bR[i] - mB / 252);
    const beta = vB === 0 ? 0 : (cov / (n - 1)) / (vB / Math.sqrt(252)) ** 2;
    const alpha = mS - beta * mB;
    const rf = 0.05;
    const frontier = Array.from({ length: 21 }, (_, i) => {
      const ws = i / 20;
      const eR = ws * mS + (1 - ws) * mB;
      const vP = Math.sqrt(ws * ws * vS ** 2 + (1 - ws) ** 2 * vB ** 2 + 2 * ws * (1 - ws) * beta * vS * vB * 0.5);
      return { weight: ws, expectedReturn: eR, volatility: vP, sharpe: vP === 0 ? 0 : (eR - rf) / vP };
    });
    res.json({ symbol, benchmark, alpha, beta, stockReturn: mS, stockVol: vS, benchReturn: mB, benchVol: vB, sharpeStock: vS === 0 ? 0 : (mS - rf) / vS, sharpeBench: vB === 0 ? 0 : (mB - rf) / vB, frontier });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

mathAdvancedRoutes.get('/pca', async (req, res) => {
  try {
    const symbols = ((req.query.symbols as string) || 'AAPL,MSFT,GOOGL,AMZN,META,TSLA,NVDA,JPM').split(',');
    const days = parseInt(req.query.days as string) || 252;
    const allR: Record<string, number[]> = {};
    for (const s of symbols) allR[s] = await getReturns(s, days);
    const minLen = Math.min(...symbols.map(s => allR[s].length));
    if (minLen < 30) return res.status(404).json({ error: 'Insufficient data' });
    const trimmed: Record<string, number[]> = {};
    for (const s of symbols) trimmed[s] = allR[s].slice(-minLen);
    const means: Record<string, number> = {};
    for (const s of symbols) means[s] = trimmed[s].reduce((a, b) => a + b, 0) / minLen;
    const matrix: number[][] = [];
    for (let i = 0; i < minLen; i++) matrix.push(symbols.map(s => trimmed[s][i] - means[s]));
    const sz = symbols.length;
    const covMatrix: number[][] = Array.from({ length: sz }, () => Array(sz).fill(0));
    for (let i = 0; i < sz; i++) for (let j = 0; j < sz; j++) { let sum = 0; for (let k = 0; k < minLen; k++) sum += matrix[k][i] * matrix[k][j]; covMatrix[i][j] = sum / (minLen - 1); }
    const eigenvalues: number[] = [];
    const eigenvectors: number[][] = [];
    for (let comp = 0; comp < Math.min(sz, 5); comp++) {
      let v = Array(sz).fill(0).map(() => Math.random());
      const vN = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      v = v.map(x => x / vN);
      for (let iter = 0; iter < 100; iter++) {
        const w: number[] = Array(sz).fill(0);
        for (let i = 0; i < sz; i++) for (let j = 0; j < sz; j++) w[i] += covMatrix[i][j] * v[j];
        for (let c = 0; c < comp; c++) { let dot = 0; for (let i = 0; i < sz; i++) dot += w[i] * eigenvectors[c][i]; for (let i = 0; i < sz; i++) w[i] -= dot * eigenvectors[c][i]; }
        const wN = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
        v = wN === 0 ? v : w.map(x => x / wN);
      }
      const Av: number[] = Array(sz).fill(0);
      for (let i = 0; i < sz; i++) for (let j = 0; j < sz; j++) Av[i] += covMatrix[i][j] * v[j];
      let eigenval = 0; for (let i = 0; i < sz; i++) eigenval += v[i] * Av[i];
      eigenvalues.push(eigenval);
      eigenvectors.push(v);
    }
    const totalVar = eigenvalues.reduce((a, b) => a + b, 0);
    let cumVar = 0;
    const loadings = eigenvectors.map((vec, i) => {
      cumVar += eigenvalues[i] / totalVar * 100;
      return { component: i + 1, eigenvalue: eigenvalues[i], varianceExplained: totalVar === 0 ? 0 : (eigenvalues[i] / totalVar) * 100, cumulativeVariance: cumVar, loadings: Object.fromEntries(symbols.map((s, j) => [s, vec[j]])) };
    });
    res.json({ symbols, loadings, totalVariance: totalVar, nComponents: Math.min(sz, 5) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
