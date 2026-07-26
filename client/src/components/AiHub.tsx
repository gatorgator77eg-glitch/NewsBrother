import { useState, useRef, useEffect } from 'react';
import { aiChat, aiRiskRadar, aiNarrativeDecoder, aiCatalystEngine, aiSentimentForecaster, aiSmartDoc } from '../api';

type Tab = 'chat' | 'risk' | 'narrative' | 'catalyst' | 'forecast' | 'doc';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chat', label: 'Analyst Chat', icon: '💬' },
  { id: 'doc', label: 'Smart Doc', icon: '📄' },
  { id: 'risk', label: 'Risk Radar', icon: '⚠️' },
  { id: 'narrative', label: 'Narrative Decoder', icon: '📰' },
  { id: 'catalyst', label: 'Catalyst Engine', icon: '⚡' },
  { id: 'forecast', label: 'Sentiment Forecast', icon: '🔮' },
];

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-gray-900 dark:text-gray-100 mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-gray-900 dark:text-gray-100 mt-4 mb-1">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm text-gray-700 dark:text-gray-300">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm text-gray-700 dark:text-gray-300">$2</li>')
    .replace(/\n/g, '<br/>');
}

// ── Chat Tab ────────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const allMsgs = [...messages, { role: 'user' as const, content: userMsg }].map(m => ({ role: m.role, content: m.content }));
      const data = await aiChat(allMsgs);
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || data.reason || 'No response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: failed to get response.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl mb-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-12">
            <div className="text-3xl mb-2">🤖</div>
            <p className="text-sm">Ask about any ticker, market trend, or political topic.</p>
            <p className="text-xs mt-1">Try: "What's happening with NVDA?" or "Analyze AAPL risk"</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm'
            }`}>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Thinking...
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask the AI analyst..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Generic Analysis Tab ────────────────────────────────────────────────────

function AnalysisTab({ title, icon, placeholder, fieldLabel, onRun, children }: {
  title: string; icon: string; placeholder: string; fieldLabel: string;
  onRun: (val: string) => Promise<any>; children?: (data: any) => React.ReactNode;
}) {
  const [input, setInput] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const run = async () => {
    if (!input.trim() || loading) return;
    setLoading(true); setData(null); setReason(null);
    try {
      const result = await onRun(input.trim());
      if (result.analysis) setData(result);
      else setReason(result.reason || 'No analysis generated.');
    } catch (e: any) { setReason(e.message); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{fieldLabel}</label>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder={placeholder}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={run}
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing
              </span>
            ) : `${icon} Analyze`}
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-full animate-pulse" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-4/5 animate-pulse" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-3/5 animate-pulse" />
        </div>
      )}

      {reason && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          {reason}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {data.data && children && children(data.data)}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Analysis</span>
              {data.model && <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{data.model}</span>}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.analysis) }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Narrative Decoder Specific UI ───────────────────────────────────────────

function NarrativeTab() {
  const [input, setInput] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const run = async () => {
    if (!input.trim() || loading) return;
    setLoading(true); setData(null); setReason(null);
    try {
      const result = await aiNarrativeDecoder(input.trim());
      if (result.analysis) setData(result);
      else setReason(result.reason || 'No analysis generated.');
    } catch (e: any) { setReason(e.message); }
    setLoading(false);
  };

  const toneBar = (tone: number) => {
    const pct = Math.min(100, Math.max(0, (tone + 10) * 5));
    const color = tone > 1 ? 'bg-green-500' : tone < -1 ? 'bg-red-500' : 'bg-gray-400';
    return (
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Topic or Keyword</label>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            placeholder="e.g. tariff, election, inflation"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-end">
          <button onClick={run} disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap">
            {loading ? <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Decoding</span> : '📰 Decode'}
          </button>
        </div>
      </div>

      {data?.data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(['left', 'center', 'right'] as const).map(lean => {
            const d = data.data[lean];
            return (
              <div key={lean} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">{lean}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{d.count}</div>
                <div className="text-xs text-gray-400 mb-2">articles · tone {d.avgTone.toFixed(1)}</div>
                {toneBar(d.avgTone)}
                {d.exclusiveWords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.exclusiveWords.slice(0, 5).map((w: string) => (
                      <span key={w} className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">{w}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data?.data?.blindspots?.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">⚠ Blindspots Detected</div>
          {data.data.blindspots.map((b: string, i: number) => (
            <div key={i} className="text-sm text-amber-600 dark:text-amber-400">• {b}</div>
          ))}
        </div>
      )}

      {reason && <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">{reason}</div>}

      {data?.analysis && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Narrative Analysis</span>
            {data.model && <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{data.model}</span>}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.analysis) }} />
        </div>
      )}
    </div>
  );
}

// ── Smart Doc Tab ────────────────────────────────────────────────────────────

function SmartDocTab() {
  const [doc, setDoc] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const docReady = doc.trim().length > 20;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const ask = async () => {
    if (!input.trim() || loading || !docReady) return;
    const q = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const data = await aiSmartDoc(doc, q, history);
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer || data.reason || 'No response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: failed to get response.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Paste or type your document below
          {docReady && <span className="ml-2 text-green-500">✓ {doc.length.toLocaleString()} chars</span>}
        </label>
        <textarea
          value={doc}
          onChange={e => setDoc(e.target.value)}
          placeholder="Paste a report, article, earnings call transcript, contract, research paper, or any text you want to analyze..."
          className="w-full h-40 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
        />
      </div>

      {docReady && (
        <div className="flex flex-col h-[45vh]">
          <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl mb-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 dark:text-gray-500 py-8">
                <div className="text-3xl mb-2">📄</div>
                <p className="text-sm">Document loaded. Ask anything about it.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {['Summarize this', 'What are the key points?', 'Find any risks or issues', 'What is missing?'].map(q => (
                    <button key={q} onClick={() => { setInput(q); }}
                      className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-gray-600 dark:text-gray-400 hover:border-blue-400 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm'
                }`}>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />Analyzing...
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ask()}
              placeholder="Ask about this document..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={ask} disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AiHub({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Intelligence</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">LLM-powered analysis across all your data</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === 'chat' && <ChatTab />}

      {tab === 'doc' && <SmartDocTab />}

      {tab === 'risk' && (
        <AnalysisTab title="Risk Radar" icon="⚠️" placeholder="e.g. NVDA, TSLA, AAPL" fieldLabel="Ticker Symbol"
          onRun={async (sym) => { const d = await aiRiskRadar(sym); return d; }}>
          {(data) => data && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-400">Velocity</div>
                <div className={`text-xl font-bold ${data.velocityScore > 2 ? 'text-red-500' : data.velocityScore > 1 ? 'text-amber-500' : 'text-green-500'}`}>
                  {data.velocityScore?.toFixed(1)}x
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-400">Tone σ</div>
                <div className={`text-xl font-bold ${data.toneStd > 3 ? 'text-red-500' : data.toneStd > 1.5 ? 'text-amber-500' : 'text-green-500'}`}>
                  {data.toneStd?.toFixed(1)}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-400">Source Conc.</div>
                <div className={`text-xl font-bold ${data.sourceConcentration > 0.5 ? 'text-red-500' : data.sourceConcentration > 0.3 ? 'text-amber-500' : 'text-green-500'}`}>
                  {(data.sourceConcentration * 100)?.toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </AnalysisTab>
      )}

      {tab === 'narrative' && <NarrativeTab />}

      {tab === 'catalyst' && (
        <AnalysisTab title="Catalyst Engine" icon="⚡" placeholder="e.g. NVDA, TSLA, AAPL" fieldLabel="Ticker Symbol"
          onRun={async (sym) => { const d = await aiCatalystEngine(sym); return d; }}>
          {(data) => data?.spikes?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">NEWS SPIKES</div>
              <div className="space-y-1">
                {data.spikes.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500 w-20">{s.date}</span>
                    <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{s.count}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${s.tone > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                      tone {s.tone?.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AnalysisTab>
      )}

      {tab === 'forecast' && (
        <AnalysisTab title="Sentiment Forecaster" icon="🔮" placeholder="e.g. NVDA, AAPL, or China, US" fieldLabel="Ticker or Country"
          onRun={async (val) => {
            const isTicker = /^[A-Z]{1,5}$/.test(val.toUpperCase());
            return aiSentimentForecaster(isTicker ? { symbol: val.toUpperCase() } : { country: val });
          }}>
          {(data) => data && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-400">Regime</div>
                <div className={`text-lg font-bold ${
                  data.regime === 'greed' ? 'text-green-500' : data.regime === 'fear' ? 'text-red-500' : data.regime === 'transition' ? 'text-amber-500' : 'text-gray-500'
                }`}>{data.regime}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-400">Trend</div>
                <div className={`text-lg font-bold ${data.slope > 0 ? 'text-green-500' : data.slope < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  {data.slope > 0 ? '↑' : data.slope < 0 ? '↓' : '→'} {Math.abs(data.slope).toFixed(2)}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-400">Current</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.currentTone?.toFixed(1)}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-400">Volume</div>
                <div className={`text-lg font-bold ${data.volumeTrend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {data.volumeTrend > 0 ? '+' : ''}{data.volumeTrend?.toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </AnalysisTab>
      )}
    </div>
  );
}
