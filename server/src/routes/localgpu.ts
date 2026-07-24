import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getGpuStatus, chatCompletion, ChatMessage } from '../localgpu/ollama';
import { getConfig, setConfig, setConfigBatch } from '../localgpu/config';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const log = createLogger({ module: 'localgpu' });
export const localgpuRoutes = Router();

const PYTHON_DIR = path.join(__dirname, '..', 'localgpu', 'python');
const NEWS_DB = path.join(__dirname, '..', '..', 'data', 'news.db');
const STOCKS_DB = path.join(__dirname, '..', '..', 'data', 'stocks.db');

// Track active jobs
interface JobStatus {
  id: string;
  type: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  completedAt?: string;
  progress?: number;
  result?: any;
  error?: string;
  logs: string[];
}
const activeJobs: Map<string, JobStatus> = new Map();

function runPython(script: string, args: string[], jobId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const job = activeJobs.get(jobId);
    const config = { env: { ...process.env } };

    const pyPath = process.env.PYTHON_PATH || 'python3';
    const proc = spawn(pyPath, [path.join(PYTHON_DIR, script), ...args], config);

    let buffer = '';
    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (job) {
            job.logs.push(line);
            if (parsed.status === 'processing') {
              job.progress = parsed.total ? Math.round((parsed.processed / parsed.total) * 100) : 0;
            }
            if (parsed.status === 'done') {
              job.result = parsed;
              job.status = 'done';
              job.completedAt = new Date().toISOString();
              job.progress = 100;
            }
            if (parsed.status === 'error') {
              job.error = parsed.error;
              job.status = 'error';
              job.completedAt = new Date().toISOString();
            }
          }
        } catch { /* non-JSON output, ignore */ }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && job) job.logs.push(`stderr: ${msg}`);
    });

    proc.on('close', (code) => {
      if (job && job.status === 'running') {
        job.status = code === 0 ? 'done' : 'error';
        job.completedAt = new Date().toISOString();
        if (code !== 0 && !job.error) job.error = `Process exited with code ${code}`;
      }
      resolve(job?.result || null);
    });

    proc.on('error', (err) => {
      if (job) {
        job.status = 'error';
        job.error = err.message;
        job.completedAt = new Date().toISOString();
      }
      reject(err);
    });
  });
}

