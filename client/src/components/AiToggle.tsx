import { useState, useEffect, useRef } from 'react';

interface LlmConfig {
  id: number;
  name: string;
  provider: string;
  model: string;
  isDefault: boolean;
}

interface Props {
  enabled: boolean;
  selectedId: number | null;
  onToggle: (enabled: boolean) => void;
  onSelect: (id: number | null) => void;
}

export default function AiToggle({ enabled, selectedId, onToggle, onSelect }: Props) {
  const [configs, setConfigs] = useState<LlmConfig[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/llm-config')
      .then(r => r.json())
      .then(d => setConfigs(d.configs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = configs.find(c => c.id === selectedId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!enabled) {
            onToggle(true);
            if (!selectedId && configs.length > 0) {
              const def = configs.find(c => c.isDefault) || configs[0];
              onSelect(def.id);
            }
            setOpen(true);
          } else {
            setOpen(!open);
          }
        }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          enabled
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-purple-500' : 'bg-gray-400'}`} />
        AI {enabled ? 'ON' : 'OFF'}
      </button>

      {open && enabled && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-medium text-gray-400 uppercase">Select LLM</p>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {configs.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-gray-400">No LLM configured</p>
                <p className="text-[10px] text-gray-500 mt-1">Add one in Settings</p>
              </div>
            ) : (
              configs.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors flex items-center justify-between ${
                    selectedId === c.id ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.provider} &middot; {c.model}</p>
                  </div>
                  {selectedId === c.id && (
                    <svg className="w-4 h-4 text-purple-500 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
            <button
              onClick={() => { onToggle(false); onSelect(null); setOpen(false); }}
              className="w-full text-[11px] text-red-500 hover:text-red-600 font-medium text-center py-1"
            >
              Disable AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
