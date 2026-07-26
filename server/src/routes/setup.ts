import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { createLogger } from '../logger';
import path from 'path';
import { spawn } from 'child_process';

const log = createLogger({ module: 'setup' });
export const setupRoutes = Router();

interface SetupStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
}

interface SetupState {
  running: boolean;
  steps: SetupStep[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

const STEPS: SetupStep[] = [
  { id: 'feeds', label: 'Seed RSS feeds (100 sources)', status: 'pending' },
  { id: 'rss', label: 'Fetch RSS articles', status: 'pending' },
  { id: 'gdelt', label: 'Download news archive (GDELT, last 90 days)', status: 'pending' },
  { id: 'tickers', label: 'Import stock tickers from library', status: 'pending' },
  { id: 'stocks', label: 'Download stock prices (smart update)', status: 'pending' },
  { id: 'srs', label: 'Scrape SRS fund catalog', status: 'pending' },
  { id: 'macro', label: 'Refresh macro data (T-Bill, SORA)', status: 'pending' },
  { id: 'llm', label: 'Verify LLM configuration', status: 'pending' },
];

let state: SetupState = { running: false, steps: [] };

function setStep(id: string, status: SetupStep['status'], detail?: string) {
  const step = state.steps.find(s => s.id === id);
  if (!step) return;
  step.status = status;
  step.detail = detail;
  if (status === 'running') step.startedAt = new Date().toISOString();
  if (status === 'done' || status === 'error' || status === 'skipped') step.finishedAt = new Date().toISOString();
  log.info(`Setup step: ${id} → ${status}`, { detail });
}

async function runStep(id: string, fn: () => Promise<string | void>): Promise<boolean> {
  setStep(id, 'running');
  try {
    const detail = await fn();
    setStep(id, 'done', detail || 'Complete');
    return true;
  } catch (err: any) {
    setStep(id, 'error', err.message);
    log.error(`Setup step ${id} failed`, { error: err.message });
    return false;
  }
}

async function runInitialization() {
  state = {
    running: true,
    steps: STEPS.map(s => ({ ...s, status: 'pending' as const })),
    startedAt: new Date().toISOString(),
  };

  // Step 1: Seed RSS feeds
  await runStep('feeds', async () => {
    const { ingestAll } = await import('../ingestor');
    const db = await getDb();
    const result = db.exec('SELECT COUNT(*) FROM sources');
    const count = result[0]?.values[0]?.[0] || 0;
    if (count === 0) {
      await ingestAll();
      const after = db.exec('SELECT COUNT(*) FROM sources');
      return `Seeded ${after[0]?.values[0]?.[0] || 0} feeds`;
    }
    return `${count} feeds already configured`;
  });

  // Step 2: Fetch RSS articles
  await runStep('rss', async () => {
    const { ingestAll } = await import('../ingestor');
    const { clusterArticles } = await import('../clustering');
    await ingestAll();
    await clusterArticles();
    const db = await getDb();
    const result = db.exec('SELECT COUNT(*) FROM articles');
    return `${result[0]?.values[0]?.[0] || 0} articles in database`;
  });

  // Step 3: GDELT archive
  await runStep('gdelt', async () => {
    const { startArchiveDownload } = await import('../newsArchive/downloader');
    const { getDownloadStatus } = await import('../newsArchive/db');
    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const status = getDownloadStatus();
    if (status.status === 'running') return 'Download already in progress — skipping';

    const result = await startArchiveDownload(startDate, endDate);
    if (!result.ok) return `Skipped: ${result.error}`;

    // Poll until done
    await new Promise<void>((resolve) => {
      const check = () => {
        const s = getDownloadStatus();
        if (s.status !== 'running') {
          resolve();
        } else {
          setTimeout(check, 3000);
        }
      };
      setTimeout(check, 3000);
    });

    const db = await getDb();
    const r = db.exec('SELECT COUNT(*) FROM news_archive');
    return `${r[0]?.values[0]?.[0] || 0} archived articles`;
  });

  // Step 4: Import stock tickers
  await runStep('tickers', async () => {
    const { getStockDb } = await import('../stocks/db');
    await getStockDb();
    const fs = await import('fs');
    const tickerFile = path.join(__dirname, '..', '..', 'src', 'stocks', 'tickers_world_stock.txt');
    if (!fs.existsSync(tickerFile)) return 'Ticker file not found — skipping';

    const content = fs.readFileSync(tickerFile, 'utf-8');
    const symbols = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    return `${symbols.length} tickers available in library`;
  });

  // Step 5: Download stock prices
  await runStep('stocks', async () => {
    const { getStockDb, getDownloadStatus } = await import('../stocks/db');
    const { isDownloading } = await import('../stocks/downloader');
    await getStockDb();

    if (isDownloading()) return 'Stock download already running — skipping';

    const { runSmartUpdate } = await import('../stocks/downloader');
    runSmartUpdate().catch(err => log.error('Smart update failed', { error: err.message }));

    // Wait for it to finish
    await new Promise<void>((resolve) => {
      const check = () => {
        if (!isDownloading()) {
          resolve();
        } else {
          setTimeout(check, 5000);
        }
      };
      setTimeout(check, 2000);
    });

    const db = await getStockDb();
    const r = db.exec('SELECT COUNT(DISTINCT symbol) FROM stock_prices');
    return `${r[0]?.values[0]?.[0] || 0} tickers with price data`;
  });

  // Step 6: SRS fund scrape
  await runStep('srs', async () => {
    try {
      const { scrapeSrsFunds } = await import('../scrapers/srsScraper');
      const srsMod = await import('../routes/srs');
      const funds = await scrapeSrsFunds();
      if (funds.length === 0) return 'Scraper returned 0 funds — page may have changed';
      return `${funds.length} SRS funds scraped`;
    } catch (err: any) {
      return `SRS scrape failed: ${err.message}`;
    }
  });

  // Step 7: Macro data
  await runStep('macro', async () => {
    try {
      const db = await getDb();
      const { refreshMacroData } = await import('../scrapers/macroData');
      const result = await refreshMacroData(db);
      return `${result.scraped} rates scraped, ${result.total} total`;
    } catch (err: any) {
      return `Macro refresh failed: ${err.message}`;
    }
  });

  // Step 8: LLM config
  await runStep('llm', async () => {
    const { seedLlmDefaults } = await import('../routes/llmConfig');
    const db = await getDb();
    seedLlmDefaults(db);
    return 'LLM defaults verified';
  });

  state.running = false;
  state.finishedAt = new Date().toISOString();
  log.info('Initialization complete', {
    done: state.steps.filter(s => s.status === 'done').length,
    errors: state.steps.filter(s => s.status === 'error').length,
  });
}

// POST /api/setup/initialize — start initialization
setupRoutes.post('/setup/initialize', async (_req: Request, res: Response) => {
  if (state.running) {
    res.status(409).json({ error: 'Initialization already in progress', state });
    return;
  }
  res.json({ ok: true, message: 'Initialization started' });
  runInitialization().catch(err => {
    log.error('Initialization failed', { error: err.message });
    state.running = false;
    state.error = err.message;
    state.finishedAt = new Date().toISOString();
  });
});

// GET /api/setup/status — current progress
setupRoutes.get('/setup/status', (_req: Request, res: Response) => {
  res.json(state);
});

// POST /api/setup/reset — reset state
setupRoutes.post('/setup/reset', (_req: Request, res: Response) => {
  if (state.running) {
    res.status(409).json({ error: 'Cannot reset while running' });
    return;
  }
  state = { running: false, steps: [] };
  res.json({ ok: true });
});
