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

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch {}
  }, []);

  const update = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Customize your experience</p>
        </div>
        {saved && (
          <span className="ml-auto text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
            Saved
          </span>
        )}
      </div>

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
            <select
              value={settings.theme}
              onChange={(e) => update('theme', e.target.value as SettingsData['theme'])}
              className="text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-1.5 border-0 focus:ring-2 focus:ring-blue-500"
            >
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
              <button
                onClick={() => update('defaultView', 'columns')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  settings.defaultView === 'columns'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Columns
              </button>
              <button
                onClick={() => update('defaultView', 'graph')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  settings.defaultView === 'graph'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Graph
              </button>
            </div>
          </div>
        </div>
      </section>

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
            <select
              value={settings.defaultFilter || ''}
              onChange={(e) => update('defaultFilter', e.target.value || null)}
              className="text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-1.5 border-0 focus:ring-2 focus:ring-blue-500"
            >
              {TOPIC_FILTERS.map((f) => (
                <option key={f.id || 'none'} value={f.id || ''}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Data</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Clear Local Data</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Remove all saved preferences and cached data</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">Soon</span>
          </button>
          <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Export Settings</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Download your preferences as a JSON file</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">Soon</span>
          </button>
        </div>
      </section>

      <div className="text-center py-4">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Political | Map News v1.0
        </p>
      </div>
    </div>
  );
}
