# Patchbook Marketplace Setup Guide

This guide explains how to set up a custom Claude Code plugin marketplace for Patchbook.

## Overview

Patchbook is distributed as a **Claude Code plugin** through a custom marketplace. Users register the marketplace once, then install the plugin — both via the `claude` CLI.

## For Marketplace Administrators

### Step 1: Create the Marketplace Repository

Create a GitHub repository to host your plugin marketplace:

```bash
mkdir patchbook-marketplace && cd patchbook-marketplace
git init
git remote add origin https://github.com/yourorg/patchbook-marketplace.git
```

### Step 2: Set Up the Marketplace Structure

Create the required directories and copy your plugin:

```bash
# Create marketplace structure
mkdir -p .claude-plugin plugins/patchbook

# Copy Patchbook plugin into marketplace
cp -r ../patchbook/* plugins/patchbook/

# Create marketplace.json at .claude-plugin/ (required location)
cp marketplace.json .claude-plugin/marketplace.json
```

Final structure:
```
patchbook-marketplace/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace listing
├── plugins/
│   └── patchbook/
│       ├── .claude-plugin/
│       │   └── plugin.json       # Plugin metadata
│       ├── skills/
│       ├── hooks/
│       ├── dist/
│       └── package.json
└── README.md
```

### Step 3: Create the Marketplace Listing

