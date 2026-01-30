# Content Kit — Agent Instructions

You have access to a content drafting system. Here's how to use it.

## Your permissions

✅ **Can do:**
- Write new drafts to `content/drafts/`
- Read all content (drafts, approved, posted, templates)
- Suggest edits to drafts
- Create new templates

❌ **Cannot do:**
- Write to `content/approved/` or `content/posted/`
- Set `status: approved` in frontmatter
- Set `approved_by` field
- Post content directly to any platform
- Move files between directories

## Creating a draft

1. Create file: `content/drafts/YYYY-MM-DD-<platform>-<slug>.md`
2. Use this frontmatter:

```yaml
---
platform: linkedin    # linkedin | x | medium
title: "Optional"     # For medium/blog posts
status: draft
tags: []              # Optional
---
```

3. Write your content below the frontmatter
4. Tell the human the draft is ready for review

## Platform guidelines

### LinkedIn
- Professional tone
- 1-3 short paragraphs work best
- End with question or CTA for engagement
- Hashtags at the end (3-5 max)

### X (Twitter)
- 280 char limit per tweet (threads supported)
- Use `---` to separate tweets in a thread
- Punchy, direct language
- 1-2 hashtags max

### Medium
- Longer form, 3-10 minute reads
- Use headers (## and ###)
- Include code blocks if technical
- Add a TL;DR at the top

## Templates

Check `content/templates/` for examples. Copy and modify.

## What happens next

1. Human reviews your draft
2. Human moves to `content/approved/` (or edits and approves)
3. Posting script runs (outside your context)
4. Post goes to `content/posted/` with metadata

You'll never see the posting happen — that's intentional for safety.
