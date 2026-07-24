import { useState, useEffect } from 'react';

interface AlertEntry {
  id: string;
  type: 'sentiment_spike' | 'volume_surge' | 'tone_shift';
  message: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  metadata: Record<string, any>;
}

interface AlertConfig {
  sentimentThreshold: number;
  volumeThreshold: number;
  toneShiftThreshold: number;
  enabled: boolean;
}

const severityColor: Record<string, string> = {
  high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  low: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
};

const typeIcon: Record<string, string> = {
  sentiment_spike: '🎭',
  volume_surge: '📊',
  tone_shift: '🔀',
};

export default function Alerts({ onBack }: { onBack: () => void }) {
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [scannedAt, setScannedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchAlerts = () => {
    setLoading(true);
    fetch('/api/alerts/scan')
      .then(r => r.json())
      .then(d => { setAlerts(d.alerts || []); setScannedAt(d.scannedAt || ''); setConfig(d.config || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchConfig = () => {
    fetch('/api/alerts/config').then(r => r.json()).then(d => setConfig(d.config)).catch(() => {});
  };

  useEffect(() => { fetchAlerts(); fetchConfig(); }, []);

  const updateConfig = (patch: Partial<AlertConfig>) => {
    const updated = { ...config!, ...patch };
    setConfig(updated);
    fetch('/api/alerts/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Alerts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {scannedAt ? `Last scan: ${new Date(scannedAt).toLocaleString()}` : 'Sentiment spike & volume surge detection'}
          </p>
        </div>
        <button onClick={fetchAlerts}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Scan Now
        </button>
      </div>

      {config && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Alert Configuration</h2>
            <button onClick={() => updateConfig({ enabled: !config.enabled })}
              className={`relative w-11 h-6 rounded-full transition-colors ${config.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${config.enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          {config.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tone Shift Threshold</label>
                <input type="number" value={config.toneShiftThreshold} step="0.5"
                  onChange={e => updateConfig({ toneShiftThreshold: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Volume Threshold</label>
                <input type="number" value={config.volumeThreshold} step="10"
                  onChange={e => updateConfig({ volumeThreshold: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Sentiment Threshold</label>
                <input type="number" value={config.sentimentThreshold} step="0.5"
                  onChange={e => updateConfig({ sentimentThreshold: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">No alerts detected</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">All sentiment and volume levels are within normal ranges.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div key={alert.id} className={`p-4 rounded-2xl border ${severityColor[alert.severity]} flex items-start gap-3`}>
              <span className="text-xl flex-shrink-0 mt-0.5">{typeIcon[alert.type]}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{alert.message}</p>
                <p className="text-xs opacity-70 mt-1">
                  {alert.type.replace(/_/g, ' ')} · {new Date(alert.timestamp).toLocaleString()}
                </p>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                alert.severity === 'high' ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200' :
                alert.severity === 'medium' ? 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200' :
                'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
              }`}>
                {alert.severity}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
