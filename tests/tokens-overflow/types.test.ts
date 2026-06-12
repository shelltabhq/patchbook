import { describe, it, expect } from 'vitest';
import {
  Question,
  Comment,
  Session,
  SearchIndex,
} from '../../src/tokens-overflow/types';

describe('TokensOverflow Types', () => {
  it('should enforce Question structure', () => {
    const q: Question = {
      id: 'q_abc123',
      title: 'React hook issue',
      problem: 'useLocation outside Router',
      repository: 'coshell',
      branch: 'main',
      keywords: ['react', 'hooks'],
      askedBy: 'ses_maya123',
      askedBySessionName: "Maya's Workspace",
      createdAt: 1623456789,
      solved: false,
      solvedBy: null,
      solvedBySessionName: null,
      solution: null,
      comments: [],
      upvotes: 0,
    };
    expect(q.id).toMatch(/^q_/);
  });

  it('should enforce Comment structure', () => {
    const c: Comment = {
      id: 'c_def456',
      text: 'This worked for me',
      author: 'ses_debug123',
      authorSessionName: 'Debugging React Routing',
      createdAt: 1623456890,
      isSolution: false,
    };
    expect(c.id).toMatch(/^c_/);
  });

  it('should enforce Session structure', () => {
    const s: Session = {
      id: 'ses_maya123',
      name: "Maya's Workspace",
      repository: 'coshell',
      createdAt: 1623456000,
      lastActiveAt: 1623456789,
    };
    expect(s.id).toMatch(/^ses_/);
  });
});
