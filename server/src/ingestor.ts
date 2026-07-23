import Parser from 'rss-parser';
import { getDb, insertArticle, insertSource } from './db';
import { resultToObjects } from './utils';
import feedsData from './feeds.json';

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
  return sources;
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

    console.log(`  [${feed.name}] Fetched ${items.length} items, ${newCount} new`);
    return newCount;
  } catch (err: any) {
    console.error(`  [${feed.name}] Error: ${err.message}`);
    return 0;
  }
}

export async function ingestAll() {
  await getDb();
  const feeds = await loadFeeds();
  console.log(`\n🚀 Starting RSS ingestion for ${feeds.length} sources...`);

  let totalNew = 0;
  const batchSize = 5;

  for (let i = 0; i < feeds.length; i += batchSize) {
    const batch = feeds.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fetchFeed));
    totalNew += results.reduce((a, b) => a + b, 0);
  }

  console.log(`\n✅ Ingestion complete. ${totalNew} new articles added.`);
  return totalNew;
}

if (require.main === module) {
  ingestAll().then(() => process.exit(0));
}
