import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLocalGpuStatus, localGpuChat, runLocalGpuSentiment, getLocalGpuSentimentStatus,
  runLocalGpuVectors, getLocalGpuClusters, getLocalGpuVectorStatus,
  runLocalGpuAnalytics, getLocalGpuAnalyticsResults, getLocalGpuAnalyticsStatus,
  getLocalGpuConfig, setLocalGpuConfig,
  type GpuStatus, type TopicCluster, type AnalyticsResult,
} from '../api';

type Tab = 'monitor' | 'chat' | 'sentiment' | 'vectors' | 'analytics' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'monitor', label: 'GPU Monitor', icon: '📊' },
  { id: 'chat', label: 'LLM Chat', icon: '💬' },
  { id: 'sentiment', label: 'Sentiment Engine', icon: '🎭' },
  { id: 'vectors', label: 'Vector Clustering', icon: '🧬' },
  { id: 'analytics', label: 'GPU Analytics', icon: '⚡' },
  { id: 'settings', label: 'GPU Settings', icon: '⚙️' },
];

interface Props { onBack: () => void; }

export default function LocalGPU({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('monitor');
  const [loading, setLoading] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);

  // Poll GPU status every 3 seconds when on monitor tab
  useEffect(() => {
    if (tab !== 'monitor') return;
    const poll = async () => {
      try { setGpuStatus(await getLocalGpuStatus()); } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [tab]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">LocalGPU</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Local LLM + ML Inference Engine</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-thin">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'monitor' && <MonitorTab status={gpuStatus} />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'sentiment' && <SentimentTab />}
      {tab === 'vectors' && <VectorsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════
// 1. GPU MONITOR
// ═══════════════════════════════════════════
function MonitorTab({ status }: { status: GpuStatus | null }) {
  if (!status) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;
  }

  const vramPct = status.vram.total > 0 ? Math.round((status.vram.used / status.vram.total) * 100) : 0;
  const totalEngineVram = Object.values(status.engines).reduce((s, e) => s + e.vramMb, 0);

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div className={`rounded-2xl p-4 ${status.available ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status.available ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
          <div>
            <span className={`text-sm font-bold ${status.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500'}`}>
              {status.available ? 'System Active' : 'System Standby'}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              {status.ollamaConnected ? `Ollama connected · ${status.models.length} model(s)` : 'Ollama offline'}
            </span>
          </div>
        </div>
      </div>

      {/* VRAM Overview */}
      {status.vram.total > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">GPU Memory</h3>
          <div className="relative h-8 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all" style={{ width: `${vramPct}%` }} />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-200">
              {status.vram.used} MB / {status.vram.total} MB ({vramPct}%)
            </div>
          </div>
        </div>
      )}

      {/* Engine Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(status.engines).map(([name, engine]) => (
          <div key={name} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{name}</span>
              <span className={`w-2 h-2 rounded-full ${engine.status === 'ready' ? 'bg-emerald-500' : engine.status === 'standby' ? 'bg-yellow-400' : 'bg-gray-400'}`} />
            </div>
            <div className={`text-lg font-bold ${engine.status === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : engine.status === 'standby' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400'}`}>
              {engine.status}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{engine.vramMb > 0 ? `${engine.vramMb} MB VRAM` : 'CPU fallback'}</div>
          </div>
        ))}
      </div>

      {/* VRAM Budget */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">VRAM Budget Allocation</h3>
        <div className="space-y-2">
          {Object.entries(status.engines).map(([name, engine]) => {
            const pct = totalEngineVram > 0 ? (engine.vramMb / 8000) * 100 : 0;
            return (
              <div key={name} className="flex items-center gap-3">
                <div className="w-20 text-xs font-medium text-gray-600 dark:text-gray-400 capitalize">{name}</div>
                <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${engine.status === 'ready' ? 'bg-emerald-500' : engine.status === 'standby' ? 'bg-yellow-400' : 'bg-gray-300'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="w-16 text-right text-[10px] text-gray-400">{engine.vramMb} MB</div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="w-20 text-xs font-bold text-gray-700 dark:text-gray-300">Total</div>
            <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${(totalEngineVram / 8000) * 100}%` }} />
            </div>
            <div className="w-16 text-right text-[10px] font-bold text-gray-500">{totalEngineVram} / 8000 MB</div>
          </div>
        </div>
      </div>

      {/* Models */}
      {status.models.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Loaded Models (Ollama)</h3>
          <div className="space-y-2">
            {status.models.map(m => (
              <div key={m.name} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.name}</div>
                  <div className="text-[10px] text-gray-400">{m.parameter_size} · {m.quantization}</div>
                </div>
                <div className="text-xs text-gray-400">{(m.size / 1e9).toFixed(1)} GB</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Jobs */}
      {status.activeJobs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Active Jobs</h3>
          {status.activeJobs.map((j: any) => (
            <div key={j.id} className="flex items-center gap-3 py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent" />
              <span className="text-xs text-gray-600 dark:text-gray-400">{j.type} · {j.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 2. LLM CHAT
// ═══════════════════════════════════════════
function ChatTab() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const presets = [
    { label: 'Summarize', prompt: 'Summarize the latest political news headlines in 3 bullet points.' },
    { label: 'Sentiment', prompt: 'Analyze the sentiment of these headlines and classify each as positive, negative, or neutral.' },
    { label: 'Bias Check', prompt: 'Compare how left-leaning and right-leaning sources might cover this topic differently.' },
    { label: 'Market Impact', prompt: 'What potential market impact could this political event have?' },
  ];

  const send = async (overrideInput?: string) => {
    const text = overrideInput || input;
    if (!text.trim() || sending) return;
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const res = await localGpuChat(newMessages.map(m => ({ role: m.role, content: m.content })));
      setMessages([...newMessages, { role: 'assistant', content: res.response }]);
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}. Make sure Ollama is running.` }]);
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Preset buttons */}
      <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-thin pb-1">
        {presets.map(p => (
          <button key={p.label} onClick={() => send(p.prompt)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 whitespace-nowrap transition-all">
            {p.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 scrollbar-thin">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm text-gray-400">Chat with the local LLM via Ollama</p>
            <p className="text-[10px] text-gray-400 mt-1">Powered by Llama-3 / Mistral (4-bit quantized)</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
            }`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Type a message..."
          disabled={sending}
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50"
        />
        <button onClick={() => send()}
          disabled={sending || !input.trim()}
          className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 disabled:opacity-40 transition-colors">
          Send
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 3. SENTIMENT ENGINE
// ═══════════════════════════════════════════
function SentimentTab() {
  const [job, setJob] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [batchSize, setBatchSize] = useState(16);

  const startJob = async () => {
    setRunning(true);
    try {
      const res = await runLocalGpuSentiment(batchSize);
      setJob({ id: res.jobId, status: 'running', progress: 0 });
      // Poll
      const poll = setInterval(async () => {
        try {
          const status = await getLocalGpuSentimentStatus(res.jobId);
          setJob(status);
          if (status.status === 'done' || status.status === 'error') {
            clearInterval(poll);
            setRunning(false);
          }
        } catch { clearInterval(poll); setRunning(false); }
      }, 2000);
    } catch (err) {
      setRunning(false);
      alert('Failed to start: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Financial Sentiment Engine</h3>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4">
          Score news articles with ML-based sentiment analysis. Uses FinBERT (ML) or rule-based fallback.
          Processes {batchSize} articles per batch to prevent memory spikes.
        </p>

        <div className="flex items-center gap-4 mb-4">
          <label className="text-xs text-gray-500">Batch size:</label>
          <select value={batchSize} onChange={e => setBatchSize(parseInt(e.target.value))}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
            {[8, 16, 32, 64].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={startJob} disabled={running}
            className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {running ? 'Processing...' : 'Run Sentiment'}
          </button>
        </div>

        {job && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{job.status === 'running' ? 'Processing...' : job.status === 'done' ? 'Complete' : 'Error'}</span>
              <span>{job.progress || 0}%</span>
            </div>
            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${job.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${job.progress || 0}%` }} />
            </div>
            {job.result && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                Processed {job.result.processed} articles
              </div>
            )}
          </div>
        )}
      </div>

      {/* Architecture note */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
        <h4 className="text-xs font-bold text-gray-500 mb-2">How it works</h4>
        <div className="text-[10px] text-gray-400 space-y-1">
          <p>1. Extracts articles from news_archive that lack sentiment labels</p>
          <p>2. Tokenizes and scores in batches of {batchSize} to stay under 1.2GB VRAM</p>
          <p>3. Results stored as `sentiment_label` column (e.g., "positive:0.873")</p>
          <p>4. GPU mode uses FinBERT; CPU fallback uses keyword-based rules</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 4. VECTOR CLUSTERING
// ═══════════════════════════════════════════
function VectorsTab() {
  const [clusters, setClusters] = useState<TopicCluster[]>([]);
  const [job, setJob] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [numClusters, setNumClusters] = useState(10);
  const [selected, setSelected] = useState<number | null>(null);

  const loadClusters = useCallback(async () => {
    try {
      const res = await getLocalGpuClusters();
      setClusters(res.clusters);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadClusters(); }, [loadClusters]);

  const startJob = async () => {
    setRunning(true);
    try {
      const res = await runLocalGpuVectors(numClusters);
      setJob({ id: res.jobId, status: 'running', progress: 0 });
      const poll = setInterval(async () => {
        try {
          const status = await getLocalGpuVectorStatus(res.jobId);
          setJob(status);
          if (status.status === 'done' || status.status === 'error') {
            clearInterval(poll);
            setRunning(false);
            loadClusters();
          }
        } catch { clearInterval(poll); setRunning(false); }
      }, 3000);
    } catch (err) {
      setRunning(false);
    }
  };

  const selectedCluster = clusters.find(c => c.id === selected);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 flex items-center gap-4">
        <label className="text-xs text-gray-500">Clusters:</label>
        <select value={numClusters} onChange={e => setNumClusters(parseInt(e.target.value))}
          className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
          {[5, 8, 10, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={startJob} disabled={running}
          className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
          {running ? 'Embedding...' : 'Generate & Cluster'}
        </button>
        {clusters.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">{clusters.length} clusters</span>
        )}
      </div>

      {job && job.status === 'running' && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent" />
            <span className="text-xs text-emerald-700 dark:text-emerald-300">Generating embeddings and clustering...</span>
          </div>
          <div className="h-2 bg-emerald-100 dark:bg-emerald-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${job.progress || 0}%` }} />
          </div>
        </div>
      )}

      {/* Cluster Visualization */}
      {clusters.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Topic Clusters</h3>
          <div className="flex flex-wrap gap-2">
            {clusters.map(c => {
              const size = Math.max(40, Math.min(100, c.articleCount * 5));
              return (
                <button key={c.id} onClick={() => setSelected(selected === c.id ? null : c.id)}
                  className={`rounded-xl border-2 transition-all hover:scale-105 flex flex-col items-center justify-center text-center p-2 ${
                    selected === c.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
                  }`}
                  style={{ width: `${size}px`, height: `${size}px` }}>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{c.articleCount}</div>
                  <div className="text-[8px] text-gray-400">articles</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected cluster detail */}
      {selectedCluster && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Cluster #{selectedCluster.id} · {selectedCluster.articleCount} articles
          </h3>
          <div className="text-xs text-gray-400 mb-3 truncate">{selectedCluster.label}</div>
          <div className="space-y-2">
            {selectedCluster.articles?.map(a => (
              <div key={a.id} className="flex items-start gap-2 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{a.title}</div>
                  <div className="text-[10px] text-gray-400">{a.domain} · {a.country}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {clusters.length === 0 && !running && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">🧬</div>
          <p className="text-sm text-gray-400">No clusters generated yet</p>
          <p className="text-[10px] text-gray-400 mt-1">Click "Generate & Cluster" to embed articles and run K-means</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 5. GPU ANALYTICS
// ═══════════════════════════════════════════
function AnalyticsTab() {
  const [results, setResults] = useState<AnalyticsResult[]>([]);
  const [job, setJob] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [window, setWindow] = useState(90);

  const loadResults = useCallback(async () => {
    try {
      const res = await getLocalGpuAnalyticsResults();
      setResults(res.results);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadResults(); }, [loadResults]);

  const startJob = async () => {
    setRunning(true);
    try {
      const res = await runLocalGpuAnalytics(window);
      setJob({ id: res.jobId, status: 'running', progress: 0 });
      const poll = setInterval(async () => {
        try {
          const status = await getLocalGpuAnalyticsStatus(res.jobId);
          setJob(status);
          if (status.status === 'done' || status.status === 'error') {
            clearInterval(poll);
            setRunning(false);
            loadResults();
          }
        } catch { clearInterval(poll); setRunning(false); }
      }, 3000);
    } catch (err) {
      setRunning(false);
    }
  };

  const sorted = [...results].sort((a, b) => Math.abs(b.volatility) - Math.abs(a.volatility));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 flex items-center gap-4">
        <label className="text-xs text-gray-500">Window:</label>
        <select value={window} onChange={e => setWindow(parseInt(e.target.value))}
          className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
          {[30, 60, 90, 180, 365].map(n => <option key={n} value={n}>{n} days</option>)}
        </select>
        <button onClick={startJob} disabled={running}
          className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
          {running ? 'Computing...' : 'Run GPU Analytics'}
        </button>
        {results.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">{results.length} tickers analyzed</span>
        )}
      </div>

      {job && job.status === 'running' && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent" />
            <span className="text-xs text-emerald-700 dark:text-emerald-300">Running GPU-accelerated calculations...</span>
          </div>
          <div className="h-2 bg-emerald-100 dark:bg-emerald-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${job.progress || 0}%` }} />
          </div>
        </div>
      )}

      {/* Results Table */}
      {sorted.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">GPU Analytics Results</h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                <tr className="text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">Symbol</th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="px-4 py-2 text-right font-medium">Volatility</th>
                  <th className="px-4 py-2 text-right font-medium">Sharpe</th>
                  <th className="px-4 py-2 text-right font-medium">Max DD</th>
                  <th className="px-4 py-2 text-right font-medium">RSI</th>
                  <th className="px-4 py-2 text-right font-medium">Vol Chg</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.symbol} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{r.symbol}</td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">${r.last_close}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${r.volatility > 50 ? 'text-red-500' : r.volatility > 25 ? 'text-orange-500' : 'text-gray-600 dark:text-gray-300'}`}>
                        {r.volatility}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${r.sharpe > 1 ? 'text-green-600' : r.sharpe < -1 ? 'text-red-500' : 'text-gray-500'}`}>
                        {r.sharpe}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-red-500">{r.max_drawdown}%</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${r.rsi > 70 ? 'text-red-500' : r.rsi < 30 ? 'text-green-600' : 'text-gray-500'}`}>
                        {r.rsi}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${r.volume_change_pct > 50 ? 'text-purple-500' : 'text-gray-500'}`}>
                        {r.volume_change_pct > 0 ? '+' : ''}{r.volume_change_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length === 0 && !running && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <p className="text-sm text-gray-400">No analytics results yet</p>
          <p className="text-[10px] text-gray-400 mt-1">Runs volatility, Sharpe, RSI, and max drawdown across tickers</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 6. GPU SETTINGS
// ═══════════════════════════════════════════
function SettingsTab() {
  const [config, setConfigState] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getLocalGpuConfig().then(res => setConfigState(res.config)).catch(() => {});
  }, []);

  const updateConfig = (key: string, value: string) => {
    setConfigState(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    try {
      await setLocalGpuConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const sections = [
    { title: 'Ollama', keys: ['ollama_url', 'ollama_model', 'embed_model'] },
    { title: 'VRAM Allocation (MB)', keys: ['vram_llm_mb', 'vram_sentiment_mb', 'vram_vectors_mb', 'vram_analytics_mb'] },
    { title: 'Processing', keys: ['sentiment_batch_size', 'embedding_batch_size', 'analytics_window_days', 'gpu_enabled'] },
    { title: 'Schedule', keys: ['schedule_sentiment_cron', 'schedule_vectors_cron', 'schedule_analytics_cron'] },
    { title: 'Environment', keys: ['python_path'] },
  ];

  return (
    <div className="space-y-4">
      {sections.map(section => (
        <div key={section.title} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{section.title}</h3>
          <div className="space-y-2">
            {section.keys.map(key => (
              <div key={key} className="flex items-center gap-3">
                <label className="w-48 text-xs text-gray-500 font-mono">{key}</label>
                <input
                  value={config[key] || ''}
                  onChange={e => updateConfig(key, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button onClick={save}
        className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
          saved ? 'bg-green-500 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700'
        }`}>
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
