import { Question, SearchIndex, SearchResult } from './types';

export function generateKeywords(text: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'have',
    'has', 'do', 'does', 'did', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  ]);

  const keywords = text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word))
    .map(word => word.replace(/[^a-z0-9]/g, ''))
    .filter(word => word.length > 0);

  return [...new Set(keywords)];
}

export function indexQuestion(question: Question): SearchIndex {
  const titleKeywords = generateKeywords(question.title);
  const problemKeywords = generateKeywords(question.problem);
  const solutionKeywords = question.solution
    ? generateKeywords(question.solution)
    : [];

  const allKeywords = [
    ...titleKeywords,
    ...problemKeywords,
    ...solutionKeywords,
    ...question.keywords,
  ];

  return {
    questionId: question.id,
    keywords: [...new Set(allKeywords)],
    title: question.title,
    problem: question.problem,
    lastIndexedAt: Date.now(),
  };
}

export function searchQuestions(
  query: string,
  questions: Question[]
): SearchResult[] {
  const queryKeywords = generateKeywords(query);

  if (queryKeywords.length === 0) {
    return questions.map(q => ({
      question: q,
      relevance: 0,
      matchedKeywords: [],
    }));
  }

  const results: SearchResult[] = questions
    .map(question => {
      const index = indexQuestion(question);
      const matchedKeywords = queryKeywords.filter(kw =>
        index.keywords.includes(kw)
      );

      let relevance = 0;

      if (matchedKeywords.length > 0) {
        relevance += matchedKeywords.length * 10;

        const titleMatch = matchedKeywords.filter(kw =>
          question.title.toLowerCase().includes(kw)
        ).length;
        relevance += titleMatch * 5;

        if (question.solved) {
          relevance += 3;
        }

        relevance += Math.min(question.upvotes, 10);
      }

      return {
        question,
        relevance,
        matchedKeywords,
      };
    })
    .filter(result => result.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);

  return results;
}

export function buildSearchIndex(questions: Question[]): SearchIndex[] {
  return questions.map(q => indexQuestion(q));
}
