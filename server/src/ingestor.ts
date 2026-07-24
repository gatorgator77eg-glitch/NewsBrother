import Parser from 'rss-parser';
import { getDb, insertArticle, insertSource } from './db';
import { resultToObjects } from './utils';
import feedsData from './feeds.json';
import { createLogger } from './logger';

const log = createLogger({ module: 'ingestor' });

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'PoliticalNewsBot/1.0',
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

async function fetchFeed(feed: FeedItem) {
  try {
    const parsed = await parser.parseURL(feed.rssUrl);
    const items = parsed.items || [];
    let newCount = 0;

    for (const item of items.slice(0, 20)) {
      if (!item.title || !item.link) continue;

      const result = insertArticle({
        source_id: feed.id,
        title: item.title.trim(),
        excerpt: item.contentSnippet?.slice(0, 300) || item.content?.slice(0, 300) || '',
        url: item.link,
        published_at: item.pubDate || item.isoDate || new Date().toISOString(),
      });

      if (result.changes > 0) newCount++;
    }

    log.info(`Feed fetched`, { feed: feed.name, items: items.length, newArticles: newCount });
    return newCount;
  } catch (err: any) {
    log.warn(`Feed failed`, { feed: feed.name, error: err.message });
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
