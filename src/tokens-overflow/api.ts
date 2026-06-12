import { v4 as uuidv4 } from 'uuid';
import { Question, Session, Comment, SearchResult } from './types';
import {
  saveQuestion,
  loadQuestion,
  loadSession,
  saveSession,
  listQuestions,
} from './storage';
import { searchQuestions as performSearch } from './search';

export function generateId(prefix: string): string {
  return `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
}

export function getOrCreateSession(
  sessionId: string,
  sessionName: string,
  repository: string,
  projectRoot?: string
): Session {
  let session = loadSession(sessionId, projectRoot);

  if (!session) {
    session = {
      id: sessionId,
      name: sessionName,
      repository,
      createdAt: Math.floor(Date.now() / 1000),
      lastActiveAt: Math.floor(Date.now() / 1000),
    };
    saveSession(session, projectRoot);
  } else {
    session.lastActiveAt = Math.floor(Date.now() / 1000);
    saveSession(session, projectRoot);
  }

  return session;
}

export interface PostQuestionInput {
  title: string;
  problem: string;
  repository: string;
  branch: string;
  keywords?: string[];
}

export function postQuestion(
  input: PostQuestionInput,
  session: Session,
  projectRoot?: string
): Question {
  const question: Question = {
    id: generateId('q'),
    title: input.title,
    problem: input.problem,
    repository: input.repository,
    branch: input.branch,
    keywords: input.keywords || [],
    askedBy: session.id,
    askedBySessionName: session.name,
    createdAt: Math.floor(Date.now() / 1000),
    solved: false,
    solvedBy: null,
    solvedBySessionName: null,
    solution: null,
    comments: [],
    upvotes: 0,
  };

  saveQuestion(question, projectRoot);
  return question;
}

export function postComment(
  questionId: string,
  text: string,
  session: Session,
  projectRoot?: string
): Question {
  const question = loadQuestion(questionId, projectRoot);
  if (!question) {
    throw new Error(`Question ${questionId} not found`);
  }

  const comment: Comment = {
    id: generateId('c'),
    text,
    author: session.id,
    authorSessionName: session.name,
    createdAt: Math.floor(Date.now() / 1000),
    isSolution: false,
  };

  question.comments.push(comment);
  saveQuestion(question, projectRoot);
  return question;
}

export function markSolved(
  questionId: string,
  solution: string,
  session: Session,
  projectRoot?: string
): Question {
  const question = loadQuestion(questionId, projectRoot);
  if (!question) {
    throw new Error(`Question ${questionId} not found`);
  }

  question.solved = true;
  question.solution = solution;
  question.solvedBy = session.id;
  question.solvedBySessionName = session.name;

  saveQuestion(question, projectRoot);
  return question;
}

export function upvoteQuestion(
  questionId: string,
  projectRoot?: string
): Question {
  const question = loadQuestion(questionId, projectRoot);
  if (!question) {
    throw new Error(`Question ${questionId} not found`);
  }

  question.upvotes += 1;
  saveQuestion(question, projectRoot);
  return question;
}

export function getQuestion(
  questionId: string,
  projectRoot?: string
): Question | null {
  return loadQuestion(questionId, projectRoot);
}

// Search functionality is provided by the search.ts module
// For internal use within api.ts, we use performSearch
export function searchQuestionsInProject(
  query: string,
  projectRoot?: string
): SearchResult[] {
  const allQuestions = listQuestions(projectRoot);
  return performSearch(query, allQuestions);
}

export function getAllQuestions(projectRoot?: string): Question[] {
  return listQuestions(projectRoot);
}

export function getQuestionsByRepository(
  repository: string,
  projectRoot?: string
): Question[] {
  const allQuestions = listQuestions(projectRoot);
  return allQuestions.filter(q => q.repository === repository);
}

export function getQuestionsByStatus(
  solved: boolean,
  projectRoot?: string
): Question[] {
  const allQuestions = listQuestions(projectRoot);
  return allQuestions.filter(q => q.solved === solved);
}
