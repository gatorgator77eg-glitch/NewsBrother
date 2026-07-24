import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';

const log = createLogger({ module: 'sentiment' });
export const sentimentRoutes = Router();

// Known political lean of major news domains
const DOMAIN_LEAN: Record<string, 'left' | 'center' | 'right'> = {
  // Left-leaning
  'cnn.com': 'left', 'msnbc.com': 'left', 'huffpost.com': 'left', 'vox.com': 'left',
  'motherjones.com': 'left', 'salon.com': 'left', 'theguardian.com': 'left',
  'nytimes.com': 'left', 'washingtonpost.com': 'left', 'slate.com': 'left',
  'theintercept.com': 'left', 'npr.org': 'left', 'propublica.org': 'left',
  'buzzfeednews.com': 'left', 'newyorker.com': 'left', 'rollingstone.com': 'left',
  'theatlantic.com': 'left', 'time.com': 'left', 'abcnews.go.com': 'left',
  // Center
  'reuters.com': 'center', 'apnews.com': 'center', 'bbc.com': 'center',
  'bbc.co.uk': 'center', 'bbcnews.com': 'center',
  'usatoday.com': 'center', 'cbsnews.com': 'center', 'abcnews.com': 'center',
  'nbcnews.com': 'center', 'newsweek.com': 'center', 'economist.com': 'center',
  'ft.com': 'center', 'bloomberg.com': 'center', 'marketwatch.com': 'center',
  'cnbc.com': 'center', 'axios.com': 'center', 'politico.com': 'center',
  'thehill.com': 'center', 'aljazeera.com': 'center', 'dailymail.co.uk': 'center',
  // Right-leaning
  'foxnews.com': 'right', 'foxnewsopinion.com': 'right', 'nationalreview.com': 'right',
  'washingtonexaminer.com': 'right', 'dailycaller.com': 'right',
  'thefederalist.com': 'right', 'nypost.com': 'right',
  'oann.com': 'right', 'breitbart.com': 'right',
  'dailywire.com': 'right',
  'theepochtimes.com': 'right', 'justthenews.com': 'right',
  'washingtontimes.com': 'right', 'dailysignal.com': 'right',
  'redstate.com': 'right', 'townhall.com': 'right',
};

