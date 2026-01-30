/**
 * X/Twitter Poster (built-in)
 * Uses bird CLI under the hood
 * 
 * Note: X auth uses Firefox cookies via bird CLI, which we cannot encrypt.
 * When secure signing is enabled, we require password before posting
 * as a speed bump (even though auth itself isn't encrypted).
 */

import { execa } from 'execa';
import { createInterface } from 'readline';
import type { PosterPlugin, PostOptions, PostResult, ValidationResult } from '../types.js';
import { isSecureSigningEnabled, getPassword, encryptXTokens, decryptXTokens, hasEncryptedXTokens } from '../signing.js';

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
async function checkAuth(authToken?: string, ct0?: string): Promise<boolean> {
  try {
    const args = ['whoami'];
    if (authToken && ct0) {
      args.push('--auth-token', authToken, '--ct0', ct0);
    }
    const result = await execa('bird', args, { reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function buildBirdArgs(base: string[], authToken?: string, ct0?: string): string[] {
  const args = [...base];
  if (authToken && ct0) {
    args.push('--auth-token', authToken, '--ct0', ct0);
  }
  return args;
}

async function promptToken(label: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${label}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function post(content: string, options: PostOptions): Promise<PostResult> {
  const timestamp = new Date().toISOString();
  
  // Load encrypted tokens if present
  let authToken: string | undefined;
  let ct0: string | undefined;
  
  if (hasEncryptedXTokens() && !options.dryRun) {
    try {
      const password = await getPassword();
      const tokens = decryptXTokens(password);
      authToken = tokens.authToken;
      ct0 = tokens.ct0;
    } catch (err) {
      return {
        success: false,
        error: `Password required: ${(err as Error).message}`,
        platform,
        timestamp,
      };
    }
  } else if (isSecureSigningEnabled() && !options.dryRun) {
    // If secure signing enabled but no tokens stored, still require password as speed bump
    try {
      await getPassword();
    } catch (err) {
      return {
        success: false,
        error: `Password required: ${(err as Error).message}`,
        platform,
        timestamp,
      };
    }
  }
  
  // Check bird is installed
  if (!await checkBird()) {
    return {
      success: false,
      error: 'bird CLI not found. Install: npm install -g @steipete/bird',
      platform,
      timestamp,
    };
  }
  
  // Check auth (use tokens if available)
  if (!await checkAuth(authToken, ct0)) {
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
        result = await execa('bird', buildBirdArgs(['tweet', tweet, '--json'], authToken, ct0));
      } else {
        result = await execa('bird', buildBirdArgs(['reply', lastTweetId!, tweet, '--json'], authToken, ct0));
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
 * Auth setup for X: store auth_token + ct0 encrypted
 */
export async function auth(): Promise<void> {
  console.log('X/Twitter authentication for content-kit uses encrypted tokens.');
  console.log('You will provide auth_token and ct0 (from your browser cookies).');
  console.log('');
  console.log('How to get them:');
  console.log('1. Run: bird check (to confirm you are logged in)');
  console.log('2. Use your browser cookie viewer to copy cookies: auth_token and ct0');
  console.log('');
  
  const authToken = await promptToken('auth_token');
  const ct0 = await promptToken('ct0');
  
  if (!authToken || !ct0) {
    console.log('Both auth_token and ct0 are required.');
    return;
  }
  
  try {
    const password = await getPassword();
    encryptXTokens(authToken, ct0, password);
    console.log('✓ Tokens encrypted and saved to .content-kit/x-tokens.enc');
  } catch (err) {
    console.error(`⚠ Failed to encrypt tokens: ${(err as Error).message}`);
  }
}

export const xPoster: PosterPlugin = {
  platform,
  limits,
  post,
  validate,
};

export default xPoster;
