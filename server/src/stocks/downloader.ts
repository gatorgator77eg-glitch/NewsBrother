import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import path from 'path';
import {
  getStockDb,
  upsertTicker,
  insertPrices,
  setMeta,
  getDownloadStatus,
  getAllLastPriceDates,
} from './db';

const yf = new YahooFinance({ validation: { logErrors: false }, suppressNotices: ['ripHistorical'] });
const DELAY_MS = 600;
const MAX_RETRIES = 3;
const TICKER_FILE = path.join(__dirname, '..', '..', '..', 'tickers_world_stock.txt');
const PROGRESS_FILE = path.join(__dirname, '..', '..', '..', 'data', 'stock-progress.json');

let downloadAbort: (() => void) | null = null;
let downloading = false;

export function isDownloading() {
  return downloading;
}

export function abortDownload() {
  if (downloadAbort) downloadAbort();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeProgress(data: any) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

function loadTickerSymbols(): string[] {
  if (!fs.existsSync(TICKER_FILE)) {
    console.error(`Ticker file not found: ${TICKER_FILE}`);
    return [];
  }
  const content = fs.readFileSync(TICKER_FILE, 'utf-8');
  const symbols = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => line.toUpperCase());
  const unique = [...new Set(symbols)];
  console.log(`Loaded ${unique.length} unique tickers from file`);
  return unique;
}

async function enrichTickerInfo(symbol: string): Promise<{
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: number;
}> {
  try {
    const quote = await yf.quote(symbol) as any;
    return {
      symbol,
      name: quote.shortName || quote.longName || symbol,
      exchange: quote.exchange || '',
      sector: quote.sector || '',
      industry: quote.industry || '',
      country: quote.country || '',
      market_cap: quote.marketCap || 0,
    };
  } catch {
    return { symbol, name: symbol, exchange: '', sector: '', industry: '', country: '', market_cap: 0 };
  }
}

async function downloadTickerHistory(
  symbol: string,
  retries = 0
): Promise<{ date: string; open: number; high: number; low: number; close: number; volume: number }[]> {
  try {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const now = new Date();

    const result = await yf.chart(symbol, {
      period1: tenYearsAgo,
      period2: now,
      interval: '1d',
    });

    const quotes = (result as any).quotes || [];
    return quotes
      .filter((r: any) => r.close != null)
      .map((r: any) => ({
        date: r.date.toISOString().split('T')[0],
        open: Math.round(r.open * 100) / 100,
        high: Math.round(r.high * 100) / 100,
        low: Math.round(r.low * 100) / 100,
        close: Math.round(r.close * 100) / 100,
        volume: r.volume || 0,
      }));
  } catch (err: any) {
    if (retries < MAX_RETRIES && (err.message?.includes('429') || err.message?.includes('Too Many'))) {
      await sleep(5000);
      return downloadTickerHistory(symbol, retries + 1);
    }
    throw err;
  }
}

