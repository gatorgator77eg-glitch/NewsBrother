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

    // Find the most recent date in the archive as anchor
    const maxDateResult = archiveDb.exec(`SELECT MAX(published_at) FROM news_archive`);
    const maxDate = maxDateResult[0]?.values[0]?.[0] as string || '';

    if (!maxDate) {
      res.json({
        generatedAt: new Date().toISOString(),
        topStories: [], sentimentShifts: [], emergingNarratives: [],
        coverageByCountry: [], breakingNews: [],
        stats: { articlesToday: 0, articlesYesterday: 0 },
        archiveDateRange: null,
      });
      return;
    }

    // Extract just the date part from the anchor (e.g. "2026-06-25")
    const anchorDate = maxDate.substring(0, 10);

    // "today" = anchor date, "yesterday" = anchor date - 1 day
    // Use SQLite date arithmetic on the anchor string
    const topStories = archiveDb.exec(`
      SELECT title, domain, source_country, tone, published_at, url
      FROM news_archive
      WHERE date(published_at) = date(?)
        AND title != ''
      ORDER BY ABS(tone) DESC
      LIMIT 10
    `, [anchorDate]);
    const stories = topStories[0]?.values.map((r: any[]) => ({
      title: r[0], domain: r[1], country: r[2], tone: r[3], publishedAt: r[4], url: r[5],
    })) || [];

    const sentimentShifts = archiveDb.exec(`
      SELECT source_country,
             AVG(CASE WHEN date(published_at) = date(?) THEN tone END) as todayTone,
             AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END) as yesterdayTone,
             COUNT(*) as count
      FROM news_archive
      WHERE date(published_at) IN (date(?), date(?, '-1 day'))
        AND source_country != ''
      GROUP BY source_country
      HAVING count >= 3
      ORDER BY ABS(
        AVG(CASE WHEN date(published_at) = date(?) THEN tone END) -
        AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END)
      ) DESC
      LIMIT 8
    `, [anchorDate, anchorDate, anchorDate, anchorDate, anchorDate, anchorDate]);
    const shifts = sentimentShifts[0]?.values.map((r: any[]) => ({
      country: r[0], todayTone: r[1], yesterdayTone: r[2], count: r[3],
      change: (r[1] as number) - (r[2] as number),
    })).filter((s: any) => s.todayTone !== null && s.yesterdayTone !== null) || [];

    const emergingNarratives = archiveDb.exec(`
      SELECT title, domain, tone, published_at
      FROM news_archive
      WHERE date(published_at) = date(?)
        AND title != ''
        AND (title LIKE '%tariff%' OR title LIKE '%trade war%' OR title LIKE '%sanction%'
          OR title LIKE '%rate cut%' OR title LIKE '%inflation%' OR title LIKE '%earnings%'
          OR title LIKE '%election%' OR title LIKE '%war%' OR title LIKE '%crisis%'
          OR title LIKE '%recession%' OR title LIKE '%bull%' OR title LIKE '%bear%'
          OR title LIKE '%FDA%' OR title LIKE '%merger%' OR title LIKE '%acquisition%'
          OR title LIKE '%IPO%' OR title LIKE '%ban%' OR title LIKE '%deal%')
      ORDER BY ABS(tone) DESC LIMIT 15
    `, [anchorDate]);
    const narratives = emergingNarratives[0]?.values.map((r: any[]) => ({
      title: r[0], domain: r[1], tone: r[2], publishedAt: r[3],
    })) || [];

    const coverageByCountry = archiveDb.exec(`
      SELECT source_country, COUNT(*) as cnt, AVG(tone) as avg_tone
      FROM news_archive
      WHERE date(published_at) = date(?) AND source_country != ''
      GROUP BY source_country
      ORDER BY cnt DESC LIMIT 10
    `, [anchorDate]);
    const coverage = coverageByCountry[0]?.values.map((r: any[]) => ({
      country: r[0], count: r[1], avgTone: r[2],
    })) || [];

    const totalToday = archiveDb.exec(`
      SELECT COUNT(*) FROM news_archive WHERE date(published_at) = date(?)
    `, [anchorDate]);
    const totalYesterday = archiveDb.exec(`
      SELECT COUNT(*) FROM news_archive WHERE date(published_at) = date(?, '-1 day')
    `, [anchorDate]);

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
      archiveDateRange: { anchor: anchorDate },
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
