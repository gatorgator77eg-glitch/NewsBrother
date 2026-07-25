import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';
import { getDb } from '../db';
import { getStockDb } from '../stocks/db';
import { callLlm, getDefaultLlmConfig } from '../utils/llmClient';

const log = createLogger({ module: 'ai' });
export const aiRoutes = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function getTickerAliases(): Record<string, string[]> {
  return {
    AAPL: ['Apple'], MSFT: ['Microsoft'], GOOGL: ['Google', 'Alphabet'], AMZN: ['Amazon'],
    NVDA: ['Nvidia'], META: ['Meta', 'Facebook'], TSLA: ['Tesla'], JPM: ['JPMorgan'],
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
    RIO: ['Rio Tinto'], BHP: ['BHP'], NAB: ['National Australia'],
  };
}

function buildTickerWhere(symbol: string, aliases: string[]): string {
  const parts = [`title LIKE '%${symbol}%'`];
  for (const a of aliases) parts.push(`title LIKE '%${a}%'`);
  return `(${parts.join(' OR ')})`;
}

function safeToFixed(v: unknown, d = 1): string {
  return v != null ? (v as number).toFixed(d) : '0.0';
}

async function askLlm(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { maxTokens?: number; temperature?: number }
): Promise<{ text: string; model: string } | { text: null; reason: string }> {
  const config = await getDefaultLlmConfig();
  if (!config) return { text: null, reason: 'No LLM configured. Add one in Settings > LLM Configuration.' };
  try {
    const text = await callLlm(messages, config, opts);
    if (!text) return { text: null, reason: 'LLM returned empty response.' };
    return { text, model: config.model };
  } catch (err: any) {
    return { text: null, reason: `LLM error: ${err.message}` };
  }
}

// ── 1. AI Analyst Chat ──────────────────────────────────────────────────────

