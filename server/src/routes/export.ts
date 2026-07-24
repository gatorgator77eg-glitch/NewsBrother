import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getStockDb, getTickerHistory } from '../stocks/db';

const log = createLogger({ module: 'export' });
export const exportRoutes = Router();

function toCSV(rows: any[], headers: string[]): string {
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════
// 1. Export news archive as CSV
// ═══════════════════════════════════════════
exportRoutes.get('/news-archive', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { query, dateFrom, dateTo, limit = 1000 } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (query) {
      conditions.push(`(title LIKE ? OR domain LIKE ?)`);
      params.push(`%${query}%`, `%${query}%`);
    }
    if (dateFrom) {
      conditions.push(`published_at >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`published_at <= ?`);
      params.push(dateTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = db.exec(
      `SELECT id, url, title, domain, source_country, language, published_at, tone, goldsteinscale, sentiment_label
       FROM news_archive ${where}
       ORDER BY published_at DESC LIMIT ?`,
      [...params, limit]
    );

    const rows = result[0]?.values || [];
    const headers = ['id', 'url', 'title', 'domain', 'source_country', 'language', 'published_at', 'tone', 'goldsteinscale', 'sentiment_label'];
    const csv = toCSV(rows, headers);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="news-archive-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err: any) {
    log.error('Export news archive failed', { error: err.message });
    res.status(500).json({ error: 'Export failed' });
  }
});

// ═══════════════════════════════════════════
// 2. Export stock prices as CSV
// ═══════════════════════════════════════════
exportRoutes.get('/stock-prices/:symbol', async (req: Request, res: Response) => {
  try {
    const db = await getStockDb();
    const symbol = req.params.symbol.toUpperCase();
    const { days } = req.query;

    let where = 'WHERE symbol = ?';
    const params: any[] = [symbol];

    if (days) {
      const cutoff = new Date(Date.now() - parseInt(days as string) * 24 * 3600 * 1000).toISOString().slice(0, 10);
      where += ' AND date >= ?';
      params.push(cutoff);
    }

    const result = db.exec(
      `SELECT date, open, high, low, close, volume FROM stock_prices ${where} ORDER BY date ASC`,
      params
    );

    const rows = result[0]?.values || [];
    const headers = ['date', 'open', 'high', 'low', 'close', 'volume'];
    const csv = toCSV(rows, headers);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${symbol}-prices-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err: any) {
    log.error('Export stock prices failed', { error: err.message });
    res.status(500).json({ error: 'Export failed' });
  }
});

// ═══════════════════════════════════════════
// 3. Export deep research results as CSV
// ═══════════════════════════════════════════
exportRoutes.post('/deep-research', async (req: Request, res: Response) => {
  try {
    const { articles, tickers, timeline } = req.body;

    // Export articles
    const articleRows = (articles || []).map((a: any) => [
      a.id, a.url, a.title, a.domain, a.source_country, a.published_at, a.tone, a.goldsteinscale,
    ]);
    const articleCsv = toCSV(articleRows, ['id', 'url', 'title', 'domain', 'country', 'published_at', 'tone', 'goldstein']);

    // Export ticker mentions
    const tickerRows = (tickers || []).map((t: any) => [
      t.symbol, t.mentions, t.name, t.sector,
    ]);
    const tickerCsv = toCSV(tickerRows, ['symbol', 'mentions', 'name', 'sector']);

    // Export tone timeline
    const timelineRows = (timeline || []).map((t: any) => [
      t.date, t.avgTone, t.count,
    ]);
    const timelineCsv = toCSV(timelineRows, ['date', 'avgTone', 'count']);

    const combined = [
      '--- ARTICLES ---',
      articleCsv,
      '',
      '--- TICKER MENTIONS ---',
      tickerCsv,
      '',
      '--- TONE TIMELINE ---',
      timelineCsv,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="deep-research-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(combined);
  } catch (err: any) {
    log.error('Export deep research failed', { error: err.message });
    res.status(500).json({ error: 'Export failed' });
  }
});

// ═══════════════════════════════════════════
// 4. Export correlation data as CSV
// ═══════════════════════════════════════════
exportRoutes.get('/correlation/:symbol', async (req: Request, res: Response) => {
  try {
    const db = await getStockDb();
    const symbol = req.params.symbol.toUpperCase();
    const { days = 90 } = req.query;

    const prices = getTickerHistory(symbol);
    const cutoffDate = new Date(Date.now() - parseInt(days as string) * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const filtered = prices.filter(p => p.date >= cutoffDate);

    const rows = filtered.map(p => [
      p.date, p.open, p.high, p.low, p.close, p.volume,
    ]);
    const headers = ['date', 'open', 'high', 'low', 'close', 'volume'];
    const csv = toCSV(rows, headers);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${symbol}-correlation-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err: any) {
    log.error('Export correlation failed', { error: err.message });
    res.status(500).json({ error: 'Export failed' });
  }
});

// ═══════════════════════════════════════════
// 5. Dashboard summary export
// ═══════════════════════════════════════════
exportRoutes.get('/dashboard-summary', async (_req: Request, res: Response) => {
  try {
    const newsDb = await getNewsArchiveDb();
    const stocksDb = await getStockDb();

    // News stats
    const newsStats = newsDb.exec(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN tone > 1 THEN 1 END) as positive,
             COUNT(CASE WHEN tone < -1 THEN 1 END) as negative,
             COUNT(DISTINCT domain) as domains,
             COUNT(DISTINCT source_country) as countries
      FROM news_archive
    `);

    const ns = newsStats[0]?.values[0];

    // Stock stats
    const stockStats = stocksDb.exec(`
      SELECT COUNT(DISTINCT symbol) as tickers_with_prices,
             COUNT(*) as total_price_rows
      FROM stock_prices
    `);

    const ss = stockStats[0]?.values[0];

    // Source stats
    const sourceStats = stocksDb.exec(`
      SELECT COUNT(*) as total_tickers,
             COUNT(CASE WHEN market_cap > 0 THEN 1 END) as with_mcap
      FROM stock_tickers
    `);

    const src = sourceStats[0]?.values[0];

    const rows = [
      ['Total news articles', ns?.[0] ?? 0],
      ['Positive tone articles', ns?.[1] ?? 0],
      ['Negative tone articles', ns?.[2] ?? 0],
      ['Unique news domains', ns?.[3] ?? 0],
      ['Countries covered', ns?.[4] ?? 0],
      ['Tickers with price data', ss?.[0] ?? 0],
      ['Total price data points', ss?.[1] ?? 0],
      ['Total tickers in library', src?.[0] ?? 0],
      ['Tickers with market cap', src?.[1] ?? 0],
      ['Generated at', new Date().toISOString()],
    ];

    const csv = rows.map(r => r.join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dashboard-summary-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err: any) {
    log.error('Export dashboard summary failed', { error: err.message });
    res.status(500).json({ error: 'Export failed' });
  }
});
