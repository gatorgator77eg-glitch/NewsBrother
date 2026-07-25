import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getDb } from '../db';
import crypto from 'crypto';

const log = createLogger({ module: 'llm-config' });
export const llmConfigRoutes = Router();

function ensureTable() {
  return `CREATE TABLE IF NOT EXISTS llm_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'openai',
    url TEXT NOT NULL,
    api_key TEXT DEFAULT '',
    model TEXT NOT NULL,
    max_tokens INTEGER DEFAULT 4096,
    temperature REAL DEFAULT 0.7,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`;
}

function rowToConfig(r: any[]) {
  return {
    id: r[0], name: r[1], provider: r[2], url: r[3],
    apiKey: r[4] ? '••••' + r[4].slice(-4) : '',
    apiKeySet: !!r[4],
    model: r[5], maxTokens: r[6], temperature: r[7],
    isDefault: !!r[8], createdAt: r[9], updatedAt: r[10],
  };
}

function getRawApiKey(id: string, db: any): string | null {
  const r = db.exec('SELECT api_key FROM llm_configs WHERE id = ?', [id]);
  return r[0]?.values[0]?.[0] as string ?? null;
}

// List all configs
llmConfigRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    db.run(ensureTable());
    const result = db.exec('SELECT * FROM llm_configs ORDER BY is_default DESC, name ASC');
    const configs = (result[0]?.values || []).map(rowToConfig);
    res.json({ configs });
  } catch (err: any) {
    log.error('Failed to list LLM configs', { error: err.message });
    res.status(500).json({ error: 'Failed to list configs' });
  }
});

// Create config
llmConfigRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const { name, provider = 'openai', url, apiKey = '', model, maxTokens = 4096, temperature = 0.7 } = req.body;
    if (!name || !url || !model) {
      return res.status(400).json({ error: 'name, url, and model are required' });
    }

    const db = await getDb();
    db.run(ensureTable());

    const id = crypto.randomUUID();
    const hasDefault = db.exec('SELECT COUNT(*) FROM llm_configs WHERE is_default = 1');
    const isDefault = (hasDefault[0]?.values[0]?.[0] as number) === 0 ? 1 : 0;

    db.run(
      `INSERT INTO llm_configs (id, name, provider, url, api_key, model, max_tokens, temperature, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, provider, url, apiKey, model, maxTokens, temperature, isDefault]
    );

    const result = db.exec('SELECT * FROM llm_configs WHERE id = ?', [id]);
    const config = rowToConfig(result[0].values[0]);
    log.info('Created LLM config', { id, name, provider, model });
    res.json(config);
  } catch (err: any) {
    log.error('Failed to create LLM config', { error: err.message });
    res.status(500).json({ error: 'Failed to create config' });
  }
});

// Update config
llmConfigRoutes.put('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    db.run(ensureTable());
    const { id } = req.params;
    const { name, provider, url, apiKey, model, maxTokens, temperature, isDefault } = req.body;

    const existing = db.exec('SELECT id FROM llm_configs WHERE id = ?', [id]);
    if (!existing[0]?.values[0]) return res.status(404).json({ error: 'Config not found' });

    if (isDefault) {
      db.run('UPDATE llm_configs SET is_default = 0');
    }

    const updates: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (provider !== undefined) { updates.push('provider = ?'); params.push(provider); }
    if (url !== undefined) { updates.push('url = ?'); params.push(url); }
    if (apiKey !== undefined && apiKey !== '') { updates.push('api_key = ?'); params.push(apiKey); }
    if (model !== undefined) { updates.push('model = ?'); params.push(model); }
    if (maxTokens !== undefined) { updates.push('max_tokens = ?'); params.push(maxTokens); }
    if (temperature !== undefined) { updates.push('temperature = ?'); params.push(temperature); }
    if (isDefault !== undefined) { updates.push('is_default = ?'); params.push(isDefault ? 1 : 0); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(id);
      db.run(`UPDATE llm_configs SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const result = db.exec('SELECT * FROM llm_configs WHERE id = ?', [id]);
    const config = rowToConfig(result[0].values[0]);
    log.info('Updated LLM config', { id });
    res.json(config);
  } catch (err: any) {
    log.error('Failed to update LLM config', { error: err.message });
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Delete config
llmConfigRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    db.run(ensureTable());
    const { id } = req.params;
    db.run('DELETE FROM llm_configs WHERE id = ?', [id]);
    log.info('Deleted LLM config', { id });
    res.json({ ok: true });
  } catch (err: any) {
    log.error('Failed to delete LLM config', { error: err.message });
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

// Test config
llmConfigRoutes.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    db.run(ensureTable());
    const { id } = req.params;
    const result = db.exec('SELECT * FROM llm_configs WHERE id = ?', [id]);
    if (!result[0]?.values[0]) return res.status(404).json({ error: 'Config not found' });

    const r = result[0].values[0];
    const provider = r[2] as string;
    const url = r[3] as string;
    const apiKey = r[4] as string;
    const model = r[5] as string;

    const testPrompt = 'Say "Connection successful" in exactly 3 words or fewer.';
    const startTime = Date.now();

    let testResult: { ok: boolean; response: string; latencyMs: number; error?: string };

    try {
      if (provider === 'ollama') {
        const ollamaUrl = url.replace(/\/api\/chat\/?$/, '').replace(/\/$/, '');
        const resp = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: testPrompt }],
            stream: false,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await resp.json() as any;
        testResult = {
          ok: resp.ok,
          response: data.message?.content || JSON.stringify(data).slice(0, 200),
          latencyMs: Date.now() - startTime,
        };
      } else {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const body: any = {
          model,
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 50,
        };

        const resp = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
        const data = await resp.json() as any;
        testResult = {
          ok: resp.ok,
          response: data.choices?.[0]?.message?.content || data.error?.message || JSON.stringify(data).slice(0, 200),
          latencyMs: Date.now() - startTime,
        };
      }
    } catch (fetchErr: any) {
      testResult = {
        ok: false,
        response: '',
        latencyMs: Date.now() - startTime,
        error: fetchErr.name === 'TimeoutError' ? 'Connection timed out (15s)' : fetchErr.message,
      };
    }

    res.json(testResult);
  } catch (err: any) {
    log.error('Failed to test LLM config', { error: err.message });
    res.status(500).json({ error: 'Failed to test config' });
  }
});

