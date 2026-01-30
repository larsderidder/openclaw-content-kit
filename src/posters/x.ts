/**
 * X/Twitter Poster (built-in)
 * Uses bird CLI under the hood
 */

import { execa } from 'execa';
import type { PosterPlugin, PostOptions, PostResult, ValidationResult } from '../types.js';

export const platform = 'x';

export const limits = {
  maxLength: 280,
  maxImages: 4,
  maxVideos: 1,
};

/**
 * Check if content is a thread (contains --- separators)
 */
function isThread(content: string): boolean {
  return content.includes('\n---\n') || content.includes('\n---');
}

/**
 * Split thread content into individual tweets
 */
function splitThread(content: string): string[] {
  return content
    .split(/\n---+\n?/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

export async function validate(content: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const tweets = isThread(content) ? splitThread(content) : [content];
  
  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    if (tweet.length > limits.maxLength) {
      errors.push(`Tweet ${i + 1} exceeds limit (${tweet.length}/${limits.maxLength} chars)`);
    }
    if (tweet.length > 250) {
      warnings.push(`Tweet ${i + 1} is close to limit (${tweet.length}/280)`);
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check if bird CLI is available
 */
async function checkBird(): Promise<boolean> {
  try {
    await execa('bird', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if logged in to X via bird
 */
async function checkAuth(): Promise<boolean> {
  try {
    const result = await execa('bird', ['whoami'], { reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function post(content: string, options: PostOptions): Promise<PostResult> {
  const timestamp = new Date().toISOString();
  
  // Check bird is installed
  if (!await checkBird()) {
    return {
      success: false,
      error: 'bird CLI not found. Install: npm install -g @steipete/bird',
      platform,
      timestamp,
    };
  }
  
  // Check auth
  if (!await checkAuth()) {
    return {
      success: false,
      error: 'Not logged in to X. Run: content-kit auth x',
      platform,
      timestamp,
    };
  }
  
  const tweets = isThread(content) ? splitThread(content) : [content];
  
  if (options.dryRun) {
    return {
      success: true,
      platform,
      timestamp,
      error: `Dry run - would post ${tweets.length} tweet(s)`,
    };
  }
  
  try {
    let lastTweetId: string | undefined;
    
    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];
      
      if (options.verbose) {
        console.log(`Posting tweet ${i + 1}/${tweets.length}...`);
      }
      
      let result;
      if (i === 0) {
        result = await execa('bird', ['tweet', tweet, '--json']);
      } else {
        result = await execa('bird', ['reply', lastTweetId!, tweet, '--json']);
      }
      
      try {
        const data = JSON.parse(result.stdout);
        lastTweetId = data.id || data.rest_id;
      } catch {
        // Continue anyway
      }
    }
    
    return {
      success: true,
      url: lastTweetId ? `https://x.com/i/status/${lastTweetId}` : undefined,
      platform,
      timestamp,
    };
    
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      platform,
      timestamp,
    };
  }
}

/**
 * Auth check - bird manages its own auth via cookies
 */
export async function auth(): Promise<void> {
  console.log('X/Twitter authentication is managed by the bird CLI.');
  console.log('');
  console.log('To set up:');
  console.log('1. Run: bird check');
  console.log('2. Follow the instructions to import Firefox cookies');
  console.log('');
  console.log('See: https://github.com/anthropics/bird');
}

export const xPoster: PosterPlugin = {
  platform,
  limits,
  post,
  validate,
};

export default xPoster;
