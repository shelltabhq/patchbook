import * as fs from 'fs';
import * as path from 'path';
import { Question } from './types';

function getPatchbookRoot(): string {
  return process.env.PATCHBOOK_ROOT || path.join(process.cwd(), '.patchbook');
}

function getQuestionsDir(): string {
  return path.join(getPatchbookRoot(), 'questions');
}

function getAnalyticsDir(): string {
  return path.join(getPatchbookRoot(), 'analytics');
}

// Simple in-memory lock tracking (process-level, not distributed)
const writeLocks = new Map<string, { until: number }>();

function isLocked(key: string): boolean {
  const lock = writeLocks.get(key);
  if (!lock) return false;
  if (lock.until < Date.now()) {
    writeLocks.delete(key);
    return false;
  }
  return true;
}

function acquireLock(key: string, timeoutMs = 5000): boolean {
  if (isLocked(key)) return false;
  writeLocks.set(key, { until: Date.now() + timeoutMs });
  return true;
}

function releaseLock(key: string): void {
  writeLocks.delete(key);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function initializeStorage(): void {
  ensureDir(getPatchbookRoot());
  ensureDir(getQuestionsDir());
  ensureDir(getAnalyticsDir());
}

export function getQuestionPath(questionId: string): string {
  return path.join(getQuestionsDir(), `${questionId}.json`);
}

export function saveQuestion(question: Question): void {
  initializeStorage();
  const filePath = getQuestionPath(question.id);
  const lockKey = `question:${question.id}`;

  // Acquire lock to prevent concurrent writes
  const maxAttempts = 10;
  let attempts = 0;
  while (!acquireLock(lockKey) && attempts < maxAttempts) {
    // Wait a small amount and retry
    const start = Date.now();
    while (Date.now() - start < 10) {
      // Busy-wait 10ms
    }
    attempts++;
  }

  if (!isLocked(lockKey)) {
    throw new Error(`Failed to acquire lock for question ${question.id} after ${maxAttempts} attempts`);
  }

  try {
    // Atomic write: write to temp file, then rename
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(question, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } finally {
    releaseLock(lockKey);
  }
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
  const files = fs.readdirSync(getQuestionsDir()).filter(f => f.endsWith('.json'));
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
  const filePath = path.join(getAnalyticsDir(), `${eventId}.json`);

  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(eventData, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function listAnalyticsEvents(): unknown[] {
  initializeStorage();
  const files = fs.readdirSync(getAnalyticsDir()).filter(f => f.endsWith('.json'));
  const events: unknown[] = [];

  for (const file of files) {
    try {
      const data = fs.readFileSync(path.join(getAnalyticsDir(), file), 'utf-8');
      events.push(JSON.parse(data));
    } catch (error) {
      console.error(`Error reading analytics event ${file}:`, error);
    }
  }

  return events;
}
