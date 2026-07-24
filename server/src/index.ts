import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import logger from './logger';
import { requestIdMiddleware, requestLoggingMiddleware, errorMiddleware } from './middleware/logging';
import { searchRoutes } from './routes/search';
import { topicsRoutes } from './routes/topics';
import { blindspotsRoutes } from './routes/blindspots';
import { feedsRoutes } from './routes/feeds';
import { breakingRoutes } from './routes/breaking';
import { graphRoutes } from './routes/graph';
import { googleNewsRoutes } from './routes/googleNews';
import { eventsRoutes } from './routes/events';
import { stocksRoutes } from './routes/stocks';
import { marketAnalyticsRoutes } from './routes/marketAnalytics';
import { newsVsPriceRoutes } from './routes/newsVsPrice';
import { newsArchiveRoutes } from './routes/newsArchive';
import { janusRoutes } from './routes/janus';
import { sentimentRoutes } from './routes/sentiment';
import { localgpuRoutes } from './routes/localgpu';
import { deepResearchRoutes } from './routes/deepResearch';
import { correlationRoutes } from './routes/correlation';
import { exportRoutes } from './routes/export';
import { briefingRoutes } from './routes/briefing';
import { timelineRoutes } from './routes/timeline';
import { biasCompareRoutes } from './routes/biasCompare';
import { alertsRoutes } from './routes/alerts';
import { getNewsArchiveDb } from './newsArchive/db';
import { getDb } from './db';
import { ingestAll } from './ingestor';
import { clusterArticles } from './clustering';

const log = logger.child({ module: 'server' });
const app = express();
const PORT = process.env.PORT || 3001;

app.use(requestIdMiddleware);
app.use(requestLoggingMiddleware);
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

app.use('/api', searchRoutes);
app.use('/api', topicsRoutes);
app.use('/api', blindspotsRoutes);
app.use('/api', feedsRoutes);
app.use('/api', breakingRoutes);
app.use('/api', graphRoutes);
app.use('/api', googleNewsRoutes);
app.use('/api', eventsRoutes);
app.use('/api', stocksRoutes);
app.use('/api', marketAnalyticsRoutes);
app.use('/api', newsVsPriceRoutes);
app.use('/api/news-archive', newsArchiveRoutes);
app.use('/api/janus', janusRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/localgpu', localgpuRoutes);
app.use('/api/deep-research', deepResearchRoutes);
app.use('/api/correlation', correlationRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/briefing', briefingRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/bias', biasCompareRoutes);
app.use('/api/alerts', alertsRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    const newsDb = await getDb();
    const archiveDb = await getNewsArchiveDb();

    const newsCount = newsDb.exec('SELECT COUNT(*) FROM articles')[0]?.values[0]?.[0] || 0;
    const archiveCount = archiveDb.exec('SELECT COUNT(*) FROM news_archive')[0]?.values[0]?.[0] || 0;
    const latestArticle = newsDb.exec('SELECT MAX(published_at) FROM articles')[0]?.values[0]?.[0] || null;
    const latestArchive = archiveDb.exec('SELECT MAX(published_at) FROM news_archive')[0]?.values[0]?.[0] || null;
    const sourceCount = newsDb.exec('SELECT COUNT(*) FROM sources')[0]?.values[0]?.[0] || 0;

    const lastIngestMeta = newsDb.exec("SELECT value FROM meta WHERE key = 'last_ingest'")[0]?.values[0]?.[0] || null;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      news: { articles: newsCount, latestArticle, sources: sourceCount },
      archive: { articles: archiveCount, latestArticle: latestArchive },
      stocks: { tickers: 0, priceRows: 0 },
      lastIngest: lastIngestMeta,
    });
  } catch (err: any) {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), error: err.message });
  }
});

app.use(errorMiddleware);

cron.schedule('*/5 * * * *', async () => {
  log.info('Cron: Starting ingestion cycle');
  try {
    await ingestAll();
    await clusterArticles();
    log.info('Cron: Ingestion cycle complete');
  } catch (err: any) {
    log.error('Cron: Ingestion cycle failed', { error: err.message, stack: err.stack });
  }
});

(async () => {
  await getDb();
  log.info('Database initialized');

  app.listen(PORT, () => {
    log.info(`Server listening on http://localhost:${PORT}`);

    ingestAll()
      .then(() => clusterArticles())
      .then(() => log.info('Initial data load complete'))
      .catch((err: any) => log.error('Initial load failed', { error: err.message, stack: err.stack }));
  });
})();