export async function runFullDownload(): Promise<void> {
  if (downloading) {
    console.log('Download already in progress');
    return;
  }

  downloading = true;
  let aborted = false;
  downloadAbort = () => { aborted = true; };

  try {
    await getStockDb();
    setMeta('status', 'loading_tickers');
    setMeta('started_at', new Date().toISOString());
    setMeta('last_error', '');

    const symbols = loadTickerSymbols();
    if (symbols.length === 0) {
      setMeta('status', 'error');
      setMeta('last_error', 'No tickers found in file');
      downloading = false;
      return;
    }

    // Check which tickers already have price data
    setMeta('status', 'checking_existing');
    const db = await getStockDb();
    const existingResult = db.exec(`SELECT DISTINCT symbol FROM stock_prices`);
    const existingSymbols = new Set(
      existingResult[0]?.values.map((row: any[]) => row[0] as string) || []
    );

    const toDownload = symbols.filter(s => !existingSymbols.has(s));
    console.log(`${existingSymbols.size} already have prices, ${toDownload.length} remaining out of ${symbols.length}`);

    // Enrich ticker info for tickers that don't have it yet
    const tickersWithoutInfo = db.exec(`SELECT symbol FROM stock_tickers WHERE name = symbol OR name = ''`);
    const needEnrichment = new Set(
      tickersWithoutInfo[0]?.values.map((row: any[]) => row[0] as string) || []
    );

    // Also add all symbols that don't exist in stock_tickers at all
    const allTickerResult = db.exec(`SELECT symbol FROM stock_tickers`);
    const knownTickers = new Set(
      allTickerResult[0]?.values.map((row: any[]) => row[0] as string) || []
    );
    for (const s of symbols) {
      if (!knownTickers.has(s)) needEnrichment.add(s);
    }

    if (needEnrichment.size > 0) {
      console.log(`Enriching ${needEnrichment.size} tickers...`);
      setMeta('status', 'enriching_tickers');
      let enrichIdx = 0;
      for (const sym of needEnrichment) {
        if (aborted) break;
        const info = await enrichTickerInfo(sym);
        upsertTicker(info);
        enrichIdx++;
        if (enrichIdx % 100 === 0) {
          console.log(`  Enriched ${enrichIdx}/${needEnrichment.size}`);
          writeProgress({ phase: 'enriching', done: enrichIdx, total: needEnrichment.size });
        }
        await sleep(150);
      }
    }

    // Download price history
    setMeta('status', 'downloading_prices');
    setMeta('total_to_fetch', String(toDownload.length));
    let downloaded = 0;
    let errors = 0;
    let skipped = 0;
    const startTime = Date.now();

    for (const symbol of toDownload) {
      if (aborted) {
        setMeta('status', 'paused');
        break;
      }

      try {
        setMeta('current_ticker', symbol);
        setMeta('current_index', String(downloaded + skipped + 1));

        const prices = await downloadTickerHistory(symbol);
        if (prices.length > 0) {
          insertPrices(symbol, prices);
          downloaded++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        errors++;
        skipped++;
        await sleep(500);
      }

      const progress = downloaded + skipped;
      if (progress % 25 === 0 || progress === toDownload.length) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = progress / (elapsed || 1);
        const remaining = toDownload.length - progress;
        const etaSec = remaining / rate;
        const etaMin = Math.round(etaSec / 60);

        const msg = `[${progress}/${toDownload.length}] ${symbol} — ${downloaded} saved, ${errors} errors — ETA: ${etaMin}m`;
        console.log(msg);
        writeProgress({
          phase: 'downloading',
          current: symbol,
          done: progress,
          total: toDownload.length,
          saved: downloaded,
          errors,
          etaMin,
          elapsedMin: Math.round(elapsed / 60),
        });
        setMeta('current_index', String(progress));
      }

      await sleep(DELAY_MS);
    }

    if (!aborted) {
      setMeta('status', 'completed');
      setMeta('completed_at', new Date().toISOString());
      console.log(`Done! ${downloaded} saved, ${errors} errors, ${skipped} empty`);
      writeProgress({ phase: 'completed', saved: downloaded, errors, skipped });
    }
  } catch (err: any) {
    console.error('Fatal error:', err.message);
    setMeta('status', 'error');
    setMeta('last_error', err.message);
  } finally {
    downloading = false;
    downloadAbort = null;
  }
}

async function downloadRecentHistory(
  symbol: string,
  fromDate: string,
  retries = 0
): Promise<{ date: string; open: number; high: number; low: number; close: number; volume: number }[]> {
  try {
    const start = new Date(fromDate);
    start.setDate(start.getDate() + 1);
    const now = new Date();

    if (start >= now) return [];

    const result = await yf.chart(symbol, {
      period1: start,
      period2: now,
      interval: '1d',
    });

    const quotes = (result as any).quotes || [];
    return quotes
      .filter((r: any) => r.close != null)
      .map((r: any) => ({
        date: r.date.toISOString().split('T')[0],
        open: Math.round(r.open * 100) / 100,
        high: Math.round(r.high * 100) / 100,
        low: Math.round(r.low * 100) / 100,
        close: Math.round(r.close * 100) / 100,
        volume: r.volume || 0,
      }));
  } catch (err: any) {
    if (retries < MAX_RETRIES && (err.message?.includes('429') || err.message?.includes('Too Many'))) {
      await sleep(5000);
      return downloadRecentHistory(symbol, fromDate, retries + 1);
    }
    throw err;
  }
}