// ═══════════════════════════════════════════
// 1. GPU Monitor — Status
// ═══════════════════════════════════════════
localgpuRoutes.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getGpuStatus();
    const jobs = Array.from(activeJobs.values()).filter(j => j.status === 'running');
    res.json({ ...status, activeJobs: jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// 2. LLM Chat
// ═══════════════════════════════════════════
localgpuRoutes.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model } = req.body as { messages: ChatMessage[]; model?: string };
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const config = await getConfig();
    const mdl = model || config.ollama_model;

    // Check if streaming requested
    if (req.query.stream === 'true') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const result = await chatCompletion(messages, mdl, (chunk) => {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true, fullResponse: result })}\n\n`);
      res.end();
    } else {
      const result = await chatCompletion(messages, mdl);
      res.json({ response: result, model: mdl });
    }
  } catch (err: any) {
    log.error('Chat error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// 3. Sentiment Engine
// ═══════════════════════════════════════════
localgpuRoutes.post('/sentiment/run', async (req: Request, res: Response) => {
  try {
    const config = await getConfig();
    const batchSize = parseInt(req.body?.batchSize || config.sentiment_batch_size);
    const limit = parseInt(req.body?.limit || '0');
    const jobId = `sentiment-${Date.now()}`;

    const job: JobStatus = {
      id: jobId,
      type: 'sentiment',
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [],
    };
    activeJobs.set(jobId, job);

    runPython('sentiment_engine.py', [NEWS_DB, '--batch-size', String(batchSize), '--limit', String(limit)], jobId)
      .catch(err => {
        job.status = 'error';
        job.error = err.message;
        job.completedAt = new Date().toISOString();
      });

    res.json({ jobId, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

localgpuRoutes.get('/sentiment/status', async (req: Request, res: Response) => {
  const jobId = req.query.jobId as string;
  if (!jobId) {
    // Return all sentiment jobs
    const jobs = Array.from(activeJobs.values()).filter(j => j.type === 'sentiment').slice(-10);
    return res.json({ jobs });
  }
  const job = activeJobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ═══════════════════════════════════════════
// 4. Vector Clustering
// ═══════════════════════════════════════════
localgpuRoutes.post('/vectors/embed', async (req: Request, res: Response) => {
  try {
    const config = await getConfig();
    const clusters = parseInt(req.body?.clusters || '10');
    const limit = parseInt(req.body?.limit || '0');
    const jobId = `vectors-${Date.now()}`;

    const job: JobStatus = {
      id: jobId,
      type: 'vectors',
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [],
    };
    activeJobs.set(jobId, job);

    runPython('vector_engine.py', [NEWS_DB, '--clusters', String(clusters), '--limit', String(limit)], jobId)
      .catch(err => {
        job.status = 'error';
        job.error = err.message;
        job.completedAt = new Date().toISOString();
      });

    res.json({ jobId, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

localgpuRoutes.get('/vectors/clusters', async (_req: Request, res: Response) => {
  try {
    const { getNewsArchiveDb } = require('../newsArchive/db');
    const db = await getNewsArchiveDb();

    const result = db.exec(`
      SELECT tc.id, tc.label, tc.article_count, tc.created_at
      FROM topic_clusters tc
      ORDER BY tc.article_count DESC
    `);

    const clusters = (result[0]?.values || []).map((r: any[]) => ({
      id: r[0],
      label: r[1],
      articleCount: r[2],
      createdAt: r[3],
    }));

    // Get articles per cluster
    for (const cluster of clusters.slice(0, 5)) {
      const articles = db.exec(`
        SELECT na.id, na.title, na.domain, na.source_country
        FROM cluster_assignments ca
        JOIN news_archive na ON ca.article_id = na.id
        WHERE ca.cluster_id = ?
        LIMIT 5
      `, [cluster.id]);
      cluster.articles = (articles[0]?.values || []).map((r: any[]) => ({
        id: r[0], title: r[1], domain: r[2], country: r[3],
      }));
    }

    res.json({ clusters });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

localgpuRoutes.get('/vectors/status', async (req: Request, res: Response) => {
  const jobId = req.query.jobId as string;
  if (!jobId) {
    const jobs = Array.from(activeJobs.values()).filter(j => j.type === 'vectors').slice(-5);
    return res.json({ jobs });
  }
  const job = activeJobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ═══════════════════════════════════════════
// 5. GPU Analytics
// ═══════════════════════════════════════════
localgpuRoutes.post('/analytics/run', async (req: Request, res: Response) => {
  try {
    const config = await getConfig();
    const window = parseInt(req.body?.window || config.analytics_window_days);
    const gpu = config.gpu_enabled === 'true' ? 'true' : 'false';
    const tickers = req.body?.tickers || '';
    const jobId = `analytics-${Date.now()}`;

    const job: JobStatus = {
      id: jobId,
      type: 'analytics',
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [],
    };
    activeJobs.set(jobId, job);

    const args = [STOCKS_DB, '--window', String(window), '--gpu', gpu];
    if (tickers) args.push('--tickers', tickers);

    runPython('analytics_engine.py', args, jobId)
      .catch(err => {
        job.status = 'error';
        job.error = err.message;
        job.completedAt = new Date().toISOString();
      });

    res.json({ jobId, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

localgpuRoutes.get('/analytics/results', async (_req: Request, res: Response) => {
  try {
    const { getStockDb } = require('../stocks/db');
    const db = await getStockDb();

    const result = db.exec(`
      SELECT key, value FROM stock_meta WHERE key LIKE 'gpu_analysis:%' ORDER BY key LIMIT 100
    `);

    const results = (result[0]?.values || []).map((r: any[]) => {
      try {
        return JSON.parse(r[1] as string);
      } catch {
        return null;
      }
    }).filter(Boolean);

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

localgpuRoutes.get('/analytics/status', async (req: Request, res: Response) => {
  const jobId = req.query.jobId as string;
  if (!jobId) {
    const jobs = Array.from(activeJobs.values()).filter(j => j.type === 'analytics').slice(-5);
    return res.json({ jobs });
  }
  const job = activeJobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ═══════════════════════════════════════════
// 6. GPU Settings
// ═══════════════════════════════════════════
localgpuRoutes.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await getConfig();
    res.json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

localgpuRoutes.post('/config', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, string>;
    await setConfigBatch(updates);
    const config = await getConfig();
    res.json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
