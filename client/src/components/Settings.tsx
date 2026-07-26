import { useState, useEffect } from 'react';

interface SettingsData {
  theme: 'light' | 'dark' | 'system';
  defaultView: 'columns' | 'graph';
  defaultFilter: string | null;
}

const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system',
  defaultView: 'columns',
  defaultFilter: null,
};

const STORAGE_KEY = 'politicalNewsSettings';

const BIAS_COLORS: Record<string, string> = {
  left: 'bg-blue-100 text-blue-800',
  'lean-left': 'bg-green-100 text-green-800',
  center: 'bg-gray-100 text-gray-600',
  'lean-right': 'bg-orange-100 text-orange-800',
  right: 'bg-red-100 text-red-800',
};

const TOPIC_FILTERS = [
  { id: null, label: 'None' },
  { id: 'economy', label: 'Economy' },
  { id: 'elections', label: 'Elections' },
  { id: 'foreign-policy', label: 'Foreign Policy' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'climate', label: 'Climate' },
  { id: 'immigration', label: 'Immigration' },
  { id: 'technology', label: 'Technology' },
];

interface LLMConfig {
  id: string;
  name: string;
  provider: string;
  url: string;
  apiKey: string;
  apiKeySet: boolean;
  model: string;
  maxTokens: number;
  temperature: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FeedItem {
  id: string;
  name: string;
  url: string;
  rss_url: string;
  bias: string;
  credibility_score: number;
  tags: string[];
}

interface TickerItem {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: number;
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1', placeholder: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1', placeholder: 'sk-ant-...' },
  { value: 'ollama', label: 'Ollama (Local)', defaultUrl: 'http://localhost:11434', placeholder: '' },
  { value: 'openrouter', label: 'OpenRouter', defaultUrl: 'https://openrouter.ai/api/v1', placeholder: 'sk-or-...' },
  { value: 'together', label: 'Together AI', defaultUrl: 'https://api.together.xyz/v1', placeholder: '' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)', defaultUrl: '', placeholder: '' },
];

