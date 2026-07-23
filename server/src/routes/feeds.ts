import { Router } from 'express';
import { getAllSources } from '../db';

export const feedsRoutes = Router();

feedsRoutes.get('/feeds', async (_req, res) => {
  const sources = await getAllSources();
  res.json(sources);
});
