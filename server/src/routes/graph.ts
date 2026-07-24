import { Router } from 'express';
import { getDb } from '../db';
import { resultToObjects } from '../utils';
import { createLogger } from '../logger';

const log = createLogger({ module: 'graph' });
export const graphRoutes = Router();

type GraphNodeType = 'source' | 'article' | 'cluster';
type GraphEdgeType = 'published_by' | 'contains';

interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  bias?: string;
  credibility?: number;
  articleCount?: number;
  blindspot?: string[];
  coverage?: Record<string, number>;
  publishedAt?: string;
  sourceId?: string;
  sourceName?: string;
  url?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
}

function buildGraphFromArticles(articles: any[]) {
  const sourceNodes = new Map<string, GraphNode>();
  const articleNodes: GraphNode[] = [];
  const clusterNodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const BIAS_ORDER = ['left', 'lean-left', 'center', 'lean-right', 'right'];

  for (const article of articles) {
    const articleId = `article-${article.id}`;
    const sourceId = `source-${article.source_id}`;
    const clusterId = article.cluster_id ? `cluster-${article.cluster_id}` : null;

    if (!sourceNodes.has(sourceId)) {
      sourceNodes.set(sourceId, {
        id: sourceId,
        type: 'source',
        label: article.source_name || article.source_id,
        bias: article.bias,
        credibility: article.credibility_score || 0.5,
        articleCount: 0,
      });
    }
    const sourceNode = sourceNodes.get(sourceId)!;
    sourceNode.articleCount = (sourceNode.articleCount || 0) + 1;

    articleNodes.push({
      id: articleId,
      type: 'article',
      label: article.title?.slice(0, 80) || 'Untitled',
      bias: article.bias,
      credibility: article.credibility_score || 0.5,
      publishedAt: article.published_at,
      sourceId: article.source_id,
      sourceName: article.source_name,
      url: article.url,
    });

    edges.push({ source: sourceId, target: articleId, type: 'published_by' });

    if (clusterId) {
      if (!clusterNodes.has(clusterId)) {
        clusterNodes.set(clusterId, {
          id: clusterId,
          type: 'cluster',
          label: article.title?.slice(0, 100) || 'Unknown Topic',
          articleCount: 0,
          blindspot: [],
          coverage: {},
        });
      }
      const clusterNode = clusterNodes.get(clusterId)!;
      clusterNode.articleCount = (clusterNode.articleCount || 0) + 1;
      if (article.bias) {
        clusterNode.coverage = clusterNode.coverage || {};
        clusterNode.coverage[article.bias] = (clusterNode.coverage[article.bias] || 0) + 1;
      }

      edges.push({ source: clusterId, target: articleId, type: 'contains' });
    }
  }

  for (const [, node] of clusterNodes) {
    node.blindspot = BIAS_ORDER.filter(b => !node.coverage?.[b] || node.coverage[b] === 0);
  }

  const nodes: GraphNode[] = [
    ...sourceNodes.values(),
    ...articleNodes,
    ...clusterNodes.values(),
  ];

  return { nodes, edges };
}

graphRoutes.get('/graph/breaking', async (_req, res) => {
  try {
    const db = await getDb();
    const clusterResult = db.exec(`
      SELECT c.id, c.topic_label
      FROM clusters c
      LEFT JOIN articles a ON a.cluster_id = c.id
      GROUP BY c.id
      HAVING COUNT(a.id) > 0
      ORDER BY COUNT(a.id) DESC
      LIMIT 10
    `);
    const clusters = resultToObjects(clusterResult);

    if (clusters.length === 0) {
      return res.json({ nodes: [], edges: [] });
    }

    const clusterIds = clusters.map((c: any) => c.id);
    const placeholders = clusterIds.map(() => '?').join(',');
    const articlesResult = db.exec(`
      SELECT a.*, s.bias, s.name as source_name, s.credibility_score
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.cluster_id IN (${placeholders})
      ORDER BY a.published_at DESC
    `, clusterIds);
    const articles = resultToObjects(articlesResult);

    const graph = buildGraphFromArticles(articles);
    res.json(graph);
  } catch (err: any) {
    log.error('Graph breaking failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to build graph' });
  }
});

graphRoutes.get('/graph/search', async (req, res) => {
  const q = ((req.query.q as string) || '').replace(/[<>&"';()]/g, '').trim().slice(0, 200);
  const bias = (req.query.bias as string) || undefined;

  if (!q) {
    return res.json({ nodes: [], edges: [] });
  }

  try {
    const db = await getDb();
    const params: any[] = [`%${q}%`, `%${q}%`];
    let whereClause = `(a.title LIKE ? OR a.excerpt LIKE ?)`;
    if (bias && ['left', 'lean-left', 'center', 'lean-right', 'right'].includes(bias)) {
      whereClause += ` AND s.bias = ?`;
      params.push(bias);
    }

    const articlesResult = db.exec(`
      SELECT a.*, s.bias, s.name as source_name, s.credibility_score
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE ${whereClause}
      ORDER BY a.published_at DESC
      LIMIT 200
    `, params);
    const articles = resultToObjects(articlesResult);

    if (articles.length === 0) {
      return res.json({ nodes: [], edges: [] });
    }

    const clusterIds = [...new Set(articles.map((a: any) => a.cluster_id).filter(Boolean))];
    if (clusterIds.length > 0) {
      const placeholders = clusterIds.map(() => '?').join(',');
      const clusterArticlesResult = db.exec(`
        SELECT a.*, s.bias, s.name as source_name, s.credibility_score
        FROM articles a
        JOIN sources s ON a.source_id = s.id
        WHERE a.cluster_id IN (${placeholders})
        ORDER BY a.published_at DESC
      `, clusterIds);
      const allArticles = resultToObjects(clusterArticlesResult);
      const graph = buildGraphFromArticles(allArticles);
      return res.json(graph);
    }

    const graph = buildGraphFromArticles(articles);
    res.json(graph);
  } catch (err: any) {
    log.error('Graph search failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to build graph' });
  }
});

graphRoutes.get('/graph/topic/:id', async (req, res) => {
  const topicId = parseInt(req.params.id);
  if (isNaN(topicId)) {
    return res.status(400).json({ error: 'Invalid topic ID' });
  }

  try {
    const db = await getDb();
    const articlesResult = db.exec(`
      SELECT a.*, s.bias, s.name as source_name, s.credibility_score
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.cluster_id = ?
      ORDER BY a.published_at DESC
    `, [topicId]);
    const articles = resultToObjects(articlesResult);

    if (articles.length === 0) {
      return res.json({ nodes: [], edges: [] });
    }

    const graph = buildGraphFromArticles(articles);
    res.json(graph);
  } catch (err: any) {
    log.error('Graph topic failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to build graph' });
  }
});
