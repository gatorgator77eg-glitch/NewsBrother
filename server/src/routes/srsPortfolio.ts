import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';

const log = createLogger({ module: 'srs-portfolio' });
export const srsPortfolioRoutes = Router();

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

// ── GET /api/srs/portfolio — Full portfolio summary ───────────────────────
srsPortfolioRoutes.get('/portfolio', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const acct = query(db, `SELECT * FROM srs_portfolio WHERE id = 1`)[0] || { cash_balance: 0, total_deposited: 0 };
    const holdings = query(db, `SELECT * FROM srs_holdings ORDER BY product_name`);
    const transactions = query(db, `SELECT * FROM srs_transactions ORDER BY created_at DESC LIMIT 50`);

    let totalHoldingsValue = 0;
    let totalUnrealizedPnl = 0;
    const enrichedHoldings = holdings.map((h: any) => {
      const marketValue = h.quantity * h.current_price;
      const costBasis = h.quantity * h.average_cost;
      const unrealizedPnl = marketValue - costBasis;
      const pnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
      totalHoldingsValue += marketValue;
      totalUnrealizedPnl += unrealizedPnl;
      return {
        ...h,
        market_value: Math.round(marketValue * 100) / 100,
        cost_basis: Math.round(costBasis * 100) / 100,
        unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
        pnl_pct: Math.round(pnlPct * 100) / 100,
      };
    });

    const totalValue = acct.cash_balance + totalHoldingsValue;
    const totalReturn = totalValue - acct.total_deposited;
    const returnPct = acct.total_deposited > 0 ? (totalReturn / acct.total_deposited) * 100 : 0;

    res.json({
      account: {
        cash_balance: acct.cash_balance,
        total_deposited: acct.total_deposited,
        holdings_value: Math.round(totalHoldingsValue * 100) / 100,
        total_value: Math.round(totalValue * 100) / 100,
        unrealized_pnl: Math.round(totalUnrealizedPnl * 100) / 100,
        total_return: Math.round(totalReturn * 100) / 100,
        return_pct: Math.round(returnPct * 100) / 100,
      },
      holdings: enrichedHoldings,
      recentTransactions: transactions,
    });
  } catch (err: any) {
    log.error('Failed to fetch portfolio', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// ── POST /api/srs/portfolio/cash — Update cash balance ────────────────────
srsPortfolioRoutes.post('/portfolio/cash', async (req: Request, res: Response) => {
  try {
    const { cash_balance, total_deposited } = req.body;
    const db = await getDb();
    if (cash_balance !== undefined) {
      db.run(`UPDATE srs_portfolio SET cash_balance = ?, updated_at = datetime('now') WHERE id = 1`, [cash_balance]);
    }
    if (total_deposited !== undefined) {
      db.run(`UPDATE srs_portfolio SET total_deposited = ?, updated_at = datetime('now') WHERE id = 1`, [total_deposited]);
    }
    const acct = query(db, `SELECT * FROM srs_portfolio WHERE id = 1`)[0];
    res.json({ success: true, account: acct });
  } catch (err: any) {
    log.error('Failed to update cash', { error: err.message });
    res.status(500).json({ error: 'Failed to update cash' });
  }
});

// ── POST /api/srs/portfolio/holdings — Add or update a holding ────────────
srsPortfolioRoutes.post('/portfolio/holdings', async (req: Request, res: Response) => {
  try {
    const { product_type, product_id, product_name, quantity, price, action } = req.body;
    const db = await getDb();
    const txType = action === 'sell' ? 'sell' : 'buy';
    const units = quantity || 1;
    const unitPrice = price || 0;
    const amount = units * unitPrice;

    // Log transaction
    db.run(
      `INSERT INTO srs_transactions (type, product_type, product_id, product_name, amount, price, units, fees)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [txType, product_type, product_id, product_name, amount, unitPrice, units]
    );

    // Update holding
    const existing = query(db, `SELECT * FROM srs_holdings WHERE product_type = ? AND product_id = ?`, [product_type, product_id])[0];
    if (txType === 'buy') {
      if (existing) {
        const newQty = existing.quantity + units;
        const newCost = ((existing.quantity * existing.average_cost) + amount) / newQty;
        db.run(
          `UPDATE srs_holdings SET quantity = ?, average_cost = ?, current_price = ?, last_updated = datetime('now')
           WHERE product_type = ? AND product_id = ?`,
          [newQty, newCost, unitPrice, product_type, product_id]
        );
      } else {
        db.run(
          `INSERT INTO srs_holdings (product_type, product_id, product_name, quantity, average_cost, current_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [product_type, product_id, product_name, units, unitPrice, unitPrice]
        );
      }
      // Deduct from cash
      db.run(`UPDATE srs_portfolio SET cash_balance = cash_balance - ?, updated_at = datetime('now') WHERE id = 1`, [amount]);
    } else {
      if (existing && existing.quantity >= units) {
        const newQty = existing.quantity - units;
        if (newQty <= 0) {
          db.run(`DELETE FROM srs_holdings WHERE product_type = ? AND product_id = ?`, [product_type, product_id]);
        } else {
          db.run(
            `UPDATE srs_holdings SET quantity = ?, current_price = ?, last_updated = datetime('now')
             WHERE product_type = ? AND product_id = ?`,
            [newQty, unitPrice, product_type, product_id]
          );
        }
      }
      // Add to cash
      db.run(`UPDATE srs_portfolio SET cash_balance = cash_balance + ?, updated_at = datetime('now') WHERE id = 1`, [amount]);
    }

    const acct = query(db, `SELECT * FROM srs_portfolio WHERE id = 1`)[0];
    res.json({ success: true, cash_balance: acct?.cash_balance || 0 });
  } catch (err: any) {
    log.error('Failed to record holding', { error: err.message });
    res.status(500).json({ error: 'Failed to record holding' });
  }
});

// ── DELETE /api/srs/portfolio/holdings/:id — Remove a holding ─────────────
srsPortfolioRoutes.delete('/portfolio/holdings/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const holding = query(db, `SELECT * FROM srs_holdings WHERE id = ?`, [id])[0];
    if (!holding) { res.status(404).json({ error: 'Holding not found' }); return; }
    // Refund to cash at current price
    const refund = holding.quantity * (holding.current_price || holding.average_cost);
    db.run(`UPDATE srs_portfolio SET cash_balance = cash_balance + ?, updated_at = datetime('now') WHERE id = 1`, [refund]);
    db.run(`DELETE FROM srs_holdings WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    log.error('Failed to delete holding', { error: err.message });
    res.status(500).json({ error: 'Failed to delete holding' });
  }
});

// ── GET /api/srs/portfolio/transactions — Transaction history ─────────────
srsPortfolioRoutes.get('/portfolio/transactions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const db = await getDb();
    const txns = query(db, `SELECT * FROM srs_transactions ORDER BY created_at DESC LIMIT ?`, [limit]);
    res.json({ transactions: txns });
  } catch (err: any) {
    log.error('Failed to fetch transactions', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});
