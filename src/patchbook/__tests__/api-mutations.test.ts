/**
 * Tests for the new mutation workflow that returns updated questions for chaining.
 * Tests that postAnswer, verifyAnswer, rejectAnswer, and postComment all return
 * {result, updatedQuestion} tuples to enable chainable workflows without version mismatches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  postQuestion,
  postAnswer,
  verifyAnswer,
  rejectAnswer,
  getVerifiedAnswer,
  postComment,
  computeQuestionStatus,
  captureAgentMetadata,
} from '../api';
import { Question, Answer, AgentMetadata } from '../types';

describe('Mutation Workflow - Chainable Returns', () => {
  let agentMetadata: AgentMetadata;
  let tempDir: string;
  let question: Question;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patchbook-test-'));
    process.env.PATCHBOOK_ROOT = tempDir;

    agentMetadata = {
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      systemVersion: '2024-06',
      commitSha: 'abc123def456',
      branch: 'main',
      dependencyVersions: { typescript: '5.0.0' },
    };

    question = postQuestion(
      {
        title: 'Test question',
        problem: 'Test problem',
        repository: 'repo',
        branch: 'main',
        keywords: ['test'],
        author: 'alice',
        authorSessionName: 'session-1',
      },
      agentMetadata
    );
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.PATCHBOOK_ROOT;
  });

  describe('postAnswer', () => {
    it('returns {answer, updatedQuestion}', () => {
      const result = postAnswer(
        question,
        {
          text: 'Test solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      expect(result).toHaveProperty('answer');
      expect(result).toHaveProperty('updatedQuestion');
      expect(result.answer.text).toBe('Test solution');
      expect(result.updatedQuestion.answers).toContainEqual(result.answer);
      expect(result.updatedQuestion.status).toBe('candidate');
      expect(result.updatedQuestion.version).toBe(2);
    });

    it('enables chaining: postAnswer -> postAnswer', () => {
      const { answer: ans1, updatedQuestion: q1 } = postAnswer(
        question,
        {
          text: 'Answer 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      const { answer: ans2, updatedQuestion: q2 } = postAnswer(
        q1,
        {
          text: 'Answer 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      expect(q2.answers.length).toBe(2);
      expect(q2.answers).toContainEqual(ans1);
      expect(q2.answers).toContainEqual(ans2);
      expect(q2.version).toBe(3);
    });
  });

  describe('verifyAnswer', () => {
    let answer: Answer;

    beforeEach(() => {
      const result = postAnswer(
        question,
        { text: 'Test solution', author: 'bob', authorSessionName: 'session-2' },
        agentMetadata
      );
      answer = result.answer;
      question = result.updatedQuestion;
    });

    it('returns {signal, updatedQuestion}', () => {
      const result = verifyAnswer(question, {
        answerId: answer.id,
        sessionId: 'verify-1',
        evidence: 'Tested and works',
      });

      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('updatedQuestion');
      expect(result.signal.type).toBe('verified');
      expect(result.signal.evidence).toBe('Tested and works');
      expect(result.updatedQuestion.status).toBe('verified');
      expect(result.updatedQuestion.version).toBe(3);
    });

    it('enables chaining: postAnswer -> verifyAnswer -> verifyAnswer', () => {
      const ans2Result = postAnswer(
        question,
        {
          text: 'Answer 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );
      let q = ans2Result.updatedQuestion;

      const verify1 = verifyAnswer(q, {
        answerId: answer.id,
        sessionId: 'verify-1',
        evidence: 'Works on main',
      });
      q = verify1.updatedQuestion;

      const verify2 = verifyAnswer(q, {
        answerId: ans2Result.answer.id,
        sessionId: 'verify-2',
        evidence: 'Also works',
      });
      q = verify2.updatedQuestion;

      expect(q.status).toBe('verified');
      expect(q.version).toBe(5);
      expect(
        q.answers[0].signals.filter((s) => s.type === 'verified').length
      ).toBe(1);
      expect(
        q.answers[1].signals.filter((s) => s.type === 'verified').length
      ).toBe(1);
    });
  });

  describe('rejectAnswer', () => {
    let answer: Answer;

    beforeEach(() => {
      const result = postAnswer(
        question,
        { text: 'Test solution', author: 'bob', authorSessionName: 'session-2' },
        agentMetadata
      );
      answer = result.answer;
      question = result.updatedQuestion;
    });

    it('returns {signal, updatedQuestion}', () => {
      const result = rejectAnswer(question, {
        answerId: answer.id,
        sessionId: 'reject-1',
        reason: 'Does not work',
      });

      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('updatedQuestion');
      expect(result.signal.type).toBe('rejected');
      expect(result.signal.reason).toBe('Does not work');
      expect(result.updatedQuestion.status).toBe('candidate');
      expect(result.updatedQuestion.version).toBe(3);
    });

    it('enables chaining: postAnswer -> rejectAnswer -> verifyAnswer -> contested', () => {
      const ans2Result = postAnswer(
        question,
        {
          text: 'Answer 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );
      let q = ans2Result.updatedQuestion;

      const reject = rejectAnswer(q, {
        answerId: answer.id,
        sessionId: 'reject-1',
        reason: 'Staging proxy issue',
      });
      q = reject.updatedQuestion;
      expect(q.status).toBe('candidate');

      const verify = verifyAnswer(q, {
        answerId: ans2Result.answer.id,
        sessionId: 'verify-1',
        evidence: 'Works on prod',
      });
      q = verify.updatedQuestion;

      expect(q.status).toBe('contested');
      expect(q.version).toBe(5);
    });
  });

  describe('postComment', () => {
    it('returns {comment, updatedQuestion}', () => {
      const result = postComment(
        question,
        'This is a comment',
        'bob',
        'session-2',
        agentMetadata
      );

      expect(result).toHaveProperty('comment');
      expect(result).toHaveProperty('updatedQuestion');
      expect(result.comment.text).toBe('This is a comment');
      expect(result.updatedQuestion.comments).toContainEqual(result.comment);
      expect(result.updatedQuestion.version).toBe(2);
    });

    it('enables chaining with other mutations', () => {
      const ansResult = postAnswer(
        question,
        { text: 'Solution', author: 'bob', authorSessionName: 'session-2' },
        agentMetadata
      );
      let q = ansResult.updatedQuestion;

      const cmtResult = postComment(
        q,
        'Great solution',
        'charlie',
        'session-3',
        agentMetadata
      );
      q = cmtResult.updatedQuestion;

      const verifyResult = verifyAnswer(q, {
        answerId: ansResult.answer.id,
        sessionId: 'verify-1',
        evidence: 'Works',
      });
      q = verifyResult.updatedQuestion;

      expect(q.answers.length).toBe(1);
      expect(q.comments.length).toBe(1);
      expect(q.status).toBe('verified');
      expect(q.version).toBe(4);
    });
  });

  describe('Version consistency in chainable workflows', () => {
    it('no version mismatches when chaining mutations', () => {
      // This test validates the core problem fix:
      // Before: caller had stale question object, causing version mismatch
      // After: each mutation returns fresh question with correct version

      let q = question;
      let expectedVersion = 1;

      // Add 3 answers
      for (let i = 0; i < 3; i++) {
        const { updatedQuestion } = postAnswer(
          q,
          { text: `Answer ${i}`, author: 'bob', authorSessionName: 'session-2' },
          agentMetadata
        );
        q = updatedQuestion;
        expectedVersion++;
        expect(q.version).toBe(expectedVersion);
      }

      // Verify first answer
      const ans1 = q.answers[0];
      const { updatedQuestion: q2 } = verifyAnswer(q, {
        answerId: ans1.id,
        sessionId: 'verify-1',
        evidence: 'Works',
      });
      q = q2;
      expectedVersion++;
      expect(q.version).toBe(expectedVersion);

      // Reject second answer - would have failed with old API due to version mismatch
      const ans2 = q.answers[1];
      const { updatedQuestion: q3 } = rejectAnswer(q, {
        answerId: ans2.id,
        sessionId: 'reject-1',
        reason: 'No',
      });
      q = q3;
      expectedVersion++;
      expect(q.version).toBe(expectedVersion);

      // Add comment - would also have failed with version mismatch
      const { updatedQuestion: q4 } = postComment(
        q,
        'Discussion',
        'alice',
        'session-1',
        agentMetadata
      );
      q = q4;
      expectedVersion++;
      expect(q.version).toBe(expectedVersion);

      // Verify final state
      expect(q.answers.length).toBe(3);
      expect(q.comments.length).toBe(1);
      expect(q.status).toBe('contested');
    });
  });

  describe('getVerifiedAnswer with chained mutations', () => {
    it('works correctly after chained mutations', () => {
      let q = question;

      const ans1 = postAnswer(
        q,
        { text: 'Solution 1', author: 'bob', authorSessionName: 'session-2' },
        agentMetadata
      );
      q = ans1.updatedQuestion;

      const ans2 = postAnswer(
        q,
        { text: 'Solution 2', author: 'charlie', authorSessionName: 'session-3' },
        agentMetadata
      );
      q = ans2.updatedQuestion;

      const v1 = verifyAnswer(q, {
        answerId: ans1.answer.id,
        sessionId: 'verify-1',
        evidence: 'Works once',
      });
      q = v1.updatedQuestion;

      const v2 = verifyAnswer(q, {
        answerId: ans1.answer.id,
        sessionId: 'verify-2',
        evidence: 'Works twice',
      });
      q = v2.updatedQuestion;

      const verified = getVerifiedAnswer(q);
      expect(verified?.id).toBe(ans1.answer.id);
      expect(verified?.signals.filter((s) => s.type === 'verified').length).toBe(
        2
      );
    });
  });
});
