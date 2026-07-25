import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getDb } from '../db';
import { ensureLlmTable, seedLlmDefaults } from './llmConfig';

const log = createLogger({ module: 'briefing' });
export const briefingRoutes = Router();

briefingRoutes.get('/daily', async (_req: Request, res: Response) => {
  try {
    const archiveDb = await getNewsArchiveDb();
    const newsDb = await getDb();

    // Find the most recent date in the archive as anchor
    const maxDateResult = archiveDb.exec(`SELECT MAX(published_at) FROM news_archive`);
    const maxDate = maxDateResult[0]?.values[0]?.[0] as string || '';

    if (!maxDate) {
      res.json({
        generatedAt: new Date().toISOString(),
        topStories: [], sentimentShifts: [], emergingNarratives: [],
        coverageByCountry: [], breakingNews: [],
        stats: { articlesToday: 0, articlesYesterday: 0 },
        archiveDateRange: null,
      });
      return;
    }

    // Extract just the date part from the anchor (e.g. "2026-06-25")
    const anchorDate = maxDate.substring(0, 10);

    // "today" = anchor date, "yesterday" = anchor date - 1 day
    // Use SQLite date arithmetic on the anchor string
    const topStories = archiveDb.exec(`
      SELECT title, domain, source_country, tone, published_at, url
      FROM news_archive
      WHERE date(published_at) = date(?)
        AND title != ''
      ORDER BY ABS(tone) DESC
      LIMIT 10
    `, [anchorDate]);
    const stories = topStories[0]?.values.map((r: any[]) => ({
      title: r[0], domain: r[1], country: r[2], tone: r[3], publishedAt: r[4], url: r[5],
    })) || [];

    const sentimentShifts = archiveDb.exec(`
      SELECT source_country,
             AVG(CASE WHEN date(published_at) = date(?) THEN tone END) as todayTone,
             AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END) as yesterdayTone,
             COUNT(*) as count
      FROM news_archive
      WHERE date(published_at) IN (date(?), date(?, '-1 day'))
        AND source_country != ''
      GROUP BY source_country
      HAVING count >= 3
      ORDER BY ABS(
        AVG(CASE WHEN date(published_at) = date(?) THEN tone END) -
        AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END)
      ) DESC
      LIMIT 8
    `, [anchorDate, anchorDate, anchorDate, anchorDate, anchorDate, anchorDate]);
    const shifts = sentimentShifts[0]?.values.map((r: any[]) => ({
      country: r[0], todayTone: r[1], yesterdayTone: r[2], count: r[3],
      change: (r[1] as number) - (r[2] as number),
    })).filter((s: any) => s.todayTone !== null && s.yesterdayTone !== null) || [];

    const emergingNarratives = archiveDb.exec(`
      SELECT title, domain, tone, published_at
      FROM news_archive
      WHERE date(published_at) = date(?)
        AND title != ''
        AND (title LIKE '%tariff%' OR title LIKE '%trade war%' OR title LIKE '%sanction%'
          OR title LIKE '%rate cut%' OR title LIKE '%inflation%' OR title LIKE '%earnings%'
          OR title LIKE '%election%' OR title LIKE '%war%' OR title LIKE '%crisis%'
          OR title LIKE '%recession%' OR title LIKE '%bull%' OR title LIKE '%bear%'
          OR title LIKE '%FDA%' OR title LIKE '%merger%' OR title LIKE '%acquisition%'
          OR title LIKE '%IPO%' OR title LIKE '%ban%' OR title LIKE '%deal%')
      ORDER BY ABS(tone) DESC LIMIT 15
    `, [anchorDate]);
    const narratives = emergingNarratives[0]?.values.map((r: any[]) => ({
      title: r[0], domain: r[1], tone: r[2], publishedAt: r[3],
    })) || [];

    const coverageByCountry = archiveDb.exec(`
      SELECT source_country, COUNT(*) as cnt, AVG(tone) as avg_tone
      FROM news_archive
      WHERE date(published_at) = date(?) AND source_country != ''
      GROUP BY source_country
      ORDER BY cnt DESC LIMIT 10
    `, [anchorDate]);
    const coverage = coverageByCountry[0]?.values.map((r: any[]) => ({
      country: r[0], count: r[1], avgTone: r[2],
    })) || [];

    const totalToday = archiveDb.exec(`
      SELECT COUNT(*) FROM news_archive WHERE date(published_at) = date(?)
    `, [anchorDate]);
    const totalYesterday = archiveDb.exec(`
      SELECT COUNT(*) FROM news_archive WHERE date(published_at) = date(?, '-1 day')
    `, [anchorDate]);

    const breakingFromRSS = newsDb.exec(`
      SELECT a.title, s.name as source_name, a.url, a.published_at
      FROM articles a LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= datetime('now', '-6 hours')
      ORDER BY a.published_at DESC LIMIT 5
    `);
    const breaking = breakingFromRSS[0]?.values.map((r: any[]) => ({
      title: r[0], source: r[1], url: r[2], publishedAt: r[3],
    })) || [];

    res.json({
      generatedAt: new Date().toISOString(),
      archiveDateRange: { anchor: anchorDate },
      topStories: stories,
      sentimentShifts: shifts,
      emergingNarratives: narratives,
      coverageByCountry: coverage,
      breakingNews: breaking,
      stats: {
        articlesToday: totalToday[0]?.values[0]?.[0] || 0,
        articlesYesterday: totalYesterday[0]?.values[0]?.[0] || 0,
      },
    });
  } catch (err: any) {
    log.error('Failed to generate daily briefing', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to generate daily briefing' });
  }
});

// ── AI-Powered Executive Summary ────────────────────────────────────────────

async function gatherBriefingContext(archiveDb: any, newsDb: any): Promise<{ anchorDate: string; context: string } | null> {
  const maxDateResult = archiveDb.exec(`SELECT MAX(published_at) FROM news_archive`);
  const maxDate = maxDateResult[0]?.values[0]?.[0] as string || '';
  if (!maxDate) return null;

  const anchorDate = maxDate.substring(0, 10);

  const topStories = archiveDb.exec(`
    SELECT title, domain, source_country, tone
    FROM news_archive
    WHERE date(published_at) = date(?) AND title != ''
    ORDER BY ABS(tone) DESC LIMIT 10
  `, [anchorDate]);
  const stories = topStories[0]?.values.map((r: any[]) =>
    `  - "${r[0]}" (${r[1]}, ${r[2] || 'unknown'}, tone: ${r[3] != null ? (r[3] as number).toFixed(1) : '0.0'})`
  ).join('\n') || '  (none)';

  const sentimentShifts = archiveDb.exec(`
    SELECT source_country,
           AVG(CASE WHEN date(published_at) = date(?) THEN tone END) as todayTone,
           AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END) as yesterdayTone
    FROM news_archive
    WHERE date(published_at) IN (date(?), date(?, '-1 day')) AND source_country != ''
    GROUP BY source_country HAVING COUNT(*) >= 3
    ORDER BY ABS(AVG(CASE WHEN date(published_at) = date(?) THEN tone END) -
                  AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END)) DESC
    LIMIT 8
  `, [anchorDate, anchorDate, anchorDate, anchorDate, anchorDate, anchorDate]);
  const shifts = sentimentShifts[0]?.values.map((r: any[]) => {
    const today = r[1] != null ? (r[1] as number) : 0;
    const yesterday = r[2] != null ? (r[2] as number) : 0;
    const change = (today - yesterday).toFixed(1);
    const arrow = parseFloat(change) > 0 ? '↑' : parseFloat(change) < 0 ? '↓' : '→';
    return `  - ${r[0]}: tone shifted ${arrow} by ${change} (today: ${today.toFixed(1)}, yesterday: ${yesterday.toFixed(1)})`;
  }).join('\n') || '  (none)';

  const narratives = archiveDb.exec(`
    SELECT title, tone FROM news_archive
    WHERE date(published_at) = date(?) AND title != ''
      AND (title LIKE '%tariff%' OR title LIKE '%trade war%' OR title LIKE '%sanction%'
        OR title LIKE '%rate cut%' OR title LIKE '%inflation%' OR title LIKE '%earnings%'
        OR title LIKE '%election%' OR title LIKE '%war%' OR title LIKE '%crisis%'
        OR title LIKE '%recession%' OR title LIKE '%bull%' OR title LIKE '%bear%'
        OR title LIKE '%merger%' OR title LIKE '%acquisition%' OR title LIKE '%deal%')
    ORDER BY ABS(tone) DESC LIMIT 10
  `, [anchorDate]);
  const narrativeList = narratives[0]?.values.map((r: any[]) =>
    `  - "${r[0]}" (tone: ${r[1] != null ? (r[1] as number).toFixed(1) : '0.0'})`
  ).join('\n') || '  (none)';

  const coverage = archiveDb.exec(`
    SELECT source_country, COUNT(*) as cnt, AVG(tone) as avg_tone
    FROM news_archive WHERE date(published_at) = date(?) AND source_country != ''
    GROUP BY source_country ORDER BY cnt DESC LIMIT 10
  `, [anchorDate]);
  const coverageList = coverage[0]?.values.map((r: any[]) =>
    `  - ${r[0]}: ${r[1]} articles, avg tone ${r[2] != null ? (r[2] as number).toFixed(1) : '0.0'}`
  ).join('\n') || '  (none)';

  const totalToday = archiveDb.exec(`SELECT COUNT(*) FROM news_archive WHERE date(published_at) = date(?)`, [anchorDate]);
  const totalYesterday = archiveDb.exec(`SELECT COUNT(*) FROM news_archive WHERE date(published_at) = date(?, '-1 day')`, [anchorDate]);
  const todayCount = totalToday[0]?.values[0]?.[0] as number || 0;
  const yesterdayCount = totalYesterday[0]?.values[0]?.[0] as number || 0;

  const breaking = newsDb.exec(`
    SELECT a.title, s.name as source_name
    FROM articles a LEFT JOIN sources s ON a.source_id = s.id
    WHERE a.published_at >= datetime('now', '-6 hours')
    ORDER BY a.published_at DESC LIMIT 5
  `);
  const breakingList = breaking[0]?.values.map((r: any[]) =>
    `  - "${r[0]}" (${r[1]})`
  ).join('\n') || '  (none)';

  const context = `Date: ${anchorDate}
Article volume: ${todayCount} today, ${yesterdayCount} yesterday (${todayCount > yesterdayCount ? '↑' : todayCount < yesterdayCount ? '↓' : '→'} ${todayCount - yesterdayCount} vs yesterday)

TOP STORIES (sorted by impact):
${stories}

SENTIMENT SHIFTS (country-level tone changes):
${shifts}

EMERGING NARRATIVES (market-moving themes):
${narratives}

COVERAGE BY COUNTRY:
${coverageList}

BREAKING / RECENT (last 6 hours):
${breakingList}`;

  return { anchorDate, context };
}

function buildSummaryPrompt(context: string): string {
  return `You are a senior political and market intelligence analyst. Write a concise executive briefing based on the following data.

FORMAT:
- Lead with the 2-3 most important stories in 1-2 sentences
- A "Market Sentiment" paragraph covering overall tone and notable country shifts
- A "Key Themes" bullet list (3-5 bullets) of emerging narratives
- A "Watch List" line with 1-2 things to monitor

STYLE:
- Professional, direct, no fluff
- No markdown headers — just plain text with line breaks
- Under 300 words total
- Write as if briefing a portfolio manager at market open

DATA:
${context}`;
}

async function callLlm(prompt: string, config: { url: string; apiKey: string; model: string; provider: string }): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  let url: string;
  let body: any;

  if (config.provider === 'ollama') {
    const ollamaUrl = config.url.replace(/\/api\/chat\/?$/, '').replace(/\/$/, '');
    url = `${ollamaUrl}/api/chat`;
    body = {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };
  } else {
    url = `${config.url}/chat/completions`;
    body = {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.4,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`LLM returned ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json() as any;

    if (config.provider === 'ollama') {
      return data.message?.content || '';
    }
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

briefingRoutes.post('/ai-summary', async (_req: Request, res: Response) => {
  try {
    const archiveDb = await getNewsArchiveDb();
    const newsDb = await getDb();

    // Read default LLM config
    newsDb.run(ensureLlmTable());
    seedLlmDefaults(newsDb);
    const configResult = newsDb.exec('SELECT * FROM llm_configs WHERE is_default = 1 LIMIT 1');
    if (!configResult[0]?.values[0]) {
      res.json({ summary: null, reason: 'No LLM configured. Add one in Settings > LLM Configuration.' });
      return;
    }

    const row = configResult[0].values[0];
    const llmConfig = {
      provider: row[2] as string,
      url: row[3] as string,
      apiKey: row[4] as string,
      model: row[5] as string,
    };

    // Gather context
    const result = await gatherBriefingContext(archiveDb, newsDb);
    if (!result) {
      res.json({ summary: null, reason: 'No archive data available to summarize.' });
      return;
    }

    const prompt = buildSummaryPrompt(result.context);
    log.info('Generating AI briefing summary', { model: llmConfig.model, provider: llmConfig.provider });

    const summary = await callLlm(prompt, llmConfig);

    if (!summary) {
      res.json({ summary: null, reason: 'LLM returned empty response.' });
      return;
    }

    res.json({ summary, anchorDate: result.anchorDate, model: llmConfig.model });
  } catch (err: any) {
    log.error('Failed to generate AI briefing summary', { error: err.message });
    if (err.name === 'AbortError') {
      res.json({ summary: null, reason: 'LLM request timed out (30s).' });
      return;
    }
    res.json({ summary: null, reason: `LLM error: ${err.message}` });
  }
});
