import { Router } from 'express';
import { buildStoryNodes } from '../clustering';

export const breakingRoutes = Router();

breakingRoutes.get('/breaking', async (_req, res) => {
  const nodes = await buildStoryNodes();
  const recent = nodes.slice(0, 20);
  res.json({ nodes: recent, total: nodes.length });
});
