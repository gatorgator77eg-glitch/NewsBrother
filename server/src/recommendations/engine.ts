import YahooFinance from 'yahoo-finance2';
import { COUNTRIES, CountryDef, getUniverse, getPriceHistory, getIndexPriceHistory, PriceBar, TickerInfo } from './universe';
import { getCountrySentiment, getTickerSentiment, SentimentResult } from './sentiment';
import { createLogger } from '../logger';

const log = createLogger({ module: 'recs-engine' });

const yf = new YahooFinance({ validation: { logErrors: false }, suppressNotices: ['ripHistorical'] });

export interface FundamentalData {
  pe: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  earningsGrowth: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketCap: number;
  avgVolume: number;
}

export interface StockScore {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  capTier: 'mega' | 'large' | 'mid' | 'small';
  price: number;
  change1d: number;
  change1w: number;
  change1m: number;
  composite: number;
  technical: number;
  sentiment: number;
  volume: number;
  relativeStrength: number;
  macro: number;
  fundamental: number;
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  reasoning: string[];
  scoreDelta: number;
  prevSignal: string;
  sparkline: { date: string; price: number }[];
  priceHistory: { date: string; price: number }[];
}

export interface CountryRecommendation {
  country: CountryDef;
  indexChange1d: number;
  indexChange1w: number;
  countrySentiment: SentimentResult;
  topBuy: StockScore[];
  topSell: StockScore[];
  allScored: StockScore[];
  computedAt: string;
}

function getCapTier(cap: number): StockScore['capTier'] {
  if (cap >= 200e9) return 'mega';
  if (cap >= 10e9) return 'large';
  if (cap >= 2e9) return 'mid';
  return 'small';
}

// ── Technical Indicators ────────────────────────────────────────────────────

function computeEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function computeSMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function computeRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function computeMACD(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(26), 9);
  if (signalLine.length < 1) return null;
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd, signal, histogram: macd - signal };
}

function computeBBands(closes: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number; pctB: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const latest = closes[closes.length - 1];
  const pctB = upper !== lower ? (latest - lower) / (upper - lower) : 0.5;
  return { upper, middle, lower, pctB };
}