aiRoutes.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, symbol } = req.body as { messages: { role: string; content: string }[]; symbol?: string };
    if (!messages?.length) return res.status(400).json({ error: 'messages array required' });

    const archiveDb = await getNewsArchiveDb();
    const newsDb = await getDb();
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // Detect ticker from explicit param or from user message
    let ticker = symbol?.toUpperCase() || '';
    if (!ticker) {
      const match = lastUser.match(/\b([A-Z]{1,5})\b/);
      if (match) {
        const stockDb = await getStockDb();
        const check = stockDb.exec('SELECT 1 FROM stock_tickers WHERE symbol = ? LIMIT 1', [match[1]]);
        if (check[0]?.values[0]) ticker = match[1];
      }
    }

    let context = '';

    if (ticker) {
      // Ticker-specific context
      const aliases = getTickerAliases();
      const where = buildTickerWhere(ticker, aliases[ticker] || []);

      // Velocity
      const vel = newsDb.exec(`
        SELECT COUNT(*) as today,
               (SELECT AVG(cnt) FROM (
                 SELECT date(published_at) as d, COUNT(*) as cnt
                 FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-30 days')
                 GROUP BY date(published_at)
               )) as avg30
        FROM news_archive WHERE ${where} AND date(published_at) = date('now')
      `);
      const todayCount = vel[0]?.values[0]?.[0] as number || 0;
      const avg30 = vel[0]?.values[0]?.[1] as number || 1;
      const velocityScore = todayCount / Math.max(avg30, 0.1);

      // Sentiment
      const sent = newsDb.exec(`
        SELECT AVG(tone), COUNT(*), MIN(tone), MAX(tone)
        FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-7 days')
      `);
      const avgTone = sent[0]?.values[0]?.[0] as number || 0;
      const sentCount = sent[0]?.values[0]?.[1] as number || 0;

      // Recent headlines
      const headlines = newsDb.exec(`
        SELECT title, tone, domain FROM news_archive
        WHERE ${where} ORDER BY published_at DESC LIMIT 10
      `);
      const hl = headlines[0]?.values.map(r =>
        `  - "${r[0]}" (tone: ${safeToFixed(r[1])}, source: ${r[2]})`
      ).join('\n') || '  (none)';

      // Price (if available)
      const stockDb = await getStockDb();
      const price = stockDb.exec(`
        SELECT close, (close - LAG(close) OVER (ORDER BY date)) / LAG(close) OVER (ORDER BY date) * 100 as pct_change
        FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 5
      `, [ticker]);
      const priceCtx = price[0]?.values.map(r =>
        `  $${(r[0] as number)?.toFixed(2)} (${r[1] != null ? (r[1] as number).toFixed(2) : 'n/a'}%)`
      ).join('\n') || '  (no price data)';

      context = `TICKER: ${ticker}
VELOCITY SCORE: ${velocityScore.toFixed(1)}x (${todayCount} articles today vs ${avg30.toFixed(1)} avg)
SENTIMENT (7d): avg tone ${safeToFixed(avgTone)} from ${sentCount} articles
RECENT PRICE:
${priceCtx}
RECENT HEADLINES:
${headlines[0]?.values.length ? headlines[0].values.map(r => `  - "${r[0]}" (tone: ${safeToFixed(r[1])})`).join('\n') : '  (none)'}`;
    } else {
      // General context: top stories + sentiment shifts
      const maxDate = archiveDb.exec('SELECT MAX(published_at) FROM news_archive');
      const anchor = (maxDate[0]?.values[0]?.[0] as string || '').substring(0, 10);
      if (anchor) {
        const topStories = archiveDb.exec(`
          SELECT title, domain, source_country, tone FROM news_archive
          WHERE date(published_at) = date(?) AND title != ''
          ORDER BY ABS(tone) DESC LIMIT 10
        `, [anchor]);
        const stories = topStories[0]?.values.map(r =>
          `  - "${r[0]}" (${r[1]}, ${r[2]}, tone: ${safeToFixed(r[3])})`
        ).join('\n') || '  (none)';

        const shifts = archiveDb.exec(`
          SELECT source_country,
                 AVG(CASE WHEN date(published_at) = date(?) THEN tone END) as t,
                 AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END) as y
          FROM news_archive
          WHERE date(published_at) IN (date(?), date(?, '-1 day')) AND source_country != ''
          GROUP BY source_country HAVING COUNT(*) >= 3
          ORDER BY ABS(AVG(CASE WHEN date(published_at) = date(?) THEN tone END) -
                        AVG(CASE WHEN date(published_at) = date(?, '-1 day') THEN tone END)) DESC
          LIMIT 8
        `, [anchor, anchor, anchor, anchor, anchor, anchor]);
        const shiftText = shifts[0]?.values.map(r => {
          const change = ((r[1] as number || 0) - (r[2] as number || 0));
          return `  - ${r[0]}: ${change > 0 ? '+' : ''}${change.toFixed(1)}`;
        }).join('\n') || '  (none)';

        context = `DATE: ${anchor}
TOP STORIES:
${stories}
SENTIMENT SHIFTS:
${shiftText}`;
      }
    }

    const systemPrompt = `You are a senior political and market intelligence analyst. Answer based on the provided data. Be direct, specific, and use numbers. If the data doesn't contain enough information to answer, say so clearly.`;

    const fullMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `DATA CONTEXT:\n${context}\n\nQUESTION: ${lastUser}` },
    ];

    const result = await askLlm(fullMessages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })), { maxTokens: 1024, temperature: 0.4 });
    if (result.text === null) return res.json({ response: null, reason: result.reason });
    res.json({ response: result.text, model: result.model, contextApplied: ticker || 'general' });
  } catch (err: any) {
    log.error('AI chat failed', { error: err.message });
    res.json({ response: null, reason: err.message });
  }
});

// ── 2. AI Risk Radar ────────────────────────────────────────────────────────

