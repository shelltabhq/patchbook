import { describe, it, expect } from 'vitest';
import {
  generateKeywords,
  indexQuestion,
  searchQuestions,
  buildSearchIndex,
} from '../../src/tokens-overflow/search';
import { Question } from '../../src/tokens-overflow/types';

describe('Search Indexing', () => {
  const mockQuestion: Question = {
    id: 'q_abc123',
    title: 'React hook issue with useLocation',
    problem: 'useLocation outside Router throws error',
    repository: 'coshell',
    branch: 'main',
    keywords: ['react', 'hooks', 'router'],
    askedBy: 'ses_maya123',
    askedBySessionName: "Maya's Workspace",
    createdAt: 1623456789,
    solved: true,
    solvedBy: 'ses_debug123',
    solvedBySessionName: 'Debugging Session',
    solution: 'Wrap component with Router provider',
    comments: [],
    upvotes: 5,
  };

  it('generateKeywords - filters stopwords and lowercases', () => {
    const keywords = generateKeywords(
      'The React hook is used for state management'
    );
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('for');
    expect(keywords).toContain('react');
    expect(keywords).toContain('hook');
    expect(keywords).toContain('state');
    expect(keywords).toContain('management');
  });

  it('indexQuestion - builds SearchIndex from question', () => {
    const index = indexQuestion(mockQuestion);
    expect(index.questionId).toBe('q_abc123');
    expect(index.title).toBe('React hook issue with useLocation');
    expect(index.keywords).toContain('react');
    expect(index.keywords).toContain('hook');
    expect(index.lastIndexedAt).toBeGreaterThan(0);
  });

  it('searchQuestions - ranks by relevance', () => {
    const questions: Question[] = [
      mockQuestion,
      {
        ...mockQuestion,
        id: 'q_xyz789',
        title: 'TypeScript compilation error',
        problem: 'TypeScript fails to compile',
        solved: false,
        upvotes: 0,
      },
    ];

    const results = searchQuestions('react hook', questions);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].question.id).toBe('q_abc123');
    expect(results[0].relevance).toBeGreaterThan(0);
  });

  it('buildSearchIndex - indexes all questions', () => {
    const questions: Question[] = [mockQuestion, { ...mockQuestion, id: 'q_xyz' }];
    const indexes = buildSearchIndex(questions);
    expect(indexes).toHaveLength(2);
    expect(indexes[0].questionId).toBe('q_abc123');
    expect(indexes[1].questionId).toBe('q_xyz');
  });

  it('searchQuestions - multi-word query matching', () => {
    const questions: Question[] = [
      mockQuestion,
      {
        ...mockQuestion,
        id: 'q_other',
        title: 'JavaScript async await issue',
        problem: 'async function timing problem',
      },
    ];

    const results = searchQuestions('useLocation router', questions);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].question.id).toBe('q_abc123');
    expect(results[0].matchedKeywords.length).toBeGreaterThan(0);
  });
});
