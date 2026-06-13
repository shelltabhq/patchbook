# Patchbook: Claude Code Plugin Marketplace — Comprehensive Research

## Executive Summary

Claude Code has a **built-in plugin system** with **CLI support for 2-step marketplace registration**. Verified against actual system files on 2026-06-13.

## 2-Step Installation Process (Verified)

### Step 1: Add Marketplace (CLI Command)
```bash
claude plugin marketplace add <source>
```

Where `<source>` can be:
- **GitHub repo:** `anthropics/claude-plugins-official` or full URL
- **HTTP URL:** `https://example.com/marketplace.json`
- **Local path:** `/path/to/marketplace/` (for development)

This command:
1. Clones the marketplace repo to `~/.claude/plugins/marketplaces/<marketplace-name>/`
2. Stores registration in `~/.claude/plugins/known_marketplaces.json`
3. Records scope (user/project/local) in `~/.claude/settings.json` if scope is project/local

Options:
- `--scope <scope>` — Where to declare: `user` (default), `project`, or `local`
- `--sparse <paths...>` — For monorepos, limit checkout to specific directories (e.g., `.claude-plugin plugins`)

### Step 2: Install Plugin (CLI Command)
```bash
claude plugin install patchbook@patchbook-marketplace
```

This command:
1. Fetches marketplace repo if not cached
2. Reads `~/.claude/plugins/marketplaces/patchbook-marketplace/.claude-plugin/marketplace.json`
3. Finds plugin entry matching `patchbook`
4. Clones/caches plugin at `~/.claude/plugins/cache/patchbook-marketplace/patchbook/<version>/`
5. Records installation in `~/.claude/plugins/installed_plugins.json`

## Marketplace Directory Structure

When a marketplace is registered via `claude plugin marketplace add`, Claude Code clones the entire repository to `~/.claude/plugins/marketplaces/<marketplace-name>/`:

```
~/.claude/plugins/marketplaces/patchbook-marketplace/
├── .claude-plugin/
│   └── marketplace.json          # THE marketplace listing (required)
├── plugins/                       # (optional) local plugins
│   └── patchbook/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/
│       ├── hooks/
│       └── ...
└── README.md
```

## marketplace.json Schema (Verified)

**Location:** `.claude-plugin/marketplace.json` at marketplace root

**Format:** Single JSON object (NOT an array)

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "patchbook-marketplace",
  "description": "Knowledge base platform for Claude Code",
  "owner": {
    "name": "Your Organization",
    "email": "hello@example.com"
  },
  "plugins": [
    {
      "name": "patchbook",
      "description": "Evidence-backed verification knowledge base...",
      "author": {
        "name": "Your Name",
        "email": "your@email.com"
      },
      "category": "productivity",
      "homepage": "https://github.com/yourorg/patchbook",
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/yourorg/patchbook-marketplace.git",
        "path": "plugins/patchbook",
        "ref": "main",
        "sha": "<commit-hash>"
      }
    }
  ]
}
```

## Source Types (Verified from Real Examples)

### 1. git-subdir (for plugins inside marketplace repo)
```json
{
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/yourorg/patchbook-marketplace.git",
    "path": "plugins/patchbook",
    "ref": "main",
    "sha": "<commit-hash>"
  }
}
```
Used when: Plugin code lives in a subdirectory of the marketplace repo

### 2. url (for standalone plugin repos)
```json
{
  "source": {
    "source": "url",
    "url": "https://github.com/yourorg/patchbook.git",
    "sha": "<commit-hash>"
  }
}
```
Used when: Plugin is a standalone repository

### 3. Local relative path (for dev/local marketplaces)
```json
{
  "source": "./plugins/patchbook"
}
```
Used when: Plugin is in the same marketplace repository

## known_marketplaces.json (Verified)

**Location:** `~/.claude/plugins/known_marketplaces.json`

**Structure:**
```json
{
  "patchbook-marketplace": {
    "source": {
      "source": "github",
      "repo": "yourorg/patchbook-marketplace"
    },
    "installLocation": "/Users/michael/.claude/plugins/marketplaces/patchbook-marketplace",
    "lastUpdated": "2026-06-13T12:34:56.789Z",
    "autoUpdate": true
  }
}
```

**Notes:**
- `source.source` can be: `github`, `http`, or local `path`
- `installLocation` is set automatically by Claude Code
- `autoUpdate` (optional) enables automatic updates

## Plugin Installation Tracking

**Location:** `~/.claude/plugins/installed_plugins.json`

**Structure:**
```json
{
  "version": 2,
  "plugins": {
    "patchbook@patchbook-marketplace": [
      {
        "scope": "user",
        "installPath": "/Users/michael/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0",
        "version": "0.1.0",
        "installedAt": "2026-06-13T12:34:56.789Z",
        "lastUpdated": "2026-06-13T12:34:56.789Z",
        "gitCommitSha": "abc123def456..."
      }
    ]
  }
}
```

**Notes:**
- `scope` can be: `user`, `project`
- `installPath` is cache location where plugin is stored
- `version` comes from `.claude-plugin/plugin.json` or plugin.json in package
- Claude Code manages this file — do not edit manually

## .claude-plugin/plugin.json Format (Verified)

**Location:** Inside each plugin at `.claude-plugin/plugin.json`

**Required fields:**
```json
{
  "name": "patchbook",
  "description": "Short description",
  "version": "0.1.0",
  "author": {
    "name": "Your Name",
    "email": "your@email.com"
  },
  "homepage": "https://github.com/...",
  "repository": "https://github.com/.../patchbook.git",
  "license": "MIT"
}
```

## Skills Auto-Discovery (Verified)

**Location:** `skills/<skill-name>/SKILL.md`

**Format:** Markdown with YAML frontmatter

```yaml
---
name: patchbook
description: Evidence-backed verification knowledge base for agent workflows
version: 0.1.0
author: Your Name
---

