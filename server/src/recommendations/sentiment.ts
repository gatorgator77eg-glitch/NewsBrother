import { getNewsArchiveDb } from '../newsArchive/db';
import { createLogger } from '../logger';

const log = createLogger({ module: 'recs-sentiment' });

const COUNTRY_GDELT_MAP: Record<string, string[]> = {
  US: ['US', 'United States'],
  UK: ['GB', 'UK', 'United Kingdom'],
  CA: ['CA', 'Canada'],
  FR: ['FR', 'France'],
  DE: ['DE', 'Germany'],
  IT: ['IT', 'Italy'],
  JP: ['JP', 'Japan'],
  CN: ['CHN', 'China'],
  IN: ['IND', 'India'],
  BR: ['BRA', 'Brazil'],
  ZA: ['ZAF', 'South Africa'],
  HK: ['HKG', 'Hong Kong'],
  SG: ['SGP', 'Singapore'],
  KR: ['KOR', 'South Korea'],
  TW: ['TWN', 'Taiwan'],
  CH: ['CHE', 'Switzerland'],
  AE: ['ARE', 'UAE', 'United Arab Emirates'],
  AU: ['AUS', 'Australia'],
};

const THEME_FILTER = `(themes LIKE '%economy%' OR themes LIKE '%business%' OR themes LIKE '%finance%' OR themes LIKE '%trade%' OR themes LIKE '%industry%')`;

// Ticker → company name aliases for better sentiment matching
const TICKER_ALIASES: Record<string, string[]> = {
  AAPL: ['Apple'], MSFT: ['Microsoft'], GOOGL: ['Google', 'Alphabet'], AMZN: ['Amazon'],
  NVDA: ['Nvidia'], META: ['Meta', 'Facebook'], TSLA: ['Tesla'], JPM: ['JPMorgan', 'JPMorgan Chase'],
  V: ['Visa'], WMT: ['Walmart'], JNJ: ['Johnson & Johnson'], PG: ['Procter'],
  MA: ['Mastercard'], HD: ['Home Depot'], UNH: ['UnitedHealth'], DIS: ['Disney'],
  BAC: ['Bank of America'], XOM: ['ExxonMobil', 'Exxon'], CVX: ['Chevron'],
  PFE: ['Pfizer'], KO: ['Coca-Cola'], CSCO: ['Cisco'], VZ: ['Verizon'],
  ADBE: ['Adobe'], CRM: ['Salesforce'], ACN: ['Accenture'], NKE: ['Nike'],
  AMD: ['AMD', 'Advanced Micro'], INTC: ['Intel'], T: ['AT&T'],
  SHEL: ['Shell'], BP: ['BP plc'], HSBC: ['HSBC'], AZN: ['AstraZeneca'],
  BABA: ['Alibaba'], BIDU: ['Baidu'], JD: ['JD.com'], PDD: ['Pinduoduo'],
  TCS: ['Tata Consultancy'], INFY: ['Infosys'], RELI: ['Reliance'],
  SAP: ['SAP'], ASML: ['ASML'], SIE: ['Siemens'], ALV: ['Allianz'],
  '005930': ['Samsung'], '000660': ['SK Hynix'], '0700': ['Tencent'],
  '2330': ['TSMC', 'Taiwan Semiconductor'], '2318': ['China Life'],
  RIO: ['Rio Tinto'], BHP: ['BHP'], NAB: ['National Australia'],
};

export interface SentimentResult {
  avgTone: number;
  articleCount: number;
  positiveRatio: number;
  negativeRatio: number;
  trend: 'improving' | 'stable' | 'deteriorating';
  recentHeadlines: { title: string; tone: number; published_at: string }[];
  goldsteinAvg: number;
  financeArticleCount: number;
}

function buildTickerPattern(ticker: string, companyName: string): string {
  const conditions: string[] = [];
  conditions.push(`title LIKE '%${ticker}%'`);
  const aliases = TICKER_ALIASES[ticker] || [];
  for (const alias of aliases) {
    conditions.push(`title LIKE '%${alias}%'`);
  }
  if (companyName && companyName.length > 3) {
    const words = companyName.split(/[\s,]+/).filter(w => w.length > 3);
    for (const w of words.slice(0, 3)) {
      conditions.push(`title LIKE '%${w}%'`);
    }
  }
  return `(${conditions.join(' OR ')})`;
}