aiRoutes.post('/risk-radar', async (req: Request, res: Response) => {
  try {
    const { symbol, days = 30 } = req.body as { symbol: string; days?: number };
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    const sym = symbol.toUpperCase();
    const archiveDb = await getNewsArchiveDb();
    const aliases = getTickerAliases();
    const where = buildTickerWhere(sym, aliases[sym] || []);

    // Velocity
    const vel = archiveDb.exec(`
      SELECT COUNT(*) as today,
             (SELECT AVG(cnt) FROM (
               SELECT date(published_at) as d, COUNT(*) as cnt
               FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-30 days')
               GROUP BY date(published_at)
             )) as avg30
      FROM news_archive WHERE ${where} AND date(published_at) = date('now')
    `);
    const todayCount = vel[0]?.values[0]?.[0] as number || 0;
    const avg30 = vel[0]?.values[0]?.[1] as number || 1;
    const velocityScore = todayCount / Math.max(avg30, 0.1);

    // Sentiment trend (7d vs 30d)
    const sent7 = archiveDb.exec(`SELECT AVG(tone), COUNT(*) FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-7 days')`);
    const sent30 = archiveDb.exec(`SELECT AVG(tone), COUNT(*) FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-30 days')`);
    const tone7 = sent7[0]?.values[0]?.[0] as number || 0;
    const tone30 = sent30[0]?.values[0]?.[0] as number || 0;
    const count7 = sent7[0]?.values[0]?.[1] as number || 0;
    const count30 = sent30[0]?.values[0]?.[1] as number || 0;

    // Tone polarization (std dev approximation)
    const toneValues = archiveDb.exec(`
      SELECT tone FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-${days} days')
    `);
    const tones = (toneValues[0]?.values || []).map(r => r[0] as number);
    const toneMean = tones.length ? tones.reduce((a, b) => a + b, 0) / tones.length : 0;
    const toneStd = tones.length > 1 ? Math.sqrt(tones.reduce((s, t) => s + (t - toneMean) ** 2, 0) / (tones.length - 1)) : 0;

    // Source concentration
    const sources = archiveDb.exec(`
      SELECT domain, COUNT(*) as cnt FROM news_archive
      WHERE ${where} AND published_at >= datetime('now', '-7 days')
      GROUP BY domain ORDER BY cnt DESC LIMIT 5
    `);
    const topSource = sources[0]?.values[0]?.[1] as number || 0;
    const totalRecent = count7 || 1;
    const sourceConcentration = topSource / totalRecent;

    // Headlines
    const headlines = archiveDb.exec(`
      SELECT title, tone, domain, published_at FROM news_archive
      WHERE ${where} ORDER BY published_at DESC LIMIT 8
    `);
    const hl = headlines[0]?.values.map(r =>
      `  - "${r[0]}" (tone: ${safeToFixed(r[1])}, ${r[2]}, ${r[3]})`
    ).join('\n') || '  (none)';

    const context = `TICKER: ${sym}
VELOCITY: ${velocityScore.toFixed(1)}x (${todayCount} today vs ${avg30.toFixed(1)} avg)
SENTIMENT 7d: tone ${safeToFixed(tone7)} from ${count7} articles
SENTIMENT 30d: tone ${safeToFixed(tone30)} from ${count30} articles
SENTIMENT SHIFT: ${safeToFixed(tone7 - tone30)} (7d minus 30d)
TONE VOLATILITY: σ = ${toneStd.toFixed(2)} (polarization measure)
SOURCE CONCENTRATION: top source = ${(sourceConcentration * 100).toFixed(0)}% of recent coverage
RECENT HEADLINES:
${headlines[0]?.values.length ? hl : '  (no recent articles)'}`;

    const prompt = `You are a risk analyst. Given these multi-signal analytics for ${sym}, produce:

1. RISK SUMMARY (2-3 sentences): overall risk assessment
2. KEY CONCERNS (3-5 bullet points): specific risk factors with numbers
3. TAIL RISK SCENARIOS (2-3 scenarios): worst-case possibilities
4. CONFIDENCE LEVEL: High / Medium / Low with reasoning

Be specific with numbers. Use the data provided.`;

    const result = await askLlm([
      { role: 'system', content: 'You are a risk analyst for financial markets.' },
      { role: 'user', content: `${context}\n\n${prompt}` },
    ], { maxTokens: 1024, temperature: 0.3 });

    if (result.text === null) return res.json({ analysis: null, reason: result.reason });
    res.json({ analysis: result.text, model: result.model, symbol: sym, data: { velocityScore, tone7, tone30, toneStd, sourceConcentration, count7, count30 } });
  } catch (err: any) {
    log.error('Risk radar failed', { error: err.message });
    res.json({ analysis: null, reason: err.message });
  }
});

