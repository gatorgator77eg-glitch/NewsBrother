import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getDb } from '../db';

const log = createLogger({ module: 'briefing' });
export const briefingRoutes = Router();

briefingRoutes.get('/daily', async (_req: Request, res: Response) => {
  try {
    const archiveDb = await getNewsArchiveDb();
    const newsDb = await getDb();

    const topStories = archiveDb.exec(`
      SELECT title, domain, source_country, tone, published_at, url
      FROM news_archive
      WHERE published_at >= date('now', '-1 day')
        AND title != ''
      ORDER BY published_at DESC LIMIT 10
    `);
    const stories = topStories[0]?.values.map((r: any[]) => ({
      title: r[0], domain: r[1], country: r[2], tone: r[3], publishedAt: r[4], url: r[5],
    })) || [];

    const sentimentShifts = archiveDb.exec(`
      SELECT source_country,
             AVG(CASE WHEN published_at >= date('now', '-1 day') THEN tone END) as today,
             AVG(CASE WHEN published_at >= date('now', '-2 days') AND published_at < date('now', '-1 day') THEN tone END) as yesterday,
             COUNT(CASE WHEN published_at >= date('now', '-1 day') THEN 1 END) as count
      FROM news_archive
      WHERE published_at >= date('now', '-2 days') AND source_country != ''
      GROUP BY source_country
      HAVING count >= 3
      ORDER BY ABS(AVG(CASE WHEN published_at >= date('now', '-1 day') THEN tone END) -
                    AVG(CASE WHEN published_at >= date('now', '-2 days') AND published_at < date('now', '-1 day') THEN tone END)) DESC
      LIMIT 8
    `);
    const shifts = sentimentShifts[0]?.values.map((r: any[]) => ({
      country: r[0], todayTone: r[1], yesterdayTone: r[2], count: r[3],
      change: (r[1] as number) - (r[2] as number),
    })).filter((s: any) => s.todayTone !== null && s.yesterdayTone !== null) || [];

    const emergingNarratives = archiveDb.exec(`
      SELECT title, domain, tone, published_at
      FROM news_archive
      WHERE published_at >= date('now', '-1 day')
        AND title != ''
        AND (title LIKE '%tariff%' OR title LIKE '%trade war%' OR title LIKE '%sanction%'
          OR title LIKE '%rate cut%' OR title LIKE '%inflation%' OR title LIKE '%earnings%'
          OR title LIKE '%election%' OR title LIKE '%war%' OR title LIKE '%crisis%'
          OR title LIKE '%recession%' OR title LIKE '%bull%' OR title LIKE '%bear%'
          OR title LIKE '%FDA%' OR title LIKE '%merger%' OR title LIKE '%acquisition%'
          OR title LIKE '%IPO%' OR title LIKE '%ban%' OR title OR title LIKE '%deal%')
      ORDER BY published_at DESC LIMIT 15
    `);
    const narratives = emergingNarratives[0]?.values.map((r: any[]) => ({
      title: r[0], domain: r[1], tone: r[2], publishedAt: r[3],
    })) || [];

    const coverageByCountry = archiveDb.exec(`
      SELECT source_country, COUNT(*) as cnt, AVG(tone) as avg_tone
      FROM news_archive
      WHERE published_at >= date('now', '-1 day') AND source_country != ''
      GROUP BY source_country
      ORDER BY cnt DESC LIMIT 10
    `);
    const coverage = coverageByCountry[0]?.values.map((r: any[]) => ({
      country: r[0], count: r[1], avgTone: r[2],
    })) || [];

    const totalToday = archiveDb.exec(`
      SELECT COUNT(*) FROM news_archive WHERE published_at >= date('now', '-1 day')
    `);
    const totalYesterday = archiveDb.exec(`
      SELECT COUNT(*) FROM news_archive
      WHERE published_at >= date('now', '-2 days') AND published_at < date('now', '-1 day')
    `);

    const breakingFromRSS = newsDb.exec(`
      SELECT title, source_name, url, published_at
      FROM articles
      WHERE published_at >= datetime('now', '-6 hours')
      ORDER BY published_at DESC LIMIT 5
    `);
    const breaking = breakingFromRSS[0]?.values.map((r: any[]) => ({
      title: r[0], source: r[1], url: r[2], publishedAt: r[3],
    })) || [];

    res.json({
      generatedAt: new Date().toISOString(),
      topStories: stories,
      sentimentShifts: shifts,
      emergingNarratives: narratives,
      coverageByCountry: coverage,
      breakingNews: breaking,
      stats: {
        articlesToday: totalToday[0]?.values[0]?.[0] || 0,
        articlesYesterday: totalYesterday[0]?.values[0]?.[0] || 0,
      },
    });
  } catch (err: any) {
    log.error('Failed to generate daily briefing', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to generate daily briefing' });
  }
});
