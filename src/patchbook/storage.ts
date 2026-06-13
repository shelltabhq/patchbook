import * as fs from 'fs';
import * as path from 'path';
import { Question } from './types';

const PATCHBOOK_ROOT = path.join(process.cwd(), '.patchbook');
const QUESTIONS_DIR = path.join(PATCHBOOK_ROOT, 'questions');
const ANALYTICS_DIR = path.join(PATCHBOOK_ROOT, 'analytics');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function initializeStorage(): void {
  ensureDir(PATCHBOOK_ROOT);
  ensureDir(QUESTIONS_DIR);
  ensureDir(ANALYTICS_DIR);
}

export function getQuestionPath(questionId: string): string {
  return path.join(QUESTIONS_DIR, `${questionId}.json`);
}

export function saveQuestion(question: Question): void {
  initializeStorage();
  const filePath = getQuestionPath(question.id);

  // Atomic write: write to temp file, then rename
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(question, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function loadQuestion(questionId: string): Question | null {
  const filePath = getQuestionPath(questionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Question;
  } catch (error) {
    console.error(`Error loading question ${questionId}:`, error);
    return null;
  }
}

export function listAllQuestions(): Question[] {
  initializeStorage();
  const files = fs.readdirSync(QUESTIONS_DIR).filter(f => f.endsWith('.json'));
  const questions: Question[] = [];

  for (const file of files) {
    const questionId = file.replace('.json', '');
    const question = loadQuestion(questionId);
    if (question) {
      questions.push(question);
    }
  }

  return questions;
}

export function deleteQuestion(questionId: string): void {
  const filePath = getQuestionPath(questionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function saveAnalyticsEvent(eventId: string, eventData: unknown): void {
  initializeStorage();
  const filePath = path.join(ANALYTICS_DIR, `${eventId}.json`);

  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(eventData, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function listAnalyticsEvents(): unknown[] {
  initializeStorage();
  const files = fs.readdirSync(ANALYTICS_DIR).filter(f => f.endsWith('.json'));
  const events: unknown[] = [];

  for (const file of files) {
    try {
      const data = fs.readFileSync(path.join(ANALYTICS_DIR, file), 'utf-8');
      events.push(JSON.parse(data));
    } catch (error) {
      console.error(`Error reading analytics event ${file}:`, error);
    }
  }

  return events;
}
