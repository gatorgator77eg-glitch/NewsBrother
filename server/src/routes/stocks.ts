import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import {
  getStockDb,
  getTickerList,
  getTickerHistory,
  getTickerInfo,
  getDownloadStatus,
  getExchanges,
  getSectors,
  getStockStats,
  setMeta,
} from '../stocks/db';
import { runFullDownload, runSmartUpdate, isDownloading, abortDownload } from '../stocks/downloader';
import { createLogger } from '../logger';

const log = createLogger({ module: 'stocks-route' });
export const stocksRoutes = Router();

let batchProcess: ReturnType<typeof spawn> | null = null;

function isBatchRunning() {
  return batchProcess !== null && !batchProcess.killed;
}

stocksRoutes.get('/stocks/search', async (req, res) => {
  try {
    await getStockDb();
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 1) return res.json({ results: [] });
    const result = getTickerList(q, undefined, 1, 10);
    res.json({ results: result.tickers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

stocksRoutes.get('/stocks', async (req, res) => {
  try {
    await getStockDb();
    const search = req.query.search as string | undefined;
    const exchange = req.query.exchange as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const result = getTickerList(search, exchange, page, limit);
    const download = getDownloadStatus();
    const stats = getStockStats();

    res.json({ ...result, download, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

stocksRoutes.get('/stocks/exchanges', async (_req, res) => {
  try {
    await getStockDb();
    res.json({ exchanges: getExchanges() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

stocksRoutes.get('/stocks/sectors', async (_req, res) => {
  try {
    await getStockDb();
    res.json({ sectors: getSectors() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

stocksRoutes.get('/stocks/stats', async (_req, res) => {
  try {
    await getStockDb();
    res.json(getStockStats());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

stocksRoutes.get('/stocks/download/status', async (_req, res) => {
  try {
    await getStockDb();
    res.json(getDownloadStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

stocksRoutes.post('/stocks/download', async (_req, res) => {
  if (isDownloading()) {
    res.status(409).json({ error: 'Download already in progress' });
    return;
  }
  res.json({ message: 'Download started' });
  runFullDownload().catch(err => log.error('Download failed', { error: err.message, stack: err.stack }));
});

stocksRoutes.post('/stocks/update', async (_req, res) => {
  if (isDownloading() || isBatchRunning()) {
    res.status(409).json({ error: 'Download already in progress' });
    return;
  }
  res.json({ message: 'Smart update started' });
  runSmartUpdate().catch(err => log.error('Update failed', { error: err.message, stack: err.stack }));
});

stocksRoutes.post('/stocks/batch-download', async (req, res) => {
  if (isBatchRunning() || isDownloading()) {
    res.status(409).json({ error: 'Download already in progress' });
    return;
  }

  const mode = (req.body?.mode as string) || 'missing';
  const tickers = (req.body?.tickers as string) || '';

  const args = [path.join(__dirname, '..', '..', 'src', 'stocks', 'batch_download.py')];
  if (mode === 'all') args.push('--all');
  else if (mode === 'update') args.push('--update');
  else if (tickers) args.push('--tickers', tickers);

  await getStockDb();
  setMeta('status', 'batch_starting');

  const python = spawn('python', args, {
    cwd: path.join(__dirname, '..', '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  batchProcess = python;

  python.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) log.info(`[batch] ${line}`);
  });
  python.stderr?.on('data', (data: Buffer) => {
    log.error(`[batch-err] ${data.toString().trim()}`);
  });
  python.on('close', (code) => {
    batchProcess = null;
    log.info(`Batch download finished`, { exitCode: code });
  });

  res.json({ message: 'Batch download started', mode });
});

stocksRoutes.post('/stocks/batch-download/abort', (_req, res) => {
  if (isBatchRunning() && batchProcess) {
    batchProcess.kill('SIGTERM');
    batchProcess = null;
    setMeta('status', 'paused');
    res.json({ message: 'Batch download aborted' });
  } else {
    res.status(404).json({ error: 'No batch download in progress' });
  }
});

stocksRoutes.post('/stocks/download/abort', (_req, res) => {
  if (isDownloading()) {
    abortDownload();
    res.json({ message: 'Abort signal sent' });
  } else {
    res.status(404).json({ error: 'No download in progress' });
  }
});

stocksRoutes.get('/stocks/:symbol', async (req, res) => {
  try {
    await getStockDb();
    const symbol = req.params.symbol.toUpperCase();
    const info = getTickerInfo(symbol);
    if (!info) {
      res.status(404).json({ error: `Ticker "${symbol}" not found` });
      return;
    }
    const history = getTickerHistory(symbol);
    res.json({ ...info, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
