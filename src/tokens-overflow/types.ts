export interface Session {
  id: string;
  name: string;
  repository: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  authorSessionName: string;
  createdAt: number;
  isSolution: boolean;
}

export interface Question {
  id: string;
  title: string;
  problem: string;
  repository: string;
  branch: string;
  keywords: string[];
  askedBy: string;
  askedBySessionName: string;
  createdAt: number;
  solved: boolean;
  solvedBy: string | null;
  solvedBySessionName: string | null;
  solution: string | null;
  comments: Comment[];
  upvotes: number;
}

export interface SearchIndex {
  questionId: string;
  keywords: string[];
  title: string;
  problem: string;
  lastIndexedAt: number;
}

export interface SearchResult {
  question: Question;
  relevance: number;
  matchedKeywords: string[];
}

export interface TokensOverflowConfig {
  projectRoot: string;
  repositoryName: string;
}
