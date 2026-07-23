import { Router } from 'express';
import { buildStoryNodes } from '../clustering';

export const blindspotsRoutes = Router();

blindspotsRoutes.get('/blindspots', async (_req, res) => {
  const nodes = await buildStoryNodes();
  const blindspotNodes = nodes.filter(n => n.blindspot.length > 0 && n.totalArticles >= 2);
  res.json({ nodes: blindspotNodes, total: blindspotNodes.length });
});
