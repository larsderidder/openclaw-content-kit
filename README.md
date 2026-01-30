# openclaw-content-kit

Safe content automation for AI agents. Draft → Review → Approve → Post.

**The pattern**: Your AI drafts content. You review and chat about changes. You approve and post.

## Why?

AI agents shouldn't post directly to social media. Too risky. But they're great at drafting.

This kit creates a clear separation:
- **Agent** → writes drafts, revises based on feedback
- **Human** → reviews, chats for changes, approves, posts
- **CLI** → handles actual posting (runs when you say so)

## Install

```bash
npm install -g openclaw-content-kit
```

Includes built-in posters for **LinkedIn** and **X/Twitter**. No extra packages needed.

## Quick Start

```bash
# 1. Initialize in your workspace
content-kit init

# 2. Authenticate (once per platform)
content-kit auth linkedin    # Opens browser for login (encrypted profile)
content-kit auth x           # Shows bird CLI setup (browser cookies)

# 3. Your agent drafts content to content/drafts/

# 4. Review the draft
content-kit review content/drafts/my-post.md

# 5. Happy? Approve it
content-kit approve content/drafts/my-post.md

# 6. Post it
content-kit post content/approved/my-post.md --execute
```

## The Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent     │     │    You      │     │    CLI      │
│   drafts    │ ──▶ │   review    │ ──▶ │   posts     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │    "make it       │
       │◀── punchier" ─────│
       │                   │
       │    revised        │
       │──▶ draft ─────────│
       │                   │
       │              approve
       │                   │
```

**The review loop is just chatting.** Read the draft, tell your agent what to change, they revise. Repeat until you're happy.

## Post Format

```yaml
---
platform: linkedin          # linkedin | x
status: draft               # draft | approved | posted
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
content-kit list              # List drafts and approved content
content-kit review <file>     # Review draft, write feedback
content-kit approve <file>    # Approve and move to approved/
content-kit post <file>       # Dry-run post
content-kit post <file> -x    # Actually post (--execute)
```

## Built-in Platforms

### LinkedIn
- Uses Playwright browser automation
- Run `content-kit auth linkedin` to log in (opens browser)
- Session persists in `~/.content-kit/linkedin-profile/`

### X (Twitter)
- Uses [bird CLI](https://github.com/steipete/bird) under the hood (`npm install -g @steipete/bird`)
- Run `content-kit auth x` for setup instructions
- Requires browser cookies (Chrome/Firefox)
- **Limitation (WIP):** cookies are managed by the browser and not encrypted by content-kit

## For AI Agents

The `AGENT.md` file (created by `init`) tells your agent:

- ✅ Write to `content/drafts/`
- ✅ Read all content
- ✅ Revise based on feedback
- ❌ Cannot approve its own work
- ❌ Cannot post directly

## Security Model

- **Dry-run by default** — always preview before posting
- **Approval required** — agent can't approve its own drafts
- **LinkedIn auth encrypted** — browser profile is encrypted with approval password
- **X auth WIP** — bird uses browser cookies; encryption not yet available
- **Credentials local** — browser profiles stored in `~/.content-kit/`
- **Human in the loop** — you run the post command, not the agent

## License

MIT — [Lars de Ridder](https://larsderidder.com)