// Bulk import configs
llmConfigRoutes.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { configs } = req.body;
    if (!Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: 'configs array is required' });
    }
    const db = await getDb();
    db.run(ensureTable());
    let imported = 0;
    const hasDefault = db.exec('SELECT COUNT(*) FROM llm_configs WHERE is_default = 1');
    let needsDefault = (hasDefault[0]?.values[0]?.[0] as number) === 0;
    for (const c of configs) {
      if (!c.name || !c.url || !c.model) continue;
      const id = crypto.randomUUID();
      const isDef = needsDefault ? 1 : 0;
      if (needsDefault) needsDefault = false;
      db.run(
        `INSERT INTO llm_configs (id, name, provider, url, api_key, model, max_tokens, temperature, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, c.name, c.provider || 'openai', c.url, c.apiKey || '', c.model, c.maxTokens || 4096, c.temperature ?? 0.7, isDef]
      );
      imported++;
    }
    log.info('Bulk imported LLM configs', { count: imported });
    res.json({ ok: true, imported, total: configs.length });
  } catch (err: any) {
    log.error('Failed to bulk import LLM configs', { error: err.message });
    res.status(500).json({ error: 'Failed to import configs' });
  }
});

// Get default config (for other features to use)
llmConfigRoutes.get('/default', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    db.run(ensureTable());
    const result = db.exec('SELECT * FROM llm_configs WHERE is_default = 1 LIMIT 1');
    if (!result[0]?.values[0]) return res.json({ config: null });
    const config = rowToConfig(result[0].values[0]);
    const rawKey = getRawApiKey(config.id, db);
    res.json({ config: { ...config, apiKey: rawKey || '' } });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get default config' });
  }
});
