import { Router, Request, Response } from 'express';
import { COUNTRIES, getCountryByCode } from '../recommendations/universe';
import { generateRecommendations, CountryRecommendation } from '../recommendations/engine';
import { getCountrySentiment } from '../recommendations/sentiment';
import { getNewsArchiveDb } from '../newsArchive/db';
import { createLogger } from '../logger';

const log = createLogger({ module: 'recs-routes' });
export const recommendationRoutes = Router();

let recsCache: Record<string, CountryRecommendation> = {};
let cacheTime: Record<string, number> = {};
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

let refreshProgress: { running: boolean; current: number; total: number; country: string } = { running: false, current: 0, total: 0, country: '' };
let refreshSseClients: Set<Response> = new Set();

function broadcastProgress() {
  for (const client of refreshSseClients) {
    client.write(`data: ${JSON.stringify(refreshProgress)}\n\n`);
  }
}

// ── Core Endpoints ──────────────────────────────────────────────────────────

recommendationRoutes.get('/recommendations', async (_req: Request, res: Response) => {
  try {
    const summaries = COUNTRIES.map(c => {
      const cached = recsCache[c.code];
      return {
        code: c.code,
        name: c.name,
        block: c.block,
        indexSymbol: c.indexSymbol,
        indexName: c.indexName,
        indexChange1d: cached?.indexChange1d || 0,
        indexChange1w: cached?.indexChange1w || 0,
        sentiment: cached?.countrySentiment?.avgTone || 0,
        sentimentTrend: cached?.countrySentiment?.trend || 'stable',
        articleCount: cached?.countrySentiment?.articleCount || 0,
        topBuy: (cached?.topBuy || []).map(s => ({
          symbol: s.symbol, name: s.name, price: s.price,
          composite: s.composite, signal: s.signal, change1d: s.change1d,
        })),
        topSell: (cached?.topSell || []).map(s => ({
          symbol: s.symbol, name: s.name, price: s.price,
          composite: s.composite, signal: s.signal, change1d: s.change1d,
        })),
        computedAt: cached?.computedAt || null,
      };
    });
    res.json({ countries: summaries });
  } catch (err: any) {
    log.error('Failed to get recommendations summary', { error: err.message });
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

recommendationRoutes.get('/recommendations/:country', async (req: Request, res: Response) => {
  try {
    const code = req.params.country.toUpperCase();
    const country = getCountryByCode(code);
    if (!country) {
      res.status(404).json({ error: `Unknown country code: ${code}` });
      return;
    }

    const now = Date.now();
    const cached = recsCache[code];
    const ttl = cacheTime[code] || 0;

    if (cached && (now - ttl) < CACHE_TTL) {
      res.json(cached);
      return;
    }

    const result = await generateRecommendations(code);
    if (!result) {
      res.status(404).json({ error: 'No data for country' });
      return;
    }

    recsCache[code] = result;
    cacheTime[code] = now;
    res.json(result);
  } catch (err: any) {
    log.error('Failed to generate recommendations', { country: req.params.country, error: err.message });
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

recommendationRoutes.post('/recommendations/refresh', async (_req: Request, res: Response) => {
  if (refreshProgress.running) {
    res.json({ success: false, message: 'Refresh already in progress', progress: refreshProgress });
    return;
  }

  recsCache = {};
  cacheTime = {};
  refreshProgress = { running: true, current: 0, total: COUNTRIES.length, country: '' };

  res.json({ success: true, message: 'Cache cleared. Background refresh started.' });

  (async () => {
    for (let i = 0; i < COUNTRIES.length; i++) {
      const c = COUNTRIES[i];
      refreshProgress.current = i + 1;
      refreshProgress.country = c.code;
      broadcastProgress();
      try {
        const result = await generateRecommendations(c.code);
        if (result) {
          recsCache[c.code] = result;
          cacheTime[c.code] = Date.now();
        }
        log.info('Precomputed recommendations', { country: c.code, buyCount: result?.topBuy.length, sellCount: result?.topSell.length });
      } catch (err: any) {
        log.error('Failed to precompute', { country: c.code, error: err.message });
      }
    }
    refreshProgress.running = false;
    broadcastProgress();
    log.info('All recommendations precomputed');
  })();
});

// ── SSE Progress ────────────────────────────────────────────────────────────

recommendationRoutes.get('/recommendations/stream/progress', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify(refreshProgress)}\n\n`);
  refreshSseClients.add(res);
  req.on('close', () => refreshSseClients.delete(res));
});

// ── History (score delta) ───────────────────────────────────────────────────

recommendationRoutes.get('/recommendations/history/:symbol/:country', async (req: Request, res: Response) => {
  try {
    const { symbol, country } = req.params;
    const limit = parseInt(req.query.limit as string) || 30;
    const db = await getNewsArchiveDb();
    const result = db.exec(
      `SELECT symbol, country, composite, signal, confidence, price, computed_at
       FROM recs_history
       WHERE symbol = ? AND country = ?
       ORDER BY computed_at DESC LIMIT ?`,
      [symbol.toUpperCase(), country.toUpperCase(), limit]
    );
    const history = result[0]?.values.map((r: any[]) => ({
      symbol: r[0], country: r[1], composite: r[2], signal: r[3],
      confidence: r[4], price: r[5], computedAt: r[6],
    })) || [];
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// ── Alerts ──────────────────────────────────────────────────────────────────

recommendationRoutes.get('/recommendations/alerts', async (_req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const result = db.exec(
      `SELECT id, symbol, country, alert_type, threshold, is_active, created_at, last_triggered
       FROM recs_alerts WHERE is_active = 1 ORDER BY created_at DESC`
    );
    const alerts = result[0]?.values.map((r: any[]) => ({
      id: r[0], symbol: r[1], country: r[2], alertType: r[3],
      threshold: r[4], isActive: !!r[5], createdAt: r[6], lastTriggered: r[7],
    })) || [];
    res.json({ alerts });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

recommendationRoutes.post('/recommendations/alerts', async (req: Request, res: Response) => {
  try {
    const { symbol, country, alertType, threshold } = req.body;
    if (!symbol || !country || !alertType || threshold === undefined) {
      res.status(400).json({ error: 'Missing symbol, country, alertType, or threshold' });
      return;
    }
    const validTypes = ['signal_change', 'score_threshold', 'confidence_drop', 'price_change'];
    if (!validTypes.includes(alertType)) {
      res.status(400).json({ error: `Invalid alertType. Must be one of: ${validTypes.join(', ')}` });
      return;
    }
    const db = await getNewsArchiveDb();
    db.run(
      `INSERT INTO recs_alerts (symbol, country, alert_type, threshold) VALUES (?, ?, ?, ?)`,
      [symbol.toUpperCase(), country.toUpperCase(), alertType, threshold]
    );
    const idResult = db.exec(`SELECT last_insert_rowid()`);
    const id = idResult[0]?.values[0]?.[0];
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

recommendationRoutes.delete('/recommendations/alerts/:id', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    db.run(`UPDATE recs_alerts SET is_active = 0 WHERE id = ?`, [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// ── Compare ─────────────────────────────────────────────────────────────────

recommendationRoutes.get('/recommendations/compare/:codes', async (req: Request, res: Response) => {
  try {
    const codes = req.params.codes.split(',').map(c => c.toUpperCase()).filter(Boolean);
    if (codes.length < 2 || codes.length > 6) {
      res.status(400).json({ error: 'Provide 2-6 country codes separated by commas' });
      return;
    }
    const results: Record<string, any> = {};
    for (const code of codes) {
      const cached = recsCache[code];
      if (cached) {
        results[code] = {
          country: cached.country.name,
          indexChange1d: cached.indexChange1d,
          indexChange1w: cached.indexChange1w,
          sentiment: cached.countrySentiment.avgTone,
          sentimentTrend: cached.countrySentiment.trend,
          topBuy: cached.topBuy.map(s => ({ symbol: s.symbol, composite: s.composite, signal: s.signal })),
          topSell: cached.topSell.map(s => ({ symbol: s.symbol, composite: s.composite, signal: s.signal })),
          avgComposite: cached.allScored.length > 0
            ? Math.round(cached.allScored.reduce((a, s) => a + s.composite, 0) / cached.allScored.length)
            : 0,
          stockCount: cached.allScored.length,
          buyRatio: cached.allScored.length > 0
            ? Math.round(cached.allScored.filter(s => s.composite > 0).length / cached.allScored.length * 100)
            : 0,
        };
      } else {
        results[code] = null;
      }
    }
    res.json({ comparison: results });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compare countries' });
  }
});

// ── Backtest ────────────────────────────────────────────────────────────────

recommendationRoutes.get('/recommendations/backtest/:country', async (req: Request, res: Response) => {
  try {
    const code = req.params.country.toUpperCase();
    const periodDays = parseInt(req.query.days as string) || 30;
    const db = await getNewsArchiveDb();

    const result = db.exec(
      `SELECT symbol, composite, signal, price, computed_at
       FROM recs_history
       WHERE country = ? AND computed_at >= datetime('now', '-${periodDays} days')
       ORDER BY computed_at ASC`,
      [code]
    );

    if (!result[0] || result[0].values.length === 0) {
      res.json({ backtest: null, message: 'Not enough history data for backtest' });
      return;
    }

    const rows = result[0].values.map((r: any[]) => ({
      symbol: r[0], composite: r[1], signal: r[2], price: r[3], computedAt: r[4],
    }));

    // Calculate win rate: did BUY signals outperform?
    const symbolGroups = new Map<string, typeof rows>();
    for (const r of rows) {
      const group = symbolGroups.get(r.symbol) || [];
      group.push(r);
      symbolGroups.set(r.symbol, group);
    }

    let wins = 0;
    let total = 0;
    for (const [, group] of symbolGroups) {
      if (group.length < 2) continue;
      const first = group[0];
      const last = group[group.length - 1];
      if (first.signal === 'BUY' || first.signal === 'STRONG_BUY') {
        total++;
        if (last.price > first.price) wins++;
      } else if (first.signal === 'SELL' || first.signal === 'STRONG_SELL') {
        total++;
        if (last.price < first.price) wins++;
      }
    }

    const avgComposite = rows.length > 0
      ? Math.round(rows.reduce((a, r) => a + r.composite, 0) / rows.length)
      : 0;

    const backtest = {
      country: code,
      periodDays,
      totalSignals: total,
      winRate: total > 0 ? Math.round(wins / total * 100) : 0,
      avgComposite,
      totalRecords: rows.length,
    };

    // Save to recs_backtest
    db.run(
      `INSERT INTO recs_backtest (country, period_days, avg_return, win_rate, total_signals)
       VALUES (?, ?, ?, ?, ?)`,
      [code, periodDays, avgComposite, backtest.winRate, total]
    );

    res.json({ backtest });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to run backtest' });
  }
});

// ── Sentiment ───────────────────────────────────────────────────────────────

recommendationRoutes.get('/recommendations/sentiment/:country', async (req: Request, res: Response) => {
  try {
    const code = req.params.country.toUpperCase();
    const days = parseInt(req.query.days as string) || 7;
    const sentiment = await getCountrySentiment(code, days);
    res.json(sentiment);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get sentiment' });
  }
});
