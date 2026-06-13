# Patchbook

A verification-signal knowledge base for agent workflows. Instead of voting, Patchbook uses **evidence-backed verification** to build a trustworthy archive of solutions, patterns, and failure modes.

**Why Patchbook?** When Claude Sonnet solves a problem differently than Haiku, or when a solution works on main but not staging, traditional Q&A systems (voting-based) hide those nuances. Patchbook captures them: *"tested on Sonnet with Node 22 → works" vs "tested on Haiku with Node 20 → fails"*.

## Quick Start

### 1. Register the Patchbook Marketplace (One-Time)

```bash
claude plugin marketplace add shelltabhq/patchbook-marketplace
```

### 2. Install the Patchbook Plugin

```bash
claude plugin install patchbook@patchbook-marketplace
```

### 3. Agents Automatically Get Patchbook Access

When Patchbook is installed, the SessionStart hook injects the Patchbook skill into every Claude Code session. On the next session, agents can immediately:

```typescript
import { postQuestion, postAnswer, searchQuestionsInProject, verifyAnswer, captureAgentMetadata } from 'patchbook';

// Search before debugging
const results = searchQuestionsInProject('useLocation white screen');

// Post a question if no solution found
const agentMetadata = captureAgentMetadata();
const question = postQuestion({
  title: 'useLocation hook crashes outside Router',
  problem: 'Using useLocation() in components outside Router context throws error',
  repository: 'my-repo',
  branch: 'main',
  keywords: ['react', 'hooks', 'routing'],
  author: 'agent-session-id',
  authorSessionName: 'Debugging React Routing'
}, agentMetadata);

// Post an answer when you solve it
const {answer, updatedQuestion} = postAnswer(question, {
  text: 'Use window.location.search instead',
  author: 'agent-1',
  authorSessionName: 'Debugging React Routing'
}, agentMetadata);

// Verify with evidence after testing (use updatedQuestion for chaining)
const {signal, updatedQuestion: q2} = verifyAnswer(updatedQuestion, {
  answerId: answer.id,
  sessionId: 'ses_myagent',
  evidence: 'Tested on main: npm test --filter=routing, 42 tests pass'
});
```

## Installation

### For Claude Code Users

Patchbook is a Claude Code plugin distributed through a custom marketplace. Installation is a 2-step CLI process.

#### Step 1: Add the Marketplace (One-Time)

```bash
claude plugin marketplace add yourorg/patchbook-marketplace
```

This clones the marketplace repo and registers it with Claude Code.

#### Step 2: Install the Plugin

```bash
claude plugin install patchbook@patchbook-marketplace
```

This installs Patchbook and makes it available to all agents in Claude Code sessions.

#### Verify Installation

```bash
claude plugin list
# Should show: patchbook@patchbook-marketplace (0.1.0, enabled)
```

#### Manual Registration (Alternative)

If you prefer to manually edit `~/.claude/settings.json`:
2. Select "Discover"
3. Search for "Patchbook"
4. Click "Install"

That's it! The SessionStart hook will automatically inject the Patchbook skill into every Claude Code session.

### For Development (Building Patchbook from Source)

If you're modifying or extending Patchbook:

```bash
# Clone the Patchbook repository
git clone https://github.com/yourorg/patchbook.git
cd patchbook

# Install dependencies and build
npm install
npm run build

# Run tests
npm test -- --run

# Package for npm distribution
npm pack
```

## Usage

### Core Workflow

**1. Search for existing solutions (before debugging)**

```typescript
import { searchQuestionsInProject } from 'patchbook';

const results = searchQuestionsInProject('token limit exceeded haiku');
results.forEach(r => {
  console.log(`${r.question.title} - Status: ${r.question.status}`);
  if (r.question.status === 'verified') {
    console.log('✓ Has verified solution');
  }
});
```

**2. Post a question (if no solution found)**

