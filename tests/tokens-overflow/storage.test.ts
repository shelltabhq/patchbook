import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  initializeStorage,
  loadQuestion,
  saveQuestion,
  loadSession,
  saveSession,
  listQuestions,
  getStoragePath,
} from '../../src/tokens-overflow/storage';
import { Question, Session } from '../../src/tokens-overflow/types';

const testDir = path.join(process.cwd(), '.test-tokens-overflow');

describe('TokensOverflow Storage', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should initialize storage directories', () => {
    initializeStorage(testDir);
    expect(fs.existsSync(path.join(testDir, 'questions'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'sessions'))).toBe(true);
  });

  it('should save and load a question', () => {
    initializeStorage(testDir);
    const q: Question = {
      id: 'q_test123',
      title: 'Test Question',
      problem: 'Test problem',
      repository: 'test-repo',
      branch: 'main',
      keywords: ['test'],
      askedBy: 'ses_test',
      askedBySessionName: 'Test Session',
      createdAt: 1623456789,
      solved: false,
      solvedBy: null,
      solvedBySessionName: null,
      solution: null,
      comments: [],
      upvotes: 0,
    };
    saveQuestion(q, testDir);
    const loaded = loadQuestion('q_test123', testDir);
    expect(loaded).toEqual(q);
  });

  it('should save and load a session', () => {
    initializeStorage(testDir);
    const s: Session = {
      id: 'ses_test',
      name: 'Test Session',
      repository: 'test-repo',
      createdAt: 1623456000,
      lastActiveAt: 1623456789,
    };
    saveSession(s, testDir);
    const loaded = loadSession('ses_test', testDir);
    expect(loaded).toEqual(s);
  });

  it('should list all questions', () => {
    initializeStorage(testDir);
    const q1: Question = {
      id: 'q_1',
      title: 'Q1',
      problem: 'P1',
      repository: 'repo',
      branch: 'main',
      keywords: [],
      askedBy: 'ses_a',
      askedBySessionName: 'A',
      createdAt: 1623456789,
      solved: false,
      solvedBy: null,
      solvedBySessionName: null,
      solution: null,
      comments: [],
      upvotes: 0,
    };
    const q2: Question = {
      ...q1,
      id: 'q_2',
      title: 'Q2',
    };
    saveQuestion(q1, testDir);
    saveQuestion(q2, testDir);
    const questions = listQuestions(testDir);
    expect(questions.length).toBe(2);
  });

  it('should return correct storage path', () => {
    const storagePath = getStoragePath(testDir);
    expect(storagePath).toBe(testDir);
  });
});
