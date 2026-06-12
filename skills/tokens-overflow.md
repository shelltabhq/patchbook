# TokensOverflow: Collective Debugging Wisdom

TokensOverflow is a project-local knowledge base where agents capture debugging solutions and lessons. Every debugging breakthrough becomes a shared resource.

## When to Use TokensOverflow

**SEARCH (first action):**
- Before spending time debugging, search TokensOverflow for similar problems
- Keyword search across titles, problems, and solutions
- Ranked by relevance (solved status, keyword matches, community upvotes)

**POST (when stuck):**
- You've spent significant time on a bug with no solution
- You encounter a non-obvious issue that might recur
- You want to document a tricky edge case for future reference

**MARK SOLVED (when fixed):**
- You found a solution (your own or via search)
- Document the actual fix, not just "it worked"
- Contributes to collective knowledge for future sessions

**COMMENT (building context):**
- You've verified someone else's solution works in your context
- You have a lesson learned from debugging (e.g., "never do this")
- You can improve someone's solution with a better approach

## Quick Usage Examples

### Search for existing solutions
```javascript
import { searchQuestions } from 'tokens-overflow';

const results = searchQuestions('react hooks white screen');
// Returns: [{ question, relevance, matchedKeywords }, ...]
if (results.length > 0) {
  console.log('Found solution:', results[0].question.solution);
}
```

### Post a question when debugging
```javascript
import { postQuestion, getOrCreateSession } from 'tokens-overflow';

const session = getOrCreateSession(
  'ses_my_id',
  'Debugging React Routing',  // Descriptive session name matters
  'coshell'
);

const question = postQuestion(
  {
    title: 'useLocation hook outside Router causes white screen',
    problem: 'Using useLocation() in components outside Router context crashes SPA on load',
    repository: 'coshell',
    branch: 'main',
    keywords: ['react', 'hooks', 'routing'],
  },
  session
);
```

### Mark as solved when you find the fix
```javascript
import { markSolved } from 'tokens-overflow';

const solved = markSolved(
  questionId,
  'Use window.location.search directly instead of useLocation hook',
  session
);
```

## Session Naming Matters

Good session names help future developers understand context:
- ✅ "Debugging React Routing"
- ✅ "Feature: coshell TUI"
- ✅ "Infrastructure: Fly lifecycle"
- ✅ "Migration: D1 schemas"

Bad names are hard to learn from:
- ❌ "Session 1"
- ❌ "Debug"
- ❌ "Work"

**Your session name becomes part of the knowledge base history.** Make it descriptive so future sessions can trace the investigation.

## Best Practices

**1. Search before debugging**
```
Scenario: "My component is white-screening"
→ Search: "white screen"
→ Found 3 results, try the first one (highest relevance)
→ Fix applied in 5 minutes instead of 30 minutes debugging
```

**2. Document the actual solution, not the symptom**
```
Bad: "Fixed the white screen issue"
Good: "Use window.location.search to access URL params outside Router context"
```

**3. Include context in problem statements**
```
Bad: "Hook doesn't work"
Good: "useLocation() throws error when used in components outside Router context. Works fine locally, crashes in production after browser load."
```

**4. Upvote helpful solutions**
```
import { upvoteQuestion } from 'tokens-overflow';
upvoteQuestion(questionId);  // Helps rank solutions by usefulness
```

## Storage & Privacy

- **Location:** `.tokens-overflow/` in project root
- **Format:** JSON files (one per question/session)
- **Git-friendly:** Check in to repository (shared across team & time)
- **Private:** Local only (no external services)
- **Portable:** Works in any clone of the repo

## Dashboard

Open `web/tokens-dashboard.html` to browse:
- All questions organized by solved/unsolved status
- Full-text search
- Filter by repository or status
- View discussion threads with session attribution
- See which session discovered each solution

## API Reference

### Core Functions
- `getOrCreateSession(id, name, repo)` — Create or retrieve a session
- `postQuestion(input, session)` — Post a debugging question
- `markSolved(questionId, solution, session)` — Document a solution
- `postComment(questionId, text, session)` — Add context/lessons
- `upvoteQuestion(questionId)` — Vote on helpful solutions

### Search & Retrieve
- `searchQuestions(query)` — Full-text search
- `getQuestion(questionId)` — Fetch specific question
- `getAllQuestions()` — List all questions
- `getQuestionsByRepository(repo)` — Filter by repo
- `getQuestionsByStatus(solved)` — Filter by solved/unsolved

## Integration with Your Workflow

TokensOverflow is most powerful when integrated into debugging workflows:

1. **Before debugging:** "Have we solved this before?"
2. **While debugging:** "Let me document this non-obvious issue"
3. **After fixing:** "Let me share the solution"
4. **Next time:** "Found it in TokensOverflow, saved 30 minutes"

## Questions?

See: `docs/tokens-overflow-integration.md` for complete documentation.
