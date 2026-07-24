import * as stringSimilarity from 'string-similarity';
import { getDb, createCluster, assignArticleToCluster, getUnclusteredArticles } from './db';
import { resultToObjects } from './utils';
import { createLogger } from './logger';

const log = createLogger({ module: 'clustering' });

const SIMILARITY_THRESHOLD = 0.55;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(title: string): string {
  return normalizeTitle(title)
    .split(' ')
    .filter(w => w.length > 3)
    .join(' ');
}

export async function clusterArticles() {
  const db = await getDb();
  const unclustered = getUnclusteredArticles();

  if (unclustered.length === 0) {
    log.debug('No unclustered articles');
    return 0;
  }

  log.info('Clustering articles', { count: unclustered.length });

  const clusterResult = db.exec(`
    SELECT c.id, c.topic_label, a.title
    FROM clusters c
    JOIN articles a ON a.cluster_id = c.id
    ORDER BY a.published_at DESC
    LIMIT 500
  `);
  const existingClusters = resultToObjects(clusterResult);

  const clusterTitles: { [key: number]: string[] } = {};
  for (const row of existingClusters) {
    if (!clusterTitles[row.id]) clusterTitles[row.id] = [];
    clusterTitles[row.id].push(row.title);
  }

  let clustered = 0;

  for (const article of unclustered) {
    const normTitle = getWords(article.title);
    if (normTitle.length < 5) continue;

    let bestClusterId: number | null = null;
    let bestSimilarity = 0;

    for (const [clusterId, titles] of Object.entries(clusterTitles)) {
      for (const existingTitle of titles) {
        const normExisting = getWords(existingTitle);
        const similarity = stringSimilarity.compareTwoStrings(normTitle, normExisting);

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestClusterId = parseInt(clusterId);
        }
      }
    }

    if (bestClusterId && bestSimilarity >= SIMILARITY_THRESHOLD) {
      assignArticleToCluster(article.id, bestClusterId);
      clusterTitles[bestClusterId].push(article.title);
      clustered++;
    } else {
      const newClusterId = createCluster(article.title.slice(0, 100));
      assignArticleToCluster(article.id, newClusterId);
      clusterTitles[newClusterId] = [article.title];
      clustered++;
    }
  }

  log.info('Clustering complete', { clustered });
  return clustered;
}

export async function buildStoryNodes() {
  const db = await getDb();
  const clusterResult = db.exec(`
    SELECT c.id, c.topic_label, c.created_at,
           COUNT(a.id) as article_count
    FROM clusters c
    LEFT JOIN articles a ON a.cluster_id = c.id
    GROUP BY c.id
    HAVING article_count > 0
    ORDER BY article_count DESC, c.created_at DESC
  `);
  const clusters = resultToObjects(clusterResult);

  const biasColumns = ['left', 'lean-left', 'center', 'lean-right', 'right'] as const;

  return clusters.map((cluster: any) => {
    const articlesResult = db.exec(`
      SELECT a.*, s.bias, s.name as source_name, s.credibility_score
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.cluster_id = ?
      ORDER BY s.credibility_score DESC
    `, [cluster.id]);
    const articles = resultToObjects(articlesResult);

    const byBias: Record<string, any[]> = {};
    for (const b of biasColumns) byBias[b] = [];
    for (const article of articles) {
      if (byBias[article.bias]) byBias[article.bias].push(article);
    }

    const blindspot = biasColumns.filter(b => byBias[b].length === 0);

    return {
      id: cluster.id,
      topicLabel: cluster.topic_label,
      articles: byBias,
      blindspot,
      totalArticles: articles.length,
      createdAt: cluster.created_at,
    };
  });
}
