import { getNewsArchiveDb } from '../newsArchive/db';
import { createLogger } from '../logger';

const log = createLogger({ module: 'localgpu-config' });

const DEFAULT_CONFIG: Record<string, string> = {
  'ollama_url': 'http://localhost:11434',
  'ollama_model': 'llama3',
  'embed_model': 'nomic-embed-text',
  'sentiment_model': 'ProsusAI/finbert',
  'vram_llm_mb': '4608',
  'vram_sentiment_mb': '1200',
  'vram_vectors_mb': '800',
  'vram_analytics_mb': '1500',
  'sentiment_batch_size': '16',
  'embedding_batch_size': '32',
  'analytics_window_days': '90',
  'schedule_sentiment_cron': '0 * * * *',
  'schedule_vectors_cron': '30 * * * *',
  'schedule_analytics_cron': '15,45 * * * *',
  'python_path': 'python3',
  'gpu_enabled': 'false',
};

export async function ensureLocalGpuMeta() {
  const db = await getNewsArchiveDb();
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS localgpu_meta (key TEXT PRIMARY KEY, value TEXT)`);
  } catch {
    // table may already exist
  }
}

export async function getConfig(): Promise<Record<string, string>> {
  await ensureLocalGpuMeta();
  const db = await getNewsArchiveDb();
  const result = db.exec(`SELECT key, value FROM localgpu_meta`);
  const stored: Record<string, string> = {};
  if (result[0]) {
    for (const row of result[0].values) {
      stored[row[0] as string] = row[1] as string;
    }
  }
  // Merge defaults with stored values
  return { ...DEFAULT_CONFIG, ...stored };
}

export async function setConfig(key: string, value: string): Promise<void> {
  await ensureLocalGpuMeta();
  const db = await getNewsArchiveDb();
  db.run(`INSERT OR REPLACE INTO localgpu_meta (key, value) VALUES (?, ?)`, [key, value]);
  log.info('Config updated', { key, value });
}

export async function setConfigBatch(entries: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(entries)) {
    await setConfig(k, v);
  }
}
