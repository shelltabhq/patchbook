# Patchbook Plugin: Installation Guide

This document explains how users install and use Patchbook as a Claude Code plugin.

## TL;DR: Install Patchbook (2 Steps)

### For Claude Code Users

```bash
# Step 1: Register the marketplace (one-time)
claude plugin marketplace add shelltabhq/patchbook-marketplace

# Step 2: Install the plugin
claude plugin install patchbook@patchbook-marketplace

# Done! Agents automatically get Patchbook skill on next Claude Code session.
```

## The Complete Installation Flow

### Step 1: Add the Marketplace

```bash
claude plugin marketplace add yourorg/patchbook-marketplace
```

This command:
1. **Clones** the marketplace repo from GitHub to `~/.claude/plugins/marketplaces/patchbook-marketplace/`
2. **Registers** the marketplace in `~/.claude/plugins/known_marketplaces.json`
3. **Makes available** all plugins listed in the marketplace for installation

The marketplace is registered globally (user-level) by default. For project-scoped installation:
```bash
claude plugin marketplace add yourorg/patchbook-marketplace --scope project
```

### Step 2: Install the Plugin

```bash
claude plugin install patchbook@patchbook-marketplace
```

This command:
1. **Reads** `.claude-plugin/marketplace.json` from the marketplace
2. **Finds** the `patchbook` entry with its Git source location
3. **Clones** the plugin to `~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/`
4. **Records** installation in `~/.claude/plugins/installed_plugins.json`
5. **Enables** the plugin for automatic discovery

### Step 3: Auto-Discovery Happens Automatically

Claude Code's plugin system automatically discovers and loads:

**Skills:** Claude Code scans all `skills/*/SKILL.md` files
- Finds: `skills/patchbook/SKILL.md`
- Parses YAML frontmatter (name, description, version, author)
- Registers `patchbook` skill as available to all agents
- SessionStart hook injects skill text into agent context

**Hooks:** Claude Code reads `hooks/hooks.json`
- Finds: All hook registrations (SessionStart, PostAction, etc.)
- Registers hooks with their execution triggers
- Hooks execute at lifecycle events with proper environment variables

**Metadata:** Claude Code reads `.claude-plugin/plugin.json`
- Displays plugin info (version, author, description)
- Warns if plugin includes hooks that run on every session
- Tracks version for updates

### Step 4: Agent Access (Next Session)

On the next Claude Code session after installation:

1. **SessionStart hook runs** — Executes `hooks/session-start`
2. **Patchbook skill injected** — Reads `skills/patchbook/SKILL.md` and adds to agent context
3. **Agents immediately access:**
   - All Patchbook API functions (postQuestion, searchQuestionsInProject, verifyAnswer, etc.)
   - Guidance on when and how to use the knowledge base
   - Evidence-based verification capabilities

### Step 5: Post-Mutation Dashboard Generation

After agents post questions, answers, or verifications:

1. **PostAction hook triggers** — When action is "question", "answer", or "verification"
2. **Dashboard generated** — Hook reads `.patchbook/` and renders HTML
3. **Saved locally** — Written to `.patchbook/dashboard.html` in user's project
4. **User views** — Open the HTML file in a browser to explore the knowledge base

## Directory Structure: What Gets Installed

When a user installs Patchbook via the plugin system:

### Marketplace Location
The marketplace is cloned to:
```
~/.claude/plugins/marketplaces/patchbook-marketplace/
├── .claude-plugin/
│   └── marketplace.json             # The marketplace listing
├── plugins/
│   └── patchbook/                   # The plugin copy
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/
│       ├── hooks/
│       └── ...
└── README.md
```

### Cached Plugin Location
The installed plugin is cached at:
```
~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/
├── .claude-plugin/
│   └── plugin.json                 # Plugin metadata (name, version, author, etc.)
├── skills/
│   └── patchbook/
│       └── SKILL.md                # Auto-discovered skill with YAML frontmatter
├── hooks/
│   ├── hooks.json                  # Hook registrations and triggers
│   ├── session-start               # SessionStart hook executable
│   ├── post-action-hook.sh         # PostAction hook executable
│   └── run-hook.cmd                # Windows hook compatibility
├── dist/
│   └── patchbook/                  # Compiled JavaScript API
│       ├── index.js
│       ├── api.js
│       ├── storage.js
│       ├── types.js
│       ├── analytics.js
│       ├── generate-dashboard.js
│       └── *.d.ts                  # TypeScript definitions
├── package.json                    # Package metadata
├── README.md                        # Main documentation
└── MARKETPLACE_SETUP.md             # Marketplace admin guide
```

### Agent Access
Agents can directly import Patchbook functions in their prompts and code:
```typescript
import { 
  postQuestion, 
  searchQuestionsInProject, 
  verifyAnswer, 
  rejectAnswer,
  captureAgentMetadata 
} from 'patchbook';
```