// ── 3. AI Narrative Decoder ─────────────────────────────────────────────────

aiRoutes.post('/narrative-decoder', async (req: Request, res: Response) => {
  try {
    const { topic, days = 30 } = req.body as { topic: string; days?: number };
    if (!topic) return res.status(400).json({ error: 'topic required' });
    const archiveDb = await getNewsArchiveDb();
    const words = topic.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    const likeClause = words.map((w: string) => `title LIKE '%${w}%'`).join(' OR ');

    // Articles matching topic
    const articles = archiveDb.exec(`
      SELECT title, domain, source_country, tone, published_at FROM news_archive
      WHERE (${likeClause}) AND published_at >= datetime('now', '-${days} days') AND title != ''
      ORDER BY published_at DESC LIMIT 50
    `);
    const rows = articles[0]?.values || [];

    // Left/Center/Right classification
    const DOMAIN_LEAN: Record<string, string> = {
      'nytimes.com': 'left', 'washingtonpost.com': 'left', 'cnn.com': 'left',
      'theguardian.com': 'left', 'huffpost.com': 'left', 'msnbc.com': 'left',
      'reuters.com': 'center', 'apnews.com': 'center', 'bbc.com': 'center',
      'bbc.co.uk': 'center', 'economist.com': 'center',
      'foxnews.com': 'right', 'nationalreview.com': 'right', 'wsj.com': 'right',
      'nypost.com': 'right', 'dailymail.co.uk': 'right', 'breitbart.com': 'right',
      'oann.com': 'right', 'washingtontimes.com': 'right',
    };

    const buckets: Record<string, { titles: string[]; tones: number[]; domains: string[] }> = {
      left: { titles: [], tones: [], domains: [] },
      center: { titles: [], tones: [], domains: [] },
      right: { titles: [], tones: [], domains: [] },
    };

    for (const r of rows) {
      const domain = (r[1] as string || '').toLowerCase();
      const lean = DOMAIN_LEAN[domain] || 'center';
      buckets[lean].titles.push(r[0] as string);
      buckets[lean].tones.push(r[3] as number || 0);
      buckets[lean].domains.push(domain);
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // Exclusive words per lean
    const wordFreq: Record<string, Record<string, number>> = { left: {}, center: {}, right: {} };
    for (const [lean, data] of Object.entries(buckets)) {
      for (const title of data.titles) {
        for (const word of title.toLowerCase().split(/\s+/)) {
          const w = word.replace(/[^a-z0-9]/g, '');
          if (w.length > 3) wordFreq[lean][w] = (wordFreq[lean][w] || 0) + 1;
        }
      }
    }
    const allWords = new Set([...Object.keys(wordFreq.left), ...Object.keys(wordFreq.center), ...Object.keys(wordFreq.right)]);
    const exclusiveWords: Record<string, string[]> = { left: [], center: [], right: [] };
    for (const w of allWords) {
      const inLeft = (wordFreq.left[w] || 0) > 2;
      const inCenter = (wordFreq.center[w] || 0) > 2;
      const inRight = (wordFreq.right[w] || 0) > 2;
      const total = (wordFreq.left[w] || 0) + (wordFreq.center[w] || 0) + (wordFreq.right[w] || 0);
      if (total < 3) continue;
      if (inLeft && !inCenter && !inRight) exclusiveWords.left.push(w);
      if (inCenter && !inLeft && !inRight) exclusiveWords.center.push(w);
      if (inRight && !inLeft && !inCenter) exclusiveWords.right.push(w);
    }

    // Blindspot detection
    const hasLeft = buckets.left.titles.length > 0;
    const hasCenter = buckets.center.titles.length > 0;
    const hasRight = buckets.right.titles.length > 0;
    const blindspots: string[] = [];
    if (!hasLeft) blindspots.push('Left-leaning sources are not covering this topic');
    if (!hasCenter) blindspots.push('Center/mainstream sources are not covering this topic');
    if (!hasRight) blindspots.push('Right-leaning sources are not covering this topic');

    const context = `TOPIC: ${topic}
TOTAL ARTICLES: ${rows.length} (last ${days} days)

LEFT-LEANING (${buckets.left.titles.length} articles, avg tone: ${safeToFixed(avg(buckets.left.tones))}):
Top sources: ${[...new Set(buckets.left.domains)].slice(0, 5).join(', ') || 'none'}
Exclusive vocabulary: ${exclusiveWords.left.slice(0, 10).join(', ') || 'none'}
Headlines:
${buckets.left.titles.slice(0, 5).map(t => `  - "${t}"`).join('\n') || '  (none)'}

CENTER (${buckets.center.titles.length} articles, avg tone: ${safeToFixed(avg(buckets.center.tones))}):
Top sources: ${[...new Set(buckets.center.domains)].slice(0, 5).join(', ') || 'none'}
Exclusive vocabulary: ${exclusiveWords.center.slice(0, 10).join(', ') || 'none'}
Headlines:
${buckets.center.titles.slice(0, 5).map(t => `  - "${t}"`).join('\n') || '  (none)'}

RIGHT-LEANING (${buckets.right.titles.length} articles, avg tone: ${safeToFixed(avg(buckets.right.tones))}):
Top sources: ${[...new Set(buckets.right.domains)].slice(0, 5).join(', ') || 'none'}
Exclusive vocabulary: ${exclusiveWords.right.slice(0, 10).join(', ') || 'none'}
Headlines:
${buckets.right.titles.slice(0, 5).map(t => `  - "${t}"`).join('\n') || '  (none)'}

BLINDSPOTS: ${blindspots.length ? blindspots.join('; ') : 'None detected — all perspectives represented'}`;

    const prompt = `You are a media analysis expert. Given left/center/right sentiment data and vocabulary for the topic "${topic}", produce:

1. FRAMING ANALYSIS: How each political side frames this issue (2-3 sentences per side)
2. VOCABULARY BREAKDOWN: What the exclusive word choices reveal about each side's perspective
3. BLINDSPOT REPORT: What perspectives or facts are being ignored by each side
4. TRUTH ASSESSMENT: A balanced middle-ground synthesis based on the data

Be objective and evidence-based. Reference specific headlines and numbers.`;

    const result = await askLlm([
      { role: 'system', content: 'You are a neutral media analysis expert.' },
      { role: 'user', content: `${context}\n\n${prompt}` },
    ], { maxTokens: 1500, temperature: 0.3 });

    if (result.text === null) return res.json({ analysis: null, reason: result.reason });
    res.json({
      analysis: result.text, model: result.model, topic,
      data: {
        left: { count: buckets.left.titles.length, avgTone: avg(buckets.left.tones), exclusiveWords: exclusiveWords.left.slice(0, 10) },
        center: { count: buckets.center.titles.length, avgTone: avg(buckets.center.tones), exclusiveWords: exclusiveWords.center.slice(0, 10) },
        right: { count: buckets.right.titles.length, avgTone: avg(buckets.right.tones), exclusiveWords: exclusiveWords.right.slice(0, 10) },
        blindspots,
      },
    });
  } catch (err: any) {
    log.error('Narrative decoder failed', { error: err.message });
    res.json({ analysis: null, reason: err.message });
  }
});

// ── 4. AI Catalyst Engine ───────────────────────────────────────────────────

aiRoutes.post('/catalyst-engine', async (req: Request, res: Response) => {
  try {
    const { symbol, days = 30 } = req.body as { symbol: string; days?: number };
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    const sym = symbol.toUpperCase();
    const archiveDb = await getNewsArchiveDb();
    const aliases = getTickerAliases();
    const where = buildTickerWhere(sym, aliases[sym] || []);

    // Velocity spikes (days with >= 2x avg)
    const daily = archiveDb.exec(`
      SELECT date(published_at) as d, COUNT(*) as cnt, AVG(tone) as avg_tone
      FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-${days} days')
      GROUP BY date(published_at) ORDER BY d
    `);
    const dailyRows = daily[0]?.values || [];
    const avgDaily = dailyRows.length ? dailyRows.reduce((s, r) => s + (r[1] as number), 0) / dailyRows.length : 1;
    const spikes = dailyRows.filter(r => (r[1] as number) >= avgDaily * 2).map(r => ({
      date: r[0], count: r[1] as number, tone: r[2] as number,
    }));

    // Tone shifts (day-over-day changes)
    const toneShifts: { date: string; change: number }[] = [];
    for (let i = 1; i < dailyRows.length; i++) {
      const prev = dailyRows[i - 1][2] as number || 0;
      const curr = dailyRows[i][2] as number || 0;
      if (Math.abs(curr - prev) > 1) toneShifts.push({ date: dailyRows[i][0] as string, change: curr - prev });
    }

    // Source concentration per spike
    const spikeDetails = spikes.slice(-5).map(s => {
      const src = archiveDb.exec(`
        SELECT domain, COUNT(*) as cnt FROM news_archive
        WHERE ${where} AND date(published_at) = ? GROUP BY domain ORDER BY cnt DESC
      `, [s.date]);
      const topDomains = (src[0]?.values || []).slice(0, 3).map(r => `${r[0]}(${r[1]})`).join(', ');
      return `  - ${s.date}: ${s.count} articles (tone: ${safeToFixed(s.tone)}), sources: ${topDomains}`;
    }).join('\n') || '  (no spikes)';

    // Sector context
    const stockDb = await getStockDb();
    const sector = stockDb.exec('SELECT sector FROM stock_tickers WHERE symbol = ? LIMIT 1', [sym]);
    const sectorName = sector[0]?.values[0]?.[0] as string || 'unknown';
    const sectorArticles = archiveDb.exec(`
      SELECT COUNT(*), AVG(tone) FROM news_archive
      WHERE source_country != '' AND published_at >= datetime('now', '-7 days')
        AND (domain LIKE '%tech%' OR domain LIKE '%finance%' OR domain LIKE '%energy%' OR domain LIKE '%health%')
    `);

    const context = `TICKER: ${sym} (sector: ${sectorName})
VELOCITY SPIKES (>= 2x avg, last ${days} days):
${spikes.length ? spikeDetails : '  (no significant spikes)'}

TONE SHIFTS (day-over-day > 1 point):
${toneShifts.slice(-5).map(s => `  - ${s.date}: ${s.change > 0 ? '+' : ''}${s.change.toFixed(1)}`).join('\n') || '  (none)'}

DAILY COVERAGE:
${dailyRows.slice(-7).map(r => `  - ${r[0]}: ${r[1]} articles, tone ${safeToFixed(r[2])}`).join('\n') || '  (none)'}`;

    const prompt = `You are a catalyst analyst. Given news velocity, tone shifts, and coverage data for ${sym}, produce:

1. ACTIVE CATALYSTS: What's driving the stock now (2-4 items with specific dates/data)
2. POTENTIAL CATALYSTS: What could drive it next (2-3 forward-looking items)
3. CATALYST RISK: Single-source risk, fading narratives, coverage concentration
4. WATCH LIST: Specific events, dates, or data points to monitor

Use specific data points from the context.`;

    const result = await askLlm([
      { role: 'system', content: 'You are a stock catalyst analyst.' },
      { role: 'user', content: `${context}\n\n${prompt}` },
    ], { maxTokens: 1024, temperature: 0.3 });

    if (result.text === null) return res.json({ analysis: null, reason: result.reason });
    res.json({ analysis: result.text, model: result.model, symbol: sym, data: { spikes, toneShifts, sector: sectorName } });
  } catch (err: any) {
    log.error('Catalyst engine failed', { error: err.message });
    res.json({ analysis: null, reason: err.message });
  }
});

// ── 5. AI Sentiment Forecaster ──────────────────────────────────────────────

aiRoutes.post('/sentiment-forecaster', async (req: Request, res: Response) => {
  try {
    const { symbol, country, days = 60 } = req.body as { symbol?: string; country?: string; days?: number };
    if (!symbol && !country) return res.status(400).json({ error: 'symbol or country required' });
    const archiveDb = await getNewsArchiveDb();

    let target = '';
    let where = '';
    let filterDesc = '';

    if (symbol) {
      const sym = symbol.toUpperCase();
      const aliases = getTickerAliases();
      where = buildTickerWhere(sym, aliases[sym] || []);
      target = sym;
      filterDesc = `ticker ${sym}`;
    } else {
      where = `source_country = '${country!}'`;
      target = country!;
      filterDesc = `country ${country}`;
    }

    // Historical sentiment timeline (daily)
    const timeline = archiveDb.exec(`
      SELECT date(published_at) as d, AVG(tone) as avg_tone, COUNT(*) as cnt
      FROM news_archive WHERE ${where} AND published_at >= datetime('now', '-${days} days')
      GROUP BY date(published_at) ORDER BY d
    `);
    const tlRows = timeline[0]?.values || [];

    // 7-day trend (linear regression slope)
    const last7 = tlRows.slice(-7);
    const slope = last7.length > 1
      ? (() => {
          const n = last7.length;
          const xs = last7.map((_, i) => i);
          const ys = last7.map(r => r[1] as number || 0);
          const xMean = xs.reduce((a, b) => a + b, 0) / n;
          const yMean = ys.reduce((a, b) => a + b, 0) / n;
          const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
          const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
          return den ? num / den : 0;
        })()
      : 0;

    // Volume trend (last 7d vs prev 7d)
    const recent7Count = tlRows.slice(-7).reduce((s, r) => s + (r[2] as number || 0), 0);
    const prev7Count = tlRows.slice(-14, -7).reduce((s, r) => s + (r[2] as number || 0), 0);
    const volumeTrend = prev7Count > 0 ? ((recent7Count - prev7Count) / prev7Count) * 100 : 0;

    // Current regime
    const lastTone = tlRows.length ? tlRows[tlRows.length - 1][1] as number : 0;
    const avgAll = tlRows.length ? tlRows.reduce((s, r) => s + (r[1] as number || 0), 0) / tlRows.length : 0;
    let regime = 'neutral';
    if (lastTone > 2 && slope > 0.1) regime = 'greed';
    else if (lastTone < -2 && slope < -0.1) regime = 'fear';
    else if (Math.abs(slope) > 0.2) regime = 'transition';

    // Extreme days
    const extremes = [...tlRows].sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number)).slice(0, 5);

    const context = `TARGET: ${filterDesc}
SENTIMENT TIMELINE (last ${days} days):
${tlRows.map(r => `  ${r[0]}: tone ${safeToFixed(r[1])} (${r[2]} articles)`).join('\n') || '  (no data)'}

7-DAY TREND SLOPE: ${slope.toFixed(3)} (${slope > 0.1 ? 'improving' : slope < -0.1 ? 'deteriorating' : 'stable'})
VOLUME TREND: ${volumeTrend > 0 ? '+' : ''}${volumeTrend.toFixed(0)}% (last 7d vs prev 7d)
CURRENT TONE: ${safeToFixed(lastTone)}
60-DAY AVG: ${safeToFixed(avgAll)}
CURRENT REGIME: ${regime}
EXTREME DAYS:
${extremes.map(r => `  ${r[0]}: tone ${safeToFixed(r[1])} (${r[2]} articles)`).join('\n') || '  (none)'}`;

    const prompt = `You are a sentiment forecaster. Given the 60-day sentiment history and current trajectory for ${filterDesc}, produce:

1. SENTIMENT FORECAST: Direction (bullish/bearish/neutral) + confidence (High/Medium/Low) for the next 7 days with reasoning
2. KEY INFLECTION POINTS: What events or conditions could shift sentiment (3-5 items)
3. REGIME CLASSIFICATION: Current market regime with reasoning
4. WATCH SIGNALS: Specific metrics or thresholds that would change the forecast

Be quantitative. Reference specific tone values and trends.`;

    const result = await askLlm([
      { role: 'system', content: 'You are a market sentiment forecaster.' },
      { role: 'user', content: `${context}\n\n${prompt}` },
    ], { maxTokens: 1024, temperature: 0.3 });

    if (result.text === null) return res.json({ analysis: null, reason: result.reason });
    res.json({
      analysis: result.text, model: result.model, target,
      data: { slope, volumeTrend, regime, currentTone: lastTone, avgTone: avgAll, days: tlRows.length },
    });
  } catch (err: any) {
    log.error('Sentiment forecaster failed', { error: err.message });
    res.json({ analysis: null, reason: err.message });
  }
});
