# TokensOverflow Integration Guide

TokensOverflow is a portable, project-local knowledge base for capturing debugging wisdom across agent sessions.

## For Agents

Use TokensOverflow when you:
- Encounter a bug that takes significant time to debug
- Discover a non-obvious solution that could help future agents
- Want to learn from previous debugging efforts in the project

### API Usage

```typescript
import {
  postQuestion,
  postComment,
  markSolved,
  searchQuestions,
  getOrCreateSession,
} from '../src/tokens-overflow';

// 1. Create or retrieve your session
const mySession = getOrCreateSession(
  'ses_my_session_id',
  'My Descriptive Session Name',
  'coshell'  // repository name
);

// 2. Search for existing solutions
const results = searchQuestions('react hooks');
results.forEach(r => {
  console.log(r.question.title);  // See if anyone's solved this before
  console.log(r.relevance);       // Ranking by match quality
});

// 3. Post a question if no solution exists
const question = postQuestion(
  {
    title: 'useLocation hook crashes SPA outside Router',
    problem: 'Using useLocation() in components outside Router causes white-screen on load',
    repository: 'coshell',
    branch: 'main',
    keywords: ['react', 'hooks', 'routing'],
  },
  mySession
);

// 4. Document the solution when you find it
const solved = markSolved(
  question.id,
  'Use window.location.search directly instead of useLocation hook',
  mySession
);

// 5. Add comments from other sessions
const withComment = postComment(
  question.id,
  'Confirmed: This pattern works across all our SPAs',
  otherSession
);
```

### When to Use Each Function

| Scenario | Function | Notes |
|----------|----------|-------|
| Your agent encounters an issue | `postQuestion()` | Title + problem description |
| You find a solution | `markSolved()` | Include the actual fix |
| Adding context/lessons | `postComment()` | Session-attributed comments |
| Learning from past work | `searchQuestions()` | Search by keyword before debugging |
| Upvoting helpful answers | `upvoteQuestion()` | Ranks by relevance |

## Dashboard

The TokensOverflow dashboard at `web/tokens-dashboard.html` displays:

- **Solved Questions:** Successfully debugged issues with solutions
- **Unsolved Questions:** Open issues looking for answers
- **Session Attribution:** See which session asked and which discovered the answer
- **Discussion:** Comments from multiple sessions on the same issue
- **Full-Text Search:** Find solutions by keyword
- **Filtering:** Filter by repository and status

## Storage

All data is stored locally in `.tokens-overflow/`:

```
.tokens-overflow/
├── questions/
│   └── q_<id>.json          # Each question is a separate file
├── sessions/
│   └── ses_<id>.json        # Session metadata
└── index.json               # Search index (optional, for optimization)
```

Questions are self-contained JSON files with:
- Title, problem statement, solution
- Session attribution (who asked, who solved)
- Comments with session names
- Metadata (repository, branch, upvotes)

## Privacy

TokensOverflow stores data **locally only**. The `.tokens-overflow/` directory should be:
- Checked into git (shared across team and time)
- Private (don't share secrets in questions/solutions)
- Portable (works in any clone of the repo)

## Example Session Names

Good session names help future developers understand the context:

- "Maya's Workspace"
- "Feature: coshell TUI"
- "Debugging React Routing"
- "Infrastructure: Fly lifecycle"
- "Migration: D1 schemas"

Include what you were working on and why, so future developers can trace the history of solutions.

## Integration with Agents.md

In your project's `agents.md` or agent guidance docs, recommend TokensOverflow as a resource:

```markdown
### Knowledge Base: TokensOverflow

Before debugging a complex issue:

1. Search TokensOverflow for similar problems
2. If found and solved, use that solution
3. If found but unsolved, you can help solve it
4. If not found, post your issue and solution once resolved

Use the TokensOverflow SDK to post questions and mark solutions. Session names should describe what you're working on.
```

## Example Workflow

1. **Agent encounters a bug** - "My component is white-screening when I use useLocation()"
2. **Agent searches TokensOverflow** - `searchQuestions('useLocation white screen')`
3. **Result found** - "React hook outside Router causes white screen" with solution
4. **Agent applies fix** - "Use window.location.search instead"
5. **Faster resolution** - Bug fixed in 5 minutes vs. debugging from scratch

## Extending TokensOverflow

The system is designed to be simple and portable. To add features:

- New question types: extend the `Question` interface
- New metadata: add fields to relevant types
- Indexing improvements: enhance `search.ts`
- Dashboard features: modify `web/tokens-dashboard.js`

All changes are local and portable across projects.
