import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../logger';

const log = createLogger({ module: 'news-archive-db' });
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');
let db: SqlJsDatabase;
let saveTimeout: NodeJS.Timeout | null = null;
let dirty = false;

export async function getNewsArchiveDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    log.info('Opened news.db for archive', { sizeKB: Math.round(buffer.byteLength / 1024) });
  } else {
    db = new SQL.Database();
    log.info('Created new news.db for archive');
  }

  initArchiveSchema();
  flushArchiveDb();
  return db;
}

function flushArchiveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  log.debug('Flushed news.db archive', { sizeKB: Math.round(buffer.byteLength / 1024) });
}

function scheduleArchiveDbSave() {
  dirty = true;
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    if (dirty) {
      flushArchiveDb();
      dirty = false;
    }
    saveTimeout = null;
  }, 2000);
}

function initArchiveSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS news_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      title TEXT DEFAULT '',
      domain TEXT DEFAULT '',
      source_country TEXT DEFAULT '',
      language TEXT DEFAULT '',
      published_at TEXT,
      image_url TEXT DEFAULT '',
      themes TEXT DEFAULT '[]',
      tone REAL DEFAULT 0,
      goldsteinscale REAL DEFAULT 0,
      downloaded_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_news_archive_date ON news_archive(published_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_news_archive_domain ON news_archive(domain)`);

  // Migration: add goldsteinscale if missing
  try {
    db.exec(`SELECT goldsteinscale FROM news_archive LIMIT 1`);
  } catch {
    db.run(`ALTER TABLE news_archive ADD COLUMN goldsteinscale REAL DEFAULT 0`);
    log.info('Added goldsteinscale column to news_archive');
  }

  // Migration: add sentiment_label if missing
  try {
    db.exec(`SELECT sentiment_label FROM news_archive LIMIT 1`);
  } catch {
    db.run(`ALTER TABLE news_archive ADD COLUMN sentiment_label TEXT DEFAULT ''`);
    log.info('Added sentiment_label column to news_archive');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS news_archive_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export function insertArchiveArticle(article: {
  url: string;
  title: string;
  domain: string;
  source_country: string;
  language: string;
  published_at: string;
  image_url: string;
  tone?: number;
  goldsteinscale?: number;
}): { inserted: boolean } {
  try {
    db.run(
      `INSERT OR IGNORE INTO news_archive (url, title, domain, source_country, language, published_at, image_url, tone, goldsteinscale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [article.url, article.title, article.domain, article.source_country, article.language, article.published_at, article.image_url, article.tone || 0, article.goldsteinscale || 0]
    );
    const changes = db.getRowsModified();
    scheduleArchiveDbSave();
    return { inserted: changes > 0 };
  } catch {
    return { inserted: false };
  }
}

export function insertArchiveArticles(articles: {
  url: string;
  title: string;
  domain: string;
  source_country: string;
  language: string;
  published_at: string;
  image_url: string;
  tone?: number;
  goldsteinscale?: number;
}[]): number {
  let inserted = 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO news_archive (url, title, domain, source_country, language, published_at, image_url, tone, goldsteinscale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const a of articles) {
    stmt.run([a.url, a.title, a.domain, a.source_country, a.language, a.published_at, a.image_url, a.tone || 0, a.goldsteinscale || 0]);
    if (db.getRowsModified() > 0) inserted++;
  }
  stmt.free();
  scheduleArchiveDbSave();
  return inserted;
}

