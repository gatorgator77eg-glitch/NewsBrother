import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getMacroRates } from '../scrapers/macroData';

const log = createLogger({ module: 'srs-signals' });
export const srsSignalsRoutes = Router();

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

function scalar(db: any, sql: string, params: any[] = []): any {
  const r = db.exec(sql, params);
  return r[0]?.values[0]?.[0] ?? null;
}

interface Signal {
  signal_type: string;
  product_type: string;
  product_id: string;
  product_name: string;
  rationale: string;
  strength: number;
  target_amount: number;
}

// ── Signal: Idle Cash Hurdle ──────────────────────────────────────────────
function generateIdleCashSignals(db: any, cashBalance: number, rates: Record<string, any>): Signal[] {
  const signals: Signal[] = [];
  if (cashBalance <= 0) return signals;

  const baseRate = rates.srs_base_rate?.value || 0.05;
  const tbill6m = rates.tbill_6m?.value || 0;
  const tbill1y = rates.tbill_1y?.value || 0;
  const ssb1y = rates.ssb_1y_ytm?.value || 0;
  const ssb10y = rates.ssb_10y_ytm?.value || 0;
  const fd6m = rates.fd_6m_dbs?.value || 0;
  const fd12m = rates.fd_12m_dbs?.value || 0;

  const options = [
    { name: '6-Month T-Bill', yield: tbill6m, type: 'tbill', id: 'tbill-6m' },
    { name: '1-Year T-Bill', yield: tbill1y, type: 'tbill', id: 'tbill-1y' },
    { name: 'SSB (1-Year YTM)', yield: ssb1y, type: 'ssb', id: 'ssb-1y' },
    { name: 'SSB (10-Year YTM)', yield: ssb10y, type: 'ssb', id: 'ssb-10y' },
    { name: 'DBS Fixed Deposit 6M', yield: fd6m, type: 'fd', id: 'fd-6m-dbs' },
    { name: 'DBS Fixed Deposit 12M', yield: fd12m, type: 'fd', id: 'fd-12m-dbs' },
  ].filter(o => o.yield > 0);

  if (options.length === 0) return signals;

  // Sort by yield descending
  options.sort((a, b) => b.yield - a.yield);
  const best = options[0];
  const yieldPickup = best.yield - baseRate;

  if (yieldPickup > 0.5) {
    signals.push({
      signal_type: 'idle_cash_buy',
      product_type: best.type,
      product_id: best.id,
      product_name: best.name,
      rationale: `S$${cashBalance.toFixed(0)} idle cash earns ${baseRate}% p.a. Moving to ${best.name} (${best.yield}% p.a.) yields +${yieldPickup.toFixed(2)}% pickup = S$${(cashBalance * yieldPickup / 100).toFixed(0)}/year additional income.`,
      strength: Math.min(yieldPickup / 3, 1),
      target_amount: cashBalance,
    });
  }

  return signals;
}

