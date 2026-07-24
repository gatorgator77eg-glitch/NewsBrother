import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import {
  getNewsArchiveDb,
  searchArchive,
  getArchiveStats,
  getDownloadStatus,
  getDailyVolume,
} from '../newsArchive/db';
import { startArchiveDownload, abortArchiveDownload } from '../newsArchive/downloader';

const log = createLogger({ module: 'newsArchive' });
export const newsArchiveRoutes = Router();

// Ensure DB is initialized on startup
getNewsArchiveDb().catch(err => log.error('Failed to init archive DB', { error: String(err) }));

// GET /api/news-archive — search archived articles
newsArchiveRoutes.get('/', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const query = (req.query.query as string) || '';
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const result = searchArchive(query, dateFrom, dateTo, page, limit);
    res.json(result);
    log.info('Searched archive', {
      query,
      page,
      total: result.total,
      elapsedMs: Date.now() - start,
    });
  } catch (err: any) {
    log.error('Failed to search archive', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/news-archive/stats — archive statistics
newsArchiveRoutes.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = getArchiveStats();
    const dailyVolume = getDailyVolume();
    res.json({ ...stats, dailyVolume });
  } catch (err: any) {
    log.error('Failed to get archive stats', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/news-archive/download/status — download progress
newsArchiveRoutes.get('/download/status', (_req: Request, res: Response) => {
  try {
    const status = getDownloadStatus();
    res.json(status);
  } catch (err: any) {
    log.error('Failed to get download status', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/news-archive/download — start bulk download
newsArchiveRoutes.post('/download', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, query } = req.body;
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const result = await startArchiveDownload(startDate, endDate, query);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }

    res.json({ ok: true, totalDays: result.totalDays });
    log.info('Started archive download', { startDate, endDate, totalDays: result.totalDays });
  } catch (err: any) {
    log.error('Failed to start download', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/news-archive/download/abort — abort active download
newsArchiveRoutes.post('/download/abort', async (_req: Request, res: Response) => {
  try {
    const result = await abortArchiveDownload();
    res.json(result);
    log.info('Aborted archive download');
  } catch (err: any) {
    log.error('Failed to abort download', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});
