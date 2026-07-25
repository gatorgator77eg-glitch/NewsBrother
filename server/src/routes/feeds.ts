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
  insertSource({
    id,
    name,
    url,
    rss_url,
    bias,
    credibility_score: credibility_score ?? 0.5,
    tags: tags || [],
  });
  res.json({ ok: true, source: getSourceById(id) });
});

feedsRoutes.put('/feeds/:id', async (req, res) => {
  const existing = getSourceById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Source not found' });
  const { name, url, rss_url, bias, credibility_score, tags } = req.body;
  updateSource(req.params.id, { name, url, rss_url, bias, credibility_score, tags });
  res.json({ ok: true, source: getSourceById(req.params.id) });
});

feedsRoutes.delete('/feeds/:id', async (req, res) => {
  const existing = getSourceById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Source not found' });
  deleteSource(req.params.id);
  res.json({ ok: true });
});
