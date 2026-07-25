import { getDb } from '../db';
import { ensureLlmTable, seedLlmDefaults } from '../routes/llmConfig';

export interface LlmConfig {
  provider: string;
  url: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function getDefaultLlmConfig(): Promise<LlmConfig | null> {
  const db = await getDb();
  db.run(ensureLlmTable());
  seedLlmDefaults(db);
  const result = db.exec('SELECT * FROM llm_configs WHERE is_default = 1 LIMIT 1');
  const row = result[0]?.values[0];
  if (!row) return null;
  return {
    provider: row[2] as string,
    url: row[3] as string,
    apiKey: row[4] as string,
    model: row[5] as string,
    maxTokens: (row[6] as number) || 4096,
    temperature: (row[7] as number) || 0.7,
  };
}

export async function callLlm(
  messages: ChatMessage[],
  config: LlmConfig,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  let url: string;
  let body: any;

  if (config.provider === 'ollama') {
    const ollamaUrl = config.url.replace(/\/api\/chat\/?$/, '').replace(/\/$/, '');
    url = `${ollamaUrl}/api/chat`;
    body = { model: config.model, messages, stream: false };
  } else {
    url = `${config.url}/chat/completions`;
    body = {
      model: config.model,
      messages,
      max_tokens: opts?.maxTokens ?? 1024,
      temperature: opts?.temperature ?? config.temperature,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 60000);

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
    if (config.provider === 'ollama') return data.message?.content || '';
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function promptLlm(
  prompt: string,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }
): Promise<{ text: string; model: string } | { text: null; reason: string }> {
  const config = await getDefaultLlmConfig();
  if (!config) return { text: null, reason: 'No LLM configured. Add one in Settings > LLM Configuration.' };
  const text = await callLlm([{ role: 'user', content: prompt }], config, opts);
  if (!text) return { text: null, reason: 'LLM returned empty response.' };
  return { text, model: config.model };
}
