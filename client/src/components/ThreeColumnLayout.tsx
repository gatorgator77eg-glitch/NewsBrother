import { useState } from 'react';
import ArticleCard from './ArticleCard';
import type { StoryNode } from '../../../shared/types';

interface Props {
  nodes: StoryNode[];
  activeFilter: string | null;
  onCompare: (left: any, right: any) => void;
  onTopicClick: (topicId: number) => void;
}

type BiasKey = 'left' | 'lean-left' | 'center' | 'lean-right' | 'right';

const COLUMNS: { key: BiasKey; label: string; bgColor: string; accentColor: string }[] = [
  { key: 'left', label: 'Progressive / Left', bgColor: 'bg-blue-50/70 dark:bg-blue-950/20', accentColor: 'border-blue-200 dark:border-blue-800' },
  { key: 'lean-left', label: 'Lean Left', bgColor: 'bg-green-50/50 dark:bg-green-950/20', accentColor: 'border-green-200 dark:border-green-800' },
  { key: 'center', label: 'Neutral / Wire', bgColor: 'bg-gray-50/70 dark:bg-gray-800/30', accentColor: 'border-gray-200 dark:border-gray-700' },
  { key: 'lean-right', label: 'Lean Right', bgColor: 'bg-orange-50/50 dark:bg-orange-950/20', accentColor: 'border-orange-200 dark:border-orange-800' },
  { key: 'right', label: 'Conservative / Right', bgColor: 'bg-red-50/70 dark:bg-red-950/20', accentColor: 'border-red-200 dark:border-red-800' },
];

const FILTER_KEYWORDS: Record<string, string[]> = {
  economy: ['economy', 'economic', 'inflation', 'gdp', 'trade', 'tariff', 'recession', 'jobs', 'employment', 'fed', 'interest rate', 'stock', 'market'],
  elections: ['election', 'primary', 'vote', 'ballot', 'campaign', 'candidate', 'poll', 'midterm', 'democrat', 'republican'],
  'foreign-policy': ['foreign', 'nato', 'china', 'russia', 'ukraine', 'diplomacy', 'sanctions', 'war', 'military', 'treaty'],
  healthcare: ['healthcare', 'health', 'medicare', 'medicaid', 'insurance', 'hospital', 'drug', 'pharma', 'vaccine'],
  climate: ['climate', 'environment', 'carbon', 'emission', 'energy', 'oil', 'renewable', 'solar', 'green'],
  immigration: ['immigration', 'immigrant', 'border', 'asylum', 'deport', 'visa', 'migrant'],
  technology: ['technology', 'tech', 'ai', 'artificial intelligence', 'social media', 'cyber', 'data', 'privacy'],
};

export default function ThreeColumnLayout({ nodes, activeFilter, onCompare, onTopicClick }: Props) {
  const [hoveredArticleId, setHoveredArticleId] = useState<number | null>(null);

  return (
    <div className="grid grid-5-col gap-3">
      {COLUMNS.map((col) => {
        const articles = getArticlesForColumn(nodes, col.key, activeFilter);
        return (
          <div key={col.key} className={`${col.bgColor} rounded-2xl p-3 min-h-[400px]`}>
            <div className={`text-center mb-4 pb-3 border-b ${col.accentColor}`}>
              <h2 className="font-bold text-sm text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                {col.label}
              </h2>
              <p className="text-xs text-gray-400 mt-1">{articles.length} articles</p>
            </div>
            <div className="space-y-3">
              {articles.length === 0 && (
                <p className="text-gray-400 text-sm italic text-center py-8">No coverage</p>
              )}
              {articles.map((article: any) => (
                <div key={article.id} className="group">
                  <ArticleCard
                    article={article}
                    bias={col.key}
                    onCompare={onCompare}
                    onHover={setHoveredArticleId}
                    isHighlighted={hoveredArticleId !== null && hoveredArticleId === article.id}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getArticlesForColumn(nodes: StoryNode[], bias: BiasKey, activeFilter: string | null) {
  const articles: any[] = [];

  for (const node of nodes) {
    const biasArticles = node.articles?.[bias] || [];
    for (const article of biasArticles) {
      if (activeFilter) {
        const keywords = FILTER_KEYWORDS[activeFilter] || [];
        const title = (article.title || '').toLowerCase();
        const excerpt = (article.excerpt || '').toLowerCase();
        const combined = title + ' ' + excerpt;
        if (!keywords.some(kw => combined.includes(kw))) continue;
      }
      articles.push({ ...article, topicId: node.id });
    }
  }

  return articles.sort((a: any, b: any) => {
    const dateA = new Date(a.published_at || 0).getTime();
    const dateB = new Date(b.published_at || 0).getTime();
    return dateB - dateA;
  });
}
