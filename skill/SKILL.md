# Content Kit Skill

Safe content automation with cryptographic approval. Draft → Review → Approve → Post.

## Setup

```bash
npm install -g openclaw-content-kit
content-kit init   # Creates content structure
```

**Global config** — to use from anywhere, create `~/.content-kit.json`:
```json
{ "workspaceDir": "/path/to/workspace" }
```

This creates:
- `content/drafts/` — work in progress (one post per file)
- `content/reviewed/` — human reviewed, awaiting your revision
- `content/revised/` — you revised, ready for another look
- `content/approved/` — human-approved, ready to post
- `content/posted/` — archive after posting

## Your Permissions

✅ **Can do:**
- Write to `content/drafts/`
- Read all content directories
- Revise drafts based on feedback
- Run `content-kit list` to see pending content
- **Approve content when user explicitly tells you to** (move to `approved/`)

❌ **Cannot do:**
- Approve content without explicit user instruction
- Post content (posting is automated separately or manual)
- Set `status: approved` without user saying "approve"

## Creating Content

**One post per file.** Each suggestion or draft should be a single post, not a collection.

File naming: `YYYY-MM-DD-<platform>-<slug>.md`

Use frontmatter:

```yaml
---
platform: linkedin    # linkedin | x
title: Optional Title
status: draft
---

Your content here.
```

3. Tell the human: "Draft ready for review: `content-kit review <filename>`"

## The Review Loop

1. You write draft to `content/drafts/`
2. Human runs `content-kit review <file>` → file moves to `reviewed/`
3. You receive feedback, revise, and move to `revised/`
4. Human reviews again (may approve or give more feedback)
5. Human says "approve it" → you approve (see below)
6. Posting happens manually via `content-kit post`

### After Receiving Feedback

When you get review feedback:
1. Read the file from `content/reviewed/`
2. Apply the feedback
3. Move the file to `content/revised/`
4. Confirm what you changed

## Approving Content (Agent)

When the user explicitly says "approve it", "looks good, approve", etc.:

1. Read the draft file
2. Update frontmatter: `status: approved`, add `approved_at: <ISO timestamp>`
3. Move the file from `drafts/` to `approved/`
4. Confirm: "Approved and moved `<filename>` to approved/"

**Only approve when explicitly told.** Never approve proactively.

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
content-kit review <file>           # View content + give feedback
content-kit edit <file>             # Open in editor ($EDITOR or code)
content-kit approve <file>          # Human approves (or tells agent to)
content-kit post <file> --execute   # Post (manual or cron)
```

## Security Model

The security model separates drafting (AI) from posting (automated/human):

- ✅ Agent drafts content
- ✅ Agent revises based on feedback  
- ✅ Agent approves **only when explicitly told by user**
- ❌ Agent cannot post (posting is a separate process)
- ❌ Agent cannot approve without explicit instruction

Posting is handled by cron job or manual CLI — never by the agent directly.

### Platform-specific security

| Platform | Auth Storage | Encrypted? | Password Required? |
|----------|--------------|------------|-------------------|
| LinkedIn | Browser profile | ✅ Yes | ✅ Yes |
| X/Twitter | Firefox tokens | ✅ Yes | ✅ Yes |

Both platforms require password to post. Tokens are extracted from Firefox and encrypted locally.
