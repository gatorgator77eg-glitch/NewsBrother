import { Router } from 'express';
import {
  getStockDb,
  getTickerList,
  getTickerHistory,
  getTickerInfo,
  getDownloadStatus,
  getExchanges,
  getSectors,
  getStockStats,
} from '../stocks/db';
import { runFullDownload, isDownloading, abortDownload } from '../stocks/downloader';

export const stocksRoutes = Router();

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
  runFullDownload().catch(err => console.error('Download failed:', err));
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
