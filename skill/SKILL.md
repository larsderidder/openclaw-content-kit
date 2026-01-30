# Content Kit Skill

Safe content automation with cryptographic approval. Draft → Review → Approve → Post.

## Setup

```bash
npm install -g openclaw-content-kit
content-kit init --secure   # Creates encrypted signing key
```

This creates:
- `content/drafts/` — where you write
- `content/approved/` — human approves here (with signature)
- `content/posted/` — archive after posting
- `.content-kit-key` — encrypted signing key (password protected)

## Your Permissions

✅ **Can do:**
- Write to `content/drafts/`
- Read all content directories
- Revise drafts based on feedback
- Run `content-kit list` to see pending content

❌ **Cannot do:**
- Approve content (requires password you don't have)
- Write to `content/approved/` or `content/posted/`
- Post content (auth tokens are encrypted)
- Set `status: approved` or add signatures

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

1. Human runs `content-kit review <file>` 
2. Human types feedback, it's saved to the file
3. You receive the feedback and revise the draft
4. Repeat until human is happy
5. Human runs `content-kit approve <file>` (requires password)
6. Human runs `content-kit post <file> --execute`

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
content-kit review <file>           # Human reviews + gives feedback
content-kit approve <file>          # Human approves (needs password)
content-kit post <file> --execute   # Human posts
```

## Security Model

This kit uses cryptographic signatures to prevent AI agents from:
- ❌ Approving their own content
- ❌ Moving files to bypass approval
- ❌ Using saved auth tokens directly

Human password is required for approval and posting.

### Platform-specific security

| Platform | Auth Storage | Encrypted? | Password Required? |
|----------|--------------|------------|-------------------|
| LinkedIn | Browser profile | ✅ Yes | ✅ Yes |
| X/Twitter | Browser profile | ✅ Yes | ✅ Yes |

X auth now uses an encrypted Playwright browser profile (no manual cookies).
