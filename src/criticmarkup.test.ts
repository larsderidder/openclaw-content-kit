/**
 * CriticMarkup Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseCriticMarkup,
  stripCriticMarkup,
  acceptSuggestions,
  rejectSuggestions,
  extractDiscussion,
  stripDiscussion,
  addDiscussionComment,
} from './criticmarkup.js';

describe('parseCriticMarkup', () => {
  it('should parse comments', () => {
    const content = 'Hello {>> this is a comment <<} world';
    const result = parseCriticMarkup(content);

    expect(result.hasMarkup).toBe(true);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].type).toBe('comment');
    expect(result.comments[0].content).toBe('this is a comment');
  });

  it('should parse deletions', () => {
    const content = 'Hello {-- remove this --} world';
    const result = parseCriticMarkup(content);

    expect(result.hasMarkup).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('deletion');
    expect(result.items[0].content).toBe('remove this');
  });

  it('should parse additions', () => {
    const content = 'Hello {++ add this ++} world';
    const result = parseCriticMarkup(content);

    expect(result.hasMarkup).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('addition');
    expect(result.items[0].content).toBe('add this');
  });

  it('should parse substitutions', () => {
    const content = 'Hello {~~ old text ~> new text ~~} world';
    const result = parseCriticMarkup(content);

    expect(result.hasMarkup).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('substitution');
    expect(result.items[0].content).toBe('old text');
    expect(result.items[0].replacement).toBe('new text');
  });

  it('should parse highlights', () => {
    const content = 'Hello {== important ==} world';
    const result = parseCriticMarkup(content);

    expect(result.hasMarkup).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('highlight');
    expect(result.items[0].content).toBe('important');
  });

  it('should handle multiple markup types', () => {
    const content = '{>> comment <<} Hello {-- del --}{++ add ++} world {~~ a ~> b ~~}';
    const result = parseCriticMarkup(content);

    expect(result.items).toHaveLength(4);
    expect(result.comments).toHaveLength(1);
  });

  it('should track positions correctly', () => {
    const content = 'Line one\n{>> comment <<}\nLine three';
    const result = parseCriticMarkup(content);

    expect(result.comments[0].position.line).toBe(2);
    expect(result.comments[0].position.start).toBe(9);
  });

  it('should return hasMarkup false for plain text', () => {
    const content = 'Just plain text without any markup';
    const result = parseCriticMarkup(content);

    expect(result.hasMarkup).toBe(false);
    expect(result.items).toHaveLength(0);
  });

  it('should handle multiline content in markup', () => {
    const content = '{>> this is\na multiline\ncomment <<}';
    const result = parseCriticMarkup(content);

    expect(result.comments[0].content).toBe('this is\na multiline\ncomment');
  });

  it('should sort items by position', () => {
    const content = '{++ first ++} middle {-- second --} end {== third ==}';
    const result = parseCriticMarkup(content);

    expect(result.items[0].type).toBe('addition');
    expect(result.items[1].type).toBe('deletion');
    expect(result.items[2].type).toBe('highlight');
  });
});

describe('stripCriticMarkup', () => {
  it('should remove comments entirely', () => {
    const content = 'Hello {>> comment <<} world';
    expect(stripCriticMarkup(content)).toBe('Hello world');
  });

  it('should remove deletions and their content', () => {
    const content = 'Hello {-- remove this --} world';
    expect(stripCriticMarkup(content)).toBe('Hello world');
  });

  it('should keep additions without markers', () => {
    const content = 'Hello {++ beautiful ++} world';
    expect(stripCriticMarkup(content)).toBe('Hello beautiful world');
  });

  it('should use new text for substitutions', () => {
    const content = 'Hello {~~ old ~> new ~~} world';
    expect(stripCriticMarkup(content)).toBe('Hello new world');
  });

  it('should keep highlighted text without markers', () => {
    const content = 'Hello {== important ==} world';
    expect(stripCriticMarkup(content)).toBe('Hello important world');
  });

  it('should handle complex mixed markup', () => {
    const content = '{>> note <<} The {-- bad --}{++ good ++} result is {~~ wrong ~> correct ~~}';
    expect(stripCriticMarkup(content)).toBe('The good result is correct');
  });

  it('should collapse multiple spaces', () => {
    const content = 'Hello {-- extra --}   world';
    expect(stripCriticMarkup(content)).toBe('Hello world');
  });
});

describe('acceptSuggestions', () => {
  it('should be equivalent to stripCriticMarkup', () => {
    const content = '{-- old --}{++ new ++} text {~~ a ~> b ~~}';
    expect(acceptSuggestions(content)).toBe(stripCriticMarkup(content));
  });
});

describe('rejectSuggestions', () => {
  it('should keep deleted text', () => {
    const content = 'Hello {-- keep this --} world';
    expect(rejectSuggestions(content)).toBe('Hello keep this world');
  });

  it('should remove additions', () => {
    const content = 'Hello {++ remove this ++} world';
    expect(rejectSuggestions(content)).toBe('Hello world');
  });

  it('should use old text for substitutions', () => {
    const content = 'Hello {~~ keep ~> discard ~~} world';
    expect(rejectSuggestions(content)).toBe('Hello keep world');
  });

  it('should still remove comments', () => {
    const content = 'Hello {>> comment <<} world';
    expect(rejectSuggestions(content)).toBe('Hello world');
  });

  it('should keep highlighted text', () => {
    const content = 'Hello {== important ==} world';
    expect(rejectSuggestions(content)).toBe('Hello important world');
  });

  it('should handle complex rejection scenario', () => {
    const content = 'The {-- original --}{++ replacement ++} text was {~~ old ~> new ~~}';
    expect(rejectSuggestions(content)).toBe('The original text was old');
  });
});

describe('extractDiscussion', () => {
  it('should extract discussion section', () => {
    const content = `Main content here

---
## Discussion

**@alice** (2024-01-15 10:30): First comment
**@bob** (2024-01-15 11:00): Reply`;

    const discussion = extractDiscussion(content);
    expect(discussion).toContain('@alice');
    expect(discussion).toContain('@bob');
  });

  it('should return null when no discussion', () => {
    const content = 'Just regular content without discussion';
    expect(extractDiscussion(content)).toBeNull();
  });
});

describe('stripDiscussion', () => {
  it('should remove discussion section', () => {
    const content = `Main content here

---
## Discussion

Some discussion`;

    expect(stripDiscussion(content)).toBe('Main content here');
  });

  it('should return content unchanged if no discussion', () => {
    const content = 'Just regular content';
    expect(stripDiscussion(content)).toBe('Just regular content');
  });
});

describe('addDiscussionComment', () => {
  it('should create new discussion section', () => {
    const content = 'Main content';
    const result = addDiscussionComment(content, 'alice', 'My comment');

    expect(result).toContain('Main content');
    expect(result).toContain('---\n## Discussion');
    expect(result).toContain('**@alice**');
    expect(result).toContain('My comment');
  });

  it('should append to existing discussion', () => {
    const content = `Main content

---
## Discussion

**@alice** (2024-01-15 10:30): First`;

    const result = addDiscussionComment(content, 'bob', 'Second');

    expect(result).toContain('@alice');
    expect(result).toContain('@bob');
    expect(result).toContain('Second');
  });

  it('should include timestamp in comment', () => {
    const content = 'Main content';
    const result = addDiscussionComment(content, 'alice', 'Comment');

    // Should have a timestamp like (2024-01-15 10:30)
    expect(result).toMatch(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)/);
  });
});
