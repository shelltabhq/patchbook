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
  searchQuestionsInProject,
  getQuestion,
} from '../api';
import { getAnalyticsEvents } from '../analytics';
import {
  Question,
  Answer,
  AnswerSignal,
  Comment,
  AgentMetadata,
  QuestionStatus,
} from '../types';

describe('Verification API', () => {
  let agentMetadata: AgentMetadata;
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test storage
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patchbook-test-'));
    process.env.PATCHBOOK_ROOT = tempDir;

    agentMetadata = {
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      systemVersion: '2024-06',
      commitSha: 'abc123def456',
      branch: 'main',
      dependencyVersions: {
        'typescript': '5.0.0',
        'vitest': '0.34.0',
      },
    };
  });

  afterEach(() => {
    // Clean up temporary directory after each test
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.PATCHBOOK_ROOT;
  });

  describe('postQuestion', () => {
    it('creates a question with open status', () => {
      const question = postQuestion(
        {
          title: 'How to debug TypeScript errors?',
          problem: 'Getting type errors in my component',
          repository: 'myrepo',
          branch: 'main',
          keywords: ['typescript', 'debugging'],
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      expect(question).toBeDefined();
      expect(question.id).toMatch(/^q_/);
      expect(question.title).toBe('How to debug TypeScript errors?');
      expect(question.problem).toBe('Getting type errors in my component');
      expect(question.repository).toBe('myrepo');
      expect(question.branch).toBe('main');
      expect(question.keywords).toEqual(['typescript', 'debugging']);
      expect(question.askedBy).toBe('alice');
      expect(question.askedBySessionName).toBe('session-1');
      expect(question.status).toBe('open');
      expect(question.answers).toEqual([]);
      expect(question.comments).toEqual([]);
      expect(question.createdAt).toBeGreaterThan(0);
      expect(question.agentMetadata).toEqual(agentMetadata);
    });

    it('creates question without keywords', () => {
      const question = postQuestion(
        {
          title: 'Test question',
          problem: 'Some problem',
          repository: 'repo',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      expect(question.keywords).toEqual([]);
    });

    it('generates unique IDs', () => {
      const q1 = postQuestion(
        {
          title: 'Q1',
          problem: 'P1',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const q2 = postQuestion(
        {
          title: 'Q2',
          problem: 'P2',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      expect(q1.id).not.toBe(q2.id);
    });
  });

  describe('postAnswer', () => {
    let question: Question;

    beforeEach(() => {
      question = postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );
    });

    it('adds answer to question and moves status to candidate', () => {
      const answer = postAnswer(
        question,
        {
          text: 'Here is the solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      expect(answer).toBeDefined();
      expect(answer.id).toMatch(/^a_/);
      expect(answer.text).toBe('Here is the solution');
      expect(answer.author).toBe('bob');
      expect(answer.authorSessionName).toBe('session-2');
      expect(answer.signals).toEqual([]);
      expect(answer.createdAt).toBeGreaterThan(0);
      expect(answer.agentMetadata).toEqual(agentMetadata);

      // Reload question from storage to verify changes were saved
      const savedQuestion = getQuestion(question.id);
      expect(savedQuestion).toBeDefined();
      expect(savedQuestion!.answers).toContainEqual(answer);
      expect(savedQuestion!.answers.length).toBe(1);
      expect(savedQuestion!.status).toBe('candidate');
    });

    it('adds multiple answers', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first mutation
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second mutation
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.answers.length).toBe(2);
      expect(currentQuestion.answers).toContainEqual(answer1);
      expect(currentQuestion.answers).toContainEqual(answer2);
    });

    it('generates unique answer IDs', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first mutation
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      expect(answer1.id).not.toBe(answer2.id);
    });
  });

  describe('verifyAnswer', () => {
    let question: Question;
    let answer: Answer;

    beforeEach(() => {
      question = postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      answer = postAnswer(
        question,
        {
          text: 'Test solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after answer posted
      question = getQuestion(question.id)!;
    });

    it('adds verified signal to answer', () => {
      const signal = verifyAnswer(question, {
        answerId: answer.id,
        sessionId: 'verify-session-1',
        evidence: 'Confirmed in production',
      });

      expect(signal).toBeDefined();
      expect(signal.type).toBe('verified');
      expect(signal.sessionId).toBe('verify-session-1');
      expect((signal as any).evidence).toBe('Confirmed in production');
      expect(signal.createdAt).toBeGreaterThan(0);

      // Reload to verify changes were saved
      const savedQuestion = getQuestion(question.id)!;
      const savedAnswer = savedQuestion.answers.find((a) => a.id === answer.id)!;
      expect(savedAnswer.signals).toContainEqual(signal);
      expect(savedAnswer.signals.length).toBe(1);
    });

    it('marks question as verified when answer is verified', () => {
      verifyAnswer(question, {
        evidence: 'Tested and verified',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      // Reload to verify changes were saved
      const savedQuestion = getQuestion(question.id)!;
      expect(savedQuestion.status).toBe('verified');
    });

    it('requires evidence when verifying', () => {
      const signal1 = verifyAnswer(question, {
        evidence: 'Tested on main: npm test passed, 42 test cases passing',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      expect(signal1.evidence).toBe('Tested on main: npm test passed, 42 test cases passing');

      // Reload question after first verify
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Another solution',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      const signal2 = verifyAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'verify-session-2',
        evidence: 'Works in all test cases including edge cases',
      });

      expect(signal2.evidence).toBe('Works in all test cases including edge cases');
    });

    it('throws error when evidence is missing', () => {
      expect(() => {
        verifyAnswer(question, {
          evidence: '',
          answerId: answer.id,
          sessionId: 'verify-session-1',
        });
      }).toThrow('Verification evidence is required');
    });

    it('throws error when answer not found', () => {
      expect(() => {
        verifyAnswer(question, {
          evidence: 'Tested and verified',
          answerId: 'nonexistent-id',
          sessionId: 'verify-session-1',
        });
      }).toThrow('Answer nonexistent-id not found');
    });

    it('allows multiple verifications on same answer', () => {
      verifyAnswer(question, {
        evidence: 'Tested and verified',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      // Reload question after first verification
      let currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        answerId: answer.id,
        sessionId: 'verify-session-2',
        evidence: 'Confirmed again',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const savedAnswer = currentQuestion.answers.find((a) => a.id === answer.id)!;
      expect(savedAnswer.signals.length).toBe(2);
      expect(savedAnswer.signals.every((s) => s.type === 'verified')).toBe(true);
    });
  });

  describe('rejectAnswer', () => {
    let question: Question;
    let answer: Answer;

    beforeEach(() => {
      question = postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      answer = postAnswer(
        question,
        {
          text: 'Test solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after answer posted
      question = getQuestion(question.id)!;
    });

    it('adds rejected signal with reason', () => {
      const signal = rejectAnswer(question, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Does not work in edge cases',
      });

      expect(signal).toBeDefined();
      expect(signal.type).toBe('rejected');
      expect(signal.sessionId).toBe('reject-session-1');
      expect((signal as any).reason).toBe('Does not work in edge cases');
      expect(signal.createdAt).toBeGreaterThan(0);

      // Reload to verify changes were saved
      const savedQuestion = getQuestion(question.id)!;
      const savedAnswer = savedQuestion.answers.find((a) => a.id === answer.id)!;
      expect(savedAnswer.signals).toContainEqual(signal);
      expect(savedAnswer.signals.length).toBe(1);
    });

    it('marks question as candidate when answer is rejected', () => {
      rejectAnswer(question, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Not applicable',
      });

      // Reload to verify changes were saved
      const savedQuestion = getQuestion(question.id)!;
      expect(savedQuestion.status).toBe('candidate');
    });

    it('throws error when answer not found', () => {
      expect(() => {
        rejectAnswer(question, {
          answerId: 'nonexistent-id',
          sessionId: 'reject-session-1',
          reason: 'Bad answer',
        });
      }).toThrow('Answer nonexistent-id not found');
    });

    it('allows multiple rejections on same answer', () => {
      rejectAnswer(question, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Reason 1',
      });

      // Reload question after first rejection
      let currentQuestion = getQuestion(question.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer.id,
        sessionId: 'reject-session-2',
        reason: 'Reason 2',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const savedAnswer = currentQuestion.answers.find((a) => a.id === answer.id)!;
      expect(savedAnswer.signals.length).toBe(2);
      expect(savedAnswer.signals.every((s) => s.type === 'rejected')).toBe(true);
    });
  });

  describe('contested status', () => {
    let question: Question;

    beforeEach(() => {
      question = postQuestion(
        {
          title: 'Contested question',
          problem: 'Complex problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );
    });

    it('marks question as contested when both verified and rejected exist', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution A',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution B',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      // Verify first answer
      verifyAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Works',
      });

      // Reload to check status
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      // Reject second answer
      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-1',
        reason: 'Does not work',
      });

      // Reload to check final status
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('contested');
    });

    it('marks question as contested regardless of order', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution A',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution B',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      // Reject first answer
      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-1',
        reason: 'Does not work',
      });

      // Reload to check status
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('candidate');

      // Verify second answer
      verifyAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'verify-session-1',
        evidence: 'Works',
      });

      // Reload to check final status
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('contested');
    });

    it('stays contested with multiple verifications and rejections', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution A',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution B',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload after first verify
      currentQuestion = getQuestion(question.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-1',
        reason: 'Fails',
      });

      // Reload after first reject
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-2',
      });

      // Reload after second verify
      currentQuestion = getQuestion(question.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-2',
        reason: 'Still fails',
      });

      // Reload to verify final status
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('contested');
    });
  });

  describe('getVerifiedAnswer', () => {
    let question: Question;

    beforeEach(() => {
      question = postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );
    });

    it('returns first verified answer', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const verified = getVerifiedAnswer(currentQuestion);
      expect(verified?.id).toBe(answer1.id);
    });

    it('returns null when no verified answers', () => {
      postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      const verified = getVerifiedAnswer(question);
      expect(verified).toBeNull();
    });

    it('returns null when question has no answers', () => {
      const verified = getVerifiedAnswer(question);
      expect(verified).toBeNull();
    });

    it('returns first verified even when multiple verified', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload after first verify
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer2.id,
        sessionId: 'verify-session-2',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const verified = getVerifiedAnswer(currentQuestion);
      expect(verified?.id).toBe(answer1.id);
    });

    it('returns verified answer even with rejected ones present', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-1',
        reason: 'Bad',
      });

      // Reload after reject
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer2.id,
        sessionId: 'verify-session-1',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const verified = getVerifiedAnswer(currentQuestion);
      expect(verified?.id).toBe(answer2.id);
    });

    it('ranks answer with 2 verifications higher than answer with 1 verification', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      // Answer 1: 1 verification
      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload after first verify
      currentQuestion = getQuestion(question.id)!;

      // Answer 2: 2 verifications
      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer2.id,
        sessionId: 'verify-session-2',
      });

      // Reload after second verify
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Confirmed again',
        answerId: answer2.id,
        sessionId: 'verify-session-3',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const verified = getVerifiedAnswer(currentQuestion);
      expect(verified?.id).toBe(answer2.id);
    });

    it('ranks answer with 2 verifications + 1 rejection higher than answer with 1 verification', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      // Answer 1: 1 verification
      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload after first verify
      currentQuestion = getQuestion(question.id)!;

      // Answer 2: 2 verifications + 1 rejection
      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer2.id,
        sessionId: 'verify-session-2',
      });

      // Reload after second verify
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Confirmed again',
        answerId: answer2.id,
        sessionId: 'verify-session-3',
      });

      // Reload after third verify
      currentQuestion = getQuestion(question.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-1',
        reason: 'Does not work in some cases',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const verified = getVerifiedAnswer(currentQuestion);
      expect(verified?.id).toBe(answer2.id);
    });

    it('ranks old answer with 2 verifications higher than brand new answer with 0 verifications', () => {
      // Create first answer and verify it twice (old answer)
      const oldAnswer = postAnswer(
        question,
        {
          text: 'Proven solution from long ago',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: oldAnswer.id,
        sessionId: 'verify-session-1',
      });

      // Reload after first verify
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Confirmed again',
        answerId: oldAnswer.id,
        sessionId: 'verify-session-2',
      });

      // Reload after second verify
      currentQuestion = getQuestion(question.id)!;

      // Immediately create a new answer (very recent, no verifications)
      const newAnswer = postAnswer(
        currentQuestion,
        {
          text: 'Brand new unverified solution',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;

      // The old answer should be selected because verification count dominates over recency
      const verified = getVerifiedAnswer(currentQuestion);
      expect(verified?.id).toBe(oldAnswer.id);
      expect(verified?.id).not.toBe(newAnswer.id);
    });
  });

  describe('postComment', () => {
    let question: Question;

    beforeEach(() => {
      question = postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );
    });

    it('adds comment separate from answers', () => {
      const comment = postComment(
        question,
        'This is a helpful comment',
        'bob',
        'session-2',
        agentMetadata
      );

      expect(comment).toBeDefined();
      expect(comment.id).toMatch(/^cmt_/);
      expect(comment.text).toBe('This is a helpful comment');
      expect(comment.author).toBe('bob');
      expect(comment.authorSessionName).toBe('session-2');
      expect(comment.createdAt).toBeGreaterThan(0);
      expect(comment.agentMetadata).toEqual(agentMetadata);

      // Reload to verify changes were saved
      const savedQuestion = getQuestion(question.id)!;
      expect(savedQuestion.comments).toContainEqual(comment);
      expect(savedQuestion.answers.length).toBe(0);
      expect(savedQuestion.comments.length).toBe(1);
    });

    it('adds multiple comments', () => {
      const comment1 = postComment(
        question,
        'First comment',
        'bob',
        'session-2',
        agentMetadata
      );

      // Reload question after first comment
      let currentQuestion = getQuestion(question.id)!;

      const comment2 = postComment(
        currentQuestion,
        'Second comment',
        'charlie',
        'session-3',
        agentMetadata
      );

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.comments.length).toBe(2);
      expect(currentQuestion.comments).toContainEqual(comment1);
      expect(currentQuestion.comments).toContainEqual(comment2);
    });

    it('keeps comments separate from answers', () => {
      const answer = postAnswer(
        question,
        {
          text: 'Test solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after answer
      let currentQuestion = getQuestion(question.id)!;

      const comment = postComment(
        currentQuestion,
        'Additional context',
        'charlie',
        'session-3',
        agentMetadata
      );

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.answers.length).toBe(1);
      expect(currentQuestion.comments.length).toBe(1);
      expect(currentQuestion.answers).toContainEqual(answer);
      expect(currentQuestion.comments).toContainEqual(comment);
      expect(currentQuestion.answers).not.toContainEqual(comment);
      expect(currentQuestion.comments).not.toContainEqual(answer);
    });

    it('generates unique comment IDs', () => {
      const comment1 = postComment(
        question,
        'Comment 1',
        'bob',
        'session-2',
        agentMetadata
      );

      // Reload question after first comment
      let currentQuestion = getQuestion(question.id)!;

      const comment2 = postComment(
        currentQuestion,
        'Comment 2',
        'bob',
        'session-2',
        agentMetadata
      );

      expect(comment1.id).not.toBe(comment2.id);
    });
  });

  describe('computeQuestionStatus', () => {
    let question: Question;

    beforeEach(() => {
      question = postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );
    });

    it('returns open when no answers', () => {
      expect(computeQuestionStatus(question)).toBe('open');
    });

    it('returns candidate when has answers but none verified or rejected', () => {
      postAnswer(
        question,
        {
          text: 'Solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload to verify changes were saved
      const savedQuestion = getQuestion(question.id)!;
      expect(computeQuestionStatus(savedQuestion)).toBe('candidate');
    });

    it('returns verified when has verified answer', () => {
      const answer = postAnswer(
        question,
        {
          text: 'Solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after answer
      let currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      expect(computeQuestionStatus(currentQuestion)).toBe('verified');
    });

    it('returns candidate when has only rejected answers', () => {
      const answer = postAnswer(
        question,
        {
          text: 'Solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after answer
      let currentQuestion = getQuestion(question.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Bad',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      expect(computeQuestionStatus(currentQuestion)).toBe('candidate');
    });

    it('returns contested when has both verified and rejected', () => {
      const answer1 = postAnswer(
        question,
        {
          text: 'Solution 1',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Solution 2',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload after verify
      currentQuestion = getQuestion(question.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-1',
        reason: 'Bad',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      expect(computeQuestionStatus(currentQuestion)).toBe('contested');
    });
  });

  describe('captureAgentMetadata', () => {
    it('captures metadata from environment variables', () => {
      process.env.CLAUDE_MODEL = 'claude-3-5-sonnet';
      process.env.CLAUDE_PROVIDER = 'anthropic';
      process.env.CLAUDE_SYSTEM_VERSION = '2024-06';
      process.env.GIT_COMMIT_SHA = 'abc123';
      process.env.GIT_BRANCH = 'main';
      process.env.DEPENDENCY_VERSIONS = JSON.stringify({
        'typescript': '5.0.0',
      });

      const metadata = captureAgentMetadata();

      expect(metadata.model).toBe('claude-3-5-sonnet');
      expect(metadata.provider).toBe('anthropic');
      expect(metadata.systemVersion).toBe('2024-06');
      expect(metadata.commitSha).toBe('abc123');
      expect(metadata.branch).toBe('main');
      expect(metadata.dependencyVersions).toEqual({
        'typescript': '5.0.0',
      });
    });

    it('uses defaults when environment variables not set', () => {
      delete process.env.CLAUDE_MODEL;
      delete process.env.CLAUDE_PROVIDER;
      delete process.env.CLAUDE_SYSTEM_VERSION;
      delete process.env.GIT_COMMIT_SHA;
      delete process.env.GIT_BRANCH;
      delete process.env.BRANCH;
      delete process.env.DEPENDENCY_VERSIONS;

      const metadata = captureAgentMetadata();

      expect(metadata.model).toBe('unknown');
      expect(metadata.provider).toBe('unknown');
      expect(metadata.systemVersion).toBeUndefined();
      expect(metadata.commitSha).toBeUndefined();
      expect(metadata.branch).toBeUndefined();
      expect(metadata.dependencyVersions).toBeUndefined();
    });

    it('handles malformed DEPENDENCY_VERSIONS gracefully', () => {
      process.env.CLAUDE_MODEL = 'claude-3-5-sonnet';
      process.env.CLAUDE_PROVIDER = 'anthropic';
      process.env.DEPENDENCY_VERSIONS = 'not valid json {]';

      const metadata = captureAgentMetadata();

      expect(metadata.model).toBe('claude-3-5-sonnet');
      expect(metadata.provider).toBe('anthropic');
      expect(metadata.dependencyVersions).toBeUndefined();
    });
  });

  describe('Integration scenarios', () => {
    it('handles complete workflow: ask -> answer -> verify -> retrieve', () => {
      // Create question
      const question = postQuestion(
        {
          title: 'How to optimize React components?',
          problem: 'My component re-renders too often',
          repository: 'my-app',
          branch: 'main',
          keywords: ['react', 'performance'],
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      expect(question.status).toBe('open');

      // Add answer
      const answer = postAnswer(
        question,
        {
          text: 'Use React.memo() to prevent unnecessary re-renders',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after answer
      let currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('candidate');

      // Add comment
      const comment = postComment(
        currentQuestion,
        'This is a common performance issue in React',
        'charlie',
        'session-3',
        agentMetadata
      );

      // Reload question after comment
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.comments.length).toBe(1);

      // Verify answer
      verifyAnswer(currentQuestion, {
        answerId: answer.id,
        sessionId: 'verify-session-1',
        evidence: 'Applied the fix and saw 50% reduction in re-renders',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      // Retrieve verified answer
      const verified = getVerifiedAnswer(currentQuestion);
      expect(verified?.id).toBe(answer.id);
      expect(verified?.text).toContain('React.memo()');
    });

    it('handles multi-answer scenario with conflicts', () => {
      const question = postQuestion(
        {
          title: 'Best way to handle state?',
          problem: 'Confused about state management',
          repository: 'my-app',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const answer1 = postAnswer(
        question,
        {
          text: 'Use Redux for all state',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after first answer
      let currentQuestion = getQuestion(question.id)!;

      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Use React Context API',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload question after second answer
      currentQuestion = getQuestion(question.id)!;

      // Both get verified by different people
      verifyAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Works well for large apps',
      });

      // Reload after first verify
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      verifyAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'verify-session-2',
        evidence: 'Works well for small to medium apps',
      });

      // Reload after second verify
      currentQuestion = getQuestion(question.id)!;
      // Still verified (multiple verified answers)
      expect(currentQuestion.status).toBe('verified');

      // But then one gets rejected
      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-1',
        reason: 'Overkill for this project',
      });

      // Reload to check final status
      currentQuestion = getQuestion(question.id)!;
      // Now contested
      expect(currentQuestion.status).toBe('contested');
    });

    it('handles status transitions correctly', () => {
      const question = postQuestion(
        {
          title: 'Test transitions',
          problem: 'Test',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      expect(question.status).toBe('open');

      const answer = postAnswer(
        question,
        {
          text: 'Test answer',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Reload question after answer
      let currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('candidate');

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      // Reload after verify
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      // Add another answer and reject it
      const answer2 = postAnswer(
        currentQuestion,
        {
          text: 'Alternative answer',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Reload after second answer
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-1',
        reason: 'Not applicable',
      });

      // Reload to check final status
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('contested');
    });
  });

  describe('searchQuestionsInProject', () => {
    let agentMetadata: AgentMetadata;

    beforeEach(() => {
      agentMetadata = {
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        systemVersion: '2024-06',
        commitSha: 'abc123def456',
        branch: 'main',
      };
    });

    it('finds questions with single-term search', () => {
      const q1 = postQuestion(
        {
          title: 'React performance optimization',
          problem: 'Component renders too many times',
          repository: 'myapp',
          branch: 'main',
          keywords: ['react', 'performance'],
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const q2 = postQuestion(
        {
          title: 'How to debug TypeScript?',
          problem: 'Getting type errors',
          repository: 'myapp',
          branch: 'main',
          keywords: ['typescript'],
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('react');
      expect(results.length).toBe(1);
      expect(results[0].question.id).toBe(q1.id);
      expect(results[0].relevance).toBeGreaterThan(0);
    });

    it('finds questions with multi-term queries using per-term fallback', () => {
      const q1 = postQuestion(
        {
          title: 'React Router white label implementation',
          problem: 'Need to customize React Router for multiple brands',
          repository: 'myapp',
          branch: 'main',
          keywords: ['react', 'router', 'branding'],
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const q2 = postQuestion(
        {
          title: 'How to use React components?',
          problem: 'Learning React basics',
          repository: 'myapp',
          branch: 'main',
          keywords: ['react'],
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Search for "react router white" - should find both (per-term fallback)
      // q1 has all 3 terms in title, q2 has "react"
      const results = searchQuestionsInProject('react router white');
      expect(results.length).toBe(2);
      // q1 should rank higher (has all 3 terms + phrase bonus)
      expect(results[0].question.id).toBe(q1.id);
      expect(results[1].question.id).toBe(q2.id);
      // q1: title matches all 3 terms (+9) + phrase bonus (+7) = 16
      expect(results[0].relevance).toBeGreaterThanOrEqual(9);
      // q2: title matches "react" (+3)
      expect(results[1].relevance).toBeGreaterThanOrEqual(3);
      expect(results[0].relevance).toBeGreaterThan(results[1].relevance);
    });

    it('ranks full phrase matches higher than per-term matches', () => {
      const q1 = postQuestion(
        {
          title: 'React performance tips',
          problem: 'How to optimize React component performance',
          repository: 'myapp',
          branch: 'main',
          keywords: [],
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const q2 = postQuestion(
        {
          title: 'Performance in React applications',
          problem: 'React is slow in my app',
          repository: 'myapp',
          branch: 'main',
          keywords: [],
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Search for "React performance"
      const results = searchQuestionsInProject('React performance');
      expect(results.length).toBe(2);

      // q1 should rank higher because title matches both terms + phrase bonus
      const q1Result = results.find(r => r.question.id === q1.id);
      const q2Result = results.find(r => r.question.id === q2.id);

      expect(q1Result).toBeDefined();
      expect(q2Result).toBeDefined();
      expect(q1Result!.relevance).toBeGreaterThan(q2Result!.relevance);
    });

    it('matches terms in keywords', () => {
      const q1 = postQuestion(
        {
          title: 'State management solutions',
          problem: 'Need help with state management',
          repository: 'myapp',
          branch: 'main',
          keywords: ['redux', 'state', 'management'],
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('redux');
      expect(results.length).toBe(1);
      expect(results[0].question.id).toBe(q1.id);
      expect(results[0].matchedKeywords).toContain('redux');
    });

    it('matches terms in answer text', () => {
      const question = postQuestion(
        {
          title: 'Debugging issues',
          problem: 'General debugging help',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      postAnswer(
        question,
        {
          text: 'Use console.log to debug your code effectively',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('console');
      expect(results.length).toBe(1);
      expect(results[0].question.id).toBe(question.id);
    });

    it('returns empty array when no matches', () => {
      postQuestion(
        {
          title: 'React performance',
          problem: 'Slow renders',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('django');
      expect(results.length).toBe(0);
    });

    it('is case-insensitive', () => {
      const q1 = postQuestion(
        {
          title: 'React Router setup',
          problem: 'Setting up React Router',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const resultsLower = searchQuestionsInProject('react router');
      const resultsUpper = searchQuestionsInProject('REACT ROUTER');
      const resultsMixed = searchQuestionsInProject('ReAcT rOuTeR');

      expect(resultsLower.length).toBe(1);
      expect(resultsUpper.length).toBe(1);
      expect(resultsMixed.length).toBe(1);
      expect(resultsLower[0].question.id).toBe(q1.id);
      expect(resultsUpper[0].question.id).toBe(q1.id);
      expect(resultsMixed[0].question.id).toBe(q1.id);
    });

    it('tracks search_performed events with correct data', () => {
      const q1 = postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      // Clear events before search
      const eventsBefore = getAnalyticsEvents('search_performed');
      const initialCount = eventsBefore.length;

      // Perform search
      const results = searchQuestionsInProject('test');

      // Check that search_performed event was tracked
      const eventsAfter = getAnalyticsEvents('search_performed');
      expect(eventsAfter.length).toBe(initialCount + 1);

      const searchEvent = eventsAfter[eventsAfter.length - 1];
      expect(searchEvent.eventType).toBe('search_performed');
      expect(searchEvent.data.query).toBe('test');
      expect(searchEvent.data.resultCount).toBe(results.length);
      expect(searchEvent.data.topRelevance).toBeDefined();
    });

    it('correctly computes relevance scores for multi-field matches', () => {
      const q1 = postQuestion(
        {
          title: 'React optimization',
          problem: 'React is slow',
          repository: 'myapp',
          branch: 'main',
          keywords: ['react', 'performance'],
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('react');
      expect(results.length).toBe(1);

      // Title match: +3 per term
      // Problem match: +2 per term
      // Keyword match: +0.5 per term
      // Expected: 3 (title) + 2 (problem) + 0.5 (keyword react) + 0.5 (keyword performance doesn't match) = 5.5
      const expectedMinRelevance = 5.5;
      expect(results[0].relevance).toBeGreaterThanOrEqual(expectedMinRelevance);
    });

    it('handles empty queries gracefully', () => {
      postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('');
      expect(results.length).toBe(0);
    });

    it('handles whitespace-only queries gracefully', () => {
      postQuestion(
        {
          title: 'Test question',
          problem: 'Test problem',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('   ');
      expect(results.length).toBe(0);
    });

    it('sorts results by relevance descending', () => {
      const q1 = postQuestion(
        {
          title: 'React React React',
          problem: 'About React',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const q2 = postQuestion(
        {
          title: 'React in frontend',
          problem: 'General question',
          repository: 'myapp',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('react');
      expect(results.length).toBe(2);
      // q1 should come first (higher relevance due to multiple mentions)
      expect(results[0].question.id).toBe(q1.id);
      expect(results[1].question.id).toBe(q2.id);
      expect(results[0].relevance).toBeGreaterThan(results[1].relevance);
    });
  });
});
