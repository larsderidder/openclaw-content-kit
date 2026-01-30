# Content Kit Skill

Use when drafting, reviewing, or managing content for social media and blog posts.

## Setup

The content kit should be initialized in your workspace:
```bash
content-kit init
```

This creates:
- `content/drafts/` — where you write
- `content/approved/` — human moves content here
- `content/posted/` — archive after posting
- `.content-kit.json` — config

## Your Permissions

✅ **Can do:**
- Write to `content/drafts/`
- Read all content directories
- Add CriticMarkup comments for review
- Suggest edits using CriticMarkup

❌ **Cannot do:**
- Write to `content/approved/` or `content/posted/`
- Set `status: approved` or `approved_by`
- Post content directly

## Creating a Draft

1. Create file: `content/drafts/YYYY-MM-DD-<platform>-<slug>.md`
2. Use frontmatter:

```yaml
---
platform: linkedin    # linkedin | x | medium
title: "Optional"
status: draft
tags: []
---

Your content here.
```

3. Tell the human the draft is ready

## CriticMarkup (for review/feedback)

Use these markers for inline feedback — they're stripped before posting:

| Syntax | Purpose | Example |
|--------|---------|---------|
| `{>> comment <<}` | Inline comment | `{>> not sure about this tone <<}` |
| `{-- text --}` | Suggest deletion | `{--really--} important` |
| `{++ text ++}` | Suggest addition | `{++very++} important` |
| `{~~ old ~> new ~~}` | Suggest replacement | `{~~good~~>great~~}` |
| `{== text ==}` | Highlight | `{==this part==}{>> needs work <<}` |

## Discussion Thread

Add a discussion section at the end of drafts for back-and-forth:

```markdown
---
## Discussion

**@haro** (2025-01-30 13:00): First draft ready for review
**@lars** (2025-01-30 13:10): Tone is too formal, make it punchier
**@haro** (2025-01-30 13:15): Revised — check the intro
```

## Platform Guidelines

### LinkedIn
- Professional but human
- 1-3 paragraphs ideal
- End with question or CTA
- 3-5 hashtags at end

### X (Twitter)
- 280 chars per tweet
- Use `---` separator for threads
- Punchy, direct
- 1-2 hashtags max

### Medium
- Long-form (3-10 min read)
- Use headers (##, ###)
- TL;DR at top
- Code blocks for technical content

## Workflow

```
You draft → Human reviews → Human approves (moves to approved/) → Script posts
```

You never see the posting — that's intentional for safety.
