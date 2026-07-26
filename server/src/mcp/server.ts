#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = process.env.API_URL || 'http://localhost:3001';

async function api(path: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
    }
    return await resp.json();
  } catch (err: any) {
    return { error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(data: any, maxLen = 8000): string {
  const str = JSON.stringify(data, null, 2);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `\n... [truncated, ${str.length} total chars]`;
}

const server = new McpServer({
  name: 'political-news',
  version: '1.0.0',
});

// ─── News & Content ────────────────────────────────────────────────

server.tool(
  'search_news',
  'Search news articles by keyword. Returns topic clusters with articles from left, center, and right sources, plus blindspot analysis.',
  { query: z.string().describe('Search keywords'), bias: z.string().optional().describe('Filter by bias: left, lean-left, center, lean-right, right') },
  async ({ query, bias }) => {
    const params = new URLSearchParams({ q: query });
    if (bias) params.set('bias', bias);
    const data = await api(`/api/search?${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_breaking_news',
  'Get the latest breaking news stories across all political leanings.',
  {},
  async () => {
    const data = await api('/api/breaking');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_google_news',
  'Get Google News headlines for a topic or general political news.',
  { q: z.string().optional().describe('Topic query (e.g. "tariffs", "election")') },
  async ({ q }) => {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    const data = await api(`/api/google-news${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_daily_briefing',
  'Get the daily intelligence briefing: top stories, sentiment shifts, narrative divergence, coverage gaps, breaking news, and emerging topics.',
  {},
  async () => {
    const data = await api('/api/briefing/daily');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_news_archive',
  'Search the GDELT historical news archive. Returns articles with tone scores, source countries, and political lean. Use dateFrom/dateTo for date-specific queries (YYYY-MM-DD format).',
  {
    query: z.string().describe('Search keywords'),
    dateFrom: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    dateTo: z.string().optional().describe('End date (YYYY-MM-DD)'),
  },
  async ({ query, dateFrom, dateTo }) => {
    const params = new URLSearchParams({ query });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const data = await api(`/api/news-archive?${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_events',
  'Get upcoming political and market events (elections, policy decisions, earnings, etc.).',
  { country: z.string().optional().describe('Filter by country code (US, GB, etc.)'), days: z.number().optional().default(30).describe('How many days ahead') },
  async ({ country, days }) => {
    const params = new URLSearchParams({ days: String(days || 30) });
    if (country) params.set('country', country);
    const data = await api(`/api/events/events?${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

// ─── Sentiment & Bias ──────────────────────────────────────────────

server.tool(
  'get_sentiment_timeline',
  'Get sentiment (tone) over time for a specific country. Shows how media sentiment has evolved day by day.',
  { country: z.string().describe('Country code (US, GB, DE, JP, etc.)') },
  async ({ country }) => {
    const data = await api(`/api/sentiment/timeline?country=${encodeURIComponent(country)}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_sentiment_waves',
  'Get sentiment shockwave data — sudden spikes or drops in sentiment intensity across countries.',
  {},
  async () => {
    const data = await api('/api/sentiment/waves');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_bias_comparison',
  'Compare how left-leaning and right-leaning sources cover the same topic. Shows framing differences.',
  { topic: z.string().describe('Topic to compare coverage of') },
  async ({ topic }) => {
    const params = new URLSearchParams({ q: topic });
    const data = await api(`/api/bias/compare?${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_world_map',
  'Get country-level article counts and average tone scores for the world map view.',
  {},
  async () => {
    const data = await api('/api/sentiment/world-map');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_left_right',
  'Get the left-right sentiment breakdown — average tone from left-leaning vs right-leaning sources by country.',
  {},
  async () => {
    const data = await api('/api/sentiment/left-right');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

// ─── Stocks & Market ───────────────────────────────────────────────

server.tool(
  'search_stocks',
  'Search for stock tickers by name or symbol. Returns matching tickers with exchange, sector, and country info.',
  { query: z.string().describe('Ticker symbol or company name search') },
  async ({ query }) => {
    const params = new URLSearchParams({ q: query });
    const data = await api(`/api/stocks/search?${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_stock_info',
  'Get detailed info for a stock ticker: prices, sector, exchange, market cap. Use dateFrom/dateTo to narrow price history to a specific date range (YYYY-MM-DD). Without date filters, returns all history (may be large).',
  {
    symbol: z.string().describe('Stock ticker symbol (e.g. AAPL, 0005.HK)'),
    dateFrom: z.string().optional().describe('Start date for price history (YYYY-MM-DD)'),
    dateTo: z.string().optional().describe('End date for price history (YYYY-MM-DD)'),
  },
  async ({ symbol, dateFrom, dateTo }) => {
    const data = await api(`/api/stocks/${encodeURIComponent(symbol)}`);
    // Filter history by date range if provided
    if ((dateFrom || dateTo) && data.history) {
      data.history = data.history.filter((p: any) => {
        if (dateFrom && p.date < dateFrom) return false;
        if (dateTo && p.date > dateTo) return false;
        return true;
      });
    }
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_market_movers',
  'Get volume leaders, top gainers, and top losers across the stock database.',
  { country: z.string().optional().describe('Filter by country code') },
  async ({ country }) => {
    const params = country ? `?country=${encodeURIComponent(country)}` : '';
    const data = await api(`/api/market-analytics/movers${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_market_sectors',
  'Get sector breakdown: how many tickers per sector and their aggregate performance.',
  {},
  async () => {
    const data = await api('/api/market-analytics/sectors');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_correlation',
  'Get news-price correlation analysis for a stock ticker. Shows how news sentiment relates to price movements.',
  {
    symbol: z.string().describe('Stock ticker symbol'),
    days: z.number().optional().describe('Number of days to analyze (default: all available)'),
  },
  async ({ symbol, days }) => {
    const params = days ? `?days=${days}` : '';
    const data = await api(`/api/correlation/ticker/${encodeURIComponent(symbol)}${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_smart_velocity',
  'Get news velocity for a ticker — how fast news is accumulating compared to baseline.',
  { symbol: z.string().describe('Stock ticker symbol') },
  async ({ symbol }) => {
    const data = await api(`/api/smart/velocity/${encodeURIComponent(symbol)}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_smart_impact',
  'Get news impact analysis for a ticker — estimated price impact from news sentiment changes.',
  {
    symbol: z.string().describe('Stock ticker symbol'),
    days: z.number().optional().describe('Number of days to analyze'),
  },
  async ({ symbol, days }) => {
    const params = days ? `?days=${days}` : '';
    const data = await api(`/api/smart/impact/${encodeURIComponent(symbol)}${params}`);
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

// ─── Janus & Deep Analysis ─────────────────────────────────────────

server.tool(
  'get_echo_chamber',
  'Get echo chamber analysis — how isolated different political leanings are in their news consumption for a topic.',
  {},
  async () => {
    const data = await api('/api/janus/echo-chamber');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

server.tool(
  'get_divergence',
  'Get narrative divergence — topics where left and right coverage significantly disagree.',
  {},
  async () => {
    const data = await api('/api/janus/divergence');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

// ─── System ────────────────────────────────────────────────────────

server.tool(
  'get_health',
  'Get system health: article counts, source counts, latest article timestamps, and database status.',
  {},
  async () => {
    const data = await api('/api/health');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

// ─── SRS ───────────────────────────────────────────────────────────

server.tool(
  'get_srs_advisor',
  'Get SRS (Singapore Real Estate Securities) fund advisor recommendations with scoring breakdown.',
  {},
  async () => {
    const data = await api('/api/srs/advisor');
    return { content: [{ type: 'text', text: summarize(data) }] };
  }
);

// ─── Start ─────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP Server error: ${err.message}\n`);
  process.exit(1);
});
