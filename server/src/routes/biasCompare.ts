import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';

const log = createLogger({ module: 'bias-compare' });
export const biasCompareRoutes = Router();

const DOMAIN_LEAN: Record<string, 'left' | 'center' | 'right'> = {
  'cnn.com': 'left', 'msnbc.com': 'left', 'huffpost.com': 'left', 'vox.com': 'left',
  'motherjones.com': 'left', 'salon.com': 'left', 'theguardian.com': 'left',
  'nytimes.com': 'left', 'washingtonpost.com': 'left', 'slate.com': 'left',
  'theintercept.com': 'left', 'npr.org': 'left', 'propublica.org': 'left',
  'buzzfeednews.com': 'left', 'newyorker.com': 'left', 'rollingstone.com': 'left',
  'theatlantic.com': 'left', 'time.com': 'left', 'abcnews.go.com': 'left',
  'reuters.com': 'center', 'apnews.com': 'center', 'bbc.com': 'center',
  'bbc.co.uk': 'center', 'bbcnews.com': 'center',
  'usatoday.com': 'center', 'cbsnews.com': 'center', 'abcnews.com': 'center',
  'nbcnews.com': 'center', 'newsweek.com': 'center', 'economist.com': 'center',
  'ft.com': 'center', 'bloomberg.com': 'center', 'marketwatch.com': 'center',
  'cnbc.com': 'center', 'axios.com': 'center', 'politico.com': 'center',
  'thehill.com': 'center', 'aljazeera.com': 'center', 'dailymail.co.uk': 'center',
  'foxnews.com': 'right', 'foxnewsopinion.com': 'right', 'nationalreview.com': 'right',
  'washingtonexaminer.com': 'right', 'dailycaller.com': 'right',
  'thefederalist.com': 'right', 'nypost.com': 'right',
  'oann.com': 'right', 'breitbart.com': 'right',
  'dailywire.com': 'right', 'theepochtimes.com': 'right',
  'justthenews.com': 'right', 'washingtontimes.com': 'right',
  'dailysignal.com': 'right', 'redstate.com': 'right', 'townhall.com': 'right',
};

function classifyLean(domain: string): 'left' | 'center' | 'right' {
  const d = domain.toLowerCase().replace(/^www\./, '');
  if (DOMAIN_LEAN[d]) return DOMAIN_LEAN[d];
  for (const [key, lean] of Object.entries(DOMAIN_LEAN)) {
    if (d.includes(key) || key.includes(d)) return lean;
  }
  return 'center';
}

function extractWords(text: string): Record<string, number> {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'his',
    'her', 'was', 'one', 'our', 'out', 'new', 'say', 'that', 'with', 'this',
    'will', 'each', 'make', 'like', 'than', 'them', 'then', 'what', 'when',
    'your', 'from', 'have', 'been', 'said', 'more', 'also', 'just', 'over',
    'into', 'some', 'could', 'other', 'which', 'their', 'about', 'would',
    'there', 'these', 'being', 'after', 'first', 'been', 'many', 'may',
    'before', 'through', 'back', 'only', 'its', 'now', 'how', 'any',
  ]);
  const words: Record<string, number> = {};
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !stopWords.has(w));
  for (const w of tokens) {
    words[w] = (words[w] || 0) + 1;
  }
  return words;
}

biasCompareRoutes.get('/compare', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { topic, days = 30 } = req.query;

    if (!topic || (topic as string).trim().length === 0) {
      return res.status(400).json({ error: 'topic query param required' });
    }

    const keywords = (topic as string).split(/\s+/).filter(w => w.length > 2);
    const likeConditions = keywords.map(k => `(title LIKE '%${k}%')`);
    const where = `WHERE published_at IS NOT NULL AND published_at >= date('now', '-${parseInt(days as string)} days')
                   AND title != '' AND (${likeConditions.join(' OR ')})`;

    const articlesResult = db.exec(`
      SELECT id, url, title, domain, source_country, tone, published_at
      FROM news_archive ${where}
      ORDER BY published_at DESC LIMIT 200
    `);

    const allArticles = articlesResult[0]?.values.map((r: any[]) => ({
      id: r[0], url: r[1], title: r[2] as string, domain: r[3] as string,
      country: r[4], tone: r[5] as number, publishedAt: r[6],
    })) || [];

    const groups: Record<string, { articles: typeof allArticles; avgTone: number; totalTone: number }> = {
      left: { articles: [], avgTone: 0, totalTone: 0 },
      center: { articles: [], avgTone: 0, totalTone: 0 },
      right: { articles: [], avgTone: 0, totalTone: 0 },
    };

    for (const a of allArticles) {
      const lean = classifyLean(a.domain);
      groups[lean].articles.push(a);
      groups[lean].totalTone += a.tone;
    }

    for (const lean of ['left', 'center', 'right'] as const) {
      const g = groups[lean];
      g.avgTone = g.articles.length > 0 ? g.totalTone / g.articles.length : 0;
    }

    const exclusiveWords: Record<string, Record<string, number>> = { left: {}, center: {}, right: {} };
    for (const lean of ['left', 'center', 'right'] as const) {
      const combined = groups[lean].articles.map(a => a.title).join(' ');
      exclusiveWords[lean] = extractWords(combined);
    }

    const leftWords = new Set(Object.keys(exclusiveWords.left));
    const centerWords = new Set(Object.keys(exclusiveWords.center));
    const rightWords = new Set(Object.keys(exclusiveWords.right));

    const leftOnly = Object.entries(exclusiveWords.left)
      .filter(([w]) => !centerWords.has(w) && !rightWords.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    const rightOnly = Object.entries(exclusiveWords.right)
      .filter(([w]) => !leftWords.has(w) && !centerWords.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    const centerOnly = Object.entries(exclusiveWords.center)
      .filter(([w]) => !leftWords.has(w) && !rightWords.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    const allWords = new Set([...leftWords, ...centerWords, ...rightWords]);
    const overlapWords = Object.entries(exclusiveWords.left)
      .filter(([w]) => centerWords.has(w) && rightWords.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    const totalArticles = allArticles.length;
    const gapScore = totalArticles > 0
      ? Math.round(
          (Math.abs(groups.left.avgTone - groups.right.avgTone) /
            Math.max(Math.abs(groups.left.avgTone), Math.abs(groups.right.avgTone), 1)) * 100
        )
      : 0;

    res.json({
      topic,
      days: parseInt(days as string),
      groups: {
        left: { count: groups.left.articles.length, avgTone: groups.left.avgTone, articles: groups.left.articles.slice(0, 20) },
        center: { count: groups.center.articles.length, avgTone: groups.center.avgTone, articles: groups.center.articles.slice(0, 20) },
        right: { count: groups.right.articles.length, avgTone: groups.right.avgTone, articles: groups.right.articles.slice(0, 20) },
      },
      exclusiveWords: { leftOnly, centerOnly, rightOnly },
      overlapWords,
      narrativeGapScore: gapScore,
      totalArticles,
    });
  } catch (err: any) {
    log.error('Bias compare failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Bias compare failed' });
  }
});
