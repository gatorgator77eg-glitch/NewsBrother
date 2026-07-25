import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { resultToObjects } from './utils';
import { createLogger } from './logger';

const log = createLogger({ module: 'news-db' });
const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');
let db: SqlJsDatabase;
let saveTimeout: NodeJS.Timeout | null = null;
let dirty = false;

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const existed = fs.existsSync(DB_PATH);
  if (existed) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    log.info('Opened existing news.db', { sizeKB: Math.round(buffer.byteLength / 1024) });
  } else {
    db = new SQL.Database();
    log.info('Created new news.db');
  }

  initSchema();
  flushDb();
  return db;
}

function flushDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  log.debug('Flushed news.db to disk', { sizeKB: Math.round(buffer.byteLength / 1024) });
}

function scheduleDbSave() {
  dirty = true;
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    if (dirty) {
      flushDb();
      dirty = false;
    }
    saveTimeout = null;
  }, 1000);
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      rss_url TEXT NOT NULL,
      bias TEXT NOT NULL,
      credibility_score REAL DEFAULT 0.5,
      tags TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_label TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      url TEXT NOT NULL UNIQUE,
      published_at TEXT,
      cluster_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES sources(id),
      FOREIGN KEY (cluster_id) REFERENCES clusters(id)
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at)`);
}

export function insertSource(source: {
  id: string;
  name: string;
  url: string;
  rss_url: string;
  bias: string;
  credibility_score: number;
  tags: string[];
}) {
  db.run(
    `INSERT OR REPLACE INTO sources (id, name, url, rss_url, bias, credibility_score, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [source.id, source.name, source.url, source.rss_url, source.bias, source.credibility_score, JSON.stringify(source.tags)]
  );
  scheduleDbSave();
}

export function insertArticle(article: {
  source_id: string;
  title: string;
  excerpt: string;
  url: string;
  published_at: string | null;
}): { changes: number } {
  try {
    db.run(
      `INSERT OR IGNORE INTO articles (source_id, title, excerpt, url, published_at) VALUES (?, ?, ?, ?, ?)`,
      [article.source_id, article.title, article.excerpt, article.url, article.published_at || new Date().toISOString()]
    );
    const changes = db.getRowsModified();
    scheduleDbSave();
    return { changes };
  } catch (err: any) {
    log.debug('Article insert ignored', { url: article.url, error: err.message });
    return { changes: 0 };
  }
}

export function createCluster(topicLabel: string): number {
  db.run(`INSERT INTO clusters (topic_label) VALUES (?)`, [topicLabel]);
  const result = db.exec(`SELECT last_insert_rowid() as id`);
  scheduleDbSave();
  return result[0]?.values[0]?.[0] as number || 0;
}

export function assignArticleToCluster(articleId: number, clusterId: number) {
  db.run(`UPDATE articles SET cluster_id = ? WHERE id = ?`, [clusterId, articleId]);
  scheduleDbSave();
}

export function getAllArticles() {
  const result = db.exec(`SELECT * FROM articles ORDER BY published_at DESC`);
  return resultToObjects(result);
}

export function getArticlesByCluster(clusterId: number) {
  const result = db.exec(
    `SELECT a.*, s.bias, s.name as source_name, s.credibility_score
     FROM articles a
     JOIN sources s ON a.source_id = s.id
     WHERE a.cluster_id = ?`,
    [clusterId]
  );
  return resultToObjects(result);
}

export function searchArticles(query: string, bias?: string, page: number = 1, limit: number = 100) {
  const offset = (page - 1) * limit;
  const params: any[] = [`%${query}%`, `%${query}%`];

  let whereClause = `(a.title LIKE ? OR a.excerpt LIKE ?)`;
  if (bias && ['left', 'lean-left', 'center', 'lean-right', 'right'].includes(bias)) {
    whereClause += ` AND s.bias = ?`;
    params.push(bias);
  }
  params.push(limit, offset);

  const countResult = db.exec(
    `SELECT COUNT(*) as total FROM articles a JOIN sources s ON a.source_id = s.id WHERE ${whereClause.replace(' LIMIT ? OFFSET ?', '')}`,
    params.slice(0, -2)
  );
  const total = resultToObjects(countResult)[0]?.total || 0;

  const result = db.exec(
    `SELECT a.*, s.bias, s.name as source_name, s.credibility_score
     FROM articles a
     JOIN sources s ON a.source_id = s.id
     WHERE ${whereClause}
     ORDER BY a.published_at DESC
     LIMIT ? OFFSET ?`,
    params
  );
  return { articles: resultToObjects(result), total };
}

export function getAllClusters() {
  const result = db.exec(`SELECT * FROM clusters ORDER BY created_at DESC`);
  return resultToObjects(result);
}

export function getAllSources() {
  const result = db.exec(`SELECT * FROM sources ORDER BY bias, name`);
  return resultToObjects(result);
}

export function getSourceById(id: string) {
  const result = db.exec(`SELECT * FROM sources WHERE id = ?`, [id]);
  return resultToObjects(result)[0] || null;
}

export function deleteSource(id: string): boolean {
  db.run(`DELETE FROM sources WHERE id = ?`, [id]);
  const changes = db.getRowsModified();
  scheduleDbSave();
  return changes > 0;
}

export function updateSource(id: string, fields: { name?: string; url?: string; rss_url?: string; bias?: string; credibility_score?: number; tags?: string[] }) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name); }
  if (fields.url !== undefined) { sets.push('url = ?'); vals.push(fields.url); }
  if (fields.rss_url !== undefined) { sets.push('rss_url = ?'); vals.push(fields.rss_url); }
  if (fields.bias !== undefined) { sets.push('bias = ?'); vals.push(fields.bias); }
  if (fields.credibility_score !== undefined) { sets.push('credibility_score = ?'); vals.push(fields.credibility_score); }
  if (fields.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(fields.tags)); }
  if (sets.length === 0) return false;
  vals.push(id);
  db.run(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`, vals);
  scheduleDbSave();
  return true;
}

export function getUnclusteredArticles() {
  const result = db.exec(
    `SELECT a.*, s.bias, s.name as source_name
     FROM articles a
     JOIN sources s ON a.source_id = s.id
     WHERE a.cluster_id IS NULL
     ORDER BY a.published_at DESC`
  );
  return resultToObjects(result);
}
