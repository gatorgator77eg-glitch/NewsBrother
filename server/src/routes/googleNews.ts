import { Router, Request, Response } from 'express';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; PoliticalNews/1.0)',
  },
});

export const googleNewsRoutes = Router();

interface GoogleNewsArticle {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet: string;
  imageUrl?: string;
}

googleNewsRoutes.get('/google-news', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const when = req.query.when as string;
    let timeFilter = '';
    if (when === 'day') timeFilter = '+when:1d';
    else if (when === 'week') timeFilter = '+when:7d';
    else if (when === 'month') timeFilter = '+when:1m';

    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query + timeFilter)}&hl=en-US&gl=US&ceid=US:en`;

    const feed = await parser.parseURL(rssUrl);
    const articles: GoogleNewsArticle[] = feed.items.map(item => {
      const sourceMatch = item.contentSnippet?.match(/\((.+)\)/);
      return {
        title: item.title || '',
        link: item.link || '',
        source: item.creator || sourceMatch?.[1] || 'Unknown',
        publishedAt: item.pubDate || item.isoDate || '',
        snippet: item.contentSnippet?.replace(/\(.+\)/, '').trim() || '',
        imageUrl: item.enclosure?.url,
      };
    });

    const start = (page - 1) * pageSize;
    const paged = articles.slice(start, start + pageSize);

    res.json({
      query,
      page,
      pageSize,
      total: articles.length,
      articles: paged,
    });
  } catch (err: any) {
    console.error('Google News search error:', err.message);
    res.status(500).json({ error: 'Failed to fetch news from Google News' });
  }
});