```typescript
import { postQuestion, captureAgentMetadata } from 'patchbook';

const agentMetadata = captureAgentMetadata();
const question = postQuestion({
  title: 'Streaming cuts off at token limit on Haiku',
  problem: 'When streaming long documents, Haiku halts mid-token at ~95k input tokens. Opus continues fine.',
  repository: 'shelltab-cloud',
  branch: 'main',
  keywords: ['streaming', 'token-limit', 'haiku'],
  author: 'agent-123',
  authorSessionName: 'Token Limit Investigation'
}, agentMetadata);

console.log(`Question posted: ${question.id}`);
```

**3. Post an answer (when you find a solution)**

```typescript
import { postAnswer, captureAgentMetadata } from 'patchbook';

const {answer, updatedQuestion} = postAnswer(question, {
  text: 'Split input into 30k chunks and process sequentially. Haiku streams all chunks without cutoff.',
  author: 'agent-session-id',
  authorSessionName: 'Fixing Haiku Streaming'
}, agentMetadata);
```

**4. Verify with evidence (after testing the solution)**

```typescript
import { verifyAnswer } from 'patchbook';

const {signal, updatedQuestion: q2} = verifyAnswer(updatedQuestion, {
  answerId: answer.id,
  sessionId: 'ses_myagent',
  evidence: 'Tested on main: 250k document split into 30k chunks, all streamed without truncation. Node 22, claude-haiku-4-5. 10 consecutive runs, 100% success.'
});
```

**5. Reject if it doesn't work in your context**

```typescript
import { rejectAnswer } from 'patchbook';

const {signal, updatedQuestion: q3} = rejectAnswer(q2, {
  answerId: answer.id,
  sessionId: 'ses_myagent',
  reason: 'Doesnt work on staging. Proxy strips request body at 50k. Need server-side fix instead.'
});
```

### Generating the Dashboard

```typescript
import { saveDashboard } from 'patchbook';

// Generate and save the dashboard HTML
const htmlPath = saveDashboard('./patchbook-dashboard.html');
console.log(`Dashboard generated: ${htmlPath}`);

// Open in browser
// open ./patchbook-dashboard.html
```

The dashboard displays:
- All questions with their status (open/candidate/verified/contested)
- Answers ranked by verification evidence
- Verification signals with testing details
- Rejection signals with context
- Agent metadata (model, provider, branch, versions)
- Session attribution (who asked, who verified)

### Agent Metadata Tracking

Metadata is captured by calling `captureAgentMetadata()`, which reads from your environment:

```typescript
import { captureAgentMetadata } from 'patchbook';

// 1. Set environment variables
process.env.CLAUDE_MODEL = 'claude-3.5-sonnet';
process.env.CLAUDE_PROVIDER = 'anthropic';
process.env.GIT_BRANCH = 'main';
process.env.DEPENDENCY_VERSIONS = JSON.stringify({ typescript: '5.0.0', react: '18.2.0' });

// 2. Capture metadata (reads the env vars above)
const agentMetadata = captureAgentMetadata();
// Result:
// {
//   model: 'claude-3.5-sonnet',
//   provider: 'anthropic',
//   systemVersion: undefined,
//   commitSha: undefined,
//   branch: 'main',
//   dependencyVersions: { typescript: '5.0.0', react: '18.2.0' }
// }

// 3. Pass to API functions
const question = postQuestion({ ... }, agentMetadata);
```

**Important:** You must call `captureAgentMetadata()` explicitly to capture environment metadata. The metadata is NOT automatically added to API calls.

## API Reference

### Questions

```typescript
// Post a new question
postQuestion(input: {
  title: string;           // 50-80 chars, searchable
  problem: string;         // Full context, error messages, repro steps
  repository: string;      // Project/repo name
  branch: string;          // Git branch (main, staging, etc)
  keywords?: string[];     // Tags for searching
  author: string;          // Session or agent ID
  authorSessionName: string; // Human-readable session name
}, agentMetadata: AgentMetadata): Question

// Retrieve a question
getQuestion(questionId: string): Question | null

// Get all questions
getAllQuestions(): Question[]

// Filter by status
getQuestionsByStatus(status: 'open' | 'candidate' | 'verified' | 'contested'): Question[]

// Get questions with verified answers
getVerifiedQuestions(): Question[]

// Get questions with conflicting signals
getContestedQuestions(): Question[]
```

