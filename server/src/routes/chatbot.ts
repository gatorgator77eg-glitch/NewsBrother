import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getDefaultLlmConfig, callLlm, ChatMessage, LlmConfig } from '../utils/llmClient';
import { createLogger } from '../logger';

const log = createLogger({ module: 'chatbot' });
export const chatbotRoutes = Router();

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

const SYSTEM_PROMPT = `You are a political and market intelligence assistant with access to live data tools. Always use tools to get real data before answering — never guess or make up information.

AVAILABLE TOOLS:
- search_news: Search RSS articles by keyword (recent coverage)
- get_news_archive: Search GDELT historical articles with dateFrom/dateTo (YYYY-MM-DD)
- get_google_news: Google News headlines for a topic
- get_daily_briefing: Full daily intelligence briefing
- get_breaking_news: Latest breaking stories
- get_events: Upcoming political/market events
- search_stocks: Find tickers by name or symbol
- get_stock_info: Ticker details + price history. Supports dateFrom/dateTo to narrow results
- get_market_movers: Volume leaders, gainers, losers
- get_market_sectors: Sector breakdown
- get_correlation: News-price correlation (supports days param)
- get_smart_velocity: News accumulation rate for a ticker
- get_smart_impact: News impact on price (supports days param)
- get_sentiment_timeline: Sentiment over time by country
- get_sentiment_waves: Sudden sentiment spikes
- get_bias_comparison: Left vs right coverage of a topic
- get_world_map: Country article counts and tones
- get_left_right: Left-right sentiment breakdown by country
- get_echo_chamber: Echo chamber analysis
- get_divergence: Narrative divergence topics
- get_health: System health status
- get_srs_advisor: SRS fund recommendations

REASONING PATTERNS:
- Stock price on a specific date: First get_stock_info with dateFrom/dateTo around that date, then get_news_archive with matching dates and the company name/ticker. Correlate the price movement with news events.
- Stock + news questions: Always search news by company name (not just ticker). Narrow date ranges to the relevant period.
- Political analysis: Search news, check sentiment timeline, compare left/right bias, then synthesize.
- Market overview: Get movers + sectors + briefing, then identify patterns.

GUIDELINES:
- Use tools proactively — call them before answering, not after
- For date-specific questions, always use dateFrom/dateTo parameters
- When a tool returns data, analyze it and explain what it means
- Consider multiple political perspectives (left, center, right)
- If a tool returns an error or empty data, try an alternative approach
- For complex questions, use 2-4 tools in sequence to build a complete picture
- Be specific: cite numbers, dates, sources, and tone scores from the data`;

