import { createLogger } from '../logger';

const log = createLogger({ module: 'macro-data' });

export interface MacroDataPoint {
  key: string;
  date: string;
  value: number;
  source: string;
}

// ── Hardcoded baseline rates (updated manually or via scraper) ─────────────
const FALLBACK_RATES: Record<string, { value: number; date: string; source: string }> = {
  'srs_base_rate': { value: 0.05, date: '2026-01-01', source: 'DBS (fixed)' },
  'tbill_6m': { value: 3.15, date: '2026-07-01', source: 'MAS (manual)' },
  'tbill_1y': { value: 2.95, date: '2026-07-01', source: 'MAS (manual)' },
  'sora_overnight': { value: 3.22, date: '2026-07-22', source: 'MAS (manual)' },
  'sora_1m': { value: 3.18, date: '2026-07-22', source: 'MAS (manual)' },
  'sora_3m': { value: 3.09, date: '2026-07-22', source: 'MAS (manual)' },
  'mas_core_inflation': { value: 1.6, date: '2026-06-01', source: 'MAS (manual)' },
  'cpi_all_items': { value: 1.2, date: '2026-06-01', source: 'SingStat (manual)' },
  'ssb_1y_ytm': { value: 2.85, date: '2026-07-01', source: 'MAS (manual)' },
  'ssb_10y_ytm': { value: 3.15, date: '2026-07-01', source: 'MAS (manual)' },
  'fd_6m_dbs': { value: 2.80, date: '2026-07-01', source: 'DBS (manual)' },
  'fd_12m_dbs': { value: 3.00, date: '2026-07-01', source: 'DBS (manual)' },
};

// ── Scrape T-Bill yields from MAS eservices ───────────────────────────────
export async function scrapeTBillYields(): Promise<MacroDataPoint[]> {
  const url = 'https://eservices.mas.gov.sg/Statistics/fdanet/TreasuryBillOriginalMaturities.aspx';
  log.info('Fetching T-Bill yields from MAS', { url });
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const data: MacroDataPoint[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // Parse yield from HTML table — look for patterns like "1.40" near T-Bill identifiers
    const yieldPattern = /(\d\.\d{2,4})\s*%/g;
    let match;
    while ((match = yieldPattern.exec(html)) !== null) {
      const val = parseFloat(match[1]);
      if (val > 0 && val < 10) {
        data.push({ key: 'tbill_yield_scraped', date: today, value: val, source: 'MAS eservices' });
        break; // Just grab the first reasonable yield as representative
      }
    }
    log.info('Scraped T-Bill yields', { count: data.length });
    return data;
  } catch (err: any) {
    log.warn('T-Bill scrape failed, using fallback', { error: err.message });
    return [];
  }
}

// ── Scrape SORA from MAS eservices ────────────────────────────────────────
export async function scrapeSora(): Promise<MacroDataPoint[]> {
  const url = 'https://eservices.mas.gov.sg/statistics/dir/DomesticInterestRates.aspx';
  log.info('Fetching SORA from MAS', { url });
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const data: MacroDataPoint[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // Look for SORA rate patterns in the HTML
    const soraPattern = /SORA.*?(\d\.\d{2,4})/gi;
    let match;
    while ((match = soraPattern.exec(html)) !== null) {
      const val = parseFloat(match[1]);
      if (val > 0 && val < 10) {
        data.push({ key: 'sora_overnight', date: today, value: val, source: 'MAS eservices' });
        break;
      }
    }
    log.info('Scraped SORA', { count: data.length });
    return data;
  } catch (err: any) {
    log.warn('SORA scrape failed, using fallback', { error: err.message });
    return [];
  }
}

// ── Get all macro rates (scrape + fallback) ───────────────────────────────
export async function getMacroRates(db: any): Promise<Record<string, { value: number; date: string; source: string }>> {
  const rates: Record<string, { value: number; date: string; source: string }> = {};

  // Load from DB cache first
  try {
    const cached = db.exec(`SELECT key, date, value, source FROM srs_macro WHERE date >= date('now', '-7 days')`);
    if (cached[0]) {
      for (const row of cached[0].values) {
        rates[row[0] as string] = { value: row[2] as number, date: row[1] as string, source: row[3] as string };
      }
    }
  } catch {}

  // Fill missing from fallback
  for (const [key, fb] of Object.entries(FALLBACK_RATES)) {
    if (!rates[key]) {
      rates[key] = fb;
    }
  }

  return rates;
}

// ── Store macro data in DB ────────────────────────────────────────────────
export function storeMacroData(db: any, points: MacroDataPoint[]) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO srs_macro (key, date, value, source) VALUES (?, ?, ?, ?)`);
  for (const p of points) {
    stmt.run([p.key, p.date, p.value, p.source]);
  }
  stmt.free();
}

// ── Update all macro data (scrape + fallback + store) ─────────────────────
export async function refreshMacroData(db: any): Promise<{ scraped: number; total: number }> {
  log.info('Starting macro data refresh');
  const scraped: MacroDataPoint[] = [];

  const [tbill, sora] = await Promise.all([
    scrapeTBillYields().catch(() => []),
    scrapeSora().catch(() => []),
  ]);
  scraped.push(...tbill, ...sora);

  if (scraped.length > 0) {
    storeMacroData(db, scraped);
  }

  const rates = await getMacroRates(db);
  return { scraped: scraped.length, total: Object.keys(rates).length };
}
