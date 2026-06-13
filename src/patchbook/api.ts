import { v4 as uuidv4 } from 'uuid';
import {
  AgentMetadata,
  Answer,
  AnswerSignal,
  Comment,
  Question,
  QuestionStatus,
} from './types';
import { trackEvent } from './analytics';

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
    createdAt: Math.floor(Date.now() / 1000),
    answers: [],
    comments: [],
    status: 'open',
  };

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
  evidence?: string;
}

export function verifyAnswer(
  question: Question,
  input: VerifyAnswerInput
): AnswerSignal {
  const answer = question.answers.find((a) => a.id === input.answerId);
  if (!answer) {
    throw new Error(`Answer ${input.answerId} not found`);
  }

  const signal: AnswerSignal = {
    type: 'verified',
    sessionId: input.sessionId,
    evidence: input.evidence,
    createdAt: Math.floor(Date.now() / 1000),
  };

  answer.signals.push(signal);
  question.status = computeQuestionStatus(question);

  trackEvent(
    'answer_verified',
    {
      answerId: answer.id,
      questionId: question.id,
      evidence: input.evidence ? true : false,
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

  const signal: AnswerSignal = {
    type: 'rejected',
    sessionId: input.sessionId,
    reason: input.reason,
    createdAt: Math.floor(Date.now() / 1000),
  };

  answer.signals.push(signal);
  question.status = computeQuestionStatus(question);

  trackEvent(
    'answer_rejected',
    {
      answerId: answer.id,
      questionId: question.id,
      reason: input.reason,
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

export function postComment(
  question: Question,
  text: string,
  author: string,
  authorSessionName: string,
  agentMetadata: AgentMetadata
): Comment {
  const comment: Comment = {
    id: generateId('cmt'),
    text,
    author,
    authorSessionName,
    agentMetadata,
    createdAt: Math.floor(Date.now() / 1000),
  };

  question.comments.push(comment);

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
