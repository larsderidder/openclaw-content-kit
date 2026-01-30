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
- `content/suggestions/` — ideas and outlines (can be promoted to draft)
- `content/drafts/` — content ready for review
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

## Creating a Draft

1. Create file: `content/drafts/YYYY-MM-DD-<platform>-<slug>.md`
2. Use frontmatter:

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

1. Human runs `content-kit review <file>` or chats directly with you
2. You receive feedback and revise the draft
3. Repeat until human is happy
4. Human says "approve it" → you approve (see below)
5. Posting happens via cron job or manual `content-kit post`

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
content-kit list                    # Show suggestions, drafts, and approved
content-kit draft <file>            # Promote suggestion to draft
content-kit review <file>           # Human reviews + gives feedback
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
| X/Twitter | Browser cookies via bird | ❌ No (WIP) | ✅ (approval only) |

**X/Twitter limitation (WIP):**
Currently X auth is handled by the bird CLI and uses browser cookies. This is not encrypted by content-kit. We tried Playwright + token encryption, but X blocks automated login. Work-in-progress to improve this.
