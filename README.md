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

## Quick Start

```bash
# 1. Initialize in your workspace (creates folders + global config)
content-kit init

# 2. Authenticate (once per platform)
content-kit auth linkedin    # Opens browser for login
content-kit auth x           # Extracts tokens from Firefox

# 3. Your agent writes to content/drafts/

# 4. Review: give feedback OR approve
content-kit review content/drafts/my-post.md
# → Enter feedback → moves to reviewed/, notifies agent
# → No feedback → asks "Approve?" → moves to approved/

# 5. Agent revises (if feedback given), you review again

# 6. Post when approved
content-kit post content/approved/my-post.md
```

`content-kit init` automatically sets up `~/.content-kit.json` with your workspace path, so commands work from any directory.

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
                     ▲                │
                     └────────────────┘
                      more feedback
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
content-kit init              # Initialize content structure + global config
content-kit init --secure     # Also enable cryptographic approval signatures
content-kit auth <platform>   # Authenticate (linkedin, x)

# Workflow
content-kit list              # Show all folders with timestamps
content-kit review <file>     # Review: give feedback OR approve (if no feedback)
content-kit edit <file>       # Open in $EDITOR
content-kit post <file>       # Post (shows preview, asks confirmation)
content-kit post <file> -n    # Dry-run (--dry-run)
```

## Platforms

### LinkedIn
- Playwright browser automation
- Session encrypted in `~/.content-kit/`

### X (Twitter)
- Uses [bird CLI](https://github.com/steipete/bird)
- Tokens extracted from Firefox, encrypted with password

## Secure Mode (Cryptographic Approval)

For extra assurance that content was human-approved, use `--secure`:

```bash
content-kit init --secure
```

This creates an Ed25519 signing keypair:
- **Private key** — encrypted with your password, stored in `.content-kit-key`
- **Public key** — embedded in the key file for verification

**How it works:**
1. When you approve content, you enter your password
2. The content is signed with your private key
3. When posting, the signature is verified
4. If content was modified after approval, posting is blocked

**Why use it?**
Because you don't want to give the credentials to your social media to your AI agent. You can still automate posting
in a boring deterministic process of course.

**Files:**
- `.content-kit-key` — your encrypted keypair (add to `.gitignore`!)
- Approved posts get `approval_signature` and `content_hash` in frontmatter

## For AI Agents

- ✅ Write to `content/drafts/`
- ✅ Move reviewed files to `content/revised/`
- ✅ Move to `content/approved/` when told
- ❌ Cannot post

## Clawdbot Integration

If you're using [Clawdbot](https://github.com/clawdbot/clawdbot), content-kit automatically notifies your agent when you give review feedback.

**How it works:**
1. `content-kit init` auto-detects Clawdbot and saves its path to `.content-kit.json`
2. When you run `content-kit review <file>` and enter feedback
3. The feedback is saved to the draft file
4. Your agent receives a message with the feedback and instructions to revise

**The agent sees:**
```
📝 Review feedback for 2025-01-30-linkedin-post.md:

"Make the intro punchier, less formal"

Read the draft at content/reviewed/..., apply the feedback, 
and save the revised version. Then confirm what you changed.
```

This creates a seamless review loop — you give feedback in terminal, agent responds in chat.

**Manual config** (if auto-detect fails):
```json
{
  "clawdbotPath": "/path/to/clawdbot",
  "clawdbotTarget": "telegram:123456789"
}
```

## License

MIT — [Lars de Ridder](https://larsderidder.com)
