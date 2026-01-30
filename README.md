# openclaw-content-kit

Safe content automation for AI agents. Suggest → Draft → Review → Approve → Post.

**The pattern**: Your AI suggests and drafts content. You review and chat about changes. You approve. Posting happens automatically or manually.

## Why?

AI agents shouldn't post directly to social media. Too risky. But they're great at drafting.

This kit creates a clear separation:
- **Agent** → suggests ideas, writes drafts, revises based on feedback, approves when told
- **Human** → reviews, chats for changes, says "approve it"
- **Posting** → automated (cron) or manual CLI

## Install

```bash
npm install -g openclaw-content-kit
```

Includes built-in posters for **LinkedIn** and **X/Twitter**. No extra packages needed.

## Global Config

To use `content-kit` from anywhere, create `~/.content-kit.json`:

```json
{
  "workspaceDir": "/path/to/your/workspace"
}
```

Now `content-kit list`, `content-kit review`, etc. work from any directory.

## Quick Start

```bash
# 1. Initialize in your workspace
content-kit init

# 2. Authenticate (once per platform)
content-kit auth linkedin    # Opens browser for login (encrypted profile)
content-kit auth x           # Shows bird CLI setup (browser cookies)

# 3. Your agent writes suggestions to content/suggestions/

# 4. Promote to draft
content-kit draft content/suggestions/my-idea.md

# 5. Review and iterate
content-kit review content/drafts/my-post.md
# Chat with your agent, they revise

# 6. Tell your agent: "approve it"
# Agent moves to approved/

# 7. Post (manual or cron)
content-kit post content/approved/my-post.md --execute
```

## The Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent     │     │    You      │     │   Agent     │     │  Cron/CLI   │
│  suggests   │ ──▶ │  promote    │ ──▶ │  approves   │ ──▶ │   posts     │
│  + drafts   │     │  + review   │     │ (when told) │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │    "make it       │
       │◀── punchier" ─────│
       │                   │
       │    revised        │
       │──▶ draft ─────────│
       │                   │
       │         "approve it"
       │◀──────────────────│
```

## Content Folders

```
content/
├── suggestions/   # Ideas, outlines, content queues
├── drafts/        # Ready for review
├── approved/      # Human-approved, ready to post
└── posted/        # Archive after posting
```

## Post Format

```yaml
---
platform: linkedin          # linkedin | x
status: draft               # suggestion | draft | approved | posted
---

Your post content here.

For X/Twitter threads, use --- to separate tweets.
```

## CLI Reference

```bash
# Setup
content-kit init              # Initialize content structure
content-kit auth <platform>   # Authenticate (linkedin, x)
content-kit platforms         # List available platforms

# Workflow
content-kit list              # List suggestions, drafts, approved
content-kit review <file>     # View content, write feedback
content-kit edit <file>       # Open in editor ($EDITOR or code)
content-kit draft <file>      # Promote suggestion to draft
content-kit approve <file>    # Approve and move to approved/
content-kit post <file>       # Dry-run post
content-kit post <file> -x    # Actually post (--execute)
```

## Built-in Platforms

### LinkedIn
- Uses Playwright browser automation
- Run `content-kit auth linkedin` to log in (opens browser)
- Session encrypted in `~/.content-kit/`

### X (Twitter)
- Uses [bird CLI](https://github.com/steipete/bird) under the hood
- Run `content-kit auth x` for setup instructions
- Uses browser cookies (Chrome/Firefox)
- **Limitation (WIP):** cookies not encrypted by content-kit

## For AI Agents

Your agent can:

- ✅ Write to `content/suggestions/` and `content/drafts/`
- ✅ Read all content directories
- ✅ Revise drafts based on feedback
- ✅ Approve content **when explicitly told by user**
- ❌ Cannot approve without user instruction
- ❌ Cannot post (posting is separate)

## Security Model

- **Dry-run by default** — always preview before posting
- **Human approval required** — agent only approves when told
- **Posting separated** — cron job or manual, never by agent
- **LinkedIn auth encrypted** — browser profile encrypted with password
- **X auth WIP** — bird uses browser cookies
- **Credentials local** — stored in `~/.content-kit/`

## Automated Posting

Set up a cron job to post approved content:

```bash
# Post one approved item every day at 9am
0 9 * * * cd /path/to/workspace && content-kit post content/approved/*.md --execute --first
```

## License

MIT — [Lars de Ridder](https://larsderidder.com)
