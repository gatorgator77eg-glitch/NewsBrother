import Parser from 'rss-parser';
import { getDb, insertArticle, insertSource } from './db';
import { resultToObjects } from './utils';
import feedsData from './feeds.json';
import { createLogger } from './logger';

const log = createLogger({ module: 'ingestor' });

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; PoliticalNewsBot/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

interface FeedItem {
  id: string;
  name: string;
  url: string;
  rssUrl: string;
  bias: string;
  credibilityScore: number;
  tags: string[];
}

async function loadFeeds(): Promise<FeedItem[]> {
  const db = await getDb();
  const result = db.exec('SELECT * FROM sources');
  const sources = resultToObjects(result);

  if (sources.length === 0) {
    for (const feed of feedsData) {
      insertSource({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        rss_url: feed.rssUrl,
        bias: feed.bias,
        credibility_score: feed.credibilityScore,
        tags: feed.tags,
      });
    }
    return feedsData;
  }
  return sources.map((s: any) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    rssUrl: s.rss_url || s.rssUrl,
    bias: s.bias,
    credibilityScore: s.credibility_score || s.credibilityScore,
    tags: typeof s.tags === 'string' ? JSON.parse(s.tags) : s.tags || [],
  }));
}

async function fetchRawFeed(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PoliticalNewsBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();
    if (contentType.includes('text/html') && !body.includes('<rss') && !body.includes('<feed')) {
      return null;
    }
    const trimmed = body.trim();
    if (!trimmed.startsWith('<rss') && !trimmed.startsWith('<feed') && !trimmed.startsWith('<?xml')) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

async function fetchFeed(feed: FeedItem) {
  try {
    const rawXml = await fetchRawFeed(feed.rssUrl);
    if (!rawXml) {
      log.warn(`Feed returned non-RSS content`, { feed: feed.name, url: feed.rssUrl });
      return 0;
    }
    const parsed = await parser.parseString(rawXml);
    const items = parsed.items || [];
    let newCount = 0;

    for (const item of items.slice(0, 20)) {
      try {
        const title = item.title?.trim();
        const link = item.link;
        if (!title || !link) continue;

        const result = insertArticle({
          source_id: feed.id,
          title,
          excerpt: (item.contentSnippet || item.content || '').slice(0, 300),
          url: link,
          published_at: item.pubDate || item.isoDate || new Date().toISOString(),
        });

        if (result.changes > 0) newCount++;
      } catch {
        // skip individual bad items
      }
    }

    log.info(`Feed fetched`, { feed: feed.name, items: items.length, newArticles: newCount });
    return newCount;
  } catch (err: any) {
    log.warn(`Feed failed`, { feed: feed.name, error: err.message?.slice(0, 100) });
    return 0;
  }
}

export async function ingestAll() {
  await getDb();
  const feeds = await loadFeeds();
  log.info('Starting RSS ingestion', { feedCount: feeds.length });

  let totalNew = 0;
  const batchSize = 5;

  for (let i = 0; i < feeds.length; i += batchSize) {
    const batch = feeds.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fetchFeed));
    totalNew += results.reduce((a, b) => a + b, 0);
  }

  log.info('Ingestion complete', { newArticles: totalNew });
  return totalNew;
}

if (require.main === module) {
  ingestAll().then(() => process.exit(0));
}
