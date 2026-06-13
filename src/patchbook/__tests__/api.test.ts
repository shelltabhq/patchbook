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
      const { answer, updatedQuestion } = postAnswer(
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
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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

      const { answer: ans } = postAnswer(
        question,
        {
          text: 'Test solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );
      answer = ans;

      // Reload question after answer posted
      question = getQuestion(question.id)!;
    });

    it('adds verified signal to answer', () => {
      const { signal } = verifyAnswer(question, {
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
      const { signal: signal1 } = verifyAnswer(question, {
        evidence: 'Tested on main: npm test passed, 42 test cases passing',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      expect(signal1.evidence).toBe('Tested on main: npm test passed, 42 test cases passing');

      // Reload question after first verify
      let currentQuestion = getQuestion(question.id)!;

      const { answer: answer2 } = postAnswer(
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

      const { signal: signal2 } = verifyAnswer(currentQuestion, {
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

    it('throws error when same session verifies same answer twice', () => {
      verifyAnswer(question, {
        evidence: 'Tested and verified',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      // Reload question after first verification
      let currentQuestion = getQuestion(question.id)!;

      // Same sessionId should now throw an error
      expect(() => {
        verifyAnswer(currentQuestion, {
          answerId: answer.id,
          sessionId: 'verify-session-1',
          evidence: 'Trying to verify again',
        });
      }).toThrow(
        'Session verify-session-1 has already verified answer'
      );
    });

    it('allows different sessions to verify same answer', () => {
      verifyAnswer(question, {
        evidence: 'Tested and verified',
        answerId: answer.id,
        sessionId: 'verify-session-1',
      });

      // Reload question after first verification
      let currentQuestion = getQuestion(question.id)!;

      // Different sessionId should succeed
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

      const { answer: ans } = postAnswer(
        question,
        {
          text: 'Test solution',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );
      answer = ans;

      // Reload question after answer posted
      question = getQuestion(question.id)!;
    });

    it('adds rejected signal with reason', () => {
      const { signal } = rejectAnswer(question, {
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

    it('throws error when same session rejects same answer twice', () => {
      rejectAnswer(question, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Reason 1',
      });

      // Reload question after first rejection
      let currentQuestion = getQuestion(question.id)!;

      // Same sessionId should now throw an error
      expect(() => {
        rejectAnswer(currentQuestion, {
          answerId: answer.id,
          sessionId: 'reject-session-1',
          reason: 'Trying to reject again',
        });
      }).toThrow(
        'Session reject-session-1 has already rejected answer'
      );
    });

    it('allows different sessions to reject same answer', () => {
      rejectAnswer(question, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Reason 1',
      });

      // Reload question after first rejection
      let currentQuestion = getQuestion(question.id)!;

      // Different sessionId should succeed
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

    it('marks question as contested when same answer has both verified and rejected signals', () => {
      const { answer: answer1 } = postAnswer(
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

      // Verify the answer
      verifyAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Works',
      });

      // Reload to check status (should be verified)
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      // Reject the SAME answer by a different session
      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-1',
        reason: 'Does not work',
      });

      // Reload to check final status (now contested since same answer has both signals)
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('contested');
    });

    it('returns verified when different answers have verified vs rejected signals', () => {
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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

      // Verify answer1
      verifyAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Works great',
      });

      // Reload to check status
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      // Reject answer2 (DIFFERENT answer)
      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-1',
        reason: 'Does not work',
      });

      // Reload to check final status - should remain verified
      // (not contested, because different answers have the signals)
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');
    });

    it('remains verified when different answers have verified vs rejected signals', () => {
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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

      // Verify second answer (different answer)
      verifyAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'verify-session-1',
        evidence: 'Works',
      });

      // Reload to check final status - should be verified, not contested
      // (different answers have conflicting signals, not same answer)
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');
    });

    it('stays contested with multiple signals on same answer', () => {
      const { answer: answer1 } = postAnswer(
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

      // Verify answer1
      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload after first verify
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('verified');

      // Reject the same answer by a different session
      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-1',
        reason: 'Fails in some cases',
      });

      // Reload - should now be contested (same answer has both)
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('contested');

      // Add another verification to the same answer
      verifyAnswer(currentQuestion, {
        evidence: 'Works in other cases',
        answerId: answer1.id,
        sessionId: 'verify-session-2',
      });

      // Reload to verify - should still be contested
      currentQuestion = getQuestion(question.id)!;
      expect(currentQuestion.status).toBe('contested');

      // Add another rejection to the same answer
      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-2',
        reason: 'Still problematic',
      });

      // Reload to verify final status - still contested
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
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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

      // Give answer1 an extra verification so it clearly wins the ranking
      verifyAnswer(currentQuestion, {
        evidence: 'Verified again',
        answerId: answer1.id,
        sessionId: 'verify-session-1b',
      });

      // Reload after second verify on answer1
      currentQuestion = getQuestion(question.id)!;

      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer2.id,
        sessionId: 'verify-session-2',
      });

      // Reload to verify changes were saved
      currentQuestion = getQuestion(question.id)!;
      const verified = getVerifiedAnswer(currentQuestion);
      // answer1 has 2 verifications (score 20), answer2 has 1 (score 10)
      expect(verified?.id).toBe(answer1.id);
    });

    it('returns verified answer even with rejected ones present', () => {
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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
      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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
      const { answer: oldAnswer } = postAnswer(
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
      const { answer: newAnswer } = postAnswer(
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
      const { comment } = postComment(
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
      const { comment: comment1 } = postComment(
        question,
        'First comment',
        'bob',
        'session-2',
        agentMetadata
      );

      // Reload question after first comment
      let currentQuestion = getQuestion(question.id)!;

      const { comment: comment2 } = postComment(
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
      const { answer } = postAnswer(
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

      const { comment } = postComment(
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
      const { comment: comment1 } = postComment(
        question,
        'Comment 1',
        'bob',
        'session-2',
        agentMetadata
      );

      // Reload question after first comment
      let currentQuestion = getQuestion(question.id)!;

      const { comment: comment2 } = postComment(
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
      const { answer } = postAnswer(
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
      const { answer } = postAnswer(
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

    it('returns contested when same answer has both verified and rejected signals', () => {
      const { answer: answer1 } = postAnswer(
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

      // Verify the answer
      verifyAnswer(currentQuestion, {
        evidence: 'Tested and verified',
        answerId: answer1.id,
        sessionId: 'verify-session-1',
      });

      // Reload after verify
      currentQuestion = getQuestion(question.id)!;
      expect(computeQuestionStatus(currentQuestion)).toBe('verified');

      // Reject the same answer by a different session
      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-1',
        reason: 'Fails in some cases',
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
      const { answer } = postAnswer(
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
      const { comment } = postComment(
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

    it('handles multi-answer scenario with conflicts on same answer', () => {
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

      const { answer: answer1 } = postAnswer(
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

      const { answer: answer2 } = postAnswer(
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

      // Then reject answer1 (same answer that was verified)
      rejectAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'reject-session-1',
        reason: 'Overkill for this project',
      });

      // Reload to check final status
      currentQuestion = getQuestion(question.id)!;
      // Now contested (answer1 has both verified and rejected signals)
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

      const { answer } = postAnswer(
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

      // Add another answer and reject the FIRST answer (already verified)
      const { answer: answer2 } = postAnswer(
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

      // Reject the first answer (which was already verified) - makes it contested
      rejectAnswer(currentQuestion, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Not applicable in some contexts',
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

    it('ranks verified status questions higher than open status questions', () => {
      const openQuestion = postQuestion(
        {
          title: 'How to debug React',
          problem: 'Debugging help',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const verifiedQuestion = postQuestion(
        {
          title: 'Debugging techniques',
          problem: 'Different debugging approach',
          repository: 'myapp',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Add and verify an answer to the second question
      const { answer } = postAnswer(
        verifiedQuestion,
        {
          text: 'Use browser DevTools for debugging',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      let currentQuestion = getQuestion(verifiedQuestion.id)!;
      verifyAnswer(currentQuestion, {
        answerId: answer.id,
        sessionId: 'verify-session-1',
        evidence: 'Works perfectly',
      });

      // Search for "debug" - should rank verified question higher despite text similarity
      const results = searchQuestionsInProject('debug');
      expect(results.length).toBe(2);

      const verifiedResult = results.find(r => r.question.id === verifiedQuestion.id);
      const openResult = results.find(r => r.question.id === openQuestion.id);

      expect(verifiedResult).toBeDefined();
      expect(openResult).toBeDefined();
      // Verified question should rank higher due to +20 status bonus
      expect(verifiedResult!.relevance).toBeGreaterThan(openResult!.relevance);
    });

    it('ranks candidate status questions higher than open status', () => {
      const openQuestion = postQuestion(
        {
          title: 'React state management',
          problem: 'State management problem',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const candidateQuestion = postQuestion(
        {
          title: 'Managing React state',
          problem: 'Different state issue',
          repository: 'myapp',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Add an answer to move it to candidate status (no verification needed)
      postAnswer(
        candidateQuestion,
        {
          text: 'Use useState hook',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      const results = searchQuestionsInProject('state');
      expect(results.length).toBe(2);

      const candidateResult = results.find(r => r.question.id === candidateQuestion.id);
      const openResult = results.find(r => r.question.id === openQuestion.id);

      expect(candidateResult).toBeDefined();
      expect(openResult).toBeDefined();
      // Candidate should rank higher due to +10 status bonus
      expect(candidateResult!.relevance).toBeGreaterThan(openResult!.relevance);
    });

    it('ranks contested status questions higher than candidate status', () => {
      const candidateQuestion = postQuestion(
        {
          title: 'How to optimize performance',
          problem: 'Optimization help needed',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const contestedQuestion = postQuestion(
        {
          title: 'Performance tuning tips',
          problem: 'Different performance issue',
          repository: 'myapp',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Candidate: just an answer
      postAnswer(
        candidateQuestion,
        {
          text: 'Optimize bundle size',
          author: 'dave',
          authorSessionName: 'session-4',
        },
        agentMetadata
      );

      // Contested: verified + rejected answers
      const { answer: answer1 } = postAnswer(
        contestedQuestion,
        {
          text: 'Use code splitting',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      let currentQuestion = getQuestion(contestedQuestion.id)!;

      const { answer: answer2 } = postAnswer(
        currentQuestion,
        {
          text: 'Minimize CSS',
          author: 'eve',
          authorSessionName: 'session-5',
        },
        agentMetadata
      );

      currentQuestion = getQuestion(contestedQuestion.id)!;

      verifyAnswer(currentQuestion, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Works in our app',
      });

      currentQuestion = getQuestion(contestedQuestion.id)!;

      rejectAnswer(currentQuestion, {
        answerId: answer2.id,
        sessionId: 'reject-session-1',
        reason: 'Not applicable here',
      });

      const results = searchQuestionsInProject('performance');
      expect(results.length).toBe(2);

      const contestedResult = results.find(r => r.question.id === contestedQuestion.id);
      const candidateResult = results.find(r => r.question.id === candidateQuestion.id);

      expect(contestedResult).toBeDefined();
      expect(candidateResult).toBeDefined();
      // Contested (+15) should rank higher than candidate (+10)
      expect(contestedResult!.relevance).toBeGreaterThan(candidateResult!.relevance);
    });

    it('adds +5 bonus per verified signal across answers', () => {
      const singleVerifyQuestion = postQuestion(
        {
          title: 'Testing best practices',
          problem: 'Testing problem',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const multiVerifyQuestion = postQuestion(
        {
          title: 'Best testing practices',
          problem: 'Different testing issue',
          repository: 'myapp',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Single verify: one verified signal
      const { answer: answer1 } = postAnswer(
        singleVerifyQuestion,
        {
          text: 'Use vitest',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      let q1 = getQuestion(singleVerifyQuestion.id)!;
      verifyAnswer(q1, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Works great',
      });

      // Multi verify: three verified signals total
      const { answer: answer2 } = postAnswer(
        multiVerifyQuestion,
        {
          text: 'Use jest',
          author: 'dave',
          authorSessionName: 'session-4',
        },
        agentMetadata
      );

      let q2 = getQuestion(multiVerifyQuestion.id)!;

      const { answer: answer3 } = postAnswer(
        q2,
        {
          text: 'Use mocha',
          author: 'eve',
          authorSessionName: 'session-5',
        },
        agentMetadata
      );

      q2 = getQuestion(multiVerifyQuestion.id)!;

      verifyAnswer(q2, {
        answerId: answer2.id,
        sessionId: 'verify-session-2',
        evidence: 'Good choice',
      });

      q2 = getQuestion(multiVerifyQuestion.id)!;

      verifyAnswer(q2, {
        answerId: answer3.id,
        sessionId: 'verify-session-3',
        evidence: 'Also works',
      });

      q2 = getQuestion(multiVerifyQuestion.id)!;

      verifyAnswer(q2, {
        answerId: answer3.id,
        sessionId: 'verify-session-4',
        evidence: 'Double verified',
      });

      const results = searchQuestionsInProject('testing');
      expect(results.length).toBe(2);

      const singleResult = results.find(r => r.question.id === singleVerifyQuestion.id);
      const multiResult = results.find(r => r.question.id === multiVerifyQuestion.id);

      expect(singleResult).toBeDefined();
      expect(multiResult).toBeDefined();
      // Multi should rank higher: both are verified status (+20), but multi has 3 verified signals (+15) vs single's 1 (+5)
      expect(multiResult!.relevance).toBeGreaterThan(singleResult!.relevance);
    });

    it('subtracts -2 penalty per rejected signal', () => {
      const noRejectQuestion = postQuestion(
        {
          title: 'Array methods in JavaScript',
          problem: 'Need array help',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const rejectedQuestion = postQuestion(
        {
          title: 'JavaScript array techniques',
          problem: 'Different array issue',
          repository: 'myapp',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // No reject: one verified, no rejections
      const { answer: answer1 } = postAnswer(
        noRejectQuestion,
        {
          text: 'Use map()',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      let q1 = getQuestion(noRejectQuestion.id)!;
      verifyAnswer(q1, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Perfect',
      });

      // Contested: one verified + 2 rejections
      const { answer: answer2 } = postAnswer(
        rejectedQuestion,
        {
          text: 'Use filter()',
          author: 'dave',
          authorSessionName: 'session-4',
        },
        agentMetadata
      );

      let q2 = getQuestion(rejectedQuestion.id)!;

      const { answer: answer3 } = postAnswer(
        q2,
        {
          text: 'Use reduce()',
          author: 'eve',
          authorSessionName: 'session-5',
        },
        agentMetadata
      );

      q2 = getQuestion(rejectedQuestion.id)!;

      verifyAnswer(q2, {
        answerId: answer2.id,
        sessionId: 'verify-session-2',
        evidence: 'Works',
      });

      q2 = getQuestion(rejectedQuestion.id)!;

      rejectAnswer(q2, {
        answerId: answer3.id,
        sessionId: 'reject-session-1',
        reason: 'Too complex',
      });

      q2 = getQuestion(rejectedQuestion.id)!;

      rejectAnswer(q2, {
        answerId: answer3.id,
        sessionId: 'reject-session-2',
        reason: 'Not efficient',
      });

      const results = searchQuestionsInProject('array');
      expect(results.length).toBe(2);

      const noRejectResult = results.find(r => r.question.id === noRejectQuestion.id);
      const rejectedResult = results.find(r => r.question.id === rejectedQuestion.id);

      expect(noRejectResult).toBeDefined();
      expect(rejectedResult).toBeDefined();
      // Both are contested (+15), but noReject has 1 verified (+5) vs rejected's 1 verified (+5) - 2 rejected (-4) = +1
      // So noReject should be higher
      expect(noRejectResult!.relevance).toBeGreaterThan(rejectedResult!.relevance);
    });

    it('combines status bonus with verified/rejected signal bonuses', () => {
      const unverifiedQuestion = postQuestion(
        {
          title: 'How to implement caching',
          problem: 'Caching implementation',
          repository: 'myapp',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      const highlyVerifiedQuestion = postQuestion(
        {
          title: 'Caching strategies explained',
          problem: 'Understanding different caching approaches',
          repository: 'myapp',
          branch: 'main',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Unverified: candidate status (+10), no verified signals
      const { answer: unverAnswer } = postAnswer(
        unverifiedQuestion,
        {
          text: 'Use redis',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      // Highly verified: verified status (+20), multiple verified signals (+5 each = 10 total for 2)
      const { answer: answer1 } = postAnswer(
        highlyVerifiedQuestion,
        {
          text: 'Use memcached',
          author: 'dave',
          authorSessionName: 'session-4',
        },
        agentMetadata
      );

      let q2 = getQuestion(highlyVerifiedQuestion.id)!;

      verifyAnswer(q2, {
        answerId: answer1.id,
        sessionId: 'verify-session-1',
        evidence: 'Tested in prod',
      });

      q2 = getQuestion(highlyVerifiedQuestion.id)!;

      verifyAnswer(q2, {
        answerId: answer1.id,
        sessionId: 'verify-session-2',
        evidence: 'Confirmed by team',
      });

      const results = searchQuestionsInProject('caching');
      expect(results.length).toBe(2);

      const unverifiedResult = results.find(r => r.question.id === unverifiedQuestion.id);
      const highlyVerifiedResult = results.find(r => r.question.id === highlyVerifiedQuestion.id);

      expect(unverifiedResult).toBeDefined();
      expect(highlyVerifiedResult).toBeDefined();
      // Highly verified: +20 (status) + 10 (2 verified signals) = 30 bonus
      // Unverified: +10 (status) + 0 (no verified) = 10 bonus
      // So highly verified should rank significantly higher
      expect(highlyVerifiedResult!.relevance).toBeGreaterThan(unverifiedResult!.relevance);
    });
  });

  describe('Full Workflow E2E Tests', () => {
    it('Test 1: Complete workflow chain - postQuestion, postAnswer, verifyAnswer with different sessionIds', () => {
      // Post question with all required fields
      const question = postQuestion(
        {
          title: 'How to optimize React rendering?',
          problem: 'Component re-renders excessively',
          repository: 'react-app',
          branch: 'main',
          keywords: ['react', 'performance', 'rendering'],
          author: 'alice',
          authorSessionName: 'debug-session-1',
        },
        agentMetadata
      );

      expect(question.id).toMatch(/^q_/);
      expect(question.status).toBe('open');
      expect(question.answers).toEqual([]);

      // Post answer and destructure {answer, updatedQuestion}
      const { answer, updatedQuestion: q1 } = postAnswer(
        question,
        {
          text: 'Use React.memo() to prevent re-renders of child components',
          author: 'bob',
          authorSessionName: 'solution-session-1',
        },
        agentMetadata
      );

      expect(answer.id).toMatch(/^a_/);
      expect(answer.text).toContain('React.memo');
      expect(q1.status).toBe('candidate');
      expect(q1.answers.length).toBe(1);

      // Verify answer with sessionId 1 (should work)
      const { signal: signal1, updatedQuestion: q2 } = verifyAnswer(q1, {
        answerId: answer.id,
        sessionId: 'verify-session-1',
        evidence: 'Tested in production: reduced re-renders from 50 to 5 per interaction',
      });

      expect(signal1.type).toBe('verified');
      expect(signal1.sessionId).toBe('verify-session-1');
      expect(q2.status).toBe('verified');

      // Try to verify again with same sessionId (should fail with "already verified")
      expect(() => {
        verifyAnswer(q2, {
          answerId: answer.id,
          sessionId: 'verify-session-1',
          evidence: 'Trying again',
        });
      }).toThrow('already verified answer');

      // Verify with different sessionId 2 (should work)
      const q2Fresh = getQuestion(question.id)!;
      const { signal: signal2, updatedQuestion: q3 } = verifyAnswer(q2Fresh, {
        answerId: answer.id,
        sessionId: 'verify-session-2',
        evidence: 'Also confirmed on staging environment',
      });

      expect(signal2.type).toBe('verified');
      expect(signal2.sessionId).toBe('verify-session-2');
      expect(q3.answers[0].signals.length).toBe(2);

      // Check question.status remains verified (not contested, same answer with multiple verified signals)
      expect(q3.status).toBe('verified');
    });

    it('Test 2: Validation - missing required fields should fail', () => {
      // postQuestion with missing repository (should fail)
      expect(() => {
        postQuestion(
          {
            title: 'Test title',
            problem: 'Test problem',
            repository: '',
            branch: 'main',
            author: 'alice',
            authorSessionName: 'session-1',
          },
          agentMetadata
        );
      }).toThrow('repository is required');

      // postQuestion with missing author (should fail)
      expect(() => {
        postQuestion(
          {
            title: 'Test title',
            problem: 'Test problem',
            repository: 'repo',
            branch: 'main',
            author: '',
            authorSessionName: 'session-1',
          },
          agentMetadata
        );
      }).toThrow('author is required');

      // Create a question for answer validation tests
      const question = postQuestion(
        {
          title: 'Test',
          problem: 'Test',
          repository: 'repo',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      // postAnswer with missing author (should fail)
      expect(() => {
        postAnswer(
          question,
          {
            text: 'Solution',
            author: '',
            authorSessionName: 'session-2',
          },
          agentMetadata
        );
      }).toThrow('author is required');
    });

    it('Test 3: Contested logic - postQuestion, postAnswer A, postAnswer B, verify A, reject B, check verified status', () => {
      const question = postQuestion(
        {
          title: 'Best state management approach?',
          problem: 'Need guidance on state management',
          repository: 'my-app',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      // Post answer A
      const { answer: answerA, updatedQuestion: q1 } = postAnswer(
        question,
        {
          text: 'Use Redux for everything',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      expect(q1.status).toBe('candidate');

      // Post answer B
      const q1Fresh = getQuestion(question.id)!;
      const { answer: answerB, updatedQuestion: q2 } = postAnswer(
        q1Fresh,
        {
          text: 'Use Context API instead',
          author: 'charlie',
          authorSessionName: 'session-3',
        },
        agentMetadata
      );

      expect(q2.status).toBe('candidate');

      // Verify answer A (different answers, so status should be 'verified' not 'contested')
      const q2Fresh = getQuestion(question.id)!;
      const { updatedQuestion: q3 } = verifyAnswer(q2Fresh, {
        answerId: answerA.id,
        sessionId: 'verify-session-1',
        evidence: 'Works well for large apps with complex state',
      });

      expect(q3.status).toBe('verified');

      // Reject answer B (different answer from the verified one, so status stays 'verified')
      const q3Fresh = getQuestion(question.id)!;
      const { updatedQuestion: q4 } = rejectAnswer(q3Fresh, {
        answerId: answerB.id,
        sessionId: 'reject-session-1',
        reason: 'Too simple for this project scope',
      });

      expect(q4.status).toBe('verified');

      // Now reject answer A (same answer that was verified - NOW it should be contested)
      const q4Fresh = getQuestion(question.id)!;
      const { updatedQuestion: q5 } = rejectAnswer(q4Fresh, {
        answerId: answerA.id,
        sessionId: 'reject-session-2',
        reason: 'Overkill for simple state',
      });

      expect(q5.status).toBe('contested');
    });

    it('Test 3b: Contested with same answer having both signals', () => {
      const question = postQuestion(
        {
          title: 'How to handle async operations?',
          problem: 'Confusion about async patterns',
          repository: 'app',
          branch: 'main',
          author: 'alice',
          authorSessionName: 'session-1',
        },
        agentMetadata
      );

      // Post single answer
      const { answer, updatedQuestion: q1 } = postAnswer(
        question,
        {
          text: 'Use async/await for cleaner code',
          author: 'bob',
          authorSessionName: 'session-2',
        },
        agentMetadata
      );

      // Verify it
      const q1Fresh = getQuestion(question.id)!;
      const { updatedQuestion: q2 } = verifyAnswer(q1Fresh, {
        answerId: answer.id,
        sessionId: 'verify-session-1',
        evidence: 'Tested on modern Node versions',
      });

      expect(q2.status).toBe('verified');

      // Reject the SAME answer by different session
      const q2Fresh = getQuestion(question.id)!;
      const { updatedQuestion: q3 } = rejectAnswer(q2Fresh, {
        answerId: answer.id,
        sessionId: 'reject-session-1',
        reason: 'Fails on older Node versions',
      });

      // Check status = 'contested' (same answer, both verified and rejected)
      expect(q3.status).toBe('contested');
    });
  });

  describe('Integration with README quick-start workflow', () => {
    it('reproduces README example: search → post → answer → verify flow', () => {
      // Step 1: Search before debugging (no results expected on empty DB)
      let results = searchQuestionsInProject('useLocation white screen');
      expect(results).toEqual([]);

      // Step 2: Post a question (matching README example)
      const agentMetadata = captureAgentMetadata();
      const question = postQuestion(
        {
          title: 'useLocation hook crashes outside Router',
          problem: 'Using useLocation() in components outside Router context throws error',
          repository: 'my-repo',
          branch: 'main',
          keywords: ['react', 'hooks', 'routing'],
          author: 'agent-session-id',
          authorSessionName: 'Debugging React Routing',
        },
        agentMetadata
      );

      expect(question.id).toMatch(/^q_/);
      expect(question.status).toBe('open');

      // Step 3: Post an answer
      const { answer, updatedQuestion } = postAnswer(question, {
        text: 'Use window.location.search instead',
        author: 'agent-1',
        authorSessionName: 'Debugging React Routing',
      }, agentMetadata);

      expect(answer.id).toMatch(/^a_/);
      expect(updatedQuestion.status).toBe('candidate');

      // Step 4: Verify with evidence
      const { signal, updatedQuestion: q2 } = verifyAnswer(updatedQuestion, {
        answerId: answer.id,
        sessionId: 'ses_myagent',
        evidence: 'Tested on main: npm test --filter=routing, 42 tests pass',
      });

      expect(signal.type).toBe('verified');
      expect(q2.status).toBe('verified');

      // Step 5: Search again - should now find the verified answer
      results = searchQuestionsInProject('useLocation');
      expect(results.length).toBe(1);
      expect(results[0].question.id).toBe(question.id);
      expect(results[0].question.status).toBe('verified');
    });

    it('reproduces README example with additional verify step', () => {
      const agentMetadata = captureAgentMetadata();

      // Post question
      const question = postQuestion(
        {
          title: 'Streaming cuts off at token limit on Haiku',
          problem: 'When streaming long documents, Haiku halts mid-token at ~95k input tokens',
          repository: 'shelltab-cloud',
          branch: 'main',
          keywords: ['streaming', 'token-limit', 'haiku'],
          author: 'agent-123',
          authorSessionName: 'Token Limit Investigation',
        },
        agentMetadata
      );

      expect(question.status).toBe('open');

      // Post answer
      const { answer, updatedQuestion } = postAnswer(question, {
        text: 'Split input into 30k chunks and process sequentially. Haiku streams all chunks without cutoff.',
        author: 'agent-session-id',
        authorSessionName: 'Fixing Haiku Streaming',
      }, agentMetadata);

      expect(updatedQuestion.status).toBe('candidate');

      // Verify with evidence
      const { signal, updatedQuestion: q2 } = verifyAnswer(updatedQuestion, {
        answerId: answer.id,
        sessionId: 'ses_myagent',
        evidence: 'Tested on main: 250k document split into 30k chunks, all streamed without truncation. Node 22, claude-haiku-4-5. 10 consecutive runs, 100% success.',
      });

      expect(signal.type).toBe('verified');
      expect(q2.status).toBe('verified');

      // Verify again from a fresh load (demonstrates chaining)
      const q2Fresh = getQuestion(question.id)!;
      const { signal: signal2 } = verifyAnswer(q2Fresh, {
        answerId: answer.id,
        sessionId: 'ses_another_agent',
        evidence: 'Confirmed with Opus model as well, same chunking strategy works',
      });

      expect(signal2.type).toBe('verified');

      // Final state should still be verified
      const finalQuestion = getQuestion(question.id)!;
      expect(finalQuestion.status).toBe('verified');
      expect(finalQuestion.answers[0].signals.length).toBe(2);
    });
  });
});
