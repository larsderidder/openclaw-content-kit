# openclaw-content-kit

Safe content automation for AI agents. Draft → Approve → Post.

**The pattern**: Your AI drafts content. You review and approve. You post (outside agent context).

## Why?

AI agents shouldn't post directly to social media. Too risky. But they're great at drafting.

This kit creates a clear separation:
- **Agent** → writes drafts, suggests edits, can't approve or post
- **Human** → reviews, approves, triggers posting
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
content-kit auth linkedin    # Opens browser for login
content-kit auth x           # Shows bird CLI setup

# 3. Your agent drafts content to content/drafts/

# 4. Review and approve
content-kit review content/drafts/my-post.md
content-kit approve content/drafts/my-post.md --by lars

# 5. Post
content-kit post content/approved/my-post.md           # Dry-run
content-kit post content/approved/my-post.md --execute # Actually post
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Your workspace                                              │
│                                                             │
│  content/drafts/      ← Agent writes here                   │
│  content/approved/    ← You approve here                    │
│  content/posted/      ← Auto-archived after posting         │
│                                                             │
│  .content-kit.json    ← Config                              │
│  AGENT.md             ← Instructions for your AI            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ content-kit CLI                                             │
│                                                             │
│  Built-in:  linkedin, x (twitter)                           │
│  Plugins:   custom platforms via .content-kit.json          │
└─────────────────────────────────────────────────────────────┘
```

## Post Format

```yaml
---
platform: linkedin          # linkedin | x
title: "Optional title"
status: draft               # draft | approved | posted
tags: []
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
content-kit review <file>     # Review with CriticMarkup details
content-kit approve <file>    # Approve and move to approved/
content-kit post <file>       # Dry-run post
content-kit post <file> -x    # Actually post (--execute)

# Review options
content-kit review <file> --accept  # Show with suggestions accepted
content-kit review <file> --reject  # Show with suggestions rejected
content-kit approve <file> --by <name>  # Specify approver
content-kit approve <file> --accept     # Accept CriticMarkup before approving
```

## CriticMarkup (Review Comments)

Use inline markup for feedback — automatically stripped before posting:

```markdown
This is {--awkward--}{++clearer++} phrasing.

{>> @lars: not sure about this tone <<}

{~~ good ~> great ~~} choice of words.
```

| Syntax | Purpose |
|--------|---------|
| `{>> comment <<}` | Inline comment |
| `{-- text --}` | Suggest deletion |
| `{++ text ++}` | Suggest addition |
| `{~~ old ~> new ~~}` | Suggest replacement |
| `{== text ==}` | Highlight for attention |

## Discussion Threads

Add a discussion section at the end of drafts:

```markdown
---
## Discussion

**@agent** (2025-01-30 13:00): First draft ready
**@lars** (2025-01-30 13:10): Too formal, make it punchier
**@agent** (2025-01-30 13:15): Revised — check intro
```

## Built-in Platforms

### LinkedIn
- Uses Playwright browser automation
- Run `content-kit auth linkedin` to log in (opens browser)
- Session persists in `~/.content-kit/linkedin-profile/`

### X (Twitter)
- Uses [bird CLI](https://github.com/anthropics/bird) under the hood
- Run `content-kit auth x` for setup instructions
- Requires Firefox cookies export

## Custom Plugins

For platforms not built-in, add external plugins:

```json
// .content-kit.json
{
  "plugins": ["@example/poster-medium"]
}
```

Plugin interface:

```typescript
export const platform = 'medium';

export async function post(content: string, options: PostOptions): Promise<PostResult> {
  return { success: true, url: 'https://...' };
}

export async function validate(content: string): Promise<ValidationResult> {
  return { valid: true, errors: [], warnings: [] };
}
```

## For AI Agents

The `AGENT.md` file (created by `init`) tells your agent:

- ✅ Write to `content/drafts/`
- ✅ Read all content
- ✅ Use CriticMarkup for suggestions
- ❌ Cannot write to `approved/` or `posted/`
- ❌ Cannot set `status: approved`
- ❌ Cannot post directly

A skill file is included at `skill/SKILL.md` for agents that use skill discovery.

## Security Model

- **Dry-run by default** — always preview before posting
- **Approval required** — agent can't approve its own drafts
- **Credentials local** — browser profiles stored in `~/.content-kit/`
- **Human in the loop** — you run the post command, not the agent

## License

MIT — [Lars de Ridder](https://larsderidder.com) / [XIThing](https://xithing.io)
