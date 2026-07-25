import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';

const log = createLogger({ module: 'srs-advisor' });
export const srsAdvisorRoutes = Router();

async function getDb() {
  const { getSrsDb } = await import('./srs');
  return getSrsDb();
}

function query(db: any, sql: string, params: any[] = []): any[] {
  const result = db.exec(sql, params);
  if (!result[0]) return [];
  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    result[0].columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

// ── Product metadata (enrichment for recommendations) ─────────────────────
const PRODUCT_META: Record<string, { fundHouse: string; fundType: string; category: string; riskLevel: string; description: string }> = {
  'LU0417517546': { fundHouse: 'Allianz', fundType: 'Equity', category: 'US', riskLevel: 'High', description: 'US equity markets via active stock selection' },
  'LU1846563374': { fundHouse: 'Allianz', fundType: 'Bond', category: 'Global', riskLevel: 'Medium', description: 'Floating rate notes globally, lower rate sensitivity' },
  'LU0251142724': { fundHouse: 'Fidelity', fundType: 'Equity', category: 'US', riskLevel: 'High', description: 'US domiciled companies, core American exposure' },
  'LU0251143458': { fundHouse: 'Fidelity', fundType: 'Equity', category: 'Emerging Markets', riskLevel: 'High', description: 'Emerging market companies worldwide' },
  'LU0731783394': { fundHouse: 'Fidelity', fundType: 'Equity', category: 'Global', riskLevel: 'Medium-High', description: 'Global dividend companies, income + growth' },
  'LU0905234570': { fundHouse: 'Fidelity', fundType: 'Multi Asset', category: 'Global', riskLevel: 'Medium', description: 'Multi-asset income across asset classes' },
  'LU0251144936': { fundHouse: 'Fidelity', fundType: 'Equity', category: 'Asia Pacific', riskLevel: 'High', description: 'Asia Pacific focused equity' },
  'LU1867151877': { fundHouse: 'Manulife', fundType: 'Equity', category: 'Asia Pacific', riskLevel: 'Medium-High', description: 'Asia Pacific REITs for income' },
  'SG9999014484': { fundHouse: 'Nikko AM', fundType: 'Equity', category: 'ASEAN', riskLevel: 'High', description: 'ASEAN equity markets' },
  'LU1514168886': { fundHouse: 'Schroder', fundType: 'Bond', category: 'Global', riskLevel: 'Medium', description: 'Global credit income' },
  'LU0323421593': { fundHouse: 'Franklin', fundType: 'Bond', category: 'Global', riskLevel: 'Medium-High', description: 'High yield bond income' },
  'LU0320765646': { fundHouse: 'Franklin', fundType: 'Multi Asset', category: 'Global', riskLevel: 'Medium', description: 'Multi-asset income allocation' },
  'LU0536402901': { fundHouse: 'Franklin', fundType: 'Equity', category: 'India', riskLevel: 'High', description: 'India equity growth' },
  'LU0320765489': { fundHouse: 'Franklin', fundType: 'Multi Asset', category: 'Global', riskLevel: 'Medium', description: 'Multi-asset balanced allocation' },
  'LU0320765059': { fundHouse: 'Franklin', fundType: 'Equity', category: 'US', riskLevel: 'High', description: 'US growth opportunities' },
  'LU0320764755': { fundHouse: 'Franklin', fundType: 'Equity', category: 'Asia Pacific', riskLevel: 'High', description: 'Asian growth equities' },
  'LU0320764599': { fundHouse: 'Franklin', fundType: 'Equity', category: 'China', riskLevel: 'High', description: 'China equity market' },
  'LU0310800965': { fundHouse: 'Franklin', fundType: 'Multi Asset', category: 'Global', riskLevel: 'Medium', description: 'Global balanced portfolio' },
  'LU0320763948': { fundHouse: 'Franklin', fundType: 'Bond', category: 'Global', riskLevel: 'Medium', description: 'Global bond market' },
  'LU0310799852': { fundHouse: 'Franklin', fundType: 'Equity', category: 'Global', riskLevel: 'Medium-High', description: 'Global equity income' },
  'LU0310800379': { fundHouse: 'Franklin', fundType: 'Equity', category: 'Global', riskLevel: 'High', description: 'Global equity growth' },
  'LU0320764169': { fundHouse: 'Franklin', fundType: 'Multi Asset', category: 'Global', riskLevel: 'Medium', description: 'Global total return' },
  'LU0320763518': { fundHouse: 'Franklin', fundType: 'Equity', category: 'Latin America', riskLevel: 'High', description: 'Latin America equity' },
};

// ── Scoring helpers ───────────────────────────────────────────────────────

function computeDailyReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  return returns;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0.0001;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0.0001;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeSMA(closes: number[], period: number): number {
  const slice = closes.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function percentileRank(values: number[], value: number): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter(v => v < value).length;
  return (below / sorted.length) * 100;
}

// ── Main scoring engine ───────────────────────────────────────────────────

interface FundScore {
  isin: string;
  name: string;
  fundHouse: string;
  fundType: string;
  category: string;
  riskLevel: string;
  description: string;
  compositeScore: number;
  scores: {
    momentum: number;
    sharpe: number;
    trend: number;
    valuation: number;
    macroFit: number;
  };
  explanation: string;
  latestNav: number;
  periodReturns: { '1m': number; '3m': number; '6m': number; '1y': number };
  factsheetUrl: string;
  sharpeRaw: number;
  annualReturn: number;
  volatility: number;
}

function scoreFund(
  isin: string,
  fundName: string,
  navData: any[],
  riskFreeRate: number,
  inflation: number,
  tbillYield: number,
): FundScore | null {
  if (navData.length < 60) return null;

  const closes = navData.map(d => d.nav);
  const latest = closes[closes.length - 1];
  const meta = PRODUCT_META[isin] || { fundHouse: 'Unknown', fundType: 'Equity', category: '', riskLevel: 'Medium', description: '' };

  // ── Period returns ──
  const getReturn = (days: number): number => {
    if (closes.length < days + 1) return 0;
    const old = closes[closes.length - 1 - days];
    return old > 0 ? ((latest - old) / old) * 100 : 0;
  };
  const ret1m = getReturn(21);
  const ret3m = getReturn(63);
  const ret6m = getReturn(126);
  const ret1y = getReturn(252);

  // ── Daily returns for volatility ──
  const dailyReturns = computeDailyReturns(closes);
  const avgDailyReturn = mean(dailyReturns);
  const dailyVol = stdDev(dailyReturns);
  const annualReturn = avgDailyReturn * 252;
  const annualVol = dailyVol * Math.sqrt(252);

  // ── Sharpe ──
  const sharpe = annualVol > 0 ? (annualReturn - riskFreeRate / 100) / annualVol : 0;

  // ── RSI ──
  const rsi = computeRSI(closes);

  // ── SMA alignment ──
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const smaAligned = sma20 > sma50;

  // ── Z-score (252-day) ──
  const yearData = closes.slice(-252);
  const yearMean = mean(yearData);
  const yearStd = stdDev(yearData);
  const zScore = yearStd > 0 ? (latest - yearMean) / yearStd : 0;

  // ── Momentum score (0-100) ──
  const momentumRaw = ret1m * 0.4 + ret3m * 0.6;
  const momentumScore = Math.max(0, Math.min(100, 50 + momentumRaw * 5));

  // ── Sharpe score (0-100) ──
  const sharpeScore = Math.max(0, Math.min(100, 50 + sharpe * 30));

  // ── Trend score (0-100) ──
  let trendScore = 50;
  if (smaAligned) trendScore += 15;
  else trendScore -= 15;
  trendScore += (rsi - 50) * 0.5;
  trendScore = Math.max(0, Math.min(100, trendScore));

  // ── Valuation score (contrarian: low z = high score) ──
  const valuationScore = Math.max(0, Math.min(100, 50 - zScore * 20));

  // ── Macro fit (does it beat T-Bill?) ──
  const excessReturn = ret1y - tbillYield;
  const macroScore = Math.max(0, Math.min(100, 50 + excessReturn * 3));

  // ── Composite ──
  const composite = momentumScore * 0.30
    + sharpeScore * 0.25
    + trendScore * 0.20
    + valuationScore * 0.15
    + macroScore * 0.10;

  // ── Factsheet URL ──
  const factsheetUrl = '';

  // ── Build explanation ──
  const parts: string[] = [];
  if (ret1m > 2) parts.push(`Strong 1M return (+${ret1m.toFixed(1)}%)`);
  else if (ret1m > 0) parts.push(`Positive 1M return (+${ret1m.toFixed(1)}%)`);
  else if (ret1m < -3) parts.push(`Weak 1M (${ret1m.toFixed(1)}%)`);
  else parts.push(`1M return: ${ret1m.toFixed(1)}%`);

  if (smaAligned) parts.push('SMA20 above SMA50 (bullish trend)');
  else parts.push('SMA20 below SMA50 (bearish trend)');

  if (sharpe > 1.0) parts.push(`Sharpe ${sharpe.toFixed(2)} (top quartile risk-adjusted return)`);
  else if (sharpe > 0.5) parts.push(`Sharpe ${sharpe.toFixed(2)} (decent risk-adjusted return)`);
  else parts.push(`Sharpe ${sharpe.toFixed(2)} (weak risk-adjusted return)`);

  if (rsi > 70) parts.push(`RSI ${rsi.toFixed(0)} — overbought, wait for pullback`);
  else if (rsi < 30) parts.push(`RSI ${rsi.toFixed(0)} — oversold, potential entry`);
  else parts.push(`RSI ${rsi.toFixed(0)} — neutral territory`);

  if (zScore < -1) parts.push(`Trading ${Math.abs(zScore).toFixed(1)}σ below 1Y mean (undervalued)`);
  else if (zScore > 1.5) parts.push(`Trading ${zScore.toFixed(1)}σ above 1Y mean (premium)`);
  else parts.push(`Near 1Y average (${zScore.toFixed(1)}σ)`);

  if (excessReturn > 5) parts.push(`Outperforms T-Bill by ${excessReturn.toFixed(1)}% annualized`);
  else if (excessReturn > 0) parts.push(`Modest ${excessReturn.toFixed(1)}% alpha vs T-Bill`);

  return {
    isin,
    name: fundName,
    fundHouse: meta.fundHouse,
    fundType: meta.fundType,
    category: meta.category,
    riskLevel: meta.riskLevel,
    description: meta.description,
    compositeScore: Math.round(composite * 10) / 10,
    scores: {
      momentum: Math.round(momentumScore * 10) / 10,
      sharpe: Math.round(sharpeScore * 10) / 10,
      trend: Math.round(trendScore * 10) / 10,
      valuation: Math.round(valuationScore * 10) / 10,
      macroFit: Math.round(macroScore * 10) / 10,
    },
    explanation: parts.join('. ') + '.',
    latestNav: latest,
    periodReturns: {
      '1m': Math.round(ret1m * 10) / 10,
      '3m': Math.round(ret3m * 10) / 10,
      '6m': Math.round(ret6m * 10) / 10,
      '1y': Math.round(ret1y * 10) / 10,
    },
    factsheetUrl,
    sharpeRaw: sharpe,
    annualReturn: annualReturn * 100,
    volatility: annualVol * 100,
  };
}

// ── GET /api/srs/advisor — Top 3 buy recommendations ──────────────────────
srsAdvisorRoutes.get('/advisor', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    log.info('Advisor: Starting analysis');

    // Load macro data for context
    let tbillYield = 3.15;
    let inflation = 1.6;
    let riskFreeRate = 0.05;
    try {
      const macroRows = query(db, `SELECT key, value FROM srs_macro WHERE date >= date('now', '-7 days')`);
      for (const r of macroRows) {
        if (r.key === 'tbill_6m') tbillYield = r.value;
        if (r.key === 'mas_core_inflation') inflation = r.value;
        if (r.key === 'srs_base_rate') riskFreeRate = r.value;
      }
    } catch {}

    // Get all ISINs that have NAV data
    const isinRows = query(db, `
      SELECT isin, COUNT(*) as data_points,
             MIN(date) as first_date, MAX(date) as last_date
      FROM srs_nav_history
      GROUP BY isin
      HAVING data_points >= 60
    `);

    log.info('Advisor: Found ISINs with sufficient data', { count: isinRows.length });

    const allScores: FundScore[] = [];
    let skippedBonds = 0;
    let skippedInsufficient = 0;

    for (const row of isinRows) {
      const isin = row.isin;
      const meta = PRODUCT_META[isin];

      // Skip bonds and money market for growth posture
      if (meta && (meta.fundType === 'Bond' || meta.fundType === 'Money Market')) {
        skippedBonds++;
        continue;
      }

      // Get full NAV history
      const navData = query(db, `
        SELECT n.isin, n.date, n.nav
        FROM srs_nav_history n
        WHERE n.isin = ?
        ORDER BY n.date
      `, [isin]);

      if (navData.length < 60) {
        skippedInsufficient++;
        continue;
      }

      // Get fund name from srs_funds if available
    let fundName = isin;
    try {
      const nameRow = query(db, `SELECT fund_name FROM srs_funds WHERE isin = ? LIMIT 1`, [isin]);
      if (nameRow[0]?.fund_name) fundName = nameRow[0].fund_name;
    } catch {}

    const score = scoreFund(isin, fundName, navData, riskFreeRate, inflation, tbillYield);
      if (score) {
        allScores.push(score);
      }
    }

    // Sort by composite score descending
    allScores.sort((a, b) => b.compositeScore - a.compositeScore);

    // Quality filter: skip funds with negative return AND negative momentum
    const qualityFiltered = allScores.filter(s =>
      !(s.annualReturn < -5 && s.scores.momentum < 30)
    );

    const topPicks = qualityFiltered.slice(0, 3);
    const allRanked = qualityFiltered;

    log.info('Advisor: Analysis complete', {
      analyzed: qualityFiltered.length,
      skippedBonds,
      skippedInsufficient,
      topPick: topPicks[0]?.isin || 'none',
    });

    res.json({
      topPicks,
      allRanked,
      meta: {
        analyzedCount: qualityFiltered.length,
        totalIsinsWithNav: isinRows.length,
        skippedBonds,
        skippedInsufficient,
        riskFreeRate,
        inflation,
        tbillYield,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    log.error('Advisor: Failed to run analysis', { error: err.message });
    res.status(500).json({ error: 'Failed to run advisor analysis' });
  }
});
