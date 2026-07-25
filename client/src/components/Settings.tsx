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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch {}
    fetchConfigs();
  }, []);

  const update = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-3 gap-4">
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
