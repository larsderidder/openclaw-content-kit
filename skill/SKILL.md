# Content Kit Skill

Safe content automation with human-in-the-loop approval. Draft → Review → Approve → Post.

## Setup

```bash
npm install -g openclaw-content-kit
content-kit init . # Creates folders + global config (in current directory)
```

For cryptographic approval signatures (password-protected):
```bash
content-kit init . --secure
```

This creates:
- `drafts/` — work in progress (one post per file)
- `reviewed/` — human reviewed, awaiting your revision
- `revised/` — you revised, ready for another look
- `approved/` — human-approved, ready to post
- `posted/` — archive after posting
- `templates/` — review and customize before use

## Your Permissions

✅ **Can do:**
- Write to `drafts/`
- Read all content directories
- Revise drafts based on feedback
- Move revised files to `revised/`
- Run `content-kit list` to see pending content

❌ **Cannot do:**
- Move files to `approved/` (only the human can approve)
- Post content
- Set `status: approved`

## Creating Content

**One post per file.** Each suggestion or draft should be a single post, not a collection.

File naming: `YYYY-MM-DD-<platform>-<slug>.md`

Use frontmatter:

```yaml
---
platform: linkedin    # linkedin | x | reddit (experimental)
title: Optional Title
status: draft
subreddit: programming  # Required for Reddit
---

Your content here.
```

Tell the human: "Draft ready for review: `content-kit review <filename>`"

## The Review Loop

```
drafts/ → reviewed/ → revised/ → approved/ → posted/
              ↑          │
              └──────────┘
               more feedback
```

1. You write draft to `drafts/`
2. Human runs `content-kit review <file>`:
   - **With feedback** → file moves to `reviewed/`, you get notified
   - **No feedback** → human is asked "Approve?" → moves to `approved/`
3. If feedback: you revise and move to `revised/`
4. Human reviews from `revised/`:
   - More feedback → back to `reviewed/`
   - Approve → moves to `approved/`
5. Posting happens manually via `content-kit post`

### After Receiving Feedback

When you get review feedback:
1. Read the file from `reviewed/`
2. Apply the feedback
3. Move the file to `revised/`
4. Confirm what you changed

## Platform Guidelines

### LinkedIn
- Professional but human
- Idiomatic language (Dutch for NL audiences, don't be stiff)
- 1-3 paragraphs ideal
- End with question or CTA
- 3-5 hashtags at end

### X (Twitter)
- 280 chars per tweet (unless paid account)
- Punchy, direct
- 1-2 hashtags max
- Use threads sparingly

## Commands Reference

```bash
content-kit list                    # Show drafts and approved
content-kit review <file>           # Review: feedback OR approve
content-kit edit <file>             # Open in editor ($EDITOR or code)
content-kit post <file>             # Post (prompts for confirmation)
content-kit post <file> --dry-run   # Preview without posting
```

## Security Model

The security model separates drafting (AI) from approval/posting (human):

- ✅ Agent drafts content
- ✅ Agent revises based on feedback  
- ❌ Agent cannot approve (human approves via `content-kit review`)
- ❌ Agent cannot post

Posting is handled manually via CLI — never by the agent directly.

### Platform-specific security

| Platform | Auth Storage | Encrypted? | Password Required? |
|----------|--------------|------------|-------------------|
| LinkedIn | Browser profile | ✅ Yes | ✅ Yes |
| X/Twitter | Firefox tokens | ✅ Yes | ✅ Yes |

Both platforms require password to post. Tokens are extracted from Firefox and encrypted locally.
