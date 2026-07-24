import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../logger';

const log = createLogger({ module: 'stocks-db' });
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'stocks.db');
let db: SqlJsDatabase;
let saveTimeout: NodeJS.Timeout | null = null;
let dirty = false;

export async function getStockDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const existed = fs.existsSync(DB_PATH);
  if (existed) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    log.info('Opened existing stocks.db', { sizeKB: Math.round(buffer.byteLength / 1024) });
  } else {
    db = new SQL.Database();
    log.info('Created new stocks.db');
  }

  initStockSchema();
  flushStockDb();
  return db;
}

function flushStockDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  log.debug('Flushed stocks.db to disk', { sizeKB: Math.round(buffer.byteLength / 1024) });
}

function scheduleStockDbSave() {
  dirty = true;
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    if (dirty) {
      flushStockDb();
      dirty = false;
    }
    saveTimeout = null;
  }, 2000);
}

function initStockSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS stock_tickers (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      exchange TEXT DEFAULT '',
      sector TEXT DEFAULT '',
      industry TEXT DEFAULT '',
      country TEXT DEFAULT '',
      market_cap REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_prices (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume INTEGER DEFAULT 0,
      PRIMARY KEY (symbol, date)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol ON stock_prices(symbol)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_stock_prices_date ON stock_prices(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_stock_tickers_cap ON stock_tickers(market_cap DESC)`);
}

export function upsertTicker(ticker: {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: number;
}) {
  db.run(
    `INSERT OR REPLACE INTO stock_tickers (symbol, name, exchange, sector, industry, country, market_cap, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [ticker.symbol, ticker.name, ticker.exchange, ticker.sector, ticker.industry, ticker.country, ticker.market_cap]
  );
  scheduleStockDbSave();
}

export function insertPrices(symbol: string, prices: {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}[]) {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO stock_prices (symbol, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of prices) {
    stmt.run([symbol, p.date, p.open, p.high, p.low, p.close, p.volume]);
  }
  stmt.free();
  scheduleStockDbSave();
}

export function getTickerList(search?: string, exchange?: string, page: number = 1, limit: number = 50) {
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push(`(symbol LIKE ? OR name LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }
  if (exchange) {
    conditions.push(`exchange = ?`);
    params.push(exchange);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = db.exec(`SELECT COUNT(*) as total FROM stock_tickers ${where}`, params);
  const total = countResult[0]?.values[0]?.[0] as number || 0;

  const result = db.exec(
    `SELECT symbol, name, exchange, sector, industry, country, market_cap
     FROM stock_tickers ${where}
     ORDER BY market_cap DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const tickers = result[0]?.values.map((row: any[]) => ({
    symbol: row[0],
    name: row[1],
    exchange: row[2],
    sector: row[3],
    industry: row[4],
    country: row[5],
    market_cap: row[6],
  })) || [];

  return { tickers, total, page, limit };
}

export function getTickerHistory(symbol: string) {
  const result = db.exec(
    `SELECT date, open, high, low, close, volume
     FROM stock_prices
     WHERE symbol = ?
     ORDER BY date ASC`,
    [symbol]
  );

  return result[0]?.values.map((row: any[]) => ({
    date: row[0],
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
  })) || [];
}

export function getTickerInfo(symbol: string) {
  const result = db.exec(
    `SELECT symbol, name, exchange, sector, industry, country, market_cap
     FROM stock_tickers WHERE symbol = ?`,
    [symbol]
  );

  if (!result[0]?.values[0]) return null;

  const row = result[0].values[0];
  return {
    symbol: row[0],
    name: row[1],
    exchange: row[2],
    sector: row[3],
    industry: row[4],
    country: row[5],
    market_cap: row[6],
  };
}

export function getDownloadStatus() {
  const result = db.exec(`SELECT key, value FROM stock_meta`);
  const meta: Record<string, string> = {};
  if (result[0]) {
    for (const row of result[0].values) {
      meta[row[0] as string] = row[1] as string;
    }
  }

  // Also read from progress JSON (written by Python batch downloader)
  let progress: Record<string, any> = {};
  try {
    const PROGRESS_FILE = path.join(__dirname, '..', '..', 'data', 'stock-progress.json');
    if (fs.existsSync(PROGRESS_FILE)) {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch {}

  const tickerCount = db.exec(`SELECT COUNT(*) FROM stock_tickers`);
  const priceCount = db.exec(`SELECT COUNT(DISTINCT symbol) FROM stock_prices`);

  // Merge: Python progress takes priority for active batch downloads
  const isBatchActive = progress.phase === 'batch_downloading' || progress.phase === 'enriching';

  return {
    status: isBatchActive ? progress.phase : (meta['status'] || 'idle'),
    tickerCount: tickerCount[0]?.values[0]?.[0] as number || 0,
    stocksWithPrices: priceCount[0]?.values[0]?.[0] as number || 0,
    currentTicker: isBatchActive ? (progress.current || '') : (meta['current_ticker'] || ''),
    currentIndex: isBatchActive ? (progress.done || 0) : parseInt(meta['current_index'] || '0'),
    totalToFetch: isBatchActive ? (progress.total || 0) : parseInt(meta['total_to_fetch'] || '0'),
    startedAt: meta['started_at'] || null,
    completedAt: meta['completed_at'] || null,
    error: meta['last_error'] || null,
    pct: progress.pct || 0,
    etaMin: progress.etaMin || 0,
    saved: progress.saved || 0,
    errors: progress.errors || 0,
  };
}

export function getAllLastPriceDates(): Record<string, string> {
  const result = db.exec(
    `SELECT symbol, MAX(date) as last_date FROM stock_prices GROUP BY symbol`
  );
  const map: Record<string, string> = {};
  if (result[0]) {
    for (const row of result[0].values) {
      map[row[0] as string] = row[1] as string;
    }
  }
  return map;
}

export function setMeta(key: string, value: string) {
  db.run(`INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)`, [key, value]);
  scheduleStockDbSave();
}

export function getExchanges() {
  const result = db.exec(`SELECT DISTINCT exchange FROM stock_tickers WHERE exchange != '' ORDER BY exchange`);
  return result[0]?.values.map((row: any[]) => row[0] as string) || [];
}

export function getSectors() {
  const result = db.exec(`SELECT DISTINCT sector FROM stock_tickers WHERE sector != '' ORDER BY sector`);
  return result[0]?.values.map((row: any[]) => row[0] as string) || [];
}

export function getStockStats() {
  const tickerCount = db.exec(`SELECT COUNT(*) FROM stock_tickers`);
  const priceRows = db.exec(`SELECT COUNT(*) FROM stock_prices`);
  const symbolsWithPrices = db.exec(`SELECT COUNT(DISTINCT symbol) FROM stock_prices`);
  const exchanges = db.exec(`SELECT COUNT(DISTINCT exchange) FROM stock_tickers`);

  return {
    totalTickers: tickerCount[0]?.values[0]?.[0] as number || 0,
    totalPriceRows: priceRows[0]?.values[0]?.[0] as number || 0,
    stocksWithPrices: symbolsWithPrices[0]?.values[0]?.[0] as number || 0,
    totalExchanges: exchanges[0]?.values[0]?.[0] as number || 0,
  };
}