// ── Signal: Momentum (Moving Average Crossover) ───────────────────────────
function generateMomentumSignals(db: any): Signal[] {
  const signals: Signal[] = [];
  const holdings = query(db, `SELECT * FROM srs_holdings WHERE product_type = 'fund'`);

  for (const h of holdings) {
    if (!h.product_id || h.quantity <= 0) continue;

    const navData = query(db,
      `SELECT date, nav FROM srs_nav_history WHERE isin = ? ORDER BY date`,
      [h.product_id]
    );
    if (navData.length < 50) continue;

    const closes = navData.map((d: any) => d.nav);
    const current = closes[closes.length - 1];

    // 20-day and 50-day SMA
    const sma20 = closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / Math.min(20, closes.length);
    const sma50 = closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / Math.min(50, closes.length);

    // Previous day values for crossover detection
    const prev20 = closes.slice(-21, -1).reduce((a: number, b: number) => a + b, 0) / Math.min(20, closes.length - 1);
    const prev50 = closes.slice(-51, -1).reduce((a: number, b: number) => a + b, 0) / Math.min(50, closes.length - 1);

    const justCrossedUp = prev20 <= prev50 && sma20 > sma50;
    const justCrossedDown = prev20 >= prev50 && sma20 < sma50;

    // RSI (14-period)
    let rsi = 50;
    if (closes.length >= 15) {
      const changes = [];
      for (let i = closes.length - 14; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
      }
      const gains = changes.filter(c => c > 0);
      const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0.001;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 0.001;
      rsi = 100 - (100 / (1 + avgGain / avgLoss));
    }

    // Buy signal: golden cross or oversold RSI
    if (justCrossedUp || rsi < 30) {
      signals.push({
        signal_type: 'momentum_buy',
        product_type: 'fund',
        product_id: h.product_id,
        product_name: h.product_name,
        rationale: justCrossedUp
          ? `20-day SMA crossed above 50-day SMA (golden cross). SMA20=${sma20.toFixed(4)}, SMA50=${sma50.toFixed(4)}.`
          : `RSI=${rsi.toFixed(1)} (oversold territory below 30). Potential bounce.`,
        strength: justCrossedUp ? 0.7 : 0.6,
        target_amount: 0,
      });
    }

    // Sell signal: death cross or overbought RSI
    if (justCrossedDown || rsi > 70) {
      signals.push({
        signal_type: 'momentum_sell',
        product_type: 'fund',
        product_id: h.product_id,
        product_name: h.product_name,
        rationale: justCrossedDown
          ? `20-day SMA crossed below 50-day SMA (death cross). SMA20=${sma20.toFixed(4)}, SMA50=${sma50.toFixed(4)}.`
          : `RSI=${rsi.toFixed(1)} (overbought territory above 70). Consider taking profit.`,
        strength: justCrossedDown ? 0.7 : 0.6,
        target_amount: h.quantity * current,
      });
    }
  }

  return signals;
}

// ── Signal: Valuation Deviation ───────────────────────────────────────────
function generateValuationSignals(db: any): Signal[] {
  const signals: Signal[] = [];
  const holdings = query(db, `SELECT * FROM srs_holdings WHERE product_type = 'fund'`);

  for (const h of holdings) {
    if (!h.product_id || h.quantity <= 0) continue;

    const navData = query(db,
      `SELECT date, nav FROM srs_nav_history WHERE isin = ? ORDER BY date`,
      [h.product_id]
    );
    if (navData.length < 60) continue;

    const closes = navData.map((d: any) => d.nav);
    const current = closes[closes.length - 1];

    // 252-day (1 year) average and standard deviation
    const yearData = closes.slice(-252);
    const mean = yearData.reduce((a: number, b: number) => a + b, 0) / yearData.length;
    const variance = yearData.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / yearData.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) continue;

    const zScore = (current - mean) / stdDev;

    // Sell if > 2 std deviations above mean (overvalued)
    if (zScore > 2) {
      signals.push({
        signal_type: 'valuation_sell',
        product_type: 'fund',
        product_id: h.product_id,
        product_name: h.product_name,
        rationale: `Current NAV ${current.toFixed(4)} is ${(zScore).toFixed(1)}σ above 1-year mean (${mean.toFixed(4)}). Statistically overvalued. Consider rotating to undervalued assets.`,
        strength: Math.min(zScore / 3, 1),
        target_amount: h.quantity * current,
      });
    }

    // Buy if > 2 std deviations below mean (undervalued)
    if (zScore < -2) {
      signals.push({
        signal_type: 'valuation_buy',
        product_type: 'fund',
        product_id: h.product_id,
        product_name: h.product_name,
        rationale: `Current NAV ${current.toFixed(4)} is ${Math.abs(zScore).toFixed(1)}σ below 1-year mean (${mean.toFixed(4)}). Statistically undervalued. Potential entry point.`,
        strength: Math.min(Math.abs(zScore) / 3, 1),
        target_amount: 0,
      });
    }
  }

  return signals;
}

