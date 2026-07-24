import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';

const log = createLogger({ module: 'timeline' });
export const timelineRoutes = Router();

timelineRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { from, to, granularity = 'day', country, domain } = req.query;

    let where = 'WHERE published_at IS NOT NULL';
    const params: any[] = [];

    if (from) { where += ' AND published_at >= ?'; params.push(from); }
    if (to) { where += ' AND published_at <= ?'; params.push(to); }
    if (country) { where += ' AND source_country = ?'; params.push(country); }
    if (domain) { where += ' AND domain = ?'; params.push(domain); }

    const dateExpr = granularity === 'week'
      ? `strftime('%Y-%W', published_at)`
      : granularity === 'month'
        ? `strftime('%Y-%m', published_at)`
        : `date(published_at)`;

    const bucketResult = db.exec(`
      SELECT ${dateExpr} as bucket,
             COUNT(*) as count,
             AVG(tone) as avg_tone,
             MIN(tone) as min_tone,
             MAX(tone) as max_tone,
             COUNT(CASE WHEN tone > 0 THEN 1 END) as positive,
             COUNT(CASE WHEN tone < 0 THEN 1 END) as negative,
             COUNT(DISTINCT domain) as domains,
             COUNT(DISTINCT source_country) as countries
      FROM news_archive ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `, params);

    const buckets = bucketResult[0]?.values.map((r: any[]) => ({
      date: r[0],
      count: r[1],
      avgTone: r[2],
      minTone: r[3],
      maxTone: r[4],
      positive: r[5],
      negative: r[6],
      domains: r[7],
      countries: r[8],
    })) || [];

    const totalCount = buckets.reduce((sum: number, b: any) => sum + b.count, 0);
    const avgTone = buckets.length > 0
      ? buckets.reduce((sum: number, b: any) => sum + (b.avgTone || 0) * b.count, 0) / totalCount
      : 0;

    res.json({
      buckets,
      granularity,
      totalCount,
      avgTone,
      dateRange: {
        from: buckets.length > 0 ? buckets[0].date : null,
        to: buckets.length > 0 ? buckets[buckets.length - 1].date : null,
      },
    });
  } catch (err: any) {
    log.error('Timeline query failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Timeline query failed' });
  }
});

timelineRoutes.get('/detail', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { date } = req.query;

    if (!date) return res.status(400).json({ error: 'date query param required' });

    const articles = db.exec(`
      SELECT id, url, title, domain, source_country, tone, published_at
      FROM news_archive
      WHERE date(published_at) = ? AND title != ''
      ORDER BY published_at DESC LIMIT 100
    `, [date as string]);

    const result = articles[0]?.values.map((r: any[]) => ({
      id: r[0], url: r[1], title: r[2], domain: r[3], country: r[4], tone: r[5], publishedAt: r[6],
    })) || [];

    res.json({ date, articles: result, count: result.length });
  } catch (err: any) {
    log.error('Timeline detail failed', { error: err.message });
    res.status(500).json({ error: 'Timeline detail failed' });
  }
});
