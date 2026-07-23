export type BiasCategory = 'left' | 'lean-left' | 'center' | 'lean-right' | 'right';

export const BIAS_COLUMNS: readonly BiasCategory[] = ['left', 'lean-left', 'center', 'lean-right', 'right'];

export interface Source {
  id: string;
  name: string;
  url: string;
  rss_url: string;
  bias: BiasCategory;
  credibility_score: number;
  tags: string[];
}

export interface Article {
  id: number;
  source_id: string;
  title: string;
  excerpt: string;
  url: string;
  published_at: string;
  cluster_id: number | null;
  created_at: string;
  source_name?: string;
  credibility_score?: number;
  bias?: BiasCategory;
  tags?: string[];
}

export interface StoryNode {
  id: number;
  topicLabel: string;
  articles: ArticleByBias;
  blindspot: BiasCategory[];
  createdAt: string;
  totalArticles: number;
}

export interface ArticleByBias {
  [key: string]: Article[];
  left: Article[];
  'lean-left': Article[];
  center: Article[];
  'lean-right': Article[];
  right: Article[];
}

export interface SearchResult {
  nodes: StoryNode[];
  total: number;
}

export interface FeedInfo {
  source: Source;
  lastFetched: string | null;
  articleCount: number;
}