export function searchArchive(query: string, dateFrom?: string, dateTo?: string, page: number = 1, limit: number = 50) {
  const offset = (page - 1) * limit;
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

  const countResult = db.exec(`SELECT COUNT(*) as total FROM news_archive ${where}`, params);
  const total = countResult[0]?.values[0]?.[0] as number || 0;

  const result = db.exec(
    `SELECT id, url, title, domain, source_country, language, published_at, image_url, tone, downloaded_at
     FROM news_archive ${where}
     ORDER BY published_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const articles = result[0]?.values.map((row: any[]) => ({
    id: row[0],
    url: row[1],
    title: row[2],
    domain: row[3],
    source_country: row[4],
    language: row[5],
    published_at: row[6],
    image_url: row[7],
    tone: row[8],
    downloaded_at: row[9],
  })) || [];

  return { articles, total, page, limit };
}

export function getArchiveStats() {
  const totalResult = db.exec(`SELECT COUNT(*) FROM news_archive`);
  const total = totalResult[0]?.values[0]?.[0] as number || 0;

  const dateRange = db.exec(`SELECT MIN(published_at), MAX(published_at) FROM news_archive`);
  const earliest = dateRange[0]?.values[0]?.[0] as string || null;
  const latest = dateRange[0]?.values[1]?.[0] as string || null;

  const domainsResult = db.exec(
    `SELECT domain, COUNT(*) as cnt FROM news_archive WHERE domain != '' GROUP BY domain ORDER BY cnt DESC LIMIT 10`
  );
  const topDomains = domainsResult[0]?.values.map((r: any[]) => ({ domain: r[0], count: r[1] })) || [];

  const countriesResult = db.exec(
    `SELECT source_country, COUNT(*) as cnt FROM news_archive WHERE source_country != '' GROUP BY source_country ORDER BY cnt DESC LIMIT 10`
  );
  const topCountries = countriesResult[0]?.values.map((r: any[]) => ({ country: r[0], count: r[1] })) || [];

  const weekResult = db.exec(
    `SELECT strftime('%Y-%W', published_at) as week, COUNT(*) as cnt
     FROM news_archive
     WHERE published_at IS NOT NULL
     GROUP BY week ORDER BY week`
  );
  const weeklyVolume = weekResult[0]?.values.map((r: any[]) => ({ week: r[0], count: r[1] })) || [];

  return { total, earliest, latest, topDomains, topCountries, weeklyVolume };
}

export function getArchiveMeta(key: string): string | null {
  const result = db.exec(`SELECT value FROM news_archive_meta WHERE key = ?`, [key]);
  return result[0]?.values[0]?.[0] as string ?? null;
}

export function setArchiveMeta(key: string, value: string) {
  db.run(`INSERT OR REPLACE INTO news_archive_meta (key, value) VALUES (?, ?)`, [key, value]);
  scheduleArchiveDbSave();
}

export function getDownloadStatus() {
  const status = getArchiveMeta('status') || 'idle';
  const startDate = getArchiveMeta('start_date') || '';
  const endDate = getArchiveMeta('end_date') || '';
  const currentDate = getArchiveMeta('current_date') || '';
  const totalDays = parseInt(getArchiveMeta('total_days') || '0');
  const completedDays = parseInt(getArchiveMeta('completed_days') || '0');
  const totalArticles = parseInt(getArchiveMeta('total_articles') || '0');
  const startedAt = getArchiveMeta('started_at') || null;
  const completedAt = getArchiveMeta('completed_at') || null;
  const lastError = getArchiveMeta('last_error') || null;
  const pct = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
  const elapsed = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
  const etaMin = completedDays > 0 && totalDays > completedDays
    ? Math.round((elapsed / completedDays) * (totalDays - completedDays) / 60000)
    : 0;

  return {
    status, startDate, endDate, currentDate,
    totalDays, completedDays, totalArticles,
    startedAt, completedAt, lastError,
    pct, etaMin,
  };
}

export function countArticlesForDate(dateStr: string): number {
  const result = db.exec(`SELECT COUNT(*) FROM news_archive WHERE published_at LIKE ?`, [dateStr + '%']);
  return result[0]?.values[0]?.[0] as number || 0;
}

export function getDailyVolume() {
  const result = db.exec(
    `SELECT date(published_at) as day, COUNT(*) as cnt
     FROM news_archive
     WHERE published_at IS NOT NULL
     GROUP BY day ORDER BY day`
  );
  return result[0]?.values.map((r: any[]) => ({ date: r[0], count: r[1] })) || [];
}
