/**
 * X/Twitter Poster (built-in)
 * Uses Playwright browser automation with encrypted profile support
 */

import { chromium, type BrowserContext } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { randomBytes } from 'crypto';
import type { PosterPlugin, PostOptions, PostResult, ValidationResult } from '../types.js';
import { isSecureSigningEnabled, encryptDirectory, decryptDirectory, getPassword } from '../signing.js';

export const platform = 'x';

export const limits = {
  maxLength: 280,
  maxImages: 4,
  maxVideos: 1,
};

const DEFAULT_PROFILE_DIR = join(homedir(), '.content-kit', 'x-profile');

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

export async function post(content: string, options: PostOptions): Promise<PostResult> {
  const timestamp = new Date().toISOString();
  const encryptedProfile = join(homedir(), '.content-kit', 'x-profile.enc');
  const isEncrypted = existsSync(encryptedProfile);
  
  let profileDir = options.profileDir || DEFAULT_PROFILE_DIR;
  let tempDir: string | null = null;
  
  // If encrypted profile exists, decrypt to temp dir
  if (isEncrypted && isSecureSigningEnabled()) {
    try {
      const password = await getPassword();
      tempDir = join(tmpdir(), `content-kit-${randomBytes(8).toString('hex')}`);
      mkdirSync(tempDir, { recursive: true });
      decryptDirectory(encryptedProfile, tempDir, password);
      profileDir = join(tempDir, 'x-profile');
    } catch (err) {
      return {
        success: false,
        error: `Failed to decrypt profile: ${(err as Error).message}`,
        platform,
        timestamp,
      };
    }
  } else if (!existsSync(profileDir)) {
    return {
      success: false,
      error: 'Not logged in. Run: content-kit auth x',
      platform,
      timestamp,
    };
  }
  
  let context: BrowserContext | null = null;
  
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 800 },
    });
    
    const page = await context.newPage();
    await page.goto('https://x.com/home', { waitUntil: 'networkidle' });
    
    // Check if logged in
    const onLogin = page.url().includes('/login') || await page.locator('input[name="text"]').count() > 0;
    if (onLogin) {
      return {
        success: false,
        error: 'Not logged in. Run: content-kit auth x',
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
    
    // Start composing
    const composer = page.locator('div[role="textbox"][data-testid="tweetTextarea_0"]');
    await composer.click();
    
    let lastTweetUrl: string | undefined;
    
    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];
      await composer.fill(tweet);
      
      // Post
      const postBtn = page.locator('div[data-testid="tweetButtonInline"]').first();
      await postBtn.click();
      
      // Wait briefly for post to complete
      await page.waitForTimeout(1500);
      
      // For threads, click "Add another tweet" if available
      if (i < tweets.length - 1) {
        const addAnother = page.locator('div[aria-label="Add another Tweet"]');
        if (await addAnother.count()) {
          await addAnother.first().click();
        }
      }
    }
    
    // Best effort: capture last tweet URL from browser address bar (not reliable)
    lastTweetUrl = page.url().includes('/status/') ? page.url() : undefined;
    
    return {
      success: true,
      url: lastTweetUrl,
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
  } finally {
    if (context) await context.close();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Interactive auth - opens browser for user to log in
 */
export async function auth(profileDir?: string): Promise<void> {
  const dir = profileDir || DEFAULT_PROFILE_DIR;
  const encryptedProfile = join(homedir(), '.content-kit', 'x-profile.enc');
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  console.log('Opening browser for X login...');
  
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  
  const page = await context.newPage();
  await page.goto('https://x.com/login');
  
  console.log('\n👆 Please log in to X in the browser window.');
  console.log('   Once logged in, close the browser to save your session.\n');
  
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });
  
  // If secure signing is enabled, encrypt the profile
  if (isSecureSigningEnabled()) {
    console.log('🔐 Encrypting profile...');
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const password = await getPassword();
        encryptDirectory(dir, encryptedProfile, password);
        rmSync(dir, { recursive: true, force: true });
        console.log('✓ Profile encrypted. Unencrypted profile removed.');
        break;
      } catch (err) {
        attempts++;
        if (attempts < maxAttempts) {
          console.error(`⚠ ${(err as Error).message}. Try again (${maxAttempts - attempts} attempts left).`);
        } else {
          console.error(`⚠ Failed to encrypt profile after ${maxAttempts} attempts.`);
          console.log('  Profile saved unencrypted.');
        }
      }
    }
  } else {
    console.log('✓ Session saved. You can now post without logging in again.');
    console.log('💡 Tip: Run "content-kit init --secure" to encrypt credentials.');
  }
}

export const xPoster: PosterPlugin = {
  platform,
  limits,
  post,
  validate,
};

export default xPoster;