const EMPTY_FORM = {
  name: '', provider: 'openai', url: 'https://api.openai.com/v1', apiKey: '',
  model: 'gpt-4o-mini', maxTokens: 4096, temperature: 0.7,
};

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; response: string; latencyMs: number; error?: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState<string | null>(null);
  const [showFeedForm, setShowFeedForm] = useState(false);
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [feedForm, setFeedForm] = useState({ id: '', name: '', url: '', rss_url: '', bias: 'center', credibility_score: 0.5 });
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedSaving, setFeedSaving] = useState(false);

  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [tickerLoading, setTickerLoading] = useState(true);
  const [tickerSearch, setTickerSearch] = useState('');
  const [tickerPage, setTickerPage] = useState(1);
  const [tickerTotal, setTickerTotal] = useState(0);
  const [showTickerForm, setShowTickerForm] = useState(false);
  const [tickerForm, setTickerForm] = useState({ symbol: '', name: '', exchange: '', sector: '', industry: '', country: '', market_cap: 0 });
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [tickerSaving, setTickerSaving] = useState(false);
  const [tickerImportMode, setTickerImportMode] = useState<'upsert' | 'replace'>('upsert');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        setSettings(parsed);
        const isDark = parsed.theme === 'dark' || (parsed.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);
      }
    } catch {}
    fetchConfigs();
    fetchFeeds();
  }, []);

  const update = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (key === 'theme') {
      const isDark = value === 'dark' || (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const fetchConfigs = () => {
    fetch('/api/llm-config').then(r => r.json()).then(d => setConfigs(d.configs || [])).catch(() => {});
  };

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (c: LLMConfig) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      provider: c.provider,
      url: c.url,
      apiKey: '',
      model: c.model,
      maxTokens: c.maxTokens,
      temperature: c.temperature,
    });
    setShowForm(true);
  };

  const saveConfig = () => {
    const body: any = { ...form };
    if (editingId && !body.apiKey) delete body.apiKey;

    const url = editingId ? `/api/llm-config/${editingId}` : '/api/llm-config';
    const method = editingId ? 'PUT' : 'POST';

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()).then(() => {
      setShowForm(false);
      fetchConfigs();
    }).catch(() => {});
  };

  const deleteConfig = (id: string) => {
    if (!confirm('Delete this LLM configuration?')) return;
    fetch(`/api/llm-config/${id}`, { method: 'DELETE' })
      .then(() => fetchConfigs())
      .catch(() => {});
  };

  const setDefault = (id: string) => {
    fetch(`/api/llm-config/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    }).then(() => fetchConfigs()).catch(() => {});
  };

  const testConfig = (id: string) => {
    setTestingId(id);
    setTestResults(prev => ({ ...prev, [id]: undefined! }));
    fetch(`/api/llm-config/${id}/test`, { method: 'POST' })
      .then(r => r.json())
      .then(d => setTestResults(prev => ({ ...prev, [id]: d })))
      .catch(() => setTestResults(prev => ({ ...prev, [id]: { ok: false, response: '', latencyMs: 0, error: 'Network error' } })))
      .finally(() => setTestingId(null));
  };

  const fetchFeeds = () => {
    fetch('/api/feeds').then(r => r.json()).then(d => { setFeeds(d || []); setFeedsLoading(false); }).catch(() => setFeedsLoading(false));
  };

  const fetchTickers = () => {
    setTickerLoading(true);
    const q = tickerSearch ? `&search=${encodeURIComponent(tickerSearch)}` : '';
    fetch(`/api/stocks?limit=50&page=${tickerPage}${q}`)
      .then(r => r.json())
      .then(d => { setTickers(d.tickers || []); setTickerTotal(d.total || 0); setTickerLoading(false); })
      .catch(() => setTickerLoading(false));
  };

  useEffect(() => { fetchTickers(); }, [tickerPage, tickerSearch]);

  const saveTicker = async () => {
    setTickerSaving(true);
    setTickerError(null);
    try {
      const res = await fetch('/api/stocks/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tickerForm),
      });
      const data = await res.json();
      if (!res.ok) { setTickerError(data.error || 'Failed to save'); setTickerSaving(false); return; }
      setShowTickerForm(false);
      fetchTickers();
    } catch { setTickerError('Network error'); }
    setTickerSaving(false);
  };

  const deleteTicker = async (symbol: string) => {
    if (!confirm(`Delete ticker ${symbol}?`)) return;
    await fetch(`/api/stocks/tickers/${symbol}`, { method: 'DELETE' });
    fetchTickers();
  };

  const exportTickers = async () => {
    try {
      const res = await fetch('/api/stocks/tickers/export');
      const data = await res.json();
      downloadJson(data, 'analytical-tickers.json');
    } catch {}
  };

  const importTickersFromJson = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : data.tickers || [];
      const res = await fetch('/api/stocks/tickers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: items, mode: tickerImportMode }),
      });
      const result = await res.json();
      if (!res.ok) { setTickerError(result.error || 'Import failed'); return; }
      alert(`Imported ${result.imported} tickers (${result.skipped} skipped${result.errors?.length ? `, ${result.errors.length} errors` : ''})`);
      setTickerError(null);
      fetchTickers();
    } catch {
      alert('Import failed: invalid JSON file');
    }
  };

  const filteredFeeds = feedFilter ? feeds.filter(f => f.bias === feedFilter) : feeds;
  const biasCounts = feeds.reduce((acc: Record<string, number>, f) => { acc[f.bias] = (acc[f.bias] || 0) + 1; return acc; }, {} as Record<string, number>);

  const startAddFeed = () => {
    setEditingFeedId(null);
    setFeedForm({ id: '', name: '', url: '', rss_url: '', bias: 'center', credibility_score: 0.5 });
    setFeedError(null);
    setShowFeedForm(true);
  };

  const startEditFeed = (f: FeedItem) => {
    setEditingFeedId(f.id);
    setFeedForm({ id: f.id, name: f.name, url: f.url, rss_url: f.rss_url, bias: f.bias, credibility_score: f.credibility_score });
    setFeedError(null);
    setShowFeedForm(true);
  };

  const saveFeed = async () => {
    setFeedSaving(true);
    setFeedError(null);
    try {
      const isEdit = !!editingFeedId;
      const url = isEdit ? `/api/feeds/${editingFeedId}` : '/api/feeds';
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit
        ? { name: feedForm.name, url: feedForm.url, rss_url: feedForm.rss_url, bias: feedForm.bias, credibility_score: feedForm.credibility_score }
        : feedForm;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setFeedError(data.error || 'Failed to save'); return; }
      setShowFeedForm(false);
      fetchFeeds();
    } catch { setFeedError('Network error'); }
    setFeedSaving(false);
  };

  const deleteFeed = async (id: string) => {
    if (!confirm('Delete this RSS source?')) return;
    await fetch(`/api/feeds/${id}`, { method: 'DELETE' });
    fetchFeeds();
  };

  const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFromJson = async (file: File, type: 'feeds' | 'llm') => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (type === 'feeds') {
        const items = Array.isArray(data) ? data : data.feeds || [];
        const res = await fetch('/api/feeds/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feeds: items, mode: 'upsert' }),
        });
        const result = await res.json();
        if (!res.ok) { setFeedError(result.error || 'Import failed'); return; }
        alert(`Imported ${result.imported} of ${result.total} feeds (${result.skipped} skipped)`);
        setFeedError(null);
        fetchFeeds();
      } else {
        const items = Array.isArray(data) ? data : data.configs || [];
        const res = await fetch('/api/llm-config/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: items }),
        });
        const result = await res.json();
        alert(`Imported ${result.imported} of ${result.total} LLM configs`);
        fetchConfigs();
      }
    } catch (err) {
      alert('Import failed: invalid JSON file');
    }
  };

  const exportFeeds = () => downloadJson({ feeds, exportedAt: new Date().toISOString() }, 'analytical-feeds.json');
  const exportConfigs = () => {
    const safeConfigs = configs.map(({ apiKey, ...rest }) => rest);
    downloadJson({ configs: safeConfigs, exportedAt: new Date().toISOString() }, 'analytical-llm-configs.json');
  };
  const exportAll = async () => {
    const safeConfigs = configs.map(({ apiKey, ...rest }) => rest);
    try {
      const res = await fetch('/api/stocks/tickers/export');
      const tickerData = await res.json();
      downloadJson({ feeds, configs: safeConfigs, tickers: tickerData.tickers, exportedAt: new Date().toISOString() }, 'analytical-settings.json');
    } catch {
      downloadJson({ feeds, configs: safeConfigs, exportedAt: new Date().toISOString() }, 'analytical-settings.json');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Customize your experience</p>
        </div>
        {saved && (
          <span className="ml-auto text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">Saved</span>
        )}
      </div>

      {/* ─── Data Management ─────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Data Management</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Export or import your configuration</p>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">RSS Feeds</p>
            <div className="flex gap-1.5 justify-center">
              <button onClick={exportFeeds}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Export
              </button>
              <label className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer">
                Import
                <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && importFromJson(e.target.files[0], 'feeds')} />
              </label>
            </div>
          </div>
          <div className="text-center p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">LLM Configs</p>
            <div className="flex gap-1.5 justify-center">
              <button onClick={exportConfigs}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Export
              </button>
              <label className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer">
                Import
                <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && importFromJson(e.target.files[0], 'llm')} />
              </label>
            </div>
          </div>
          <div className="text-center p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Stock Tickers</p>
            <div className="flex gap-1.5 justify-center">
              <button onClick={exportTickers}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Export
              </button>
              <label className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer">
                Import
                <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && importTickersFromJson(e.target.files[0])} />
              </label>
            </div>
          </div>
          <div className="text-center p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Everything</p>
            <div className="flex gap-1.5 justify-center">
              <button onClick={exportAll}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Export
              </button>
              <label className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer">
                Import
                <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && (async () => {
                  const text = await e.target.files![0].text();
                  const data = JSON.parse(text);
                  if (data.feeds) await importFromJson(new File([JSON.stringify(data.feeds)], 'feeds.json'), 'feeds');
                  if (data.configs) await importFromJson(new File([JSON.stringify(data.configs)], 'configs.json'), 'llm');
                  if (data.tickers) await importTickersFromJson(new File([JSON.stringify(data)], 'tickers.json'));
                })()} />
              </label>
            </div>
          </div>
        </div>
        <div className="px-5 pb-3">
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Exported JSON does not include API keys for security. Imported feeds are merged by ID. Tickers support upsert or replace mode.</p>
        </div>
      </section>

      {/* ─── RSS Feed Manager ─────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">RSS Sources</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{feeds.length} feeds configured</p>
          </div>
          <button onClick={startAddFeed}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
            + Add Feed
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex gap-1.5 flex-wrap">
          <button onClick={() => setFeedFilter(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${!feedFilter ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}>
            All ({feeds.length})
          </button>
          {(['left', 'lean-left', 'center', 'lean-right', 'right'] as const).map(bias => (
            biasCounts[bias] ? (
              <button key={bias} onClick={() => setFeedFilter(feedFilter === bias ? null : bias)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${feedFilter === bias ? 'bg-gray-800 text-white' : `${BIAS_COLORS[bias]} hover:opacity-80`}`}>
                {bias.replace('-', ' ')} ({biasCounts[bias]})
              </button>
            ) : null
          ))}
        </div>

        {feedsLoading ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading feeds...</div>
        ) : filteredFeeds.length === 0 && !showFeedForm ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            {feeds.length === 0 ? 'No feeds yet. Click "Add Feed" to create one.' : 'No feeds match this filter.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
            {filteredFeeds.map(f => (
              <div key={f.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${BIAS_COLORS[f.bias]}`}>
                    {f.bias.replace('-', ' ').toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{f.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{f.rss_url}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-10 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden hidden sm:block">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(f.credibility_score || 0.5) * 100}%` }} />
                    </div>
                    <span className="text-[9px] text-gray-400 hidden sm:inline">{Math.round((f.credibility_score || 0.5) * 100)}%</span>
                    <button onClick={() => startEditFeed(f)}
                      className="px-2 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => deleteFeed(f.id)}
                      className="px-2 py-1 text-[11px] rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors">
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showFeedForm && (
          <div className="px-5 py-5 bg-gray-50 dark:bg-gray-750 border-t border-gray-100 dark:border-gray-700 space-y-4">
            {feedError && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs rounded-lg">{feedError}</div>
            )}
            {!editingFeedId && (
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Source ID</label>
                <input value={feedForm.id} onChange={e => setFeedForm(f => ({ ...f, id: e.target.value }))}
                  placeholder="e.g. reuters-world" disabled={!!editingFeedId}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50" />
                <p className="text-[10px] text-gray-400 mt-1">Unique identifier — cannot be changed later</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Name</label>
                <input value={feedForm.name} onChange={e => setFeedForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Reuters World"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Bias</label>
                <select value={feedForm.bias} onChange={e => setFeedForm(f => ({ ...f, bias: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="left">Left</option>
                  <option value="lean-left">Lean Left</option>
                  <option value="center">Center</option>
                  <option value="lean-right">Lean Right</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Website URL</label>
              <input value={feedForm.url} onChange={e => setFeedForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://www.reuters.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">RSS Feed URL</label>
              <input value={feedForm.rss_url} onChange={e => setFeedForm(f => ({ ...f, rss_url: e.target.value }))}
                placeholder="https://www.reuters.com/rss/world"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Credibility Score ({Math.round(feedForm.credibility_score * 100)}%)</label>
              <input type="range" min="0" max="1" step="0.05" value={feedForm.credibility_score}
                onChange={e => setFeedForm(f => ({ ...f, credibility_score: parseFloat(e.target.value) }))}
                className="w-full accent-blue-600" />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={saveFeed} disabled={!feedForm.name || !feedForm.url || !feedForm.rss_url || feedSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                {feedSaving ? 'Saving...' : editingFeedId ? 'Update' : 'Add Feed'}
              </button>
              <button onClick={() => setShowFeedForm(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── LLM Configuration ─────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">LLM Configuration</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add and manage LLM API connections</p>
          </div>
          <button onClick={startAdd}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
            + Add
          </button>
        </div>

        {configs.length === 0 && !showForm && (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            No LLM configurations yet. Click "Add" to connect one.
          </div>
        )}

        {configs.length > 0 && (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {configs.map(c => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                      {c.isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-medium">Default</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{c.provider}</span>
                      <span className="truncate">{c.model}</span>
                      <span className="truncate text-gray-400">{c.url}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    <button onClick={() => testConfig(c.id)} disabled={testingId === c.id}
                      className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300 disabled:opacity-50">
                      {testingId === c.id ? '...' : 'Test'}
                    </button>
                    {!c.isDefault && (
                      <button onClick={() => setDefault(c.id)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                        Set Default
                      </button>
                    )}
                    <button onClick={() => startEdit(c)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
                      Edit
                    </button>
                    <button onClick={() => deleteConfig(c.id)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400">
                      Del
                    </button>
                  </div>
                </div>

                {testResults[c.id] && (
                  <div className={`mt-3 p-3 rounded-xl text-xs ${
                    testResults[c.id].ok
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{testResults[c.id].ok ? '✓ Connected' : '✗ Failed'}</span>
                      <span className="opacity-60">· {testResults[c.id].latencyMs}ms</span>
                    </div>
                    {testResults[c.id].error
                      ? <p>{testResults[c.id].error}</p>
                      : <p className="opacity-80">"{testResults[c.id].response}"</p>
                    }
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="px-5 py-5 bg-gray-50 dark:bg-gray-750 border-t border-gray-100 dark:border-gray-700 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="My LLM"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Provider</label>
                <select value={form.provider}
                  onChange={e => {
                    const p = PROVIDERS.find(p => p.value === e.target.value);
                    setForm(f => ({ ...f, provider: e.target.value, url: p?.defaultUrl || f.url }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">API URL</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            {form.provider !== 'ollama' && (
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">API Key</label>
                <input type="password" value={form.apiKey}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder={PROVIDERS.find(p => p.value === form.provider)?.placeholder || 'sk-...'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                {editingId && <p className="text-[10px] text-gray-400 mt-1">Leave blank to keep existing key</p>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Model</label>
                <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="gpt-4o-mini"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Max Tokens</label>
                <input type="number" value={form.maxTokens}
                  onChange={e => setForm(f => ({ ...f, maxTokens: parseInt(e.target.value) || 4096 }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Temperature</label>
                <input type="number" step="0.1" min="0" max="2" value={form.temperature}
                  onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) || 0.7 }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={saveConfig} disabled={!form.name || !form.url || !form.model}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                {editingId ? 'Update' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Ticker Manager ─────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Stock Tickers</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tickerTotal} tickers in database</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={tickerImportMode} onChange={e => setTickerImportMode(e.target.value as 'upsert' | 'replace')}
              className="text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg px-2 py-1 border-0">
              <option value="upsert">Upsert (merge)</option>
              <option value="replace">Replace all</option>
            </select>
            <button onClick={exportTickers}
              className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Export JSON
            </button>
            <label className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer">
              Import JSON
              <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && importTickersFromJson(e.target.files[0])} />
            </label>
            <button onClick={() => {
              setTickerForm({ symbol: '', name: '', exchange: '', sector: '', industry: '', country: '', market_cap: 0 });
              setTickerError(null);
              setShowTickerForm(true);
            }}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
              + Add Ticker
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <input value={tickerSearch} onChange={e => { setTickerSearch(e.target.value); setTickerPage(1); }}
            placeholder="Search by symbol or name..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>

        {/* Add/Edit Form */}
        {showTickerForm && (
          <div className="px-5 py-4 bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700 space-y-3">
            {tickerError && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs rounded-lg">{tickerError}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Symbol *</label>
                <input value={tickerForm.symbol} onChange={e => setTickerForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  placeholder="e.g. AAPL"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Name</label>
                <input value={tickerForm.name} onChange={e => setTickerForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Apple Inc."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Exchange</label>
                <input value={tickerForm.exchange} onChange={e => setTickerForm(f => ({ ...f, exchange: e.target.value }))}
                  placeholder="NASDAQ"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Sector</label>
                <input value={tickerForm.sector} onChange={e => setTickerForm(f => ({ ...f, sector: e.target.value }))}
                  placeholder="Technology"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Industry</label>
                <input value={tickerForm.industry} onChange={e => setTickerForm(f => ({ ...f, industry: e.target.value }))}
                  placeholder="Consumer Electronics"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Country</label>
                <input value={tickerForm.country} onChange={e => setTickerForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="United States"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Market Cap</label>
                <input type="number" value={tickerForm.market_cap || ''} onChange={e => setTickerForm(f => ({ ...f, market_cap: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveTicker} disabled={tickerSaving || !tickerForm.symbol}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                {tickerSaving ? 'Saving...' : 'Save Ticker'}
              </button>
              <button onClick={() => setShowTickerForm(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Ticker List */}
        {tickerLoading ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading tickers...</div>
        ) : tickers.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            {tickerSearch ? 'No tickers match your search.' : 'No tickers yet. Add manually or import a JSON file.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
            {tickers.map(t => (
              <div key={t.symbol} className="px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{t.symbol}</span>
                    {t.exchange && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">{t.exchange}</span>}
                    {t.sector && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">{t.sector}</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{t.name}{t.country ? ` \u00B7 ${t.country}` : ''}{t.market_cap > 0 ? ` \u00B7 ${(t.market_cap / 1e9).toFixed(1)}B` : ''}</p>
                </div>
                <button onClick={() => {
                  setTickerForm({ symbol: t.symbol, name: t.name, exchange: t.exchange, sector: t.sector, industry: t.industry, country: t.country, market_cap: t.market_cap });
                  setTickerError(null);
                  setShowTickerForm(true);
                }}
                  className="px-2 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors shrink-0">
                  Edit
                </button>
                <button onClick={() => deleteTicker(t.symbol)}
                  className="px-2 py-1 text-[11px] rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors shrink-0">
                  Del
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {tickerTotal > 50 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">
              Showing {(tickerPage - 1) * 50 + 1}-{Math.min(tickerPage * 50, tickerTotal)} of {tickerTotal}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setTickerPage(p => Math.max(1, p - 1))} disabled={tickerPage === 1}
                className="px-2 py-1 text-[11px] rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors">
                Prev
              </button>
              <button onClick={() => setTickerPage(p => p + 1)} disabled={tickerPage * 50 >= tickerTotal}
                className="px-2 py-1 text-[11px] rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Appearance ─────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Appearance</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Theme</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Choose your preferred color scheme</p>
            </div>
            <select value={settings.theme}
              onChange={(e) => update('theme', e.target.value as SettingsData['theme'])}
              className="text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-1.5 border-0 focus:ring-2 focus:ring-blue-500">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Default View</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">How articles are displayed initially</p>
            </div>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button onClick={() => update('defaultView', 'columns')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${settings.defaultView === 'columns' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                Columns
              </button>
              <button onClick={() => update('defaultView', 'graph')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${settings.defaultView === 'graph' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                Graph
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Content ─────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Content</h3>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Default Topic Filter</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pre-select a topic when searching</p>
            </div>
            <select value={settings.defaultFilter || ''}
              onChange={(e) => update('defaultFilter', e.target.value || null)}
              className="text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-1.5 border-0 focus:ring-2 focus:ring-blue-500">
              {TOPIC_FILTERS.map((f) => (
                <option key={f.id || 'none'} value={f.id || ''}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="text-center py-4">
        <p className="text-xs text-gray-400 dark:text-gray-500">Analytical | Map News v1.0</p>
      </div>
    </div>
  );
}
