import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { searchRoutes } from './routes/search';
import { topicsRoutes } from './routes/topics';
import { blindspotsRoutes } from './routes/blindspots';
import { feedsRoutes } from './routes/feeds';
import { breakingRoutes } from './routes/breaking';
import { graphRoutes } from './routes/graph';
import { googleNewsRoutes } from './routes/googleNews';
import { eventsRoutes } from './routes/events';
import { getDb } from './db';
import { ingestAll } from './ingestor';
import { clusterArticles } from './clustering';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(morgan('dev'));
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

cron.schedule('*/5 * * * *', async () => {
  console.log('\n⏰ Cron: Starting ingestion cycle...');
  try {
    await ingestAll();
    await clusterArticles();
  } catch (err) {
    console.error('Cron error:', err);
  }
});

(async () => {
  await getDb();
  console.log('📦 Database initialized.');

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);

    ingestAll()
      .then(() => clusterArticles())
      .then(() => console.log('🎉 Initial data load complete!'))
      .catch(err => console.error('Initial load error:', err));
  });
})();
