import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  generateId,
  getOrCreateSession,
  postQuestion,
  postComment,
  markSolved,
  upvoteQuestion,
  getQuestion,
  searchQuestions,
  getAllQuestions,
  getQuestionsByRepository,
  getQuestionsByStatus,
  PostQuestionInput,
} from '../../src/tokens-overflow/api';
import { initializeStorage } from '../../src/tokens-overflow/storage';

const testDir = path.join(process.cwd(), '.test-api-tokens-overflow');

describe('TokensOverflow API', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    initializeStorage(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should generate unique IDs with prefix', () => {
    const id1 = generateId('q');
    const id2 = generateId('q');
    expect(id1).toMatch(/^q_[a-f0-9]{16}$/);
    expect(id2).toMatch(/^q_[a-f0-9]{16}$/);
    expect(id1).not.toBe(id2);
  });

  it('should create or load a session', () => {
    const session1 = getOrCreateSession(
      'ses_test1',
      'Test Session',
      'test-repo',
      testDir
    );
    expect(session1.id).toBe('ses_test1');
    expect(session1.name).toBe('Test Session');
    expect(session1.repository).toBe('test-repo');

    const session2 = getOrCreateSession(
      'ses_test1',
      'Test Session',
      'test-repo',
      testDir
    );
    expect(session2.id).toBe('ses_test1');
    expect(session2.lastActiveAt).toBeGreaterThanOrEqual(session1.lastActiveAt);
  });

  it('should post a question and retrieve it', () => {
    const session = getOrCreateSession(
      'ses_user1',
      'User One',
      'my-repo',
      testDir
    );

    const input: PostQuestionInput = {
      title: 'How to deploy?',
      problem: 'I need help deploying to production',
      repository: 'my-repo',
      branch: 'main',
      keywords: ['deployment', 'production'],
    };

    const question = postQuestion(input, session, testDir);
    expect(question.id).toMatch(/^q_/);
    expect(question.title).toBe('How to deploy?');
    expect(question.askedBy).toBe('ses_user1');
    expect(question.askedBySessionName).toBe('User One');
    expect(question.solved).toBe(false);
    expect(question.upvotes).toBe(0);

    const retrieved = getQuestion(question.id, testDir);
    expect(retrieved).toEqual(question);
  });

  it('should add comments to a question', () => {
    const session1 = getOrCreateSession(
      'ses_user1',
      'User One',
      'my-repo',
      testDir
    );
    const session2 = getOrCreateSession(
      'ses_user2',
      'User Two',
      'my-repo',
      testDir
    );

    const input: PostQuestionInput = {
      title: 'How to debug?',
      problem: 'Debug info needed',
      repository: 'my-repo',
      branch: 'main',
    };

    const question = postQuestion(input, session1, testDir);
    const commented = postComment(
      question.id,
      'Have you tried adding logs?',
      session2,
      testDir
    );

    expect(commented.comments.length).toBe(1);
    expect(commented.comments[0].text).toBe('Have you tried adding logs?');
    expect(commented.comments[0].author).toBe('ses_user2');
    expect(commented.comments[0].authorSessionName).toBe('User Two');
  });

  it('should mark a question as solved', () => {
    const session = getOrCreateSession(
      'ses_user1',
      'User One',
      'my-repo',
      testDir
    );

    const input: PostQuestionInput = {
      title: 'Problem X',
      problem: 'How to fix X?',
      repository: 'my-repo',
      branch: 'main',
    };

    const question = postQuestion(input, session, testDir);
    expect(question.solved).toBe(false);

    const solved = markSolved(
      question.id,
      'Use approach Y to fix X',
      session,
      testDir
    );
    expect(solved.solved).toBe(true);
    expect(solved.solution).toBe('Use approach Y to fix X');
    expect(solved.solvedBy).toBe('ses_user1');
    expect(solved.solvedBySessionName).toBe('User One');
  });

  it('should increment upvotes on a question', () => {
    const session = getOrCreateSession(
      'ses_user1',
      'User One',
      'my-repo',
      testDir
    );

    const input: PostQuestionInput = {
      title: 'Popular question',
      problem: 'This will be popular',
      repository: 'my-repo',
      branch: 'main',
    };

    const question = postQuestion(input, session, testDir);
    expect(question.upvotes).toBe(0);

    const upvoted1 = upvoteQuestion(question.id, testDir);
    expect(upvoted1.upvotes).toBe(1);

    const upvoted2 = upvoteQuestion(question.id, testDir);
    expect(upvoted2.upvotes).toBe(2);
  });

  it('should search questions by keywords', () => {
    const session = getOrCreateSession(
      'ses_user1',
      'User One',
      'my-repo',
      testDir
    );

    const input1: PostQuestionInput = {
      title: 'How to use TypeScript?',
      problem: 'TypeScript compilation issues',
      repository: 'my-repo',
      branch: 'main',
      keywords: ['typescript', 'compiler'],
    };

    const input2: PostQuestionInput = {
      title: 'React performance',
      problem: 'How to optimize React components?',
      repository: 'my-repo',
      branch: 'main',
      keywords: ['react', 'performance'],
    };

    postQuestion(input1, session, testDir);
    postQuestion(input2, session, testDir);

    const results = searchQuestions('typescript', testDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].question.title).toContain('TypeScript');
    expect(results[0].matchedKeywords).toContain('typescript');
  });

  it('should get questions filtered by repository and status', () => {
    const session = getOrCreateSession(
      'ses_user1',
      'User One',
      'my-repo',
      testDir
    );

    const input1: PostQuestionInput = {
      title: 'Repo A Question',
      problem: 'Problem in repo A',
      repository: 'repo-a',
      branch: 'main',
    };

    const input2: PostQuestionInput = {
      title: 'Repo B Question',
      problem: 'Problem in repo B',
      repository: 'repo-b',
      branch: 'main',
    };

    const q1 = postQuestion(input1, session, testDir);
    const q2 = postQuestion(input2, session, testDir);

    markSolved(q1.id, 'Solved A', session, testDir);

    const allQuestions = getAllQuestions(testDir);
    expect(allQuestions.length).toBe(2);

    const repoAQuestions = getQuestionsByRepository('repo-a', testDir);
    expect(repoAQuestions.length).toBe(1);
    expect(repoAQuestions[0].title).toBe('Repo A Question');

    const solvedQuestions = getQuestionsByStatus(true, testDir);
    expect(solvedQuestions.length).toBe(1);
    expect(solvedQuestions[0].id).toBe(q1.id);

    const unsolvedQuestions = getQuestionsByStatus(false, testDir);
    expect(unsolvedQuestions.length).toBe(1);
    expect(unsolvedQuestions[0].id).toBe(q2.id);
  });
});