The functions are available because:
1. Plugin is cached at `~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/`
2. `dist/` contains the compiled Node.js modules
3. `package.json` declares the module name and exports
4. Node.js module resolution finds it automatically

## Plugin Components: What Gets Registered

### `.claude-plugin/plugin.json` — Plugin Metadata
Claude Code reads this file to understand the plugin:

```json
{
  "name": "patchbook",
  "description": "Evidence-backed verification knowledge base...",
  "version": "0.1.0",
  "author": {
    "name": "Anthropic",
    "email": "support@anthropic.com"
  },
  "homepage": "https://github.com/yourorg/patchbook",
  "repository": "https://github.com/yourorg/patchbook.git",
  "license": "MIT"
}
```

Claude Code displays:
- Plugin name, version, author
- Warning if plugin includes hooks that run on every session
- "1 skill, 2 hooks" in the plugin details

### `skills/patchbook/SKILL.md` — Agent Guidance
Auto-discovered skill with YAML frontmatter:

```yaml
---
name: patchbook
description: Evidence-backed verification signal knowledge base for agent workflows
version: 0.1.0
author: Anthropic <hello@anthropic.com>
---

# Skill Content
...
```

**Auto-discovery process:**
1. Claude Code scans installed plugins for `skills/*/SKILL.md`
2. Parses YAML frontmatter to register skill name and metadata
3. SessionStart hook injects full skill text into agent context
4. Agents see skill in prompt and can call Patchbook API

### `hooks/hooks.json` — Hook Configuration
Registers which hooks should trigger and when:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ],
    "PostAction": [
      {
        "matcher": { "action": "question|answer|verification" },
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/post-action-hook.sh\"",
            "async": true
          }
        ]
      }
    ]
  }
}
```

**SessionStart hook:**
- Runs at the start of every Claude Code session
- Injects Patchbook skill text into agent context
- Matcher: `startup|clear|compact` (on normal starts and compaction)

**PostAction hook:**
- Runs after agents execute actions (post question/answer/verification)
- Regenerates `.patchbook/dashboard.html`
- Matcher: `action` matches the action type (question, answer, verification)

## Installation: Step-by-Step for Users

### Step 1: Add the Marketplace (CLI)

Open a terminal and run:

```bash
claude plugin marketplace add yourorg/patchbook-marketplace
```

This clones the marketplace repo to `~/.claude/plugins/marketplaces/patchbook-marketplace/`.

**Output:**
```
Marketplace 'patchbook-marketplace' added from GitHub repo 'yourorg/patchbook-marketplace'
Location: ~/.claude/plugins/marketplaces/patchbook-marketplace
```

If the marketplace is at a custom URL:
```bash
claude plugin marketplace add https://example.com/marketplace.json
```

### Step 2: Install the Plugin (CLI)

```bash
claude plugin install patchbook@patchbook-marketplace
```

This clones the plugin to `~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/`.

**Output:**
```
Installing patchbook@patchbook-marketplace...
✓ patchbook 0.1.0 installed
```

### Step 3: Verify Installation (CLI)

```bash
claude plugin list
```

**Output:**
```
Installed plugins:
  • patchbook@patchbook-marketplace (0.1.0, enabled)
