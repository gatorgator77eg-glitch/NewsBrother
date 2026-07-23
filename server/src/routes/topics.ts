import { Router } from 'express';
import { getArticlesByCluster, getAllClusters } from '../db';

export const topicsRoutes = Router();

topicsRoutes.get('/topics', async (_req, res) => {
  const clusters = await getAllClusters();
  res.json(clusters);
});

topicsRoutes.get('/topics/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 0) {
    return res.status(400).json({ error: 'Invalid topic ID' });
  }

  const articles = await getArticlesByCluster(id);
  if ((articles as any[]).length === 0) {
    return res.status(404).json({ error: 'Topic not found' });
  }

  const biasColumns = ['left', 'lean-left', 'center', 'lean-right', 'right'] as const;
  const grouped: Record<string, any[]> = {};
  for (const b of biasColumns) grouped[b] = [];
  for (const article of articles as any[]) {
    if (grouped[article.bias]) grouped[article.bias].push(article);
  }

  const blindspot = biasColumns.filter(b => grouped[b].length === 0);

  res.json({
    id,
    topicLabel: (articles as any[])[0]?.title?.slice(0, 80) || 'Unknown',
    articles: grouped,
    blindspot,
    totalArticles: articles.length,
  });
});