// ─── 1. Tone Timeline ───────────────────────────────────────────────
sentimentRoutes.get('/timeline', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { country, domain, granularity = 'daily' } = req.query;

    let where = 'WHERE published_at IS NOT NULL AND tone != 0';
    const params: any[] = [];

    if (country) {
      where += ` AND source_country = ?`;
      params.push(country);
    }
    if (domain) {
      where += ` AND domain = ?`;
      params.push(domain);
    }

    const dateExpr = granularity === 'weekly'
      ? `strftime('%Y-%W', published_at)`
      : `date(published_at)`;

    const result = db.exec(`
      SELECT ${dateExpr} as period,
             AVG(tone) as avg_tone,
             COUNT(*) as article_count,
             MIN(tone) as min_tone,
             MAX(tone) as max_tone
      FROM news_archive
      ${where}
      GROUP BY period
      ORDER BY period
    `, params);

    const timeline = (result[0]?.values || []).map((r: any[]) => ({
      period: r[0],
      avgTone: Math.round((r[1] || 0) * 100) / 100,
      articleCount: r[2],
      minTone: Math.round((r[3] || 0) * 100) / 100,
      maxTone: Math.round((r[4] || 0) * 100) / 100,
    }));

    res.json({ timeline, granularity });
    log.info('Built sentiment timeline', { points: timeline.length });
  } catch (err: any) {
    log.error('Failed to build timeline', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. World Sentiment Map ─────────────────────────────────────────
sentimentRoutes.get('/world-map', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { month } = req.query; // format: '2026-07' or '2026-06'

    let where = `WHERE published_at IS NOT NULL AND source_country != '' AND tone != 0`;
    const params: any[] = [];

    if (month) {
      where += ` AND strftime('%Y-%m', published_at) = ?`;
      params.push(month);
    }

    const result = db.exec(`
      SELECT source_country as country,
             AVG(tone) as avg_tone,
             COUNT(*) as article_count,
             SUM(CASE WHEN tone > 0 THEN 1 ELSE 0 END) as positive_count,
             SUM(CASE WHEN tone < 0 THEN 1 ELSE 0 END) as negative_count
      FROM news_archive
      ${where}
      GROUP BY source_country
      HAVING article_count >= 2
      ORDER BY article_count DESC
    `, params);

    const countries = (result[0]?.values || []).map((r: any[]) => ({
      country: r[0],
      avgTone: Math.round((r[1] || 0) * 100) / 100,
      articleCount: r[2],
      positiveCount: r[3],
      negativeCount: r[4],
    }));

    // Get available months
    const monthsResult = db.exec(`
      SELECT DISTINCT strftime('%Y-%m', published_at) as month
      FROM news_archive
      WHERE published_at IS NOT NULL
      ORDER BY month DESC
    `);
    const months = (monthsResult[0]?.values || []).map((r: any[]) => r[0]);

    res.json({ countries, months, selectedMonth: month || null });
    log.info('Built world sentiment map', { countries: countries.length });
  } catch (err: any) {
    log.error('Failed to build world map', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. Source Bias Spectrum ────────────────────────────────────────
sentimentRoutes.get('/source-bias', async (_req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();

    const result = db.exec(`
      SELECT domain,
             AVG(tone) as avg_tone,
             COUNT(*) as article_count,
             MIN(tone) as min_tone,
             MAX(tone) as max_tone,
             -- Simple variance: avg(x^2) - avg(x)^2
             AVG(tone * tone) - AVG(tone) * AVG(tone) as tone_variance
      FROM news_archive
      WHERE domain != '' AND tone != 0
      GROUP BY domain
      HAVING article_count >= 3
      ORDER BY avg_tone
    `);

    const sources = (result[0]?.values || []).map((r: any[]) => {
      const domain = r[0];
      const lean = DOMAIN_LEAN[domain] || 'uncategorized';
      return {
        domain,
        avgTone: Math.round((r[1] || 0) * 100) / 100,
        articleCount: r[2],
        minTone: Math.round((r[3] || 0) * 100) / 100,
        maxTone: Math.round((r[4] || 0) * 100) / 100,
        toneVariance: Math.round((r[5] || 0) * 100) / 100,
        lean,
      };
    });

    res.json({ sources });
    log.info('Built source bias spectrum', { sources: sources.length });
  } catch (err: any) {
    log.error('Failed to build source bias', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. Sentiment Distribution ──────────────────────────────────────
sentimentRoutes.get('/distribution', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { country, domain } = req.query;

    let where = 'WHERE tone != 0';
    const params: any[] = [];

    if (country) {
      where += ` AND source_country = ?`;
      params.push(country);
    }
    if (domain) {
      where += ` AND domain = ?`;
      params.push(domain);
    }

    // Create 21 buckets from -10 to +10
    const buckets: { bucket: number; count: number; percentage: number }[] = [];
    const totalResult = db.exec(`SELECT COUNT(*) FROM news_archive ${where}`, params);
    const total = totalResult[0]?.values[0]?.[0] as number || 1;

    for (let i = -10; i <= 10; i++) {
      const lo = i - 0.5;
      const hi = i + 0.5;
      const r = db.exec(
        `SELECT COUNT(*) FROM news_archive ${where} AND tone >= ? AND tone < ?`,
        [...params, lo, hi]
      );
      const count = r[0]?.values[0]?.[0] as number || 0;
      buckets.push({
        bucket: i,
        count,
        percentage: Math.round((count / total) * 10000) / 100,
      });
    }

    // Also get summary stats
    const statsResult = db.exec(`
      SELECT AVG(tone), COUNT(*) FROM news_archive ${where}
    `, params);
    const avgTone = Math.round(((statsResult[0]?.values[0]?.[0] as number) || 0) * 100) / 100;
    const totalArticles = statsResult[0]?.values[0]?.[1] as number || 0;

    res.json({ buckets, avgTone, totalArticles });
    log.info('Built sentiment distribution', { totalArticles });
  } catch (err: any) {
    log.error('Failed to build distribution', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. Mood Pulse ──────────────────────────────────────────────────
sentimentRoutes.get('/mood-pulse', async (_req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();

    // Get countries with articles in the last 7 days
    const result = db.exec(`
      SELECT source_country as country,
             AVG(tone) as avg_tone,
             COUNT(*) as article_count,
             date(published_at) as day
      FROM news_archive
      WHERE published_at IS NOT NULL
        AND source_country != ''
        AND tone != 0
        AND published_at >= date('now', '-7 days')
      GROUP BY source_country, day
      ORDER BY source_country, day DESC
    `);

    // Build per-country sparklines
    const countryMap = new Map<string, { day: string; tone: number; count: number }[]>();
    for (const row of (result[0]?.values || [])) {
      const country = row[0] as string;
      if (!countryMap.has(country)) countryMap.set(country, []);
      countryMap.get(country)!.push({
        day: row[3] as string,
        tone: Math.round(((row[1] as number) || 0) * 100) / 100,
        count: row[2] as number,
      });
    }

    const pulse = Array.from(countryMap.entries()).map(([country, days]) => {
      const sorted = days.sort((a, b) => b.day.localeCompare(a.day));
      const today = sorted[0];
      const weekAvg = Math.round((days.reduce((s, d) => s + d.tone * d.count, 0) / Math.max(1, days.reduce((s, d) => s + d.count, 0))) * 100) / 100;
      const trend = sorted.length >= 2
        ? sorted[0].tone > sorted[1].tone ? 'up' : sorted[0].tone < sorted[1].tone ? 'down' : 'flat'
        : 'flat';

      return {
        country,
        todayTone: today?.tone || 0,
        todayCount: today?.count || 0,
        weekTone: weekAvg,
        sparkline: days.map(d => d.tone).reverse(),
        trend,
        totalArticles: days.reduce((s, d) => s + d.count, 0),
      };
    });

    pulse.sort((a, b) => b.totalArticles - a.totalArticles);

    res.json({ pulse });
    log.info('Built mood pulse', { countries: pulse.length });
  } catch (err: any) {
    log.error('Failed to build mood pulse', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. Sentiment Waves ─────────────────────────────────────────────
sentimentRoutes.get('/waves', async (req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    const { days = '14' } = req.query;
    const dayCount = Math.min(parseInt(days as string) || 14, 60);

    const result = db.exec(`
      SELECT date(published_at) as day,
             source_country as country,
             AVG(tone) as avg_tone,
             COUNT(*) as article_count
      FROM news_archive
      WHERE published_at IS NOT NULL
        AND source_country != ''
        AND tone != 0
        AND published_at >= date('now', '-${dayCount} days')
      GROUP BY day, source_country
      ORDER BY day, source_country
    `);

    // Restructure: { date: { country: { tone, count } } }
    const dayMap = new Map<string, Map<string, { tone: number; count: number }>>();
    for (const row of (result[0]?.values || [])) {
      const day = row[0] as string;
      const country = row[1] as string;
      if (!dayMap.has(day)) dayMap.set(day, new Map());
      dayMap.get(day)!.set(country, {
        tone: Math.round(((row[2] as number) || 0) * 100) / 100,
        count: row[3] as number,
      });
    }

    // Get all unique countries
    const allCountries = new Set<string>();
    dayMap.forEach(m => m.forEach((_, c) => allCountries.add(c)));

    // Build waves: array of { date, countries: { country, tone, count }[] }
    const waves = Array.from(dayMap.entries()).map(([day, countryData]) => ({
      date: day,
      countries: Array.from(allCountries).map(c => ({
        country: c,
        tone: countryData.get(c)?.tone ?? null,
        count: countryData.get(c)?.count ?? 0,
      })).filter(c => c.tone !== null),
    }));

    res.json({ waves, countries: Array.from(allCountries).sort() });
    log.info('Built sentiment waves', { days: waves.length, countries: allCountries.size });
  } catch (err: any) {
    log.error('Failed to build waves', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. Left vs Right Bias ──────────────────────────────────────────
sentimentRoutes.get('/left-right', async (_req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();

    const result = db.exec(`
      SELECT domain,
             AVG(tone) as avg_tone,
             COUNT(*) as article_count
      FROM news_archive
      WHERE domain != '' AND tone != 0
      GROUP BY domain
      HAVING article_count >= 2
    `);

    const categories: Record<string, { tones: number[]; articles: number; domains: string[] }> = {
      left: { tones: [], articles: 0, domains: [] },
      center: { tones: [], articles: 0, domains: [] },
      right: { tones: [], articles: 0, domains: [] },
      uncategorized: { tones: [], articles: 0, domains: [] },
    };

    for (const row of (result[0]?.values || [])) {
      const domain = row[0] as string;
      const avgTone = row[1] as number;
      const count = row[2] as number;
      const lean = DOMAIN_LEAN[domain] || 'uncategorized';

      categories[lean].tones.push(avgTone);
      categories[lean].articles += count;
      categories[lean].domains.push(domain);
    }

    // Build distribution buckets per category
    const buildDistribution = (tones: number[]) => {
      const buckets: { bucket: number; count: number }[] = [];
      for (let i = -10; i <= 10; i++) {
        const lo = i - 0.5;
        const hi = i + 0.5;
        const count = tones.filter(t => t >= lo && t < hi).length;
        buckets.push({ bucket: i, count });
      }
      return buckets;
    };

    const leftRight = (['left', 'center', 'right'] as const).map(cat => {
      const data = categories[cat];
      const sorted = [...data.tones].sort((a, b) => a - b);
      const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
      const avg = data.tones.length > 0
        ? Math.round((data.tones.reduce((s, t) => s + t, 0) / data.tones.length) * 100) / 100
        : 0;

      return {
        category: cat,
        avgTone: avg,
        medianTone: Math.round(median * 100) / 100,
        totalArticles: data.articles,
        domainCount: data.domains.length,
        topDomains: data.domains.slice(0, 5),
        distribution: buildDistribution(data.tones),
      };
    });

    // Also include uncategorized for reference
    const uncat = categories.uncategorized;
    const uncatSorted = [...uncat.tones].sort((a, b) => a - b);

    res.json({
      leftRight,
      uncategorized: {
        avgTone: uncat.tones.length > 0
          ? Math.round((uncat.tones.reduce((s, t) => s + t, 0) / uncat.tones.length) * 100) / 100
          : 0,
        totalArticles: uncat.articles,
        domainCount: uncat.domains.length,
      },
    });
    log.info('Built left-right bias comparison');
  } catch (err: any) {
    log.error('Failed to build left-right', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});