# Skill Content Here
```

**Auto-discovery:**
- Claude Code scans all `skills/*/SKILL.md` files in installed plugins
- Each file must have YAML frontmatter with `name` field
- Agents automatically have access to all discovered skills
- Skills are injected via SessionStart hook

## Hooks Configuration (Verified)

**Location:** `hooks/hooks.json`

**Format:**
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
    ]
  }
}
```

**Hook types:**
- `SessionStart` — Every session start
- `PreToolUse` — Before specific tools
- `PostAction` — After agent actions
- `PostMessage` — After message

**Variables:**
- `${CLAUDE_PLUGIN_ROOT}` — Path to installed plugin root
- `${CLAUDE_PROJECT_DIR}` — Current project directory

## CLI Commands Reference

### Marketplace Commands
```bash
# Add a marketplace
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add https://example.com/marketplace.json
claude plugin marketplace add /local/path --scope project

# List registered marketplaces
claude plugin marketplace list

# Update marketplace
claude plugin marketplace update patchbook-marketplace

# Remove marketplace
claude plugin marketplace remove patchbook-marketplace
```

### Plugin Commands
```bash
# Install plugin
claude plugin install patchbook@patchbook-marketplace
claude plugin install patchbook               # from default marketplace

# List installed plugins
claude plugin list

# Enable/disable plugins
claude plugin enable patchbook@patchbook-marketplace
claude plugin disable patchbook@patchbook-marketplace

# Update plugins
claude plugin update patchbook@patchbook-marketplace
claude plugin update                          # all plugins

# Validate plugin structure
claude plugin validate /path/to/plugin/
claude plugin validate /path/to/marketplace/
```

## Deployment Checklist: Patchbook

### Before Publishing

- [ ] **Marketplace repo created** — GitHub repo with marketplace.json at root
- [ ] **marketplace.json validated** — Schema matches official format (object, not array)
- [ ] **Plugin source configured** — Either:
  - [ ] `git-subdir` pointing to `plugins/patchbook/` subdirectory
  - [ ] `url` pointing to standalone repo
- [ ] **Plugin structure validated** — Has `.claude-plugin/plugin.json`, `skills/*/SKILL.md`, `hooks/hooks.json`
- [ ] **Plugin.json versioned** — Matches marketplace entry version

### For Users: Installation Flow

1. **Add marketplace (CLI):**
   ```bash
   claude plugin marketplace add yourorg/patchbook-marketplace
   ```

2. **Install plugin (CLI):**
   ```bash
   claude plugin install patchbook@patchbook-marketplace
   ```

3. **Done** — Agents automatically have Patchbook skill on next session

### Manual Registry (No CLI)

If user wants to manually edit `~/.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "patchbook-marketplace": {
      "source": {
        "source": "github",
        "repo": "yourorg/patchbook-marketplace"
      }
    }
  }
}
```

Then the CLI `install` command works without the marketplace `add` step.

## Key Findings

1. **CLI exists and is documented** — `claude plugin marketplace add` is the official way to register custom marketplaces
2. **marketplace.json is an object, not an array** — Top-level structure includes metadata + plugins array
3. **git-subdir is the preferred source type** — Allows plugins to live in marketplace repo
4. **scope system** — Marketplaces can be user-level (default), project-level, or local
5. **No npm package required** — Plugins can be git-based, no npm publishing needed
6. **Fully discoverable** — Claude Code handles auto-discovery of skills and hooks

## References

- Actual marketplace: `/Users/michael/.claude/plugins/marketplaces/claude-plugins-official/`
- Known marketplaces registry: `~/.claude/plugins/known_marketplaces.json`
- Settings: `~/.claude/settings.json` (extraKnownMarketplaces key)
- Installed plugins: `~/.claude/plugins/installed_plugins.json`
- CLI command: `claude plugin marketplace add --help`
