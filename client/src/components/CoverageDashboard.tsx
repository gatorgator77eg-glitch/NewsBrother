import { useState, useEffect, useMemo } from 'react';
import { getBreakingNews } from '../api';
import type { StoryNode } from '../../../shared/types';

const BIASES = ['left', 'lean-left', 'center', 'lean-right', 'right'] as const;

const BIAS_LABELS: Record<string, string> = {
  'left': 'Left',
  'lean-left': 'Lean Left',
  'center': 'Center',
  'lean-right': 'Lean Right',
  'right': 'Right',
};

const BIAS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  'left': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', bar: 'bg-blue-500' },
  'lean-left': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', bar: 'bg-green-500' },
  'center': { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', bar: 'bg-gray-500' },
  'lean-right': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', bar: 'bg-orange-500' },
  'right': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', bar: 'bg-red-500' },
};

function getHeatColor(count: number, max: number): string {
  if (count === 0) return 'bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-500';
  const intensity = Math.min(count / Math.max(max, 1), 1);
  if (intensity < 0.2) return 'bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400';
  if (intensity < 0.4) return 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300';
  if (intensity < 0.6) return 'bg-blue-200 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200';
  if (intensity < 0.8) return 'bg-blue-300 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100';
  return 'bg-blue-400 dark:bg-blue-900/50 text-white';
}

interface Props {
  onBack: () => void;
  onTopicClick: (topicId: number) => void;
}

export default function CoverageDashboard({ onBack, onTopicClick }: Props) {
  const [nodes, setNodes] = useState<StoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getBreakingNews();
        setNodes(data.nodes || []);
      } catch {
        setError('Failed to load coverage data');
      }
      setLoading(false);
    };
    load();
  }, []);

  const matrix = useMemo(() => {
    return nodes.map(node => {
      const counts: Record<string, number> = {};
      let maxCount = 0;
      for (const bias of BIASES) {
        const count = node.articles?.[bias]?.length || 0;
        counts[bias] = count;
        if (count > maxCount) maxCount = count;
      }
      return { node, counts, maxCount };
    });
  }, [nodes]);

  const maxCellCount = useMemo(() => {
    let max = 0;
    for (const row of matrix) {
      for (const bias of BIASES) {
        if (row.counts[bias] > max) max = row.counts[bias];
      }
    }
    return max;
  }, [matrix]);

  const biasTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const bias of BIASES) totals[bias] = 0;
    for (const row of matrix) {
      for (const bias of BIASES) {
        totals[bias] += row.counts[bias];
      }
    }
    return totals;
  }, [matrix]);

  const maxBiasTotal = useMemo(() => {
    return Math.max(...Object.values(biasTotals), 1);
  }, [biasTotals]);

  const grandTotal = useMemo(() => {
    return Object.values(biasTotals).reduce((a, b) => a + b, 0);
  }, [biasTotals]);

  const balancedTopics = useMemo(() => {
    return matrix
      .filter(row => BIASES.every(b => row.counts[b] > 0))
      .map(row => {
        const values = BIASES.map(b => row.counts[b]);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
        return { ...row, balanceScore: Math.sqrt(variance) };
      })
      .sort((a, b) => a.balanceScore - b.balanceScore)
      .slice(0, 5);
  }, [matrix]);

  const blindspotTopics = useMemo(() => {
    return matrix
      .filter(row => row.node.blindspot && row.node.blindspot.length > 0)
      .sort((a, b) => (b.node.blindspot?.length || 0) - (a.node.blindspot?.length || 0))
      .slice(0, 8);
  }, [matrix]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Coverage Dashboard</h2>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Coverage Dashboard</h2>
        </div>
        <div className="text-center py-20 text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Coverage Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{nodes.length} topics tracked across {grandTotal} articles</p>
        </div>
      </div>

      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-4">Overall Bias Distribution</h3>
        <div className="space-y-3">
          {BIASES.map(bias => {
            const total = biasTotals[bias];
            const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
            return (
              <div key={bias} className="flex items-center gap-3">
                <span className={`text-xs font-medium w-20 ${BIAS_COLORS[bias].text}`}>{BIAS_LABELS[bias]}</span>
                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${BIAS_COLORS[bias].bar}`}
                    style={{ width: `${(total / maxBiasTotal) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">{total} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Topic Coverage Matrix</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Cell intensity shows article count. Empty cells (red) indicate blindspots.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Topic</th>
                {BIASES.map(bias => (
                  <th key={bias} className={`px-3 py-3 font-medium text-xs uppercase tracking-wider text-center ${BIAS_COLORS[bias].text}`}>
                    {BIAS_LABELS[bias]}
                  </th>
                ))}
                <th className="px-3 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ node, counts }) => {
                const total = BIASES.reduce((sum, b) => sum + counts[b], 0);
                return (
                  <tr
                    key={node.id}
                    className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                    onClick={() => onTopicClick(node.id)}
                  >
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium truncate max-w-[300px]">
                      {node.topicLabel}
                    </td>
                    {BIASES.map(bias => (
                      <td key={bias} className="px-3 py-3 text-center">
                        <span className={`inline-block w-10 py-1 rounded-lg text-xs font-semibold ${getHeatColor(counts[bias], maxCellCount)}`}>
                          {counts[bias] || '—'}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                      {total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Most Balanced Topics</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Covered from all sides of the spectrum</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {balancedTopics.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No fully balanced topics found</p>
            )}
            {balancedTopics.map(({ node, counts, balanceScore }) => (
              <div
                key={node.id}
                className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                onClick={() => onTopicClick(node.id)}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{node.topicLabel}</p>
                <div className="flex gap-2 mt-1.5">
                  {BIASES.map(bias => (
                    <span key={bias} className={`text-[10px] px-1.5 py-0.5 rounded ${BIAS_COLORS[bias].bg} ${BIAS_COLORS[bias].text}`}>
                      {counts[bias]}
                    </span>
                  ))}
                  <span className="text-[10px] text-gray-400 ml-auto">
                    σ={balanceScore.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Coverage Gaps</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Topics missing coverage from certain perspectives</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {blindspotTopics.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No blindspots detected</p>
            )}
            {blindspotTopics.map(({ node }) => (
              <div
                key={node.id}
                className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                onClick={() => onTopicClick(node.id)}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{node.topicLabel}</p>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {(node.blindspot || []).map(bias => (
                    <span key={bias} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                      No {BIAS_LABELS[bias]} coverage
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
