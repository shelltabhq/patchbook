import { v4 as uuidv4 } from 'uuid';
import {
  AgentMetadata,
  Answer,
  AnswerSignal,
  Comment,
  Question,
  QuestionStatus,
  SearchResult,
} from './types';
import { trackEvent } from './analytics';
import { saveQuestion, loadQuestion, listAllQuestions } from './storage';

export function captureAgentMetadata(): AgentMetadata {
  return {
    model: process.env.CLAUDE_MODEL || 'unknown',
    provider: process.env.CLAUDE_PROVIDER || 'unknown',
    systemVersion: process.env.CLAUDE_SYSTEM_VERSION,
    commitSha: process.env.GIT_COMMIT_SHA,
    branch: process.env.GIT_BRANCH || process.env.BRANCH,
    dependencyVersions: process.env.DEPENDENCY_VERSIONS
      ? JSON.parse(process.env.DEPENDENCY_VERSIONS)
      : undefined,
  };
}

export function computeQuestionStatus(question: Question): QuestionStatus {
  if (question.answers.length === 0) return 'open';

  const hasVerified = question.answers.some((a) =>
    a.signals.some((s) => s.type === 'verified')
  );
  const hasRejected = question.answers.some((a) =>
    a.signals.some((s) => s.type === 'rejected')
  );

  if (hasVerified && hasRejected) return 'contested';
  if (hasVerified) return 'verified';
  return 'candidate';
}

