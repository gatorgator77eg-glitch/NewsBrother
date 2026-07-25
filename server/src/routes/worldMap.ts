import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getDb } from '../db';

const log = createLogger({ module: 'world-map' });
export const worldMapRoutes = Router();

const SOURCE_COUNTRY: Record<string, string> = {
  'nytimes': 'United States', 'washington-post': 'United States', 'cnn': 'United States',
  'msnbc': 'United States', 'vox': 'United States', 'huffpost': 'United States',
  'guardian': 'United Kingdom', 'slate': 'United States', 'motherjones': 'United States',
  'salon': 'United States', 'daily-beast': 'United States', 'nbc-news': 'United States',
  'cbs-news': 'United States', 'abc-news': 'United States', 'usa-today': 'United States',
  'buzzfeed-news': 'United States', 'politico': 'United States', 'ap-news': 'United States',
  'reuters': 'United Kingdom', 'bbc-us': 'United States', 'npr': 'United States',
  'pbs-news': 'United States', 'the-hill': 'United States', 'axios': 'United States',
  'the-economist': 'United Kingdom', 'wsj': 'United States', 'fox-news': 'United States',
  'nyp': 'United States', 'washington-times': 'United States', 'the-blaze': 'United States',
  'breitbart': 'United States', 'daily-wire': 'United States', 'newsmax': 'United States',
  'fox-opinion': 'United States', 'oann': 'United States', 'federalist': 'United States',
  'national-review': 'United States', 'wash-examiner': 'United States',
  'texas-tribune': 'United States', 'the-intercept': 'United States', 'propublica': 'United States',
  'axios-local': 'United States', 'bbc-world': 'United Kingdom', 'aljazeera': 'Qatar',
  'financial-times': 'United Kingdom', 'cnbc': 'United States', 'marketwatch': 'United States',
  'the-atlantic': 'United States', 'new-yorker': 'United States', 'rolling-stone': 'United States',
  'time': 'United States', 'newsweek': 'United States',
  // Asia
  'straits-times-asia': 'Singapore', 'diplomat': 'Japan', 'cna': 'Singapore',
  'japan-times': 'Japan', 'scmp': 'China', 'bangkok-post': 'Thailand',
  // Europe & Middle East
  'le-monde-en': 'France', 'france24': 'France', 'the-local-europe': 'Sweden',
  'bbc-middle-east': 'United Kingdom', 'middle-east-eye': 'United Kingdom',
  'european-newsroom': 'Germany', 'rferl': 'United States', 'brussels-morning': 'Belgium',
  'the-local-germany': 'Germany', 'the-local-spain': 'Spain',
  'the-local-france': 'France', 'the-local-sweden': 'Sweden',
  'bbc-europe': 'United Kingdom', 'guardian-world': 'United Kingdom',
  'independent-world': 'United Kingdom', 'euronews': 'France',
  'daily-express-uk': 'United Kingdom',
  'al-monitor': 'United States', 'middle-east-monitor': 'United Kingdom',
  'arab-news': 'Saudi Arabia', 'france24-mideast': 'France',
  'daily-sabah': 'Turkey', 'jerusalem-post': 'Israel', 'haaretz': 'Israel',
  // Africa
  'france24-africa': 'France', 'bbc-africa': 'United Kingdom',
  'premium-times-ng': 'Nigeria',
  // Asia-Pacific more
  'korea-herald': 'South Korea', 'the-hindu': 'India', 'times-of-india': 'India',
  'dawn-pakistan': 'Pakistan', 'global-times': 'China', 'bbc-asia': 'United Kingdom',
  'vietnam-news': 'Vietnam', 'ndtv': 'India', 'tribune-pakistan': 'Pakistan',
  'livemint': 'India', 'deccan-herald': 'India', 'bbc-china': 'United Kingdom',
  // Oceania
  'abc-australia': 'Australia', 'guardian-australia': 'Australia',
  // Latin America
  'bbc-latin-america': 'United Kingdom',
};

interface CountryData {
  country: string;
  lat: number;
  lng: number;
  iso: string;
  articleCount: number;
  latestArticle: {
    title: string;
    url: string;
    source_id: string;
    source_name: string;
    published_at: string;
    bias: string;
  } | null;
}