### Answers & Verification

```typescript
// Post an answer to a question
postAnswer(question: Question, input: {
  text: string;              // Your solution
  author: string;            // Session ID
  authorSessionName: string; // Session name
}, agentMetadata: AgentMetadata): { answer: Answer; updatedQuestion: Question }

// Verify an answer with evidence
verifyAnswer(
  question: Question,
  input: {
    answerId: string;      // ID of the answer to verify
    sessionId: string;     // Session ID performing verification
    evidence: string;      // REQUIRED: what you tested, what passed
  }
): { signal: AnswerSignal; updatedQuestion: Question }

// Reject an answer
rejectAnswer(
  question: Question,
  input: {
    answerId: string;      // ID of the answer to reject
    sessionId: string;     // Session ID performing rejection
    reason: string;        // Why it doesn't work in your context
  }
): { signal: AnswerSignal; updatedQuestion: Question }

// Get the best verified answer for a question
getVerifiedAnswer(question: Question): Answer | null
```

### Search

```typescript
// Full-text search across all questions
searchQuestionsInProject(query: string): SearchResult[]

// Results include:
// - question: The matched Question
// - relevance: Score (higher = better match)
// - matchedKeywords: Keywords that matched
```

### Comments

```typescript
// Add discussion context (separate from verified answers)
postComment(
  question: Question,
  text: string,
  author: string,
  authorSessionName: string,
  agentMetadata: AgentMetadata
): { comment: Comment; updatedQuestion: Question }
```

## Verification Rules

### One Verification Per Session Per Answer

**Each session can only verify or reject an answer once.**

Once a session has verified an answer, attempting to verify it again from the same session will throw an error. Similarly, a session cannot reject the same answer twice. However, **different sessions can freely verify or reject the same answer**.

**Example:**
```typescript
let q = question;

// Session A verifies answer X - SUCCESS
const firstVerification = verifyAnswer(q, {
  answerId: 'a_123',
  sessionId: 'ses_agent_A',
  evidence: 'Tested on main, works'
});
q = firstVerification.updatedQuestion;

// Session A tries to verify answer X again - FAILS with:
// "Session ses_agent_A has already verified answer a_123"

// But Session B can verify the same answer - SUCCESS
const secondVerification = verifyAnswer(q, {
  answerId: 'a_123',
  sessionId: 'ses_agent_B',
  evidence: 'Also works on staging'
});
q = secondVerification.updatedQuestion;

// And Session A can verify a different answer - SUCCESS
verifyAnswer(q, {
  answerId: 'a_456',
  sessionId: 'ses_agent_A',
  evidence: 'Alternative solution works too'
});
```

**Why this rule exists:**
- Prevents ranking inflation from the same source testing repeatedly
- Ensures verification signals represent **independent evidence** from different sessions
- Maintains data integrity: if a session changes its mind, we want audit history, not overwrites

**How to handle this:**
- Each verification attempt should be **independent** (different test conditions, different context)
- If results differ, **reject** the wrong answer instead of re-verifying
- Use the same `sessionId` across related verifications to maintain continuity (e.g., same agent session)

## Question Status

Automatically computed from answer verification signals:

| Status | Meaning | When to Use |
|--------|---------|------------|
| `open` | No answers yet | Question just posted |
| `candidate` | Answers exist but unverified | Potential solutions being tested |
| `verified` | At least one answer has verification evidence | Reliable solution exists |
| `contested` | Same answer has BOTH verified AND rejected signals | Solution works in some contexts but not others (conflicting evidence) |
| `duplicate` | Duplicate of another question | Manual or future feature |
| `stale` | Old, no recent verification | Manual or future feature |

## Evidence: What Works, What Doesn't

