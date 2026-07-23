import { Router, Request, Response } from 'express';
import Parser from 'rss-parser';
import { getStockDb, getTickerInfo, getTickerHistory } from '../stocks/db';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliticalNews/1.0)' },
});

export const newsVsPriceRoutes = Router();

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deduplicateNews(articles: any[]): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const a of articles) {
    const key = normalizeTitle(a.title);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(a);
    }
  }
  return result;
}

async function fetchGoogleNews(companyName: string, days: number): Promise<any[]> {
  try {
    let query = `"${companyName}" stock`;
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const feed = await parser.parseURL(rssUrl);
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    return feed.items
      .filter(item => {
        const pub = item.isoDate || item.pubDate || '';
        return pub && pub >= cutoff;
      })
      .slice(0, 50)
      .map(item => ({
        title: item.title || '',
        link: item.link || '',
        source: item.creator || item.source || 'Google News',
        publishedAt: item.isoDate || item.pubDate || '',
        snippet: item.contentSnippet?.slice(0, 300) || '',
        source_type: 'google' as const,
      }));
  } catch {
    return [];
  }
}

async function fetchGDELTNews(companyName: string, symbol: string, days: number): Promise<any[]> {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 3600 * 1000);
    const startStr = startDate.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const endStr = endDate.toISOString().replace(/[-:T]/g, '').slice(0, 14);

    const query = `"${companyName}" OR ${symbol}`;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&startdatetime=${startStr}&enddatetime=${endStr}&maxrecords=100&format=json&sort=DateDesc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!data.articles) return [];
    return data.articles.map((a: any) => ({
      title: a.title || '',
      link: a.url || '',
      source: a.source || 'GDELT',
      publishedAt: a.seendate || '',
      snippet: a.excerpt?.slice(0, 300) || '',
      source_type: 'gdelt' as const,
    }));
  } catch {
    return [];
  }
}

newsVsPriceRoutes.get('/news-vs-price/:symbol', async (req: Request, res: Response) => {
  try {
    await getStockDb();
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days as string) || 30;

    const ticker = getTickerInfo(symbol);
    if (!ticker) {
      return res.status(404).json({ error: 'Ticker not found' });
    }

    const prices = getTickerHistory(symbol);
    const companyName = String(ticker.name) || symbol;

    const [googleArticles, gdeltArticles] = await Promise.all([
      fetchGoogleNews(companyName, days),
      fetchGDELTNews(companyName, symbol, Math.min(days, 730)),
    ]);

    const allNews = deduplicateNews([...googleArticles, ...gdeltArticles]);

    allNews.sort((a, b) => {
      const da = new Date(a.publishedAt).getTime() || 0;
      const db = new Date(b.publishedAt).getTime() || 0;
      return db - da;
    });

    res.json({ ticker, prices, news: allNews });
  } catch (err) {
    console.error('News vs Price error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
