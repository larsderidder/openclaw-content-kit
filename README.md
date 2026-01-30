# openclaw-content-kit

Safe content automation for AI agents. Draft → Review → Revise → Approve → Post.

**The pattern**: Your AI drafts content. You review and give feedback. They revise. You approve. You post.

## Why?

AI agents shouldn't post directly to social media. Too risky. But they're great at drafting.

This kit enforces human-in-the-loop:
- **Agent** → writes drafts, revises based on feedback, approves when told
- **Human** → reviews, gives feedback, says "approve it", posts

## Install

```bash
npm install -g openclaw-content-kit
```

Includes built-in posters for **LinkedIn** and **X/Twitter**.

## Global Config

To use `content-kit` from anywhere, create `~/.content-kit.json`:

```json
{
  "workspaceDir": "/path/to/your/workspace"
}
```

Now all commands work from any directory.

## Quick Start

```bash
# 1. Initialize in your workspace
content-kit init

# 2. Authenticate (once per platform)
content-kit auth linkedin    # Opens browser for login
content-kit auth x           # Shows bird CLI setup

# 3. Your agent writes to content/drafts/

# 4. Review (moves to reviewed/, notifies agent)
content-kit review content/drafts/my-post.md

# 5. Agent revises and moves to revised/

# 6. Happy? Tell your agent: "approve it"

# 7. Post manually
content-kit post content/approved/my-post.md --execute
```

## Content Folders

```
content/
├── drafts/        # Agent writes here
├── reviewed/      # You reviewed, awaiting agent revision
├── revised/       # Agent revised, ready for another look
├── approved/      # You approved, ready to post
└── posted/        # Archive after posting
```

## The Workflow

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌──────────┐     ┌────────┐
│ drafts/ │ ──▶ │ reviewed/│ ──▶ │ revised/│ ──▶ │ approved/│ ──▶ │ posted/│
└─────────┘     └──────────┘     └─────────┘     └──────────┘     └────────┘
   agent          human            agent           human           human
   writes         reviews          revises         approves        posts
```

## Post Format

```yaml
---
platform: linkedin          # linkedin | x
status: draft               # draft | approved | posted
---

Your post content here.
```

## CLI Reference

```bash
# Setup
content-kit init              # Initialize content structure
content-kit auth <platform>   # Authenticate (linkedin, x)

# Workflow
content-kit list              # Show all folders with timestamps
content-kit review <file>     # Review, give feedback, moves to reviewed/
content-kit edit <file>       # Open in $EDITOR
content-kit approve <file>    # Move to approved/
content-kit post <file>       # Post (prompts for password)
content-kit post <file> -n    # Dry-run (--dry-run)
```

## Platforms

### LinkedIn
- Playwright browser automation
- Session encrypted in `~/.content-kit/`

### X (Twitter)
- Uses [bird CLI](https://github.com/steipete/bird)
- Tokens extracted from Firefox, encrypted with password

## For AI Agents

- ✅ Write to `content/drafts/`
- ✅ Move reviewed files to `content/revised/`
- ✅ Move to `content/approved/` when told
- ❌ Cannot post

## License

MIT — [Lars de Ridder](https://larsderidder.com)