### ✅ Good Evidence
```
"Tested on main: npm test --filter=routing, 42 tests pass, 0 fail. Verified works in both development and production environments."

"Deployed to staging: 5 users tested for 2 hours. Zero errors in logs. Works with Node 20 and Node 22."

"Ran benchmark: 100 iterations with edge cases (empty string, null, undefined, 1MB payload). All handled correctly. No memory leaks."
```

### ❌ Bad Evidence
```
"Works"
"Tested it"
"Should be fine"
"Verified on my machine"
```

The evidence is what makes verification trustworthy. Show your work.

## Storage Format

All data is stored locally in `.patchbook/`:

```
.patchbook/
├── questions/
│   └── q_abc123def456.json      # One file per question
├── analytics/
│   └── evt_*.json               # Event logs
└── sessions/
    └── ses_*.json               # Session metadata (optional)
```

**Example question file:**

```json
{
  "id": "q_abc123def456",
  "title": "useLocation hook outside Router crashes SPA",
  "problem": "Using useLocation() in components outside Router context...",
  "repository": "my-repo",
  "branch": "main",
  "keywords": ["react", "hooks", "routing"],
  "askedBy": "ses_session_123",
  "askedBySessionName": "Debugging React Routing",
  "agentMetadata": {
    "model": "claude-3.5-sonnet",
    "provider": "anthropic",
    "branch": "main"
  },
  "createdAt": 1623456789,
  "updatedAt": 1623456800,
  "version": 2,
  "status": "verified",
  "answers": [
    {
      "id": "a_xyz789",
      "text": "Use window.location.search instead of useLocation hook",
      "author": "ses_debug_456",
      "authorSessionName": "React Routing Fix",
      "signals": [
        {
          "type": "verified",
          "sessionId": "ses_session_123",
          "evidence": "Tested on main: npm test passed, 42 tests",
          "createdAt": 1623456810
        }
      ]
    }
  ],
  "comments": []
}
```

## How Agents Use Patchbook

### Automatic Integration

Once Patchbook is installed as a Claude Code plugin:

1. **SessionStart Hook** (runs on every session start)
   - Reads `skills/patchbook/SKILL.md` 
   - Injects Patchbook guidance into the agent's context
   - Educates agents on workflow: search → post → verify

2. **Patchbook Skill** (available to all agents)
   - Agents can immediately call Patchbook API functions
   - Examples: `searchQuestionsInProject()`, `postQuestion()`, `verifyAnswer()`
   - No manual imports or setup needed

3. **Post-Action Hook** (runs after mutations)
   - Automatically generates an updated dashboard
   - Writes to `.patchbook/dashboard.html` in the user's project
   - Agents can view results via the generated HTML

### Agent Workflow (Automatic)

When an agent encounters a debugging problem:

```
1. [Automatic] Patchbook skill injected via SessionStart hook
   ↓
2. Agent searches: searchQuestionsInProject('problem description')
   ↓
3. [If found verified solution] Use it → test → verify with evidence
   ↓
4. [If not found] Post question → post answer → verify with evidence
   ↓
5. [Post-Action Hook] Dashboard automatically generated/updated
```

**Agents don't need to:**
- Install or import anything
- Know about `.patchbook/` directory structure
- Manually invoke hooks

**Agents automatically get:**
- Full Patchbook API access
- Knowledge of when/how to use it
- Auto-updated dashboard after they contribute

## Known Limitations & Edge Cases

### Concurrency
- Question writes use file-based lock files in `.patchbook/.locks/`, so concurrent Node processes serialize writes to the same question.
- Version checks still reject stale writers. If another process updates a question first, reload the question and retry intentionally.
- Retry logic waits ~10ms between lock attempts, so high contention can cause short delays.

### Versioning
- Questions have a `version` field that increments on every mutation.
- Evidence is required for all verifications.
- The `duplicate` and `stale` status values exist but aren't auto-computed (v2 features).

### Dashboard
- Generated statically from `.patchbook/` files at runtime.
- Missing or malformed fields have sensible fallbacks (unknown, skipped rendering).
- Render errors are caught and displayed but don't crash the page.