export async function runSmartUpdate(): Promise<void> {
  if (downloading) {
    console.log('Download already in progress');
    return;
  }

  downloading = true;
  let aborted = false;
  downloadAbort = () => { aborted = true; };

  try {
    await getStockDb();
    setMeta('status', 'loading_tickers');
    setMeta('started_at', new Date().toISOString());
    setMeta('last_error', '');
    setMeta('update_mode', 'smart');

    const symbols = loadTickerSymbols();
    if (symbols.length === 0) {
      setMeta('status', 'error');
      setMeta('last_error', 'No tickers found in file');
      downloading = false;
      return;
    }

    // Get last price dates for all symbols
    setMeta('status', 'checking_existing');
    const db = await getStockDb();
    const lastDates = getAllLastPriceDates();
    const today = new Date().toISOString().split('T')[0];

    const missing: string[] = [];
    const stale: { symbol: string; lastDate: string }[] = [];
    let fresh = 0;

    for (const sym of symbols) {
      const last = lastDates[sym];
      if (!last) {
        missing.push(sym);
      } else if (last < today) {
        stale.push({ symbol: sym, lastDate: last });
      } else {
        fresh++;
      }
    }

    console.log(`${missing.length} missing, ${stale.length} stale, ${fresh} up-to-date out of ${symbols.length}`);

    // Enrich ticker info for missing ones
    const allTickerResult = db.exec(`SELECT symbol FROM stock_tickers`);
    const knownTickers = new Set(
      allTickerResult[0]?.values.map((row: any[]) => row[0] as string) || []
    );
    const needEnrichment = symbols.filter(s => !knownTickers.has(s));

    if (needEnrichment.length > 0) {
      console.log(`Enriching ${needEnrichment.length} tickers...`);
      setMeta('status', 'enriching_tickers');
      let enrichIdx = 0;
      for (const sym of needEnrichment) {
        if (aborted) break;
        const info = await enrichTickerInfo(sym);
        upsertTicker(info);
        enrichIdx++;
        if (enrichIdx % 100 === 0) {
          writeProgress({ phase: 'enriching', done: enrichIdx, total: needEnrichment.length });
        }
        await sleep(150);
      }
    }

    // Phase 1: Download full 10Y for missing tickers
    let downloaded = 0;
    let errors = 0;
    const totalWork = missing.length + stale.length;

    if (missing.length > 0) {
      setMeta('status', 'downloading_missing');
      setMeta('total_to_fetch', String(totalWork));
      console.log(`Phase 1: Downloading ${missing.length} missing tickers...`);

      for (const symbol of missing) {
        if (aborted) {
          setMeta('status', 'paused');
          break;
        }

        try {
          setMeta('current_ticker', symbol);
          setMeta('current_index', String(downloaded + 1));
          const prices = await downloadTickerHistory(symbol);
          if (prices.length > 0) {
            insertPrices(symbol, prices);
            downloaded++;
          }
        } catch {
          errors++;
          await sleep(500);
        }

        const progress = downloaded + errors;
        if (progress % 25 === 0 || progress === missing.length) {
          const pct = Math.round((progress / totalWork) * 100);
          writeProgress({
            phase: 'downloading_missing',
            current: symbol,
            done: progress,
            total: totalWork,
            saved: downloaded,
            errors,
            pct,
          });
        }
        await sleep(DELAY_MS);
      }
    }

    // Phase 2: Update stale tickers (only recent days)
    if (!aborted && stale.length > 0) {
      setMeta('status', 'updating_recent');
      setMeta('total_to_fetch', String(totalWork));
      let staleUpdated = 0;
      let staleSkipped = 0;
      console.log(`Phase 2: Updating ${stale.length} stale tickers with recent data...`);

      for (const { symbol, lastDate } of stale) {
        if (aborted) {
          setMeta('status', 'paused');
          break;
        }

        try {
          setMeta('current_ticker', symbol);
          setMeta('current_index', String(downloaded + staleUpdated + staleSkipped + 1));
          const prices = await downloadRecentHistory(symbol, lastDate);
          if (prices.length > 0) {
            insertPrices(symbol, prices);
            staleUpdated++;
          } else {
            staleSkipped++;
          }
        } catch {
          errors++;
          await sleep(500);
        }

        const progress = downloaded + staleUpdated + staleSkipped;
        if (progress % 50 === 0 || progress === totalWork) {
          const pct = Math.round((progress / totalWork) * 100);
          writeProgress({
            phase: 'updating_recent',
            current: symbol,
            done: progress,
            total: totalWork,
            saved: downloaded + staleUpdated,
            errors,
            pct,
          });
        }
        await sleep(DELAY_MS);
      }
    }

    if (!aborted) {
      setMeta('status', 'completed');
      setMeta('completed_at', new Date().toISOString());
      setMeta('update_mode', '');
      const totalSaved = downloaded + (stale.length || 0);
      console.log(`Done! ${downloaded} new, ${errors} errors`);
      writeProgress({ phase: 'completed', saved: downloaded, errors });
    }
  } catch (err: any) {
    console.error('Fatal error:', err.message);
    setMeta('status', 'error');
    setMeta('last_error', err.message);
    setMeta('update_mode', '');
  } finally {
    downloading = false;
    downloadAbort = null;
  }
}
