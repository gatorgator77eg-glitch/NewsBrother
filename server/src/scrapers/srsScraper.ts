import { createLogger } from '../logger';

const log = createLogger({ module: 'srs-scraper' });

const SRS_PAGE_URL = 'https://www.dbs.com.sg/treasures/srs-funds.page';

export interface ScrapedSrsFund {
  fundHouse: string;
  fundName: string;
  fundType: string;
  factsheetUrl: string;
  isin: string | null;
}

function extractIsin(url: string): string | null {
  const apiMatch = url.match(/_en_([A-Z]{2}[A-Z0-9]{10})_YES/);
  if (apiMatch) return apiMatch[1];
  const gwMatch = url.match(/[?&](?:fund|shareClass)=([A-Z]{2}[A-Z0-9]{10})/);
  if (gwMatch) return gwMatch[1];
  return null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

function parseNoscriptTable(html: string): ScrapedSrsFund[] {
  const funds: ScrapedSrsFund[] = [];
  const rows = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  let currentFundHouse = '';

  for (const row of rows) {
    const cells = row.match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
    const thCells = row.match(/<th[\s>][\s\S]*?<\/th>/gi) || [];
    if (thCells.length > 0) continue;

    if (cells.length === 3) {
      const houseCell = cells[0];
      const houseMatch = houseCell.match(/<p>(.*?)<\/p>/i);
      if (houseMatch) {
        currentFundHouse = decodeEntities(houseMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      const nameCell = cells[1];
      const nameMatch = nameCell.match(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/i);
      const typeCell = cells[2];
      const typeMatch = typeCell.match(/<p>(.*?)<\/p>/i) || typeCell.match(/>([^<]+)</);
      if (nameMatch && typeMatch) {
        const url = decodeEntities(nameMatch[1]);
        const name = decodeEntities(nameMatch[2].replace(/<[^>]+>/g, '').trim());
        const fundType = decodeEntities(typeMatch[1].replace(/<[^>]+>/g, '').trim());
        funds.push({
          fundHouse: currentFundHouse,
          fundName: name,
          fundType,
          factsheetUrl: url,
          isin: extractIsin(url),
        });
      }
    } else if (cells.length === 2 && currentFundHouse) {
      const nameCell = cells[0];
      const nameMatch = nameCell.match(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/i);
      const typeCell = cells[1];
      const typeMatch = typeCell.match(/<p>(.*?)<\/p>/i) || typeCell.match(/>([^<]+)</);
      if (nameMatch && typeMatch) {
        const url = decodeEntities(nameMatch[1]);
        const name = decodeEntities(nameMatch[2].replace(/<[^>]+>/g, '').trim());
        const fundType = decodeEntities(typeMatch[1].replace(/<[^>]+>/g, '').trim());
        funds.push({
          fundHouse: currentFundHouse,
          fundName: name,
          fundType,
          factsheetUrl: url,
          isin: extractIsin(url),
        });
      }
    }
  }
  return funds;
}

export async function scrapeSrsFunds(): Promise<ScrapedSrsFund[]> {
  log.info('Fetching DBS SRS funds page', { url: SRS_PAGE_URL });
  const res = await fetch(SRS_PAGE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch SRS page: ${res.status} ${res.statusText}`);
  const html = await res.text();
  log.info('Fetched SRS page', { htmlLength: html.length });

  const noscriptBlocks = html.match(/<noscript>([\s\S]*?)<\/noscript>/gi) || [];
  log.info('Found noscript blocks', { count: noscriptBlocks.length });

  const allFunds: ScrapedSrsFund[] = [];
  for (const block of noscriptBlocks) {
    const inner = block.replace(/<\/?noscript>/gi, '');
    if (!inner.includes('<table')) continue;
    const funds = parseNoscriptTable(inner);
    allFunds.push(...funds);
  }

  log.info('Scraped SRS funds', { total: allFunds.length });
  return allFunds;
}