chatbotRoutes.post('/chatbot', async (req: Request, res: Response) => {
  const { messages, stream } = req.body as { messages: ChatMessage[]; stream?: boolean };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const config = await getDefaultLlmConfig();
  if (!config) {
    return res.status(500).json({ error: 'No LLM configured. Add one in Settings > LLM Configuration.' });
  }

  // SSE streaming endpoint
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      await runChatLoop(messages, config, (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      });
      res.write(`event: done\ndata: {}\n\n`);
    } catch (err: any) {
      log.error('Chatbot stream error', { error: err.message });
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    } finally {
      res.end();
    }
    return;
  }

  // Non-streaming: collect full response
  try {
    const result = await runChatLoop(messages, config);
    res.json(result);
  } catch (err: any) {
    log.error('Chatbot error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

async function runChatLoop(
  userMessages: ChatMessage[],
  config: LlmConfig,
  onEvent?: (event: string, data: any) => void
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  // Connect to MCP server
  const mcpClient = await connectMcpServer();
  let mcpTools: any[] = [];

  try {
    const toolsResult = await mcpClient.listTools();
    mcpTools = toolsResult.tools;
  } catch (err: any) {
    log.error('Failed to list MCP tools', { error: err.message });
    if (onEvent) onEvent('error', { message: 'Failed to connect to MCP server' });
    return { content: 'Unable to connect to data tools. Please try again.', toolCalls: [] };
  }

  const mcpToolDefs = mcpTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));

  const allMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages,
  ];

  const allToolCalls: ToolCall[] = [];
  let finalContent = '';
  let lastLlmText = '';
  const MAX_ROUNDS = 5;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (onEvent) onEvent('thinking', { round: round + 1 });

    let llmResponse: string;
    try {
      llmResponse = await callLlmWithTools(allMessages, mcpToolDefs, config);
    } catch (err: any) {
      log.error('LLM call failed in round', { round, error: err.message });
      finalContent = `I encountered an error communicating with the AI: ${err.message}`;
      break;
    }

    const toolCalls = parseToolCalls(llmResponse);

    if (toolCalls.length === 0) {
      lastLlmText = extractTextContent(llmResponse);
      finalContent = lastLlmText;
      log.info('LLM returned text (no tool calls)', { round, length: lastLlmText.length });
      break;
    }

    log.info('LLM returned tool calls', { round, count: toolCalls.length, tools: toolCalls.map(t => t.name) });

    // Push the actual LLM response as assistant message so the model sees its own reasoning
    allMessages.push({
      role: 'assistant',
      content: `I need to call tools: ${toolCalls.map(t => `${t.name}(${JSON.stringify(t.arguments)})`).join(', ')}`,
    });

    for (const tc of toolCalls) {
      allToolCalls.push(tc);
      if (onEvent) onEvent('tool_call', { name: tc.name, args: tc.arguments });

      let resultStr: string;
      try {
        const mcpResult = await mcpClient.callTool({ name: tc.name, arguments: tc.arguments });
        const content = mcpResult.content as any;
        const raw = content?.[0]?.text || JSON.stringify(mcpResult);
        resultStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
      } catch (err: any) {
        resultStr = JSON.stringify({ error: err.message });
        log.error('MCP tool call failed', { tool: tc.name, error: err.message });
      }

      if (onEvent) onEvent('tool_result', { name: tc.name, result: resultStr.slice(0, 500) });

      // Truncate to avoid context overflow
      allMessages.push({
        role: 'user',
        content: `Result from ${tc.name}:\n${resultStr.slice(0, 8000)}`,
      });
    }
  }

  // Final synthesis call — force a comprehensive answer from all gathered data
  if (allToolCalls.length > 0 && finalContent.length < 50) {
    if (onEvent) onEvent('thinking', { round: 'synthesis' });

    allMessages.push({
      role: 'assistant',
      content: 'I now have all the data I need. Let me synthesize a comprehensive answer.',
    });
    allMessages.push({
      role: 'user',
      content: `Based on ALL the tool results above, write a comprehensive answer to the original question. Include specific numbers, dates, sources, and actionable insights. Do NOT call any tools — just write the answer directly.`,
    });

    log.info('Starting synthesis call', { messageCount: allMessages.length, toolCallsUsed: allToolCalls.length });

    try {
      const synthesisResponse = await callLlmWithTools(allMessages, [], config);
      const synthesized = extractTextContent(synthesisResponse);
      log.info('Synthesis result', { length: synthesized.length, preview: synthesized.slice(0, 200) });
      if (synthesized && synthesized.length > 20) {
        finalContent = synthesized;
      } else {
        log.warn('Synthesis too short, using last LLM text', { len: synthesized.length });
      }
    } catch (err: any) {
      log.error('Synthesis call failed', { error: err.message });
    }
  }

  if (!finalContent) {
    finalContent = allToolCalls.length > 0
      ? `I gathered data from ${allToolCalls.length} tool(s) but was unable to synthesize a response. Please try rephrasing your question.`
      : 'I was unable to generate a response.';
  }

  if (onEvent) onEvent('message', { content: finalContent });

  await mcpClient.close().catch(() => {});
  return { content: finalContent, toolCalls: allToolCalls };
}

async function connectMcpServer(): Promise<Client> {
  const serverPath = path.join(__dirname, '..', 'mcp', 'server.ts');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['-r', 'ts-node/register', serverPath],
    env: {
      ...process.env as Record<string, string>,
      API_URL: process.env.API_URL || 'http://localhost:3001',
    },
  });

  const client = new Client({ name: 'chatbot', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

async function callLlmWithTools(
  messages: ChatMessage[],
  tools: any[],
  config: LlmConfig
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  let url: string;
  let body: any;

  if (config.provider === 'ollama') {
    const ollamaUrl = config.url.replace(/\/api\/chat\/?$/, '').replace(/\/$/, '');
    url = `${ollamaUrl}/api/chat`;
    body = {
      model: config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: false,
    };
  } else {
    url = `${config.url}/chat/completions`;
    body = {
      model: config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

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

    // Extract response - handle both OpenAI and Ollama formats
    if (config.provider === 'ollama') {
      return data.message?.content || '';
    }

    // OpenAI format: check for tool calls in the response
    const choice = data.choices?.[0];
    if (!choice) return '';

    // If there are tool calls, serialize them as JSON
    if (choice.message?.tool_calls?.length > 0) {
      const toolCalls = choice.message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }));
      return JSON.stringify({ tool_calls: toolCalls });
    }

    return choice.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

function parseToolCalls(response: string): ToolCall[] {
  try {
    const parsed = JSON.parse(response);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls;
    }
  } catch {}
  return [];
}

function extractTextContent(response: string): string {
  if (!response) return '';
  try {
    const parsed = JSON.parse(response);
    // If it's a tool_calls object, return empty (shouldn't happen in synthesis)
    if (parsed.tool_calls) return '';
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'object' && parsed.content) return String(parsed.content);
    return response;
  } catch {
    return response;
  }
}
