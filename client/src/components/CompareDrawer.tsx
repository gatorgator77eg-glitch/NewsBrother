import { useEffect, useMemo } from 'react';

interface Props {
  item: {
    leftTitle: string;
    rightTitle: string;
    leftSource: string;
    rightSource: string;
    leftExcerpt?: string;
    rightExcerpt?: string;
  };
  onClose: () => void;
}

function getDiff(left: string, right: string) {
  const leftWords = left.toLowerCase().split(/\s+/);
  const rightWords = right.toLowerCase().split(/\s+/);
  const leftSet = new Set(leftWords);
  const rightSet = new Set(rightWords);

  const onlyInLeft = leftWords.filter(w => w.length > 3 && !rightSet.has(w));
  const onlyInRight = rightWords.filter(w => w.length > 3 && !leftSet.has(w));
  const common = leftWords.filter(w => w.length > 3 && rightSet.has(w));

  return { onlyInLeft, onlyInRight, common };
}

function SentimentBadge({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const negative = ['crisis', 'threat', 'attack', 'warn', 'fear', 'danger', 'fail', 'broken', 'destroy', 'illegal', 'radical', 'extremist', 'corrupt'].some(w => lower.includes(w));
  const positive = ['success', 'win', 'achieve', 'progress', 'hope', 'plan', 'reform', 'support', 'champion', 'lead', 'victory', 'triumph'].some(w => lower.includes(w));

  if (negative) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">NEGATIVE TONE</span>;
  if (positive) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">POSITIVE TONE</span>;
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">NEUTRAL TONE</span>;
}

export default function CompareDrawer({ item, onClose }: Props) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const diff = useMemo(() => getDiff(item.leftTitle, item.rightTitle), [item.leftTitle, item.rightTitle]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl drawer-enter max-h-[70vh] overflow-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Compare Framing</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50/70 dark:bg-blue-950/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full">LEFT</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{item.leftSource}</span>
              <SentimentBadge text={item.leftTitle} />
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-semibold text-lg leading-snug">{item.leftTitle}</p>
            {item.leftExcerpt && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-3">{item.leftExcerpt}</p>}
          </div>

          <div className="bg-red-50/70 dark:bg-red-950/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-[10px] font-bold px-2 py-0.5 rounded-full">RIGHT</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{item.rightSource}</span>
              <SentimentBadge text={item.rightTitle} />
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-semibold text-lg leading-snug">{item.rightTitle}</p>
            {item.rightExcerpt && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-3">{item.rightExcerpt}</p>}
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Headline Diff Analysis</h4>

            {diff.onlyInLeft.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Unique to Left headline:</p>
                <div className="flex flex-wrap gap-1">
                  {diff.onlyInLeft.slice(0, 8).map((w, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">{w}</span>
                  ))}
                </div>
              </div>
            )}

            {diff.onlyInRight.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Unique to Right headline:</p>
                <div className="flex flex-wrap gap-1">
                  {diff.onlyInRight.slice(0, 8).map((w, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full">{w}</span>
                  ))}
                </div>
              </div>
            )}

            {diff.common.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Shared language:</p>
                <div className="flex flex-wrap gap-1">
                  {diff.common.slice(0, 8).map((w, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">{w}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Framing Differences</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                Different word choices reflect distinct editorial perspectives
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                Headline framing may emphasize different aspects of the same story
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">•</span>
                Click through to compare full article context and sourcing
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