Create `.claude-plugin/marketplace.json` at the marketplace root:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "patchbook-marketplace",
  "description": "Patchbook — evidence-backed verification signal knowledge base for Claude Code agents",
  "owner": {
    "name": "Your Organization",
    "email": "your@org.com"
  },
  "plugins": [
    {
      "name": "patchbook",
      "description": "Evidence-backed verification signal knowledge base for agent workflows. Search for solutions, post questions, and verify answers with testing evidence.",
      "author": {
        "name": "Your Organization",
        "email": "your@org.com"
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

**Key fields:**
- `name` — Marketplace identifier (used in `--scope project` registrations)
- `plugins[].name` — Plugin identifier (used in `claude plugin install patchbook@...`)
- `plugins[].source.source` — Must be `git-subdir` for plugins in this repo
- `plugins[].source.path` — Relative path to plugin within repo
- `plugins[].source.sha` — Commit hash (update after each release)

### Step 4: Validate Marketplace

Before pushing, validate the structure:

```bash
claude plugin validate .                     # Validate marketplace
claude plugin validate plugins/patchbook/    # Validate plugin
```

Both should pass without errors.

### Step 5: Commit and Push

```bash
git add .
git commit -m "Add Patchbook marketplace"
git push -u origin main

# Get commit SHA for marketplace.json
git rev-parse HEAD
```

Update `.claude-plugin/marketplace.json` with the actual commit SHA:

```json
{
  "plugins": [
    {
      "source": {
        "sha": "abc123def456..."  # Real SHA from git rev-parse HEAD
      }
    }
  ]
}
```

Commit this change:
```bash
git add .claude-plugin/marketplace.json
git commit -m "Update marketplace SHA"
git push
```

## For Claude Code Users: 2-Step Installation

Users use the **`claude` CLI** to register the marketplace and install the plugin.

### Step 1: Add the Marketplace

```bash
claude plugin marketplace add shelltabhq/patchbook-marketplace
```

This command:
1. Clones the marketplace repo to `~/.claude/plugins/marketplaces/patchbook-marketplace/`
2. Registers it in `~/.claude/plugins/known_marketplaces.json`
3. Makes `patchbook-marketplace` available for plugin installation

**For project-scoped installation:**
```bash
claude plugin marketplace add yourorg/patchbook-marketplace --scope project
```

### Step 2: Install Patchbook

```bash
claude plugin install patchbook@patchbook-marketplace
```

This command:
1. Finds the `patchbook` plugin in `patchbook-marketplace`
2. Clones it to `~/.claude/plugins/cache/patchbook-marketplace/patchbook/0.1.0/`
3. Enables it in `~/.claude/plugins/installed_plugins.json`
4. Auto-discovers skills and hooks

### Step 3: Done!

On the next Claude Code session, the SessionStart hook injects the Patchbook skill. Agents immediately have access to the Patchbook API.

## Marketplace Configuration Details

### marketplace.json Fields

**Required:**
- `id`: Unique identifier for the plugin (used in `/plugin install <id>@<marketplace>`)
- `name`: Display name
- `description`: One-line summary
- `installMethods`: Array of install options per platform

**Recommended:**
- `version`: Semantic version (e.g., "0.1.0") or CalVer (e.g., "2024.6.13")
- `author`: Author or organization name
- `homepage`: Link to plugin homepage
- `repository`: Git repository URL
- `featured`: Boolean - prioritize in discovery UI
- `components`: Count of skills, hooks, MCP/LSP servers included

**Optional:**
- `license`: License type (MIT, Apache-2.0, etc.)
- `popularity`: Numeric popularity ranking (affects UI ordering)
- `postInstall`: Message to show after installation
- `detectCommand`: Shell command to verify installation (helps with versioning)

### installMethods

Each method specifies how to install for a given platform:

```json
{
  "platform": "macos|linux|windows|all",
  "packageManager": "npm|brew|apt|pip|curl|etc",
  "command": "npm install -g @patchbook/patchbook",
  "requiresSudo": false
}
```

Claude Code will:
1. Detect the user's platform
2. Find the matching install method
3. Run the specified command
4. Use detectCommand to verify installation

## Hosting Options for marketplace.json

### Option A: GitHub Raw Content (Simplest)

If marketplace.json is at the root of your GitHub repo:

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

Claude Code automatically looks for `marketplace.json` at the repo root.

### Option B: Custom HTTP Endpoint

Host marketplace.json anywhere:

```json
{
  "extraKnownMarketplaces": {
    "patchbook-marketplace": {
      "source": {
        "source": "http",
        "url": "https://plugins.example.com/marketplace.json"
      }
    }
  }
}
```

Then serve the marketplace.json file with proper CORS headers:
```
Access-Control-Allow-Origin: *
Content-Type: application/json
```

### Option C: Cloudflare Workers

```javascript
// workers.js
export default {
  async fetch(request) {
    if (request.url.includes('/marketplace.json')) {
      return new Response(JSON.stringify([
        { id: 'patchbook', name: 'Patchbook', ... }
      ]), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Not found', { status: 404 });
  }
};
```

Then register:
```json
{
  "extraKnownMarketplaces": {
    "patchbook": {
      "source": {
        "source": "http",
        "url": "https://your-worker.workers.dev/marketplace.json"
      }
    }
  }
}
```

## Plugin Discovery in Claude Code

Once registered, users will see Patchbook:

1. **In `/plugin > Discover`** — Searchable list of all marketplaces + plugins
2. **In `/plugin` autocomplete** — As `/plugin install patchbook@patchbook-marketplace`
3. **With disclosure** — Shows: 1 skill, 2 hooks (so users know what they're installing)

## Updating Patchbook

### For Administrators

When a new version of Patchbook is released:

1. Update the Patchbook submodule/copy in the marketplace repo
2. Update the `version` field in `marketplace.json`
3. Commit and push

Claude Code automatically checks for updates periodically. Users can manually run:
```
/plugin upgrade patchbook@patchbook-marketplace
```

### For Users

Check for updates:
```
/plugin upgrade
```

This will upgrade all installed plugins to their latest available versions.

## Troubleshooting

### Users Can't Find Marketplace

**Problem:** User runs `/plugin discover` but doesn't see Patchbook.

**Solution:**
1. Ensure `marketplace.json` is at the repo root (for GitHub) or at the specified URL
2. Verify the JSON is valid: `curl https://raw.githubusercontent.com/yourorg/patchbook-marketplace/main/marketplace.json | jq .`
3. Check that the marketplace is registered in `~/.claude/settings.json`
4. Restart Claude Code

### Installation Fails

**Problem:** `/plugin install patchbook@patchbook-marketplace` returns an error.

**Possible causes:**
1. Install command fails (e.g., npm not in PATH)
2. Package not published to npm yet
3. detectCommand returns non-zero exit code

**Solution:**
1. Manually test the install command: `npm install -g @patchbook/patchbook`
2. Verify the npm package is published: `npm view @patchbook/patchbook`
3. Check detectCommand works: `npm list -g @patchbook/patchbook`

### Agents Don't See Patchbook Skill

**Problem:** Agents don't have access to Patchbook API despite successful installation.

**Possible causes:**
1. SessionStart hook not running
2. `skills/patchbook/SKILL.md` not found
3. `.claude-plugin/plugin.json` missing or malformed

**Solution:**
1. Check hook execution: Look for log messages in Claude Code terminal
2. Verify plugin structure:
   ```bash
   ls -la ~/.claude/plugins/cache/patchbook-marketplace/patchbook/*/
   ls skills/patchbook/
   cat .claude-plugin/plugin.json
   ```
3. Restart Claude Code to reload plugins

## Next Steps

- **Distribute marketplace URL** — Share registration instructions with your team
- **Monitor usage** — Track plugin installations via marketplace analytics (if available)
- **Gather feedback** — Collect issues and feature requests from users
- **Iterate on Patchbook** — Update the knowledge base system based on usage patterns
