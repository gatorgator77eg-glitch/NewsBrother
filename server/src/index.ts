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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