// ── Signal: Real Return (inflation-adjusted) ──────────────────────────────
function generateRealReturnSignals(db: any, rates: Record<string, any>): Signal[] {
  const signals: Signal[] = [];
  const inflation = rates.mas_core_inflation?.value || 1.6;

  // Check if cash is losing purchasing power
  const cashBalance = scalar(db, `SELECT cash_balance FROM srs_portfolio WHERE id = 1`) || 0;
  if (cashBalance > 1000) {
    signals.push({
      signal_type: 'inflation_warning',
      product_type: 'cash',
      product_id: 'srs_cash',
      product_name: 'SRS Cash Balance',
      rationale: `With MAS Core Inflation at ${inflation}% and SRS base rate at 0.05%, your S$${cashBalance.toFixed(0)} is losing ${(inflation - 0.05).toFixed(2)}% purchasing power annually (S$${(cashBalance * (inflation - 0.05) / 100).toFixed(0)} real loss/year).`,
      strength: Math.min((inflation - 0.05) / 5, 1),
      target_amount: cashBalance,
    });
  }

  // Check if any fund has negative real return
  const holdings = query(db, `SELECT * FROM srs_holdings WHERE product_type = 'fund' AND quantity > 0`);
  for (const h of holdings) {
    if (!h.product_id) continue;
    const navData = query(db,
      `SELECT nav FROM srs_nav_history WHERE isin = ? ORDER BY date DESC LIMIT 1`,
      [h.product_id]
    );
    const navData365 = query(db,
      `SELECT nav FROM srs_nav_history WHERE isin = ? AND date <= date('now', '-365 days') ORDER BY date DESC LIMIT 1`,
      [h.product_id]
    );
    if (navData[0] && navData365[0]) {
      const currentNav = navData[0].nav;
      const yearAgoNav = navData365[0].nav;
      const nominalReturn = ((currentNav - yearAgoNav) / yearAgoNav) * 100;
      const realReturn = nominalReturn - inflation;
      if (realReturn < -inflation) {
        signals.push({
          signal_type: 'negative_real_return',
          product_type: 'fund',
          product_id: h.product_id,
          product_name: h.product_name,
          rationale: `1-year nominal return: ${nominalReturn.toFixed(1)}%. Real return after ${inflation}% inflation: ${realReturn.toFixed(1)}%. This fund is losing purchasing power.`,
          strength: Math.min(Math.abs(realReturn) / 10, 1),
          target_amount: h.quantity * h.current_price,
        });
      }
    }
  }

  return signals;
}

// ── Signal: Sharpe Ratio Ranking ──────────────────────────────────────────
function generateSharpeSignals(db: any, rates: Record<string, any>): Signal[] {
  const signals: Signal[] = [];
  const riskFreeRate = rates.srs_base_rate?.value || 0.05;

  const holdings = query(db, `SELECT * FROM srs_holdings WHERE product_type = 'fund' AND quantity > 0`);
  const rankings: { h: any; sharpe: number; annualReturn: number }[] = [];

  for (const h of holdings) {
    if (!h.product_id) continue;
    const navData = query(db,
      `SELECT nav FROM srs_nav_history WHERE isin = ? ORDER BY date`,
      [h.product_id]
    );
    if (navData.length < 60) continue;

    const closes = navData.map((d: any) => d.nav);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length);
    const annualReturn = avgReturn * 252;
    const annualVol = stdReturn * Math.sqrt(252);
    const sharpe = annualVol > 0 ? (annualReturn - riskFreeRate / 100) / annualVol : 0;

    rankings.push({ h, sharpe, annualReturn });
  }

  // Flag worst-performing holdings (lowest Sharpe) as sell candidates
  rankings.sort((a, b) => a.sharpe - b.sharpe);
  for (const r of rankings.slice(0, 2)) {
    if (r.sharpe < 0) {
      signals.push({
        signal_type: 'low_sharpe_sell',
        product_type: 'fund',
        product_id: r.h.product_id,
        product_name: r.h.product_name,
        rationale: `Sharpe ratio: ${r.sharpe.toFixed(2)} (negative risk-adjusted return). Annual return: ${(r.annualReturn * 100).toFixed(1)}%. Consider rotating to higher-performing assets.`,
        strength: Math.min(Math.abs(r.sharpe) / 2, 1),
        target_amount: r.h.quantity * r.h.current_price,
      });
    }
  }

  // Flag best-performing as buy more candidates
  rankings.sort((a, b) => b.sharpe - a.sharpe);
  for (const r of rankings.slice(0, 2)) {
    if (r.sharpe > 1) {
      signals.push({
        signal_type: 'high_sharpe_buy',
        product_type: 'fund',
        product_id: r.h.product_id,
        product_name: r.h.product_name,
        rationale: `Sharpe ratio: ${r.sharpe.toFixed(2)} (strong risk-adjusted return). Annual return: ${(r.annualReturn * 100).toFixed(1)}%. Good candidate for additional allocation.`,
        strength: Math.min(r.sharpe / 3, 1),
        target_amount: 0,
      });
    }
  }

  return signals;
}

