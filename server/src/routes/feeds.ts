import { Router } from 'express';
import { getAllSources, getSourceById, insertSource, deleteSource, updateSource } from '../db';

export const feedsRoutes = Router();

feedsRoutes.get('/feeds', async (_req, res) => {
  const sources = await getAllSources();
  res.json(sources);
});

feedsRoutes.post('/feeds', async (req, res) => {
  const { id, name, url, rss_url, bias, credibility_score, tags } = req.body;
  if (!id || !name || !url || !rss_url || !bias) {
    return res.status(400).json({ error: 'id, name, url, rss_url, and bias are required' });
  }
  if (getSourceById(id)) {
    return res.status(409).json({ error: 'A source with this ID already exists' });
  }
  const BIAS_ALIASES: Record<string, string> = {
    'center-left': 'lean-left', 'centre-left': 'lean-left',
    'center-right': 'lean-right', 'centre-right': 'lean-right',
  };
  let parsedTags: string[] = [];
  if (Array.isArray(tags)) parsedTags = tags;
  else if (typeof tags === 'string') { try { parsedTags = JSON.parse(tags); } catch { parsedTags = []; } }

  insertSource({
    id,
    name,
    url,
    rss_url,
    bias: BIAS_ALIASES[bias] || bias,
    credibility_score: credibility_score ?? 0.5,
    tags: parsedTags,
  });
  res.json({ ok: true, source: getSourceById(id) });
});

feedsRoutes.put('/feeds/:id', async (req, res) => {
  const existing = getSourceById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Source not found' });
  const { name, url, rss_url, bias, credibility_score, tags } = req.body;
  const BIAS_ALIASES: Record<string, string> = {
    'center-left': 'lean-left', 'centre-left': 'lean-left',
    'center-right': 'lean-right', 'centre-right': 'lean-right',
  };
  let parsedTags: string[] | undefined;
  if (tags !== undefined) {
    if (Array.isArray(tags)) parsedTags = tags;
    else if (typeof tags === 'string') { try { parsedTags = JSON.parse(tags); } catch { parsedTags = []; } }
  }
  updateSource(req.params.id, {
    name, url, rss_url,
    bias: bias ? (BIAS_ALIASES[bias] || bias) : undefined,
    credibility_score,
    tags: parsedTags,
  });
  res.json({ ok: true, source: getSourceById(req.params.id) });
});

feedsRoutes.delete('/feeds/:id', async (req, res) => {
  const existing = getSourceById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Source not found' });
  deleteSource(req.params.id);
  res.json({ ok: true });
});

feedsRoutes.post('/feeds/bulk', async (req, res) => {
  const { feeds, mode = 'upsert' } = req.body;
  if (!Array.isArray(feeds) || feeds.length === 0) {
    return res.status(400).json({ error: 'feeds array is required' });
  }

  const BIAS_ALIASES: Record<string, string> = {
    'center-left': 'lean-left',
    'centre-left': 'lean-left',
    'center-right': 'lean-right',
    'centre-right': 'lean-right',
    'far-left': 'left',
    'far-right': 'right',
  };

  let imported = 0;
  let skipped = 0;
  for (const f of feeds) {
    if (!f.id || !f.name || !f.url || !f.rss_url || !f.bias) { skipped++; continue; }
    const existing = getSourceById(f.id);
    if (existing && mode === 'skip') { skipped++; continue; }

    const bias = BIAS_ALIASES[f.bias] || f.bias;
    let tags: string[] = [];
    if (Array.isArray(f.tags)) {
      tags = f.tags;
    } else if (typeof f.tags === 'string') {
      try { tags = JSON.parse(f.tags); } catch { tags = []; }
    }

    insertSource({
      id: f.id,
      name: f.name,
      url: f.url,
      rss_url: f.rss_url,
      bias,
      credibility_score: f.credibility_score ?? 0.5,
      tags,
    });
    imported++;
  }
  res.json({ ok: true, imported, skipped, total: feeds.length });
});
