import { getStockDb } from '../stocks/db';
import { createLogger } from '../logger';

const log = createLogger({ module: 'recs-universe' });

export interface CountryDef {
  code: string;
  name: string;
  block: 'g7' | 'brics' | 'hub';
  indexSymbol: string;
  indexName: string;
  countryFilter: string[];
  etf?: string;
}

export const COUNTRIES: CountryDef[] = [
  { code: 'US', name: 'United States', block: 'g7', indexSymbol: '^GSPC', indexName: 'S&P 500', countryFilter: ['United States'], etf: 'SPY' },
  { code: 'UK', name: 'United Kingdom', block: 'g7', indexSymbol: '^FTSE', indexName: 'FTSE 100', countryFilter: ['United Kingdom'], etf: 'EWU' },
  { code: 'CA', name: 'Canada', block: 'g7', indexSymbol: '^GSPTSE', indexName: 'S&P/TSX', countryFilter: ['Canada'] },
  { code: 'FR', name: 'France', block: 'g7', indexSymbol: '^FCHI', indexName: 'CAC 40', countryFilter: ['France'], etf: 'EWQ' },
  { code: 'DE', name: 'Germany', block: 'g7', indexSymbol: '^GDAXI', indexName: 'DAX', countryFilter: ['Germany'], etf: 'EWG' },
  { code: 'IT', name: 'Italy', block: 'g7', indexSymbol: 'FTSEMIB.MI', indexName: 'FTSE MIB', countryFilter: ['Italy'], etf: 'EWI' },
  { code: 'JP', name: 'Japan', block: 'g7', indexSymbol: '^N225', indexName: 'Nikkei 225', countryFilter: ['Japan'], etf: 'EWJ' },
  { code: 'CN', name: 'China', block: 'brics', indexSymbol: '000001.SS', indexName: 'SSE Composite', countryFilter: ['China'], etf: 'FXI' },
  { code: 'IN', name: 'India', block: 'brics', indexSymbol: '^NSEI', indexName: 'Nifty 50', countryFilter: ['India'], etf: 'INDA' },
  { code: 'BR', name: 'Brazil', block: 'brics', indexSymbol: '^BVSP', indexName: 'Bovespa', countryFilter: ['Brazil'], etf: 'EWZ' },
  { code: 'ZA', name: 'South Africa', block: 'brics', indexSymbol: '^J203.JO', indexName: 'JSE Top 40', countryFilter: ['South Africa'], etf: 'EZA' },
  { code: 'HK', name: 'Hong Kong', block: 'hub', indexSymbol: '^HSI', indexName: 'Hang Seng', countryFilter: ['Hong Kong'], etf: 'EWH' },
  { code: 'SG', name: 'Singapore', block: 'hub', indexSymbol: '^STI', indexName: 'Straits Times', countryFilter: ['Singapore'], etf: 'EWS' },
  { code: 'KR', name: 'South Korea', block: 'hub', indexSymbol: '^KS11', indexName: 'KOSPI', countryFilter: ['South Korea'], etf: 'EWY' },
  { code: 'TW', name: 'Taiwan', block: 'hub', indexSymbol: '^TWII', indexName: 'TAIEX', countryFilter: ['Taiwan'], etf: 'EWT' },
  { code: 'CH', name: 'Switzerland', block: 'hub', indexSymbol: '^SSMI', indexName: 'SMI', countryFilter: ['Switzerland'], etf: 'EWL' },
  { code: 'AE', name: 'UAE', block: 'hub', indexSymbol: '^ADI', indexName: 'ADX General', countryFilter: ['United Arab Emirates', 'UAE'] },
  { code: 'AU', name: 'Australia', block: 'hub', indexSymbol: '^AXJO', indexName: 'ASX 200', countryFilter: ['Australia'], etf: 'EWA' },
];

export function getCountryByCode(code: string): CountryDef | undefined {
  return COUNTRIES.find(c => c.code === code);
}

export interface TickerInfo {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: number;
}

export async function getUniverse(country: CountryDef, limit: number = 30): Promise<TickerInfo[]> {
  const db = await getStockDb();
  const conditions: string[] = [];
  const params: any[] = [];

  const countryConditions = country.countryFilter.map(c => `country = ?`).join(' OR ');
  conditions.push(`(${countryConditions})`);
  params.push(...country.countryFilter);

  conditions.push(`market_cap > 0`);
  params.push();

  const where = conditions.join(' AND ');
  // Fetch more tickers than needed to allow sector diversification
  const rawLimit = Math.min(limit * 3, 90);
  const query = `SELECT symbol, name, sector, industry, country, market_cap FROM stock_tickers WHERE ${where} ORDER BY market_cap DESC LIMIT ?`;
  params.push(rawLimit);

  try {
    const result = db.exec(query, params);
    if (!result[0]) {
      log.warn('No tickers found for country', { country: country.code });
      return [];
    }
    const allTickers: TickerInfo[] = result[0].values.map((row: any[]) => ({
      symbol: row[0] as string,
      name: row[1] as string,
      sector: row[2] as string,
      industry: row[3] as string,
      country: row[4] as string,
      market_cap: row[5] as number,
    }));

    // Sector diversification: max 5 per sector
    const sectorCount = new Map<string, number>();
    const diversified: TickerInfo[] = [];
    for (const t of allTickers) {
      const count = sectorCount.get(t.sector) || 0;
      if (count < 5) {
        diversified.push(t);
        sectorCount.set(t.sector, count + 1);
      }
    }

    // Liquidity filter: must have at least 20 days of price data
    const liquid: TickerInfo[] = [];
    for (const t of diversified) {
      const countResult = db.exec(`SELECT COUNT(*) FROM stock_prices WHERE symbol = ?`, [t.symbol]);
      const count = countResult[0]?.values[0]?.[0] as number || 0;
      if (count >= 20) {
        liquid.push(t);
      }
      if (liquid.length >= limit) break;
    }

    if (liquid.length === 0) {
      // Fallback: return without liquidity filter
      return diversified.slice(0, limit);
    }

    return liquid;
  } catch (err: any) {
    log.error('Failed to get universe', { country: country.code, error: err.message });
    return [];
  }
}

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getPriceHistory(symbol: string, days: number = 250): Promise<PriceBar[]> {
  const db = await getStockDb();
  try {
    const result = db.exec(
      `SELECT date, open, high, low, close, volume FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT ?`,
      [symbol, days]
    );
    if (!result[0]) return [];
    return result[0].values.map((row: any[]) => ({
      date: row[0] as string,
      open: row[1] as number,
      high: row[2] as number,
      low: row[3] as number,
      close: row[4] as number,
      volume: row[5] as number,
    })).reverse();
  } catch {
    return [];
  }
}

export async function getIndexPriceHistory(indexSymbol: string, days: number = 250): Promise<PriceBar[]> {
  return getPriceHistory(indexSymbol, days);
}
