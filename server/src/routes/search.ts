import { Router, query } from 'express';
import { searchArticles, getArticlesByCluster, getAllClusters } from '../db';
import { resultToObjects } from '../utils';
import { getDb } from '../db';
import * as stringSimilarity from 'string-similarity';
import { createLogger } from '../logger';

const log = createLogger({ module: 'search' });
export const searchRoutes = Router();

const SEARCH_COLUMNS = ['left', 'lean-left', 'center', 'lean-right', 'right'] as const;

function sanitize(input: string): string {
  return input.replace(/[<>&"';()]/g, '').trim().slice(0, 200);
}

function buildStoryNodesFromArticles(articles: any[]) {
  const grouped: Record<string, any[]> = {};
  for (const b of SEARCH_COLUMNS) grouped[b] = [];
  for (const article of articles) {
    if (grouped[article.bias]) grouped[article.bias].push(article);
  }
  const blindspot = SEARCH_COLUMNS.filter(b => grouped[b].length === 0);
  return { articles: grouped, blindspot };
}

searchRoutes.get('/search', async (req, res) => {
  const q = sanitize((req.query.q as string) || '');
  const bias = (req.query.bias as string) || undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(req.query.limit as string) || 100));

  if (!q) {
    return res.json({ nodes: [], total: 0 });
  }

  try {
    const { articles: rawArticles, total } = searchArticles(q, bias, page, limit);

    if (rawArticles.length === 0) {
      return res.json({ nodes: [], total: 0 });
    }

    const clusterIds = [...new Set(rawArticles.map((a: any) => a.cluster_id).filter(Boolean))];
    const nodes: any[] = [];

    if (clusterIds.length > 0) {
      for (const cid of clusterIds) {
        const clusterArticles = getArticlesByCluster(cid);
        if (clusterArticles.length === 0) continue;
        const { articles, blindspot } = buildStoryNodesFromArticles(clusterArticles);
        nodes.push({
          id: cid,
          topicLabel: clusterArticles[0]?.title?.slice(0, 80) || 'Unknown',
          articles,
          blindspot,
          totalArticles: clusterArticles.length,
        });
      }
    }

    if (nodes.length === 0) {
      const { articles, blindspot } = buildStoryNodesFromArticles(rawArticles);
      nodes.push({
        id: 0,
        topicLabel: q,
        articles,
        blindspot,
        totalArticles: rawArticles.length,
      });
    }

    nodes.sort((a: any, b: any) => b.totalArticles - a.totalArticles);

    res.json({ nodes, total, page, limit });
  } catch (err: any) {
    log.error('Search failed', { query: q, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Search failed' });
  }
});