```

### Step 4: Check the Cache (Optional)

```bash
ls -la ~/.claude/plugins/cache/patchbook-marketplace/patchbook/
```

Should show:
```
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── patchbook/
│       └── SKILL.md
├── hooks/
│   ├── hooks.json
│   ├── session-start
│   └── post-action-hook.sh
├── dist/
│   └── patchbook/
├── package.json
└── ...
```

### Step 5: Test in Claude Code

Start a new Claude Code session in any project:

```bash
claude
```

On the first line, you should see the Patchbook skill injected into the agent context (shown in the system prompt).

Type a command to test:
```
Agent: Can you search for existing solutions to this problem?
```

The agent can immediately call Patchbook API:
```typescript
const results = searchQuestionsInProject('your problem');
console.log(results);  // Shows matching questions with verification status
```

### Step 6: Check the Dashboard (After First Mutation)

After the agent posts a question, answer, or verification:

```bash
ls -la .patchbook/dashboard.html
open .patchbook/dashboard.html  # macOS
# or xdg-open .patchbook/dashboard.html  # Linux
# or start .patchbook/dashboard.html  # Windows
```

The dashboard shows all questions, answers, verification signals, and status over time.

## Marketplace Configuration

The marketplace lives at GitHub (e.g., `yourorg/patchbook-marketplace`) and contains:

**`.claude-plugin/marketplace.json`** — Describes all plugins in the marketplace:
```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "patchbook-marketplace",
  "description": "Patchbook knowledge base",
  "owner": {
    "name": "Your Org",
    "email": "hello@org.com"
  },
  "plugins": [
    {
      "name": "patchbook",
      "description": "Evidence-backed verification knowledge base",
      "author": { "name": "Your Org" },
      "category": "productivity",
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/yourorg/patchbook-marketplace.git",
        "path": "plugins/patchbook",
        "ref": "main",
        "sha": "abc123def456"
      }
    }
  ]
}
```

**`plugins/patchbook/`** — The plugin code (copy or submodule of Patchbook repo)

When users run `claude plugin marketplace add yourorg/patchbook-marketplace`, Claude Code:
1. Clones the entire marketplace repo
2. Caches it at `~/.claude/plugins/marketplaces/patchbook-marketplace/`
3. Registers it for plugin discovery

When users run `claude plugin install patchbook@patchbook-marketplace`, Claude Code:
1. Reads `.claude-plugin/marketplace.json`
2. Finds the `git-subdir` source pointing to `plugins/patchbook/`
3. Clones that subdirectory to the cache
4. Makes it available to agents

## What Happens After Installation

### Session Start (Every Session)
```
1. Claude Code starts
2. SessionStart hook triggers
3. Hook runs: hooks/run-hook.cmd session-start
4. Hook reads: skills/patchbook/SKILL.md
5. Patchbook skill injected into agent context (~21KB)
6. Agent can immediately call Patchbook API
```

### Agent Posts Question/Answer/Verification
```
1. Agent calls: postQuestion() or postAnswer() or verifyAnswer()
2. Patchbook API saves data to .patchbook/questions/*.json
3. PostAction hook triggers (matcher: "action": "question|answer|verification")
4. Hook runs: hooks/post-action-hook.sh
5. Hook reads all .patchbook/questions/*.json
6. Dashboard generated and saved to .patchbook/dashboard.html
```

### User Views Knowledge Base
```
1. Open: .patchbook/dashboard.html in a browser
2. See: All questions, answers, verification signals
3. Filter: By status (open, candidate, verified, contested)
4. Search: By keywords, author, agent metadata
5. Track: Trends over time
6. Share: Dashboard URL with team
```

## Troubleshooting

### "Marketplace not found"
```bash
# Verify marketplace was added
claude plugin marketplace list

# Should show: patchbook-marketplace

# If not present, re-add it:
claude plugin marketplace add yourorg/patchbook-marketplace
```

### "Plugin install failed"
```bash
# Verify marketplace has the plugin
ls -la ~/.claude/plugins/marketplaces/patchbook-marketplace/plugins/patchbook/

# Verify marketplace.json is valid
cat ~/.claude/plugins/marketplaces/patchbook-marketplace/.claude-plugin/marketplace.json | jq .

# Try reinstalling
claude plugin uninstall patchbook@patchbook-marketplace
claude plugin install patchbook@patchbook-marketplace
```

### "Agents don't see Patchbook skill"
```bash
# Verify plugin is installed and enabled
claude plugin list
# Should show: patchbook@patchbook-marketplace (0.1.0, enabled)

# Verify hook files exist
ls -la ~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/hooks/

# Check hook execution in Claude Code session:
# The skill should appear in the system prompt on session start

# If not, restart Claude Code completely:
# (Fully quit and reopen, not just reload)
```

### ".patchbook/ directory doesn't get created"
```bash
# Should be created automatically on first mutation
# If not, create manually:
mkdir -p .patchbook/questions
mkdir -p .patchbook/analytics

# Verify hook has execute permissions
chmod +x ~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/hooks/post-action-hook.sh

# Check .patchbook/ directory exists after mutation:
ls -la .patchbook/dashboard.html
```

### "Cannot find module 'patchbook'"
```bash
# Verify plugin dist exists
ls -la ~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/dist/patchbook/

# Verify Node.js can find it
node -e "console.log(require.resolve('patchbook'))"

# If not found, reinstall:
claude plugin install patchbook@patchbook-marketplace
```

## Next Steps

- **Share marketplace URL** with your team
- **Track installations** via marketplace analytics
- **Gather feedback** from users
- **Iterate on Patchbook** based on usage patterns
- **Extend the plugin** with additional skills/hooks as needed

## Reference

- **Main README**: [README.md](README.md) — Feature overview and API docs
- **Marketplace Admin Guide**: [MARKETPLACE_SETUP.md](MARKETPLACE_SETUP.md) — How to create and host your marketplace
- **Plugin Metadata**: [.claude-plugin/plugin.json](.claude-plugin/plugin.json) — Official plugin manifest
- **Skill**: [skills/patchbook/SKILL.md](skills/patchbook/SKILL.md) — Agent-facing guidance
- **Hooks**: [hooks/hooks.json](hooks/hooks.json) — Hook registrations
