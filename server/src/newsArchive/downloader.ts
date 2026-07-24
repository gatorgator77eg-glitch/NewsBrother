import { getNewsArchiveDb, insertArchiveArticles, getArchiveMeta, setArchiveMeta, countArticlesForDate } from './db';
import { createLogger } from '../logger';

const log = createLogger({ module: 'news-archive-downloader' });

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
const DEFAULT_QUERY = '(tariff OR sanctions OR war OR military OR "interest rate" OR fed OR election OR protest OR conflict OR supply chain OR trade OR recession OR inflation)';
const REQUEST_DELAY_MS = 5500;
const FETCH_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;

let downloadAbort = false;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function toGDELTDatetime(d: Date): string {
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function parseGDELTDate(raw: string | undefined): string {
  if (!raw) return '';
  // GDELT format: "20260625T000000Z" → "2026-06-25T00:00:00Z"
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return raw;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

export async function startArchiveDownload(startDateStr: string, endDateStr: string, query?: string) {
  const status = getArchiveMeta('status');
  if (status === 'running') {
    return { ok: false, error: 'A download is already running' };
  }

  const q = query || DEFAULT_QUERY;
  const startDate = new Date(startDateStr + 'T00:00:00Z');
  const endDate = new Date(endDateStr + 'T23:59:59Z');

  const dayCount = Math.round((new Date(endDateStr).getTime() - new Date(startDateStr).getTime()) / (24 * 3600 * 1000)) + 1;

  setArchiveMeta('status', 'running');
  setArchiveMeta('start_date', startDateStr);
  setArchiveMeta('end_date', endDateStr);
  setArchiveMeta('total_days', String(dayCount));
  setArchiveMeta('completed_days', '0');
  setArchiveMeta('total_articles', '0');
  setArchiveMeta('started_at', new Date().toISOString());
  setArchiveMeta('completed_at', '');
  setArchiveMeta('last_error', '');

  downloadAbort = false;

  runDownloadLoop(startDate, endDate, q).catch(err => {
    log.error('Download loop crashed', { error: String(err) });
    setArchiveMeta('status', 'error');
    setArchiveMeta('last_error', String(err));
  });

  return { ok: true, totalDays: dayCount };
}

export async function abortArchiveDownload() {
  downloadAbort = true;
  return { ok: true };
}

async function runDownloadLoop(startDate: Date, endDate: Date, query: string) {
  const totalDays = parseInt(getArchiveMeta('total_days') || '0');
  let completedDays = parseInt(getArchiveMeta('completed_days') || '0');
  let totalArticles = parseInt(getArchiveMeta('total_articles') || '0');

  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    if (downloadAbort) {
      log.info('Download aborted by user');
      setArchiveMeta('status', 'aborted');
      return;
    }

    const dayStart = new Date(cursor);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const dateStr = dayStart.toISOString().slice(0, 10);
    setArchiveMeta('current_date', dateStr);

    if (countArticlesForDate(dateStr) > 0 || getArchiveMeta(`downloaded_date:${dateStr}`) === 'done') {
      completedDays++;
      setArchiveMeta('completed_days', String(completedDays));
      log.info('Skipping already-downloaded date', { date: dateStr });
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const halfDays = [
      { start: new Date(dayStart), end: new Date(dayStart.getTime() + 12 * 3600 * 1000 - 1000) },
      { start: new Date(dayStart.getTime() + 12 * 3600 * 1000), end: new Date(dayEnd) },
    ];

    for (const half of halfDays) {
      if (downloadAbort) break;

      let retries = 0;
      while (retries <= MAX_RETRIES) {
        try {
          const articles = await fetchGDELTWindow(query, half.start, half.end);
          if (articles.length > 0) {
            const inserted = insertArchiveArticles(articles);
            totalArticles += inserted;
            setArchiveMeta('total_articles', String(totalArticles));
          }
          break;
        } catch (err: any) {
          retries++;
          if (retries > MAX_RETRIES) {
            log.warn('Failed GDELT window after retries', {
              date: dateStr,
              error: String(err),
            });
          } else {
            await sleep(3000 * retries);
          }
        }
      }

      await sleep(REQUEST_DELAY_MS);
    }

    completedDays++;
    setArchiveMeta('completed_days', String(completedDays));
    setArchiveMeta(`downloaded_date:${dateStr}`, 'done');

    const pct = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
    log.info('Archive download progress', {
      date: dateStr,
      completedDays,
      totalDays,
      pct,
      totalArticles,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  setArchiveMeta('status', 'completed');
  setArchiveMeta('completed_at', new Date().toISOString());
  log.info('Archive download completed', { totalArticles, completedDays });
}

async function fetchGDELTWindow(query: string, start: Date, end: Date) {
  const startStr = toGDELTDatetime(start);
  const endStr = toGDELTDatetime(end);
  const url = `${GDELT_BASE}?query=${encodeURIComponent(query)}&mode=artlist&startdatetime=${startStr}&enddatetime=${endStr}&maxrecords=250&format=json&sort=DateDesc`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'PoliticalNewsApp/1.0' },
  });

  if (res.status === 429) {
    throw new Error('GDELT rate limited (429)');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GDELT ${res.status}: ${body.slice(0, 100)}`);
  }

  const text = await res.text();

  if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    throw new Error('GDELT returned non-JSON response');
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('GDELT returned invalid JSON');
  }

  const rawArticles = data.articles || [];
  return rawArticles.map((a: any) => ({
    url: a.url || '',
    title: a.title || '',
    domain: a.domain || '',
    source_country: a.sourcecountry || '',
    language: a.language || '',
    published_at: parseGDELTDate(a.seendate),
    image_url: a.socialimage || '',
    tone: parseFloat(a.tone) || 0,
    goldsteinscale: parseFloat(a.goldsteinscale) || 0,
  })).filter((a: any) => a.url);
}
