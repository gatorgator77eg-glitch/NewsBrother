import { useState } from 'react';

interface Props {
  article: any;
  bias: string;
  onCompare: (left: any, right: any) => void;
  highlighted?: boolean;
  onHover: (articleId: number | null) => void;
  isHighlighted: boolean;
}

const BIAS_STYLES: Record<string, { badge: string; ring: string }> = {
  left: { badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', ring: 'hover:ring-blue-300 dark:hover:ring-blue-600' },
  'lean-left': { badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', ring: 'hover:ring-green-300 dark:hover:ring-green-600' },
  center: { badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', ring: 'hover:ring-gray-300 dark:hover:ring-gray-600' },
  'lean-right': { badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', ring: 'hover:ring-orange-300 dark:hover:ring-orange-600' },
  right: { badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', ring: 'hover:ring-red-300 dark:hover:ring-red-600' },
};

export default function ArticleCard({ article, bias, onCompare, onHover, isHighlighted }: Props) {
  const [hovered, setHovered] = useState(false);
  const styles = BIAS_STYLES[bias] || BIAS_STYLES.center;

  const credibility = article.credibility_score || 0.5;
  const fontSize = credibility > 0.8 ? 'text-base' : credibility > 0.6 ? 'text-sm' : 'text-xs';
  const timeAgo = getTimeAgo(article.published_at);

  const handleMouseEnter = () => {
    setHovered(true);
    onHover(article.id);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    onHover(null);
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm card-hover cursor-pointer ring-1 ring-transparent ${styles.ring} ${isHighlighted ? 'article-highlight opacity-100' : ''} ${isHighlighted === false ? 'opacity-40' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles.badge}`}>
          {bias.replace('-', ' ').toUpperCase()}
        </span>
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo}</span>
      </div>

      <a href={article.url} target="_blank" rel="noopener noreferrer" className="no-underline" onClick={(e) => e.stopPropagation()}>
        <h3 className={`font-semibold text-gray-900 dark:text-gray-100 leading-snug mb-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${fontSize}`}>
          {article.title}
        </h3>
      </a>

      {article.excerpt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
          {article.excerpt}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 font-medium">
          {article.source_name}
        </span>
        <div className="flex items-center gap-1">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${credibility * 100}%` }} />
          </div>
          <span className="text-[9px] text-gray-400">{Math.round(credibility * 100)}%</span>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onCompare(article, null); }}
        className="mt-2 w-full text-[10px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
        style={{ opacity: hovered ? 1 : 0 }}
      >
        Compare Framing →
      </button>
    </div>
  );
}

function getTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
