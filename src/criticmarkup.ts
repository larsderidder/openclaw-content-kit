/**
 * CriticMarkup Parser
 * 
 * Handles inline review comments and suggestions.
 * Syntax: https://criticmarkup.com/
 * 
 * {>> comment <<}           - Comment
 * {-- deletion --}          - Deletion
 * {++ addition ++}          - Addition  
 * {~~ old ~> new ~~}        - Substitution
 * {== highlight ==}         - Highlight
 */

export interface CriticMarkup {
  type: 'comment' | 'deletion' | 'addition' | 'substitution' | 'highlight';
  content: string;
  replacement?: string;  // For substitutions
  position: {
    start: number;
    end: number;
    line: number;
  };
}

export interface ParsedCriticMarkup {
  /** Clean content with all markup removed (ready for posting) */
  clean: string;
  /** Content with suggestions accepted */
  accepted: string;
  /** Content with suggestions rejected (original preserved) */
  rejected: string;
  /** All markup items found */
  items: CriticMarkup[];
  /** Just the comments */
  comments: CriticMarkup[];
  /** Has any markup? */
  hasMarkup: boolean;
}

// Regex patterns for CriticMarkup
const PATTERNS = {
  comment: /\{>>\s*([\s\S]*?)\s*<<\}/g,
  deletion: /\{--\s*([\s\S]*?)\s*--\}/g,
  addition: /\{\+\+\s*([\s\S]*?)\s*\+\+\}/g,
  substitution: /\{~~\s*([\s\S]*?)\s*~>\s*([\s\S]*?)\s*~~\}/g,
  highlight: /\{==\s*([\s\S]*?)\s*==\}/g,
};

/**
 * Parse CriticMarkup from content
 */
export function parseCriticMarkup(content: string): ParsedCriticMarkup {
  const items: CriticMarkup[] = [];
  
  // Find all comments
  let match;
  const commentPattern = new RegExp(PATTERNS.comment.source, 'g');
  while ((match = commentPattern.exec(content)) !== null) {
    items.push({
      type: 'comment',
      content: match[1].trim(),
      position: {
        start: match.index,
        end: match.index + match[0].length,
        line: getLineNumber(content, match.index),
      },
    });
  }
  
  // Find deletions
  const deletionPattern = new RegExp(PATTERNS.deletion.source, 'g');
  while ((match = deletionPattern.exec(content)) !== null) {
    items.push({
      type: 'deletion',
      content: match[1].trim(),
      position: {
        start: match.index,
        end: match.index + match[0].length,
        line: getLineNumber(content, match.index),
      },
    });
  }
  
  // Find additions
  const additionPattern = new RegExp(PATTERNS.addition.source, 'g');
  while ((match = additionPattern.exec(content)) !== null) {
    items.push({
      type: 'addition',
      content: match[1].trim(),
      position: {
        start: match.index,
        end: match.index + match[0].length,
        line: getLineNumber(content, match.index),
      },
    });
  }
  
  // Find substitutions
  const subPattern = new RegExp(PATTERNS.substitution.source, 'g');
  while ((match = subPattern.exec(content)) !== null) {
    items.push({
      type: 'substitution',
      content: match[1].trim(),
      replacement: match[2].trim(),
      position: {
        start: match.index,
        end: match.index + match[0].length,
        line: getLineNumber(content, match.index),
      },
    });
  }
  
  // Find highlights
  const highlightPattern = new RegExp(PATTERNS.highlight.source, 'g');
  while ((match = highlightPattern.exec(content)) !== null) {
    items.push({
      type: 'highlight',
      content: match[1].trim(),
      position: {
        start: match.index,
        end: match.index + match[0].length,
        line: getLineNumber(content, match.index),
      },
    });
  }
  
  // Sort by position
  items.sort((a, b) => a.position.start - b.position.start);
  
  return {
    clean: stripCriticMarkup(content),
    accepted: acceptSuggestions(content),
    rejected: rejectSuggestions(content),
    items,
    comments: items.filter(i => i.type === 'comment'),
    hasMarkup: items.length > 0,
  };
}

/**
 * Strip all CriticMarkup, keeping accepted changes
 * (additions kept, deletions removed, substitutions use new text)
 */
export function stripCriticMarkup(content: string): string {
  return content
    // Remove comments entirely
    .replace(PATTERNS.comment, '')
    // Remove deletion markers AND the deleted text
    .replace(PATTERNS.deletion, '')
    // Keep additions (remove markers)
    .replace(PATTERNS.addition, '$1')
    // Use new text for substitutions
    .replace(PATTERNS.substitution, '$2')
    // Keep highlighted text (remove markers)
    .replace(PATTERNS.highlight, '$1')
    // Clean up multiple spaces
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Accept all suggestions (same as stripCriticMarkup)
 */
export function acceptSuggestions(content: string): string {
  return stripCriticMarkup(content);
}

/**
 * Reject all suggestions (keep original text)
 */
export function rejectSuggestions(content: string): string {
  return content
    // Remove comments
    .replace(PATTERNS.comment, '')
    // Keep deleted text (remove markers)
    .replace(PATTERNS.deletion, '$1')
    // Remove additions entirely
    .replace(PATTERNS.addition, '')
    // Use old text for substitutions
    .replace(PATTERNS.substitution, '$1')
    // Keep highlighted text (remove markers)
    .replace(PATTERNS.highlight, '$1')
    // Clean up
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Extract just the discussion section (if present)
 */
export function extractDiscussion(content: string): string | null {
  const discussionMatch = content.match(/^---\s*\n## Discussion\s*\n([\s\S]*)$/m);
  if (discussionMatch) {
    return discussionMatch[1].trim();
  }
  return null;
}

/**
 * Remove discussion section from content
 */
export function stripDiscussion(content: string): string {
  return content.replace(/\n---\s*\n## Discussion[\s\S]*$/, '').trim();
}

/**
 * Add a discussion comment
 */
export function addDiscussionComment(
  content: string,
  author: string,
  comment: string
): string {
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const entry = `**@${author}** (${timestamp}): ${comment}`;
  
  const existingDiscussion = extractDiscussion(content);
  if (existingDiscussion) {
    // Add to existing discussion
    return content.replace(
      /(\n---\s*\n## Discussion\s*\n[\s\S]*)$/,
      `$1\n${entry}`
    );
  } else {
    // Create new discussion section
    return `${content.trim()}\n\n---\n## Discussion\n\n${entry}`;
  }
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}
