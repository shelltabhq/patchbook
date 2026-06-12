import fs from 'fs';
import path from 'path';
import { Question, Session } from './types';

const STORAGE_DIR = '.tokens-overflow';
const QUESTIONS_DIR = 'questions';
const SESSIONS_DIR = 'sessions';

export function getStoragePath(projectRoot?: string): string {
  if (projectRoot) {
    return projectRoot;
  }
  return path.join(process.cwd(), STORAGE_DIR);
}

export function initializeStorage(projectRoot?: string): void {
  const storagePath = getStoragePath(projectRoot);
  const questionsPath = path.join(storagePath, QUESTIONS_DIR);
  const sessionsPath = path.join(storagePath, SESSIONS_DIR);

  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  if (!fs.existsSync(questionsPath)) {
    fs.mkdirSync(questionsPath, { recursive: true });
  }
  if (!fs.existsSync(sessionsPath)) {
    fs.mkdirSync(sessionsPath, { recursive: true });
  }
}

export function saveQuestion(question: Question, projectRoot?: string): void {
  initializeStorage(projectRoot);
  const storagePath = getStoragePath(projectRoot);
  const filePath = path.join(storagePath, QUESTIONS_DIR, `${question.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(question, null, 2));
}

export function loadQuestion(questionId: string, projectRoot?: string): Question | null {
  const storagePath = getStoragePath(projectRoot);
  const filePath = path.join(storagePath, QUESTIONS_DIR, `${questionId}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Question;
}

export function saveSession(session: Session, projectRoot?: string): void {
  initializeStorage(projectRoot);
  const storagePath = getStoragePath(projectRoot);
  const filePath = path.join(storagePath, SESSIONS_DIR, `${session.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

export function loadSession(sessionId: string, projectRoot?: string): Session | null {
  const storagePath = getStoragePath(projectRoot);
  const filePath = path.join(storagePath, SESSIONS_DIR, `${sessionId}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Session;
}

export function listQuestions(projectRoot?: string): Question[] {
  const storagePath = getStoragePath(projectRoot);
  const questionsPath = path.join(storagePath, QUESTIONS_DIR);

  if (!fs.existsSync(questionsPath)) {
    return [];
  }

  const files = fs.readdirSync(questionsPath).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const filePath = path.join(questionsPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Question;
  });
}

export function listSessions(projectRoot?: string): Session[] {
  const storagePath = getStoragePath(projectRoot);
  const sessionsPath = path.join(storagePath, SESSIONS_DIR);

  if (!fs.existsSync(sessionsPath)) {
    return [];
  }

  const files = fs.readdirSync(sessionsPath).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const filePath = path.join(sessionsPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Session;
  });
}

export function deleteQuestion(questionId: string, projectRoot?: string): void {
  const storagePath = getStoragePath(projectRoot);
  const filePath = path.join(storagePath, QUESTIONS_DIR, `${questionId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