function computeATR(prices: PriceBar[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    const prev = prices[i - 1].close;
    const tr = Math.max(
      prices[i].high - prices[i].low,
      Math.abs(prices[i].high - prev),
      Math.abs(prices[i].low - prev)
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / period;
}

function computeADX(prices: PriceBar[], period: number = 14): number | null {
  if (prices.length < period * 2) return null;
  const pDI: number[] = [];
  const mDI: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const upMove = prices[i].high - prices[i - 1].high;
    const downMove = prices[i - 1].low - prices[i].low;
    pDI.push(upMove > downMove && upMove > 0 ? upMove : 0);
    mDI.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smoothedPDI = computeEMA(pDI, period);
  const smoothedMDI = computeEMA(mDI, period);
  const dxValues: number[] = [];
  for (let i = period; i < smoothedPDI.length; i++) {
    const sum = smoothedPDI[i] + smoothedMDI[i];
    if (sum === 0) { dxValues.push(0); continue; }
    dxValues.push(Math.abs(smoothedPDI[i] - smoothedMDI[i]) / sum * 100);
  }
  if (dxValues.length < period) return null;
  const adx = computeEMA(dxValues, period);
  return adx[adx.length - 1];
}

function computeStochastic(prices: PriceBar[], kPeriod: number = 14, dPeriod: number = 3): { k: number; d: number } | null {
  if (prices.length < kPeriod + dPeriod) return null;
  const kValues: number[] = [];
  for (let i = prices.length - kPeriod - dPeriod + 1; i < prices.length; i++) {
    const high = Math.max(...prices.slice(i - kPeriod + 1, i + 1).map(p => p.high));
    const low = Math.min(...prices.slice(i - kPeriod + 1, i + 1).map(p => p.low));
    const close = prices[i].close;
    kValues.push(high !== low ? (close - low) / (high - low) * 100 : 50);
  }
  const k = kValues[kValues.length - 1];
  const d = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  return { k, d };
}

// ── Scoring Functions ───────────────────────────────────────────────────────

function scoreTechnical(prices: PriceBar[]): { score: number; reasons: string[] } {
  if (prices.length < 50) return { score: 0, reasons: ['Insufficient price data'] };
  const closes = prices.map(p => p.close);
  const latest = closes[closes.length - 1];
  const reasons: string[] = [];
  let score = 0;

  // MA crossover: 20 vs 50 (±15)
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  if (sma20 !== null && sma50 !== null) {
    if (sma20 > sma50) { score += 12; reasons.push('20-day MA above 50-day MA'); }
    else { score -= 12; reasons.push('20-day MA below 50-day MA'); }
    if (latest > sma20) { score += 3; } else { score -= 3; }
  }

  // RSI (±15)
  const rsi = computeRSI(closes);
  if (rsi !== null) {
    if (rsi < 30) { score += 15; reasons.push(`RSI oversold (${rsi.toFixed(0)})`); }
    else if (rsi < 40) { score += 8; reasons.push(`RSI near oversold (${rsi.toFixed(0)})`); }
    else if (rsi > 70) { score -= 15; reasons.push(`RSI overbought (${rsi.toFixed(0)})`); }
    else if (rsi > 60) { score -= 8; reasons.push(`RSI near overbought (${rsi.toFixed(0)})`); }
  }

  // MACD (±15)
  const macd = computeMACD(closes);
  if (macd) {
    if (macd.histogram > 0 && macd.macd > 0) { score += 12; reasons.push('MACD bullish crossover'); }
    else if (macd.histogram > 0) { score += 6; reasons.push('MACD histogram positive'); }
    else if (macd.histogram < 0 && macd.macd < 0) { score -= 12; reasons.push('MACD bearish crossover'); }
    else if (macd.histogram < 0) { score -= 6; reasons.push('MACD histogram negative'); }
  }

  // Bollinger Bands (±10)
  const bb = computeBBands(closes);
  if (bb) {
    if (bb.pctB < 0.1) { score += 10; reasons.push('Price near lower Bollinger Band'); }
    else if (bb.pctB < 0.3) { score += 5; reasons.push('Price below Bollinger midline'); }
    else if (bb.pctB > 0.9) { score -= 10; reasons.push('Price near upper Bollinger Band'); }
    else if (bb.pctB > 0.7) { score -= 5; reasons.push('Price above Bollinger midline'); }
  }

  // ADX trend strength (±5)
  const adx = computeADX(prices);
  if (adx !== null && adx > 25) {
    if (sma20 !== null && sma50 !== null) {
      const trendBonus = sma20 > sma50 ? 5 : -5;
      score += trendBonus;
      reasons.push(`Strong trend (ADX ${adx.toFixed(0)})`);
    }
  }

  // Stochastic (±5)
  const stoch = computeStochastic(prices);
  if (stoch) {
    if (stoch.k < 20 && stoch.k > stoch.d) { score += 5; reasons.push('Stochastic bullish'); }
    else if (stoch.k > 80 && stoch.k < stoch.d) { score -= 5; reasons.push('Stochastic bearish'); }
  }

  // 20-day slope (±10)
  if (closes.length >= 20) {
    const slope = (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100;
    if (slope > 5) { score += 10; reasons.push(`Strong 20d uptrend (+${slope.toFixed(1)}%)`); }
    else if (slope > 1) { score += 5; }
    else if (slope < -5) { score -= 10; reasons.push(`Strong 20d downtrend (${slope.toFixed(1)}%)`); }
    else if (slope < -1) { score -= 5; }
  }

  // 52-week range (±5)
  if (closes.length >= 200) {
    const high200 = Math.max(...closes.slice(-200));
    const low200 = Math.min(...closes.slice(-200));
    const pos = (latest - low200) / ((high200 - low200) || 1);
    if (pos < 0.1) { score += 5; reasons.push('Near 52-week low'); }
    else if (pos > 0.9) { score -= 5; reasons.push('Near 52-week high'); }
  }

  return { score: Math.max(-100, Math.min(100, score)), reasons };
}

function scoreVolume(prices: PriceBar[]): number {
  if (prices.length < 21) return 0;
  const volumes = prices.map(p => p.volume);
  const currentVol = volumes[volumes.length - 1];
  const avgVol20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  if (avgVol20 === 0) return 0;
  const ratio = currentVol / avgVol20;
  const priceUp = prices[prices.length - 1].close > prices[prices.length - 2].close;

  if (ratio > 2 && priceUp) return 30;
  if (ratio > 1.5 && priceUp) return 20;
  if (ratio > 1.2 && priceUp) return 10;
  if (ratio > 2 && !priceUp) return -30;
  if (ratio > 1.5 && !priceUp) return -20;
  if (ratio > 1.2 && !priceUp) return -10;
  if (ratio < 0.5) return -5;
  return 0;
}

function scoreRelativeStrength(stockPrices: PriceBar[], indexPrices: PriceBar[]): number {
  if (stockPrices.length < 22 || indexPrices.length < 22) return 0;

  const stockRet1w = (stockPrices[stockPrices.length - 1].close - stockPrices[stockPrices.length - 6].close) / stockPrices[stockPrices.length - 6].close;
  const stockRet1m = (stockPrices[stockPrices.length - 1].close - stockPrices[stockPrices.length - 22].close) / stockPrices[stockPrices.length - 22].close;
  const idxRet1w = (indexPrices[indexPrices.length - 1].close - indexPrices[indexPrices.length - 6].close) / indexPrices[indexPrices.length - 6].close;
  const idxRet1m = (indexPrices[indexPrices.length - 1].close - indexPrices[indexPrices.length - 22].close) / indexPrices[indexPrices.length - 22].close;

  let score = 0;
  const weekDiff = (stockRet1w - idxRet1w) * 100;
  if (weekDiff > 3) score += 25;
  else if (weekDiff > 1) score += 15;
  else if (weekDiff < -3) score -= 25;
  else if (weekDiff < -1) score -= 15;

  const monthDiff = (stockRet1m - idxRet1m) * 100;
  if (monthDiff > 5) score += 25;
  else if (monthDiff > 2) score += 15;
  else if (monthDiff < -5) score -= 25;
  else if (monthDiff < -2) score -= 15;

  return Math.max(-100, Math.min(100, score));
}

function scoreSentimentBlended(tickerTone: number, countrySentiment: SentimentResult): number {
  let score = 0;

  // Blend: 60% ticker-specific, 40% country
  const blendedTone = tickerTone * 0.6 + countrySentiment.avgTone * 0.4;
  score += blendedTone * 8;

  // Positive vs negative ratio (country-level)
  const netSentiment = countrySentiment.positiveRatio - countrySentiment.negativeRatio;
  score += netSentiment * 20;

  // Trend
  if (countrySentiment.trend === 'improving') score += 15;
  else if (countrySentiment.trend === 'deteriorating') score -= 15;

  return Math.max(-100, Math.min(100, score));
}

function scoreMacro(countrySentiment: SentimentResult): number {
  let score = 0;

  // Goldstein scale (geopolitical stability): lower = more stable = positive for markets
  // Goldstein is 0-10, where higher = more destabilizing events
  if (countrySentiment.goldsteinAvg > 6) score -= 25;
  else if (countrySentiment.goldsteinAvg > 4) score -= 10;
  else if (countrySentiment.goldsteinAvg < 2) score += 15;

  // Finance article relevance: more finance articles = more market attention
  if (countrySentiment.financeArticleCount > 50) score += 10;
  else if (countrySentiment.financeArticleCount > 20) score += 5;
  else if (countrySentiment.financeArticleCount < 3) score -= 5;

  // Article volume as confidence proxy
  if (countrySentiment.articleCount < 5) score *= 0.5;

  return Math.max(-100, Math.min(100, score));
}

function scoreFundamental(fund: FundamentalData | null): number {
  if (!fund) return 0;
  let score = 0;

  // P/E ratio: value investing signal
  if (fund.pe !== null) {
    if (fund.pe > 0 && fund.pe < 12) score += 15;
    else if (fund.pe >= 12 && fund.pe < 18) score += 8;
    else if (fund.pe >= 25 && fund.pe < 40) score -= 5;
    else if (fund.pe >= 40) score -= 15;
  }

  // Price-to-book
  if (fund.priceToBook !== null) {
    if (fund.priceToBook > 0 && fund.priceToBook < 1) score += 10;
    else if (fund.priceToBook > 3) score -= 5;
  }

  // Dividend yield
  if (fund.dividendYield !== null) {
    if (fund.dividendYield > 0.05) score += 15;
    else if (fund.dividendYield > 0.03) score += 10;
    else if (fund.dividendYield > 0.01) score += 5;
  }

  // 52-week position
  if (fund.fiftyTwoWeekHigh > 0 && fund.fiftyTwoWeekLow > 0) {
    const range = fund.fiftyTwoWeekHigh - fund.fiftyTwoWeekLow;
    if (range > 0) {
      const pos = (0 - fund.fiftyTwoWeekLow) / range; // use last known from caller
      if (pos < 0.2) score += 5;
    }
  }

  return Math.max(-100, Math.min(100, score));
}

function computeSignal(composite: number): StockScore['signal'] {
  if (composite >= 50) return 'STRONG_BUY';
  if (composite >= 20) return 'BUY';
  if (composite >= -20) return 'HOLD';
  if (composite >= -50) return 'SELL';
  return 'STRONG_SELL';
}

function computeConfidence(stockPrices: PriceBar[], articleCount: number, fund: FundamentalData | null): number {
  let confidence = 0.5;
  if (stockPrices.length >= 200) confidence += 0.15;
  else if (stockPrices.length >= 100) confidence += 0.08;
  else if (stockPrices.length < 30) confidence -= 0.15;
  if (articleCount >= 50) confidence += 0.12;
  else if (articleCount >= 20) confidence += 0.06;
  else if (articleCount < 5) confidence -= 0.12;
  if (fund && fund.pe !== null) confidence += 0.05;
  return Math.max(0.1, Math.min(1, confidence));
}

// ── Fundamental Data Fetch ──────────────────────────────────────────────────

async function fetchFundamentals(symbol: string): Promise<FundamentalData | null> {
  try {
    const q = await yf.quote(symbol);
    if (!q) return null;
    return {
      pe: q.trailingPE ?? null,
      priceToBook: q.priceToBook ?? null,
      dividendYield: q.dividendYield ?? null,
      earningsGrowth: null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? 0,
      marketCap: q.marketCap ?? 0,
      avgVolume: q.averageDailyVolume3Month ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Score Delta (from history) ──────────────────────────────────────────────

async function getScoreDelta(symbol: string, country: string): Promise<{ delta: number; prevSignal: string }> {
  try {
    const { getNewsArchiveDb } = await import('../newsArchive/db');
    const db = await getNewsArchiveDb();
    const result = db.exec(
      `SELECT composite, signal, computed_at FROM recs_history
       WHERE symbol = ? AND country = ?
       ORDER BY computed_at DESC LIMIT 1`,
      [symbol, country]
    );
    if (!result[0] || result[0].values.length === 0) return { delta: 0, prevSignal: '' };
    const row = result[0].values[0];
    return { delta: 0, prevSignal: row[1] as string };
  } catch {
    return { delta: 0, prevSignal: '' };
  }
}

export async function saveScoreHistory(scores: StockScore[], countryCode: string): Promise<number> {
  try {
    const { getNewsArchiveDb } = await import('../newsArchive/db');
    const db = await getNewsArchiveDb();
    let saved = 0;
    const stmt = db.prepare(
      `INSERT INTO recs_history (symbol, country, composite, signal, confidence, technical, sentiment, volume, relativeStrength, macro, fundamental, price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of scores) {
      stmt.run([s.symbol, countryCode, s.composite, s.signal, s.confidence, s.technical, s.sentiment, s.volume, s.relativeStrength, s.macro, s.fundamental, s.price]);
      saved++;
    }
    stmt.free();
    return saved;
  } catch {
    return 0;
  }
}

// ── Main Scoring ────────────────────────────────────────────────────────────

export async function scoreStock(
  ticker: TickerInfo,
  country: CountryDef,
  countrySentiment: SentimentResult,
  indexPrices: PriceBar[],
  fundamentals: Map<string, FundamentalData>,
): Promise<StockScore> {
  const prices = await getPriceHistory(ticker.symbol, 250);
  const closes = prices.map(p => p.close);
  const latestPrice = closes.length > 0 ? closes[closes.length - 1] : 0;

  // Per-ticker sentiment (60% ticker / 40% country blend happens inside)
  const tickerTone = await getTickerSentiment(ticker.symbol, ticker.name, country.code);

  const tech = scoreTechnical(prices);
  const volumeSignal = scoreVolume(prices);
  const relativeStrength = scoreRelativeStrength(prices, indexPrices);
  const sentimentScore = scoreSentimentBlended(tickerTone, countrySentiment);
  const macroScore = scoreMacro(countrySentiment);
  const fundData = fundamentals.get(ticker.symbol) || null;
  const fundamentalScore = scoreFundamental(fundData);

  const composite = Math.round(
    tech.score * 0.25 +
    sentimentScore * 0.20 +
    volumeSignal * 0.10 +
    relativeStrength * 0.15 +
    macroScore * 0.10 +
    fundamentalScore * 0.20
  );

  const reasoning = [...tech.reasons];
  if (volumeSignal > 10) reasoning.push('Volume accumulation detected');
  else if (volumeSignal < -10) reasoning.push('Volume distribution detected');
  if (relativeStrength > 15) reasoning.push('Outperforming country index');
  else if (relativeStrength < -15) reasoning.push('Underperforming country index');
  if (tickerTone > 2) reasoning.push('Positive ticker-specific news sentiment');
  else if (tickerTone < -2) reasoning.push('Negative ticker-specific news sentiment');
  if (countrySentiment.trend === 'improving') reasoning.push('Country news trend improving');
  else if (countrySentiment.trend === 'deteriorating') reasoning.push('Country news trend deteriorating');
  if (fundData) {
    if (fundData.pe !== null && fundData.pe !== undefined) {
      if (fundData.pe < 12) reasoning.push(`Attractive P/E (${fundData.pe.toFixed(1)})`);
      else if (fundData.pe > 40) reasoning.push(`High P/E (${fundData.pe.toFixed(1)})`);
    }
    if (fundData.dividendYield !== null && fundData.dividendYield !== undefined && fundData.dividendYield > 0.03) {
      reasoning.push(`Strong dividend yield (${(fundData.dividendYield * 100).toFixed(1)}%)`);
    }
  }

  const change1d = closes.length >= 2 ? (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2] * 100 : 0;
  const change1w = closes.length >= 6 ? (closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6] * 100 : 0;
  const change1m = closes.length >= 22 ? (closes[closes.length - 1] - closes[closes.length - 22]) / closes[closes.length - 22] * 100 : 0;

  // Sparkline: last 30 data points
  const sparkData = closes.slice(-30);

  const { delta, prevSignal } = await getScoreDelta(ticker.symbol, country.code);

  return {
    symbol: ticker.symbol,
    name: ticker.name,
    sector: ticker.sector,
    marketCap: ticker.market_cap || fundData?.marketCap || 0,
    capTier: getCapTier(ticker.market_cap || fundData?.marketCap || 0),
    price: latestPrice,
    change1d, change1w, change1m,
    composite,
    technical: tech.score,
    sentiment: sentimentScore,
    volume: volumeSignal,
    relativeStrength,
    macro: macroScore,
    fundamental: fundamentalScore,
    signal: computeSignal(composite),
    confidence: computeConfidence(prices, countrySentiment.articleCount, fundData),
    reasoning,
    scoreDelta: delta,
    prevSignal,
    sparkline: sparkData.map((p, i) => ({ date: `d${i}`, price: p })),
    priceHistory: prices.slice(-60).map(p => ({ date: p.date, price: p.close })),
  };
}

export async function generateRecommendations(countryCode: string): Promise<CountryRecommendation | null> {
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return null;

  log.info('Generating recommendations', { country: countryCode });

  const universe = await getUniverse(country, 30);
  if (universe.length === 0) {
    return {
      country,
      indexChange1d: 0, indexChange1w: 0,
      countrySentiment: { avgTone: 0, articleCount: 0, positiveRatio: 0, negativeRatio: 0, trend: 'stable', recentHeadlines: [], goldsteinAvg: 0, financeArticleCount: 0 },
      topBuy: [], topSell: [], allScored: [],
      computedAt: new Date().toISOString(),
    };
  }

  const countrySentiment = await getCountrySentiment(countryCode);
  const indexPrices = await getIndexPriceHistory(country.indexSymbol, 250);

  const indexCloses = indexPrices.map(p => p.close);
  const indexChange1d = indexCloses.length >= 2 ? (indexCloses[indexCloses.length - 1] - indexCloses[indexCloses.length - 2]) / indexCloses[indexCloses.length - 2] * 100 : 0;
  const indexChange1w = indexCloses.length >= 6 ? (indexCloses[indexCloses.length - 1] - indexCloses[indexCloses.length - 6]) / indexCloses[indexCloses.length - 6] * 100 : 0;

  // Batch fetch fundamentals for all tickers (with rate limiting)
  const fundamentals = new Map<string, FundamentalData>();
  for (const ticker of universe) {
    const fund = await fetchFundamentals(ticker.symbol);
    if (fund) fundamentals.set(ticker.symbol, fund);
    await new Promise(r => setTimeout(r, 150)); // Rate limit
  }

  const scored: StockScore[] = [];
  for (const ticker of universe) {
    try {
      const s = await scoreStock(ticker, country, countrySentiment, indexPrices, fundamentals);
      scored.push(s);
    } catch (err: any) {
      log.warn('Failed to score ticker', { symbol: ticker.symbol, error: err.message });
    }
  }

  scored.sort((a, b) => b.composite - a.composite);

  const topBuy = scored.filter(s => s.composite > 0).slice(0, 3);
  const topSell = [...scored].filter(s => s.composite < 0).sort((a, b) => a.composite - b.composite).slice(0, 3);

  if (topSell.length < 3) {
    const remaining = scored.slice(-3).reverse();
    for (const s of remaining) {
      if (topSell.length >= 3) break;
      if (!topSell.find(x => x.symbol === s.symbol)) topSell.push(s);
    }
  }

  // Save to history for score delta tracking
  await saveScoreHistory(scored, countryCode);

  return {
    country,
    indexChange1d,
    indexChange1w,
    countrySentiment,
    topBuy,
    topSell,
    allScored: scored,
    computedAt: new Date().toISOString(),
  };
}
