import { useState } from 'react';
import type { StoryNode } from '../../../shared/types';

interface Props {
  nodes: StoryNode[];
}

const BIAS_LABELS: Record<string, string> = {
  left: 'Progressive/Left',
  'lean-left': 'Lean Left',
  center: 'Neutral',
  'lean-right': 'Lean Right',
  right: 'Conservative/Right',
};

export default function BlindspotAlert({ nodes }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (nodes.length === 0) return null;

  const visibleNodes = expanded ? nodes : nodes.slice(0, 3);

  return (
    <div className="mb-6 space-y-3">
      {visibleNodes.map((node) => (
        <div key={node.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-5 py-3 flex items-center gap-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 truncate">
              Blindspot: {node.topicLabel}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Missing coverage from: {node.blindspot.map(b => BIAS_LABELS[b] || b).join(', ')}
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-2 py-1 rounded-full">
              {node.blindspot.length} MISSING
            </span>
          </div>
        </div>
      ))}

      {nodes.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-sm text-amber-600 dark:text-amber-400 font-medium py-2 hover:bg-amber-50 dark:hover:bg-amber-900/10 rounded-xl transition-colors"
        >
          {expanded ? 'Show less' : `Show ${nodes.length - 3} more blindspots`}
        </button>
      )}
    </div>
  );
}