function generateId(prefix: string): string {
  return `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
}

export interface PostQuestionInput {
  title: string;
  problem: string;
  repository: string;
  branch: string;
  keywords?: string[];
  author: string;
  authorSessionName: string;
}

export function postQuestion(
  input: PostQuestionInput,
  agentMetadata: AgentMetadata
): Question {
  if (!input.title?.trim()) {
    throw new Error('Question title is required');
  }
  if (!input.problem?.trim()) {
    throw new Error('Question problem description is required');
  }

  const now = Math.floor(Date.now() / 1000);
  const question: Question = {
    id: generateId('q'),
    title: input.title,
    problem: input.problem,
    repository: input.repository,
    branch: input.branch,
    keywords: input.keywords || [],
    askedBy: input.author,
    askedBySessionName: input.authorSessionName,
    agentMetadata,
    createdAt: now,
    updatedAt: now,
    version: 1,
    answers: [],
    comments: [],
    status: 'open',
  };

  saveQuestion(question);

  trackEvent(
    'question_posted',
    {
      questionId: question.id,
      title: question.title,
      keywords: question.keywords,
    },
    {
      questionId: question.id,
      userId: input.author,
    }
  );

  return question;
}

export interface PostAnswerInput {
  text: string;
  author: string;
  authorSessionName: string;
}

export function postAnswer(
  question: Question,
  input: PostAnswerInput,
  agentMetadata: AgentMetadata
): Answer {
  if (!input.text?.trim()) {
    throw new Error('Answer text is required');
  }

  const answer: Answer = {
    id: generateId('a'),
    text: input.text,
    author: input.author,
    authorSessionName: input.authorSessionName,
    agentMetadata,
    createdAt: Math.floor(Date.now() / 1000),
    signals: [],
  };

  question.answers.push(answer);
  question.status = computeQuestionStatus(question);
  question.version++;
  question.updatedAt = Math.floor(Date.now() / 1000);

  saveQuestion(question);

  trackEvent(
    'answer_posted',
    {
      answerId: answer.id,
      questionId: question.id,
      answerLength: input.text.length,
    },
    {
      answerId: answer.id,
      questionId: question.id,
      userId: input.author,
    }
  );

  return answer;
}

export interface VerifyAnswerInput {
  answerId: string;
  sessionId: string;
  evidence: string;
}

export function verifyAnswer(
  question: Question,
  input: VerifyAnswerInput
): Extract<AnswerSignal, { type: 'verified' }> {
  const answer = question.answers.find((a) => a.id === input.answerId);
  if (!answer) {
    throw new Error(`Answer ${input.answerId} not found`);
  }

  if (!input.evidence?.trim()) {
    throw new Error('Verification evidence is required. Describe what you tested and what the results were.');
  }

  const signal: AnswerSignal = {
    type: 'verified',
    sessionId: input.sessionId,
    evidence: input.evidence,
    createdAt: Math.floor(Date.now() / 1000),
  };

  answer.signals.push(signal);
  question.status = computeQuestionStatus(question);
  question.version++;
  question.updatedAt = Math.floor(Date.now() / 1000);

  saveQuestion(question);

  trackEvent(
    'answer_verified',
    {
      answerId: answer.id,
      questionId: question.id,
      evidenceLength: input.evidence.length,
      timeToVerification: signal.createdAt - answer.createdAt,
    },
    {
      answerId: answer.id,
      questionId: question.id,
      sessionId: input.sessionId,
    }
  );

  return signal;
}

export interface RejectAnswerInput {
  answerId: string;
  sessionId: string;
  reason: string;
}

export function rejectAnswer(
  question: Question,
  input: RejectAnswerInput
): AnswerSignal {
  const answer = question.answers.find((a) => a.id === input.answerId);
  if (!answer) {
    throw new Error(`Answer ${input.answerId} not found`);
  }

  if (!input.reason?.trim()) {
    throw new Error('Rejection reason is required. Explain why this answer doesn\'t work in your context.');
  }

  const signal: AnswerSignal = {
    type: 'rejected',
    sessionId: input.sessionId,
    reason: input.reason,
    createdAt: Math.floor(Date.now() / 1000),
  };

  answer.signals.push(signal);
  question.status = computeQuestionStatus(question);
  question.version++;
  question.updatedAt = Math.floor(Date.now() / 1000);

  saveQuestion(question);

  trackEvent(
    'answer_rejected',
    {
      answerId: answer.id,
      questionId: question.id,
      reasonLength: input.reason.length,
    },
    {
      answerId: answer.id,
      questionId: question.id,
      sessionId: input.sessionId,
    }
  );

  return signal;
}

export function getVerifiedAnswer(question: Question): Answer | null {
  for (const answer of question.answers) {
    if (answer.signals.some((s) => s.type === 'verified')) {
      return answer;
    }
  }
  return null;
}

export function getQuestion(questionId: string): Question | null {
  return loadQuestion(questionId);
}

export function getAllQuestions(): Question[] {
  return listAllQuestions();
}

export function getQuestionsByStatus(status: QuestionStatus): Question[] {
  return getAllQuestions().filter((q) => q.status === status);
}

export function getVerifiedQuestions(): Question[] {
  return getQuestionsByStatus('verified');
}

export function getContestedQuestions(): Question[] {
  return getQuestionsByStatus('contested');
}

export function getUnansweredQuestions(): Question[] {
  return getQuestionsByStatus('open');
}

export function searchQuestionsInProject(query: string): SearchResult[] {
  const normalizedQuery = query.toLowerCase();
  const queryTerms = normalizedQuery.split(/\s+/).filter(t => t.length > 0);

  const questions = getAllQuestions();
  const results: SearchResult[] = [];

  for (const question of questions) {
    const matchedKeywords: string[] = [];
    let relevance = 0;

    // Title match (highest weight)
    if (question.title.toLowerCase().includes(normalizedQuery)) {
      relevance += 10;
      for (const term of queryTerms) {
        if (question.title.toLowerCase().includes(term)) {
          matchedKeywords.push(term);
          relevance += 3;
        }
      }
    }

    // Problem match (medium weight)
    if (question.problem.toLowerCase().includes(normalizedQuery)) {
      relevance += 5;
      for (const term of queryTerms) {
        if (question.problem.toLowerCase().includes(term)) {
          matchedKeywords.push(term);
          relevance += 2;
        }
      }
    }

    // Keywords match (low weight)
    for (const keyword of question.keywords) {
      if (keyword.toLowerCase().includes(normalizedQuery)) {
        relevance += 1;
        matchedKeywords.push(keyword);
      } else {
        for (const term of queryTerms) {
          if (keyword.toLowerCase().includes(term)) {
            matchedKeywords.push(keyword);
            relevance += 0.5;
          }
        }
      }
    }

    // Answer text match (low weight)
    for (const answer of question.answers) {
      if (answer.text.toLowerCase().includes(normalizedQuery)) {
        relevance += 1;
        for (const term of queryTerms) {
          if (answer.text.toLowerCase().includes(term)) {
            relevance += 0.5;
          }
        }
      }
    }

    if (relevance > 0) {
      results.push({
        question,
        relevance,
        matchedKeywords: [...new Set(matchedKeywords)],
      });
    }
  }

  // Sort by relevance (descending)
  results.sort((a, b) => b.relevance - a.relevance);
  return results;
}

export function postComment(
  question: Question,
  text: string,
  author: string,
  authorSessionName: string,
  agentMetadata: AgentMetadata
): Comment {
  if (!text?.trim()) {
    throw new Error('Comment text is required');
  }

  const comment: Comment = {
    id: generateId('cmt'),
    text,
    author,
    authorSessionName,
    agentMetadata,
    createdAt: Math.floor(Date.now() / 1000),
  };

  question.comments.push(comment);
  question.version++;
  question.updatedAt = Math.floor(Date.now() / 1000);

  saveQuestion(question);

  trackEvent(
    'comment_posted',
    {
      commentId: comment.id,
      questionId: question.id,
      commentLength: text.length,
    },
    {
      questionId: question.id,
      userId: author,
    }
  );

  return comment;
}