const COUNTRY_COORDS: Record<string, { lat: number; lng: number; iso: string }> = {
  'United States': { lat: 39.8, lng: -98.5, iso: 'US' },
  'United Kingdom': { lat: 54.0, lng: -2.0, iso: 'GB' },
  'France': { lat: 46.6, lng: 2.2, iso: 'FR' },
  'Germany': { lat: 51.2, lng: 10.4, iso: 'DE' },
  'Japan': { lat: 36.2, lng: 138.3, iso: 'JP' },
  'China': { lat: 35.9, lng: 104.2, iso: 'CN' },
  'India': { lat: 20.6, lng: 78.9, iso: 'IN' },
  'Singapore': { lat: 1.35, lng: 103.8, iso: 'SG' },
  'Thailand': { lat: 15.9, lng: 100.9, iso: 'TH' },
  'South Korea': { lat: 35.9, lng: 127.8, iso: 'KR' },
  'Australia': { lat: -25.3, lng: 133.8, iso: 'AU' },
  'Brazil': { lat: -14.2, lng: -51.9, iso: 'BR' },
  'Canada': { lat: 56.1, lng: -106.3, iso: 'CA' },
  'Russia': { lat: 61.5, lng: 105.3, iso: 'RU' },
  'Israel': { lat: 31.0, lng: 34.9, iso: 'IL' },
  'Saudi Arabia': { lat: 23.9, lng: 45.1, iso: 'SA' },
  'Turkey': { lat: 38.9, lng: 35.2, iso: 'TR' },
  'Qatar': { lat: 25.4, lng: 51.2, iso: 'QA' },
  'Pakistan': { lat: 30.4, lng: 69.3, iso: 'PK' },
  'Nigeria': { lat: 9.1, lng: 8.7, iso: 'NG' },
  'South Africa': { lat: -30.6, lng: 22.9, iso: 'ZA' },
  'Egypt': { lat: 26.8, lng: 30.8, iso: 'EG' },
  'Spain': { lat: 40.5, lng: -3.7, iso: 'ES' },
  'Italy': { lat: 41.9, lng: 12.6, iso: 'IT' },
  'Sweden': { lat: 60.1, lng: 18.6, iso: 'SE' },
  'Belgium': { lat: 50.5, lng: 4.5, iso: 'BE' },
  'Vietnam': { lat: 14.1, lng: 108.3, iso: 'VN' },
  'Argentina': { lat: -38.4, lng: -63.6, iso: 'AR' },
  'Mexico': { lat: 23.6, lng: -102.6, iso: 'MX' },
  'Norway': { lat: 60.5, lng: 8.5, iso: 'NO' },
  'Poland': { lat: 51.9, lng: 19.1, iso: 'PL' },
  'Netherlands': { lat: 52.1, lng: 5.3, iso: 'NL' },
  'Ireland': { lat: 53.1, lng: -7.7, iso: 'IE' },
  'Ukraine': { lat: 48.4, lng: 31.2, iso: 'UA' },
  'Indonesia': { lat: -0.8, lng: 113.9, iso: 'ID' },
  'Philippines': { lat: 12.9, lng: 121.8, iso: 'PH' },
  'Malaysia': { lat: 4.2, lng: 101.9, iso: 'MY' },
};

worldMapRoutes.get('/articles', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();

    const result = db.exec(`
      SELECT
        a.source_id,
        a.title,
        a.url,
        a.published_at,
        s.name as source_name,
        s.bias
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      ORDER BY a.published_at DESC
    `);

    if (!result.length) {
      res.json({ countries: [] });
      return;
    }

    const cols = result[0].columns;
    const rows = result[0].values;

    const countryArticles: Record<string, any[]> = {};

    for (const row of rows) {
      const sourceId = row[0] as string;
      const country = SOURCE_COUNTRY[sourceId];
      if (!country) continue;

      if (!countryArticles[country]) countryArticles[country] = [];

      if (countryArticles[country].length < 5) {
        countryArticles[country].push({
          title: row[1],
          url: row[2],
          published_at: row[3],
          source_id: sourceId,
          source_name: row[4],
          bias: row[5],
        });
      }
    }

    const countries: CountryData[] = Object.entries(countryArticles)
      .filter(([_, articles]) => articles.length > 0)
      .map(([country, articles]) => {
        const coords = COUNTRY_COORDS[country] || { lat: 0, lng: 0, iso: '' };
        return {
          country,
          lat: coords.lat,
          lng: coords.lng,
          iso: coords.iso,
          articleCount: articles.length,
          latestArticle: articles[0],
        };
      })
      .sort((a, b) => b.articleCount - a.articleCount);

    res.json({ countries });
  } catch (err: any) {
    log.error('World map query failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

worldMapRoutes.get('/country/:country', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const country = req.params.country;

    const sourceIds = Object.entries(SOURCE_COUNTRY)
      .filter(([_, c]) => c === country)
      .map(([id]) => `'${id}'`)
      .join(',');

    if (!sourceIds) {
      res.json({ articles: [], country });
      return;
    }

    const result = db.exec(`
      SELECT
        a.title,
        a.url,
        a.excerpt,
        a.published_at,
        s.name as source_name,
        s.bias,
        s.credibility_score
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.source_id IN (${sourceIds})
      ORDER BY a.published_at DESC
      LIMIT 20
    `);

    if (!result.length) {
      res.json({ articles: [], country });
      return;
    }

    const articles = result[0].values.map(row => ({
      title: row[0],
      url: row[1],
      excerpt: row[2],
      published_at: row[3],
      source_name: row[4],
      bias: row[5],
      credibility_score: row[6],
    }));

    res.json({ articles, country });
  } catch (err: any) {
    log.error('Country query failed', { error: err.message, country: req.params.country });
    res.status(500).json({ error: err.message });
  }
});