export async function getCountrySentiment(countryCode: string, days: number = 7): Promise<SentimentResult> {
  const archiveDb = await getNewsArchiveDb();
  const countries = COUNTRY_GDELT_MAP[countryCode] || [];

  const empty: SentimentResult = {
    avgTone: 0, articleCount: 0, positiveRatio: 0, negativeRatio: 0,
    trend: 'stable', recentHeadlines: [], goldsteinAvg: 0, financeArticleCount: 0,
  };

  if (countries.length === 0) return empty;

  try {
    const placeholders = countries.map(() => '?').join(',');
    const dateThreshold = new Date(Date.now() - days * 86400000).toISOString();

    // Main sentiment query (filtered for finance-related articles)
    const toneResult = archiveDb.exec(
      `SELECT AVG(tone), COUNT(*),
              SUM(CASE WHEN tone > 1 THEN 1 ELSE 0 END) * 1.0 / MAX(COUNT(*), 1),
              SUM(CASE WHEN tone < -1 THEN 1 ELSE 0 END) * 1.0 / MAX(COUNT(*), 1),
              AVG(goldsteinscale)
       FROM news_archive
       WHERE source_country IN (${placeholders})
         AND published_at >= ?
         AND ${THEME_FILTER}`,
      [...countries, dateThreshold]
    );

    if (!toneResult[0] || toneResult[0].values[0][0] === null) {
      // Fallback: try without theme filter
      const fallback = archiveDb.exec(
        `SELECT AVG(tone), COUNT(*),
                SUM(CASE WHEN tone > 1 THEN 1 ELSE 0 END) * 1.0 / MAX(COUNT(*), 1),
                SUM(CASE WHEN tone < -1 THEN 1 ELSE 0 END) * 1.0 / MAX(COUNT(*), 1),
                AVG(goldsteinscale)
         FROM news_archive
         WHERE source_country IN (${placeholders})
           AND published_at >= ?`,
        [...countries, dateThreshold]
      );
      if (!fallback[0] || fallback[0].values[0][0] === null) return empty;
      const row = fallback[0].values[0];
      return {
        avgTone: row[0] as number, articleCount: row[1] as number,
        positiveRatio: row[2] as number, negativeRatio: row[3] as number,
        goldsteinAvg: (row[4] as number) || 0, financeArticleCount: 0,
        trend: 'stable', recentHeadlines: [],
      };
    }

    const row = toneResult[0].values[0];
    const avgTone = row[0] as number;
    const articleCount = row[1] as number;
    const positiveRatio = row[2] as number;
    const negativeRatio = row[3] as number;
    const goldsteinAvg = (row[4] as number) || 0;

    // Finance-specific article count
    const financeCountResult = archiveDb.exec(
      `SELECT COUNT(*) FROM news_archive
       WHERE source_country IN (${placeholders}) AND published_at >= ? AND ${THEME_FILTER}`,
      [...countries, dateThreshold]
    );
    const financeArticleCount = (financeCountResult[0]?.values[0][0] as number) || 0;

    // Trend: compare first half vs second half
    const halfDays = Math.floor(days / 2);
    const midDate = new Date(Date.now() - halfDays * 86400000).toISOString();
    const trendResult = archiveDb.exec(
      `SELECT
         SUM(CASE WHEN published_at < ? THEN tone ELSE 0 END) / MAX(SUM(CASE WHEN published_at < ? THEN 1 ELSE 0 END), 1),
         SUM(CASE WHEN published_at >= ? THEN tone ELSE 0 END) / MAX(SUM(CASE WHEN published_at >= ? THEN 1 ELSE 0 END), 1)
       FROM news_archive
       WHERE source_country IN (${placeholders})
         AND published_at >= ?
         AND ${THEME_FILTER}`,
      [midDate, midDate, midDate, midDate, ...countries, dateThreshold]
    );

    let trend: 'improving' | 'stable' | 'deteriorating' = 'stable';
    if (trendResult[0]) {
      const olderTone = trendResult[0].values[0][0] as number;
      const newerTone = trendResult[0].values[0][1] as number;
      const diff = newerTone - olderTone;
      if (diff > 0.5) trend = 'improving';
      else if (diff < -0.5) trend = 'deteriorating';
    }

    // Recent headlines (unfiltered for broader context)
    const headlineResult = archiveDb.exec(
      `SELECT title, tone, published_at FROM news_archive
       WHERE source_country IN (${placeholders})
         AND published_at >= ?
         AND title != ''
       ORDER BY published_at DESC LIMIT 5`,
      [...countries, dateThreshold]
    );

    const recentHeadlines = headlineResult[0]
      ? headlineResult[0].values.map((r: any[]) => ({
          title: r[0] as string,
          tone: r[1] as number,
          published_at: r[2] as string,
        }))
      : [];

    return { avgTone, articleCount, positiveRatio, negativeRatio, trend, recentHeadlines, goldsteinAvg, financeArticleCount };
  } catch (err: any) {
    log.error('Failed to get country sentiment', { countryCode, error: err.message });
    return empty;
  }
}

export async function getTickerSentiment(ticker: string, companyName: string, countryCode: string, days: number = 7): Promise<number> {
  const archiveDb = await getNewsArchiveDb();
  const countries = COUNTRY_GDELT_MAP[countryCode] || [];
  if (countries.length === 0) return 0;

  try {
    const placeholders = countries.map(() => '?').join(',');
    const dateThreshold = new Date(Date.now() - days * 86400000).toISOString();
    const tickerPattern = buildTickerPattern(ticker, companyName);

    const result = archiveDb.exec(
      `SELECT AVG(tone), COUNT(*) FROM news_archive
       WHERE source_country IN (${placeholders})
         AND published_at >= ?
         AND ${tickerPattern}`,
      [...countries, dateThreshold]
    );

    if (!result[0] || result[0].values[0][0] === null) return 0;
    const avgTone = result[0].values[0][0] as number;
    const count = result[0].values[0][1] as number;
    // Weight by article count: more articles = more reliable signal
    if (count < 2) return avgTone * 0.3;
    if (count < 5) return avgTone * 0.7;
    return avgTone;
  } catch {
    return 0;
  }
}