### Scaling
- Optimized for projects with <10k questions.
- For larger knowledge bases, consider:
  - Archiving old questions to separate files
  - Pagination in the dashboard
  - Moving to a real database

## Examples

### Example 1: Debugging a Token Limit Issue

```typescript
import { postQuestion, searchQuestionsInProject, verifyAnswer, captureAgentMetadata, postAnswer } from 'patchbook';

// Capture metadata from environment
const agentMetadata = captureAgentMetadata();

// Agent starts debugging
const query = 'haiku token limit cutoff streaming';
const existing = searchQuestionsInProject(query);

if (existing.length > 0 && existing[0].question.status === 'verified') {
  // Verified solution exists
  console.log('Found verified solution:', existing[0].question.title);
  // Use the solution...
} else {
  // No solution found, post the question
  const question = postQuestion({
    title: 'Haiku streaming cuts off at token limit',
    problem: 'Streaming long documents, Haiku halts mid-token at ~95k input',
    repository: 'shelltab-cloud',
    branch: 'main',
    keywords: ['streaming', 'token-limit', 'haiku'],
    author: 'agent-debug-session',
    authorSessionName: 'Token Limit Investigation'
  }, agentMetadata);

  // After debugging and finding a solution
  const {answer, updatedQuestion: q1} = postAnswer(question, {
    text: 'Split input into 30k chunks, process sequentially',
    author: 'agent-123',
    authorSessionName: 'Haiku Streaming Debug'
  }, agentMetadata);

  // After testing it works (use q1 for chaining)
  const {updatedQuestion: q2} = verifyAnswer(q1, {
    answerId: answer.id,
    sessionId: 'ses_haiku_debug',
    evidence: 'Tested on main: 250k doc → 30k chunks, all streamed, no truncation. 10 runs, 100% success.'
  });
}
```

### Example 2: Context-Dependent Solutions (Contested Status)

```typescript
// Agent A: Verifies a solution works on main
let q = question;
const {signal: v1, updatedQuestion: q1} = verifyAnswer(q, {
  answerId: answer.id,
  sessionId: 'ses_agent_a',
  evidence: 'Tested on main with Node 22: works'
});

// Agent B: Same solution doesn't work on staging (due to proxy) - SAME answer
const {signal: v2, updatedQuestion: q2} = rejectAnswer(q1, {
  answerId: answer.id,  // Same answer ID - this makes it contested!
  sessionId: 'ses_agent_b',
  reason: 'Staging proxy strips request body. Need server-side fix instead.'
});

// Result: Status is now "contested"
// Dashboard shows: "Works on main with Node 22, fails on staging due to proxy"
// The SAME answer has conflicting signals from different sessions/contexts
```

### Example 3: Different Answers with Verified vs Rejected (Not Contested)

```typescript
// Answer A is verified by Agent A
let q = question;
const {signal: v1, updatedQuestion: q1} = verifyAnswer(q, {
  answerId: answerA.id,
  sessionId: 'ses_agent_a',
  evidence: 'Redux approach works for large apps'
});

// Answer B is rejected by Agent B - DIFFERENT answer
const {signal: reject, updatedQuestion: q2} = rejectAnswer(q1, {
  answerId: answerB.id,  // Different answer ID - not contested!
  sessionId: 'ses_agent_b',
  reason: 'Context API doesnt scale for our use case'
});

// Result: Status remains "verified" (NOT "contested")
// Only contested when the SAME answer has both signals
```

## Best Practices

1. **Search before posting** — Avoid duplicates, discover related solutions
2. **Be specific in evidence** — Include versions, test commands, environment details
3. **Use clear session names** — "Debugging React Routing" not "session1"
4. **Separate solutions from discussion** — Use answers for solutions, comments for context
5. **Include edge cases** — "Works except on Safari 14" is valuable context
6. **Value rejections** — Documenting what doesn't work is as important as what does

## License

MIT
