/**
 * Post parser - reads markdown files with frontmatter
 */

import matter from 'gray-matter';
import { readFileSync } from 'fs';
import type { ParsedPost, PostFrontmatter, ValidationResult, ContentKitConfig } from './types.js';
import { parseCriticMarkup, stripDiscussion, type ParsedCriticMarkup } from './criticmarkup.js';

export interface ParsedPostWithMarkup extends ParsedPost {
  /** Raw content including CriticMarkup */
  rawContent: string;
  /** CriticMarkup analysis */
  markup: ParsedCriticMarkup;
  /** Discussion thread (if any) */
  discussion: string | null;
}

export function parsePost(filePath: string): ParsedPostWithMarkup {
  const fileContent = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  
  // Strip discussion section before analyzing markup
  const contentWithoutDiscussion = stripDiscussion(content);
  const markup = parseCriticMarkup(contentWithoutDiscussion);
  
  // Extract discussion
  const discussionMatch = content.match(/\n---\s*\n## Discussion\s*\n([\s\S]*)$/);
  const discussion = discussionMatch ? discussionMatch[1].trim() : null;
  
  return {
    frontmatter: data as PostFrontmatter,
    content: markup.clean, // Clean content ready for posting
    rawContent: content.trim(), // Original with markup
    markup,
    discussion,
    filePath,
  };
}

export function validatePost(
  post: ParsedPost,
  config: ContentKitConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required frontmatter
  if (!post.frontmatter.platform) {
    errors.push('Missing required field: platform');
  }
  
  if (!post.frontmatter.status) {
    errors.push('Missing required field: status');
  }
  
  // Check approval if required
  if (config.requireApproval) {
    if (post.frontmatter.status === 'approved' && !post.frontmatter[config.approvalField]) {
      errors.push(`Approval required: missing '${config.approvalField}' field`);
    }
  }
  
  // Check content exists
  if (!post.content || post.content.length === 0) {
    errors.push('Post content is empty');
  }
  
  // Warnings
  if (post.frontmatter.status === 'draft') {
    warnings.push('Post is still in draft status');
  }
  
  if (post.frontmatter.status === 'posted') {
    warnings.push('Post has already been posted');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
