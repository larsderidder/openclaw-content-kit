# Content Kit Skill

Use when drafting content for social media and blog posts.

## Setup

The content kit should be initialized in the workspace:
```bash
content-kit init
```

This creates:
- `content/drafts/` — where you write
- `content/approved/` — human approves here
- `content/posted/` — archive after posting

## Your Permissions

✅ **Can do:**
- Write to `content/drafts/`
- Read all content directories
- Revise drafts based on feedback

❌ **Cannot do:**
- Write to `content/approved/` or `content/posted/`
- Set `status: approved` or `approved_by`
- Post content directly

## Creating a Draft

1. Create file: `content/drafts/YYYY-MM-DD-<platform>-<slug>.md`
2. Use frontmatter:

```yaml
---
platform: linkedin    # linkedin | x
status: draft
---

Your content here.
```

3. Tell the human the draft is ready

## The Review Loop

1. Human reviews your draft
2. Human gives feedback ("make it punchier", "add a CTA", etc.)
3. You revise the draft
4. Repeat until human is happy
5. Human approves → moves to `content/approved/`
6. Human posts with CLI

This is just chatting. No special syntax needed.

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

## Workflow

```
You draft → Human reviews → Human gives feedback → You revise → 
Human approves → Human posts
```

You never see the posting — that's intentional for safety.
