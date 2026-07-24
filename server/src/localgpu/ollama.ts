import { createLogger } from '../logger';

const log = createLogger({ module: 'ollama-client' });

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const TIMEOUT_MS = 30000;
const CHAT_TIMEOUT_MS = 120000;

export interface OllamaModel {
  name: string;
  size: number;
  parameter_size: string;
  quantization: string;
  modified_at: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface GpuStatus {
  available: boolean;
  ollamaConnected: boolean;
  models: OllamaModel[];
  activeModel: string | null;
  vram: {
    total: number;
    used: number;
    free: number;
  };
  engines: {
    llm: { status: string; vramMb: number };
    sentiment: { status: string; vramMb: number };
    vectors: { status: string; vramMb: number };
    analytics: { status: string; vramMb: number };
  };
}

// --- Ollama API calls ---

export async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    return (data.models || []).map((m: any) => ({
      name: m.name,
      size: m.size || 0,
      parameter_size: m.details?.parameter_size || 'unknown',
      quantization: m.details?.quantization_level || 'unknown',
      modified_at: m.modified_at || '',
    }));
  } catch {
    return [];
  }
}

export async function chatCompletion(
  messages: ChatMessage[],
  model?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const mdl = model || DEFAULT_MODEL;
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: mdl,
      messages,
      stream: !!onChunk,
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Ollama chat failed: ${res.status}`);
  }

  if (onChunk && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as ChatResponse;
          if (parsed.message?.content) {
            full += parsed.message.content;
            onChunk(parsed.message.content);
          }
        } catch { /* partial JSON, skip */ }
      }
    }
    return full;
  }

  const data = await res.json() as ChatResponse;
  return data.message?.content || '';
}

export async function generateEmbedding(text: string, model?: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'nomic-embed-text',
        prompt: text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.embedding || null;
  } catch {
    return null;
  }
}

// --- Status aggregation ---

let cachedStatus: GpuStatus | null = null;
let lastStatusCheck = 0;
const STATUS_CACHE_MS = 3000;

export async function getGpuStatus(): Promise<GpuStatus> {
  const now = Date.now();
  if (cachedStatus && (now - lastStatusCheck) < STATUS_CACHE_MS) return cachedStatus;

  const ollamaConnected = await checkOllama();
  const models = ollamaConnected ? await listModels() : [];

  // Try nvidia-smi for GPU info (will fail on CPU-only machines)
  let vram = { total: 0, used: 0, free: 0 };
  let gpuAvailable = false;
  try {
    const { execSync } = require('child_process');
    const smi = execSync('nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits', {
      timeout: 5000,
      encoding: 'utf-8',
    }).trim();
    const parts = smi.split(',').map((s: string) => parseInt(s.trim()));
    if (parts.length >= 3) {
      vram = { total: parts[0], used: parts[1], free: parts[2] };
      gpuAvailable = true;
    }
  } catch {
    // No GPU / nvidia-smi not available — use estimates
    gpuAvailable = false;
  }

  const activeModel = models.length > 0 ? models[0].name : null;

  cachedStatus = {
    available: gpuAvailable || ollamaConnected,
    ollamaConnected,
    models,
    activeModel,
    vram,
    engines: {
      llm: {
        status: ollamaConnected ? 'ready' : 'offline',
        vramMb: gpuAvailable ? 4608 : 0,
      },
      sentiment: {
        status: gpuAvailable ? 'ready' : 'standby',
        vramMb: gpuAvailable ? 1200 : 0,
      },
      vectors: {
        status: gpuAvailable ? 'ready' : 'standby',
        vramMb: gpuAvailable ? 800 : 0,
      },
      analytics: {
        status: gpuAvailable ? 'ready' : 'standby',
        vramMb: gpuAvailable ? 1500 : 0,
      },
    },
  };
  lastStatusCheck = now;
  return cachedStatus;
}