// ── Generate all signals and store ────────────────────────────────────────
async function generateAllSignals(db: any): Promise<Signal[]> {
  const rates = await getMacroRates(db);
  const cashBalance = scalar(db, `SELECT cash_balance FROM srs_portfolio WHERE id = 1`) || 0;

  const signals: Signal[] = [
    ...generateIdleCashSignals(db, cashBalance, rates),
    ...generateMomentumSignals(db),
    ...generateValuationSignals(db),
    ...generateRealReturnSignals(db, rates),
    ...generateSharpeSignals(db, rates),
  ];

  // Store signals (clear old active ones first)
  db.run(`UPDATE srs_signals SET status = 'expired' WHERE status = 'active'`);
  const stmt = db.prepare(
    `INSERT INTO srs_signals (signal_type, product_type, product_id, product_name, rationale, strength, target_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  );
  for (const s of signals) {
    stmt.run([s.signal_type, s.product_type, s.product_id, s.product_name, s.rationale, s.strength, s.target_amount]);
  }
  stmt.free();

  return signals;
}

// ── GET /api/srs/signals — Get current active signals ─────────────────────
srsSignalsRoutes.get('/signals', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const active = query(db, `SELECT * FROM srs_signals WHERE status = 'active' ORDER BY strength DESC`);
    const rates = await getMacroRates(db);
    res.json({ signals: active, rates });
  } catch (err: any) {
    log.error('Failed to fetch signals', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// ── POST /api/srs/signals/refresh — Regenerate all signals ───────────────
srsSignalsRoutes.post('/signals/refresh', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const signals = await generateAllSignals(db);
    log.info('Signals generated', { count: signals.length });
    res.json({ success: true, count: signals.length, signals });
  } catch (err: any) {
    log.error('Failed to generate signals', { error: err.message });
    res.status(500).json({ error: 'Failed to generate signals' });
  }
});

// ── GET /api/srs/signals/history — Past signals ───────────────────────────
srsSignalsRoutes.get('/signals/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const db = await getDb();
    const signals = query(db, `SELECT * FROM srs_signals ORDER BY created_at DESC LIMIT ?`, [limit]);
    res.json({ signals });
  } catch (err: any) {
    log.error('Failed to fetch signal history', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch signal history' });
  }
});

// ── GET /api/srs/macro — Current macro rates ──────────────────────────────
srsSignalsRoutes.get('/macro', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rates = await getMacroRates(db);
    res.json({ rates });
  } catch (err: any) {
    log.error('Failed to fetch macro rates', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch macro rates' });
  }
});

// ── POST /api/srs/macro/refresh — Scrape latest macro data ────────────────
srsSignalsRoutes.post('/macro/refresh', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { refreshMacroData } = await import('../scrapers/macroData');
    const result = await refreshMacroData(db);
    res.json({ success: true, ...result });
  } catch (err: any) {
    log.error('Failed to refresh macro data', { error: err.message });
    res.status(500).json({ error: 'Failed to refresh macro data' });
  }
});
