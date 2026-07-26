import { useState, useMemo } from 'react';
import ArticleCard from './ArticleCard';
import type { StoryNode } from '../../../shared/types';

interface Props {
  nodes: StoryNode[];
  onCompare: (left: any, right: any) => void;
  onTopicClick: (topicId: number) => void;
}

type BiasKey = 'left' | 'lean-left' | 'center' | 'lean-right' | 'right';

const ALL_BIASES: BiasKey[] = ['left', 'lean-left', 'center', 'lean-right', 'right'];

function getAllArticles(nodes: StoryNode[]) {
  const articles: { article: any; bias: BiasKey }[] = [];
  for (const node of nodes) {
    for (const bias of ALL_BIASES) {
      const biasArticles = node.articles?.[bias] || [];
      for (const article of biasArticles) {
        articles.push({ article: { ...article, topicId: node.id }, bias });
      }
    }
  }
  return articles.sort((a, b) => {
    const dateA = new Date(a.article.published_at || 0).getTime();
    const dateB = new Date(b.article.published_at || 0).getTime();
    return dateB - dateA;
  });
}

export default function ThreeColumnLayout({ nodes, onCompare, onTopicClick }: Props) {
  const [hoveredArticleId, setHoveredArticleId] = useState<number | null>(null);
  const articles = useMemo(() => getAllArticles(nodes), [nodes]);

  return (
    <div className="space-y-3">
      {articles.length === 0 && (
        <p className="text-gray-400 text-sm italic text-center py-12">No coverage</p>
      )}
      {articles.map(({ article, bias }) => (
        <div key={article.id} className="group">
          <ArticleCard
            article={article}
            bias={bias}
            onCompare={onCompare}
            onHover={setHoveredArticleId}
            isHighlighted={hoveredArticleId !== null && hoveredArticleId === article.id}
          />
        </div>
      ))}
    </div>
  );
}
