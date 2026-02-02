#!/usr/bin/env node
/**
 * OpenClaw Content Pipeline CLI
 */

import { program } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readdirSync, renameSync, readFileSync, unlinkSync, statSync, appendFileSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { join, basename, resolve, dirname } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { parsePost, validatePost } from './parser.js';
import { loadPlugins, getPluginForPlatform } from './plugins.js';
import { getBuiltinPoster, linkedinAuth, xAuth, redditAuth } from './posters/index.js';
import type { PostOptions, PosterPlugin } from './types.js';
import { initSecureSigning, signWithPassword, verifySignature, loadPublicKey, isSecureSigningEnabled, hashContent } from './signing.js';

const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;

function getThreadPath(filePath: string, config: ReturnType<typeof loadConfig>): string {
  return join(config.contentDir, '.content-pipeline', 'threads', `${basename(filePath)}.jsonl`);
}

function readThreadEntries(filePath: string, config: ReturnType<typeof loadConfig>): Array<Record<string, unknown>> {
  const threadPath = getThreadPath(filePath, config);
  if (!existsSync(threadPath)) return [];
  return readFileSync(threadPath, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return { timestamp: '', author: 'unknown', type: 'note', message: line };
      }
    });
}

function appendThreadEntry(
  filePath: string,
  config: ReturnType<typeof loadConfig>,
  entry: { author: string; type: string; message: string }
): void {
  const threadPath = getThreadPath(filePath, config);
  const threadDir = join(config.contentDir, '.content-pipeline', 'threads');
  if (!existsSync(threadDir)) {
    mkdirSync(threadDir, { recursive: true });
  }
  appendFileSync(threadPath, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n');
}

program
  .name('content-pipeline')
  .description('Safe content automation for AI agents')
  .version(VERSION);

// Init command
program
  .command('init <dir>')
  .description('Initialize content structure in target directory')
  .option('--secure', 'Enable cryptographic approval signatures')
  .action(async (dir: string, options: { secure?: boolean }) => {
    const targetDir = resolve(dir);
    const rlConfirm = createInterface({ input: process.stdin, output: process.stdout });
    const confirmed = await new Promise<boolean>((resolve) => {
      rlConfirm.question(
        chalk.yellow(`Initialize content pipeline in:\n  ${targetDir}\nProceed? [y/N] `),
        (answer) => {
          rlConfirm.close();
          resolve(answer.toLowerCase() === 'y');
        },
      );
    });
    
    if (!confirmed) {
      console.log(chalk.gray('Cancelled.'));
      process.exit(0);
    }
    
    const dirs = ['drafts', 'reviewed', 'revised', 'approved', 'posted', 'templates'];
    
    for (const dir of dirs) {
      const fullPath = join(targetDir, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
        console.log(chalk.green(`✓ Created ${fullPath}/`));
      } else {
        console.log(chalk.gray(`  ${fullPath}/ already exists`));
      }
    }
    
    // Create config if missing
    const localConfigPath = join(targetDir, '.content-pipeline.json');
    if (!existsSync(localConfigPath)) {
      // Try to auto-detect clawdbot
      let clawdbotPath: string | undefined;
      try {
        clawdbotPath = execSync('which clawdbot 2>/dev/null || command -v clawdbot 2>/dev/null', { encoding: 'utf8' }).trim();
      } catch {
        // Not in PATH, try common locations
        const commonPaths = [
          join(homedir(), '.nvm/versions/node', process.version, 'bin/clawdbot'),
          '/usr/local/bin/clawdbot',
          '/opt/homebrew/bin/clawdbot',
        ];
        for (const p of commonPaths) {
          if (existsSync(p)) {
            clawdbotPath = p;
            break;
          }
        }
      }
      
      const config: Record<string, unknown> = {
        contentDir: targetDir,
        plugins: [],
        dryRun: true,
        requireApproval: true,
      };
      
      if (clawdbotPath) {
        config.clawdbotPath = clawdbotPath;
        console.log(chalk.green(`✓ Found clawdbot — review feedback will notify your agent`));
      }
      
      writeFileSync(localConfigPath, JSON.stringify(config, null, 2));
      console.log(chalk.green(`✓ Created ${localConfigPath}`));
    }
    
    // Update global config with workspaceDir
    const globalConfigPath = join(homedir(), '.content-pipeline.json');
    const currentDir = targetDir;
    let globalConfig: Record<string, unknown> = {};
    
    if (existsSync(globalConfigPath)) {
      try {
        globalConfig = JSON.parse(readFileSync(globalConfigPath, 'utf8'));
      } catch {
        // Ignore invalid config
      }
    }
    
    if (globalConfig.workspaceDir !== currentDir) {
      globalConfig.workspaceDir = currentDir;
      writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
      console.log(chalk.green(`✓ Set global workspace: ${currentDir}`));
    }
    
    // Create AGENT.md if missing
    const agentPath = join(targetDir, 'AGENT.md');
    if (!existsSync(agentPath)) {
      writeFileSync(agentPath, `# Content Pipeline — Agent Instructions

You have access to a content drafting system with human approval. Here's how to use it.

## Your permissions

✅ **Can do:**
- Write new drafts to \`drafts/\`
- Read all content (drafts, reviewed, revised, approved, posted, templates)
- Revise drafts based on feedback
- Move reviewed files to revised using: \`content-pipeline mv revised <file>\`
- Add notes to the thread: \`content-pipeline thread <file> --from agent\`

❌ **Cannot do:**
- Move files to \`approved/\` or \`posted/\` (human only)
- Set \`status: approved\` in frontmatter
- Set \`approved_by\` field
- Post content directly to any platform

## Creating a draft

1. Create file: \`drafts/YYYY-MM-DD-<platform>-<slug>.md\`
2. Use this frontmatter:

\`\`\`yaml
---
platform: linkedin    # linkedin | x | reddit
title: "Optional"
status: draft
subreddit: programming  # Required for Reddit
---
\`\`\`

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
- Use \`---\` to separate tweets in a thread
- Punchy, direct language
- 1-2 hashtags max

### Reddit (experimental)
- Title from frontmatter or first line
- Markdown supported
- Match subreddit rules and tone

## Templates

Check \`templates/\` for examples. Copy and modify.

## What happens next

1. Human reviews your draft
2. If feedback: you revise and run \`content-pipeline mv revised <file>\`
3. Human reviews again and approves
4. Posting happens manually

You'll never see the posting happen — that's intentional for safety.
`);
      console.log(chalk.green(`✓ Created ${agentPath}`));
    }
    
    const argv = process.argv;
    const hasSecureFlag = argv.includes('--secure') || argv.includes('--no-secure');
    let enableSecure = options.secure;
    if (!hasSecureFlag) {
      const rlSecure = createInterface({ input: process.stdin, output: process.stdout });
      enableSecure = await new Promise<boolean>((resolve) => {
        rlSecure.question(
          chalk.yellow('Enable secure approval signatures? This requires a password to sign approvals and prevents posting if content changes. [y/N] '),
          (answer) => {
            rlSecure.close();
            resolve(answer.toLowerCase() === 'y');
          },
        );
      });
    }
    
    // Set up secure signing if requested
    if (enableSecure) {
      console.log(chalk.blue('\n🔐 Setting up secure approval signatures...'));
      try {
        const { publicKey } = await initSecureSigning(targetDir);
        console.log(chalk.green('✓ Signing key created'));
        console.log(chalk.gray(`  Private key encrypted and stored in ${join(targetDir, '.content-pipeline-key')}`));
        console.log(chalk.gray('  Add .content-pipeline-key to .gitignore!'));
        
        // Update config to require signatures
        const config = JSON.parse(readFileSync(localConfigPath, 'utf8'));
        config.requireSignature = true;
        writeFileSync(localConfigPath, JSON.stringify(config, null, 2));
      } catch (err) {
        console.error(chalk.red(`Failed to set up signing: ${(err as Error).message}`));
        process.exit(1);
      }
    }
    
    console.log(chalk.blue('\n✨ Content pipeline initialized!'));
    console.log(chalk.yellow('Please review and update the templates in ./templates/'));
    console.log('\nBuilt-in platforms: linkedin, x, reddit (experimental)');
    console.log('To authenticate:');
    console.log(chalk.gray('  content-pipeline auth linkedin'));
    console.log(chalk.gray('  content-pipeline auth x'));
    console.log(chalk.gray('  content-pipeline auth reddit'));
    
    if (!options.secure && !isSecureSigningEnabled()) {
      console.log(chalk.yellow('\n💡 Tip: Run with --secure to enable cryptographic approval'));
    }
  });

// Auth command
program
  .command('auth <platform>')
  .description('Authenticate with a platform (linkedin, x, reddit)')
  .action(async (platform: string) => {
    const p = platform.toLowerCase();
    
    switch (p) {
      case 'linkedin':
        await linkedinAuth();
        break;
      case 'x':
      case 'twitter':
        await xAuth();
        break;
      case 'reddit':
        await redditAuth();
        break;
      default:
        console.error(chalk.red(`Unknown platform: ${platform}`));
        console.log(chalk.gray('Available: linkedin, x, reddit'));
        process.exit(1);
    }
  });

// Post command
program
  .command('post <file>')
  .description('Post a content file')
  .option('-n, --dry-run', 'Preview without posting', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (file: string, options: { dryRun: boolean; verbose: boolean }) => {
    const config = loadConfig();
    
    const filePath = resolveContentFile(file, config);
    if (!filePath) {
      console.error(chalk.red(`File not found: ${file}`));
      console.error(chalk.gray(`  Checked: ${file}, drafts/${file}, approved/${file}`));
      process.exit(1);
    }
    
    const post = parsePost(filePath);
    const validation = validatePost(post, config);
    
    // Show validation results
    if (validation.errors.length > 0) {
      console.error(chalk.red('Validation errors:'));
      validation.errors.forEach(e => console.error(chalk.red(`  ✗ ${e}`)));
      process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => console.warn(chalk.yellow(`  ⚠ ${w}`)));
    }
    
    // Verify signature if secure signing is enabled
    if (isSecureSigningEnabled()) {
      const publicKey = loadPublicKey();
      const signature = post.frontmatter.approval_signature as string | undefined;
      const storedHash = post.frontmatter.content_hash as string | undefined;
      
      if (!signature || !storedHash) {
        console.error(chalk.red('❌ Missing approval signature.'));
        console.error(chalk.gray('   This content was not approved with a valid signature.'));
        console.error(chalk.gray('   Run: content-pipeline approve <draft>'));
        process.exit(1);
      }
      
      // Verify the content hasn't been tampered with
      const currentHash = hashContent(post.content);
      if (currentHash !== storedHash) {
        console.error(chalk.red('❌ Content has been modified since approval.'));
        console.error(chalk.gray('   The content hash does not match the signed hash.'));
        console.error(chalk.gray('   Re-approve the content: content-pipeline approve <draft>'));
        process.exit(1);
      }
      
      // Verify the signature
      if (!publicKey || !verifySignature(post.content, signature, publicKey)) {
        console.error(chalk.red('❌ Invalid approval signature.'));
        console.error(chalk.gray('   The signature could not be verified.'));
        process.exit(1);
      }
      
      console.log(chalk.green('✓ Signature verified'));
    }
    
    // Try built-in poster first, then external plugins
    let plugin: PosterPlugin | undefined = getBuiltinPoster(post.frontmatter.platform);
    
    if (!plugin) {
      const plugins = await loadPlugins(config.plugins);
      plugin = getPluginForPlatform(plugins, post.frontmatter.platform);
    }
    
    if (!plugin) {
      console.error(chalk.red(`No poster found for platform: ${post.frontmatter.platform}`));
      console.log(chalk.gray('Built-in platforms: linkedin, x, reddit (experimental)'));
      console.log(chalk.gray('For other platforms, add a plugin to .content-pipeline.json'));
      process.exit(1);
    }
    
    const postOptions: PostOptions = {
      execute: !options.dryRun,
      dryRun: options.dryRun,
      verbose: options.verbose,
      config,
    };
    
    // Show content preview
    console.log(chalk.blue(`\n📤 Post to ${post.frontmatter.platform}:\n`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(post.content);
    console.log(chalk.gray('─'.repeat(50)));
    
    // Dry-run exits here
    if (options.dryRun) {
      console.log(chalk.blue('\n🔸 DRY RUN — no changes made'));
      return;
    }
    
    // Ask for confirmation
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const confirmed = await new Promise<boolean>((resolve) => {
      rl.question(chalk.yellow('\nPost this? [y/N] '), (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
    
    if (!confirmed) {
      console.log(chalk.gray('Cancelled.'));
      return;
    }
    
    console.log(chalk.blue(`\nPosting...`));
    
    try {
      const result = await plugin.post(post.content, postOptions);
      
      if (result.success) {
        console.log(chalk.green(`✓ Posted successfully!`));
        if (result.url) {
          console.log(chalk.gray(`  URL: ${result.url}`));
        }
        
        // Move to posted/
        const postedDir = join(config.contentDir, 'posted');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const newPath = join(postedDir, `${timestamp}-${basename(filePath)}`);
        renameSync(filePath, newPath);
        console.log(chalk.gray(`  Archived to: ${newPath}`));
      } else {
        console.error(chalk.red(`✗ Failed: ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`✗ Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Helper to resolve file path (checks drafts/, approved/, then literal path)
function resolveContentFile(file: string, config: ReturnType<typeof loadConfig>): string | null {
  // Try literal path first
  if (existsSync(file)) return file;
  
  // Try in drafts/
  const inDrafts = join(config.contentDir, 'drafts', file);
  if (existsSync(inDrafts)) return inDrafts;
  
  // Try in reviewed/
  const inReviewed = join(config.contentDir, 'reviewed', file);
  if (existsSync(inReviewed)) return inReviewed;
  
  // Try in revised/
  const inRevised = join(config.contentDir, 'revised', file);
  if (existsSync(inRevised)) return inRevised;
  
  // Try in approved/
  const inApproved = join(config.contentDir, 'approved', file);
  if (existsSync(inApproved)) return inApproved;
  
  return null;
}

// Review command - show content and prompt for feedback
program
  .command('review <file>')
  .description('Review content and provide feedback')
  .action(async (file: string) => {
    const config = loadConfig();
    const resolvedFile = resolveContentFile(file, config);
    
    if (!resolvedFile) {
      console.error(chalk.red(`File not found: ${file}`));
      console.error(chalk.gray(`  Checked: suggestions/, drafts/, approved/`));
      process.exit(1);
    }
    
    const filePath = resolvedFile;
    
    const post = parsePost(filePath);
    
    console.log(chalk.blue(`\n📄 ${basename(filePath)}`));
    console.log(chalk.gray(`Platform: ${post.frontmatter.platform}`));
    console.log(chalk.gray(`Status: ${post.frontmatter.status}`));
    
    const threadEntries = readThreadEntries(filePath, config);
    if (threadEntries.length > 0) {
      console.log(chalk.yellow('\n🧵 Thread:'));
      threadEntries.forEach((entry) => {
        const timestamp = String(entry.timestamp || '');
        const author = String(entry.author || 'unknown');
        const type = String(entry.type || 'note');
        const message = String(entry.message || '');
        console.log(chalk.yellow(`[${timestamp}] ${author} (${type})`));
        console.log(chalk.yellow(message));
        console.log(chalk.yellow('─'.repeat(40)));
      });
    }
    
    console.log(chalk.gray(`\n─`.repeat(50)));
    console.log();
    console.log(post.content);
    console.log();
    console.log(chalk.gray(`─`.repeat(50)));
    console.log();
    
    // Prompt for feedback
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    console.log(chalk.blue('💬 Your feedback (Enter to finish, Ctrl+C to cancel):'));
    
    const lines: string[] = [];
    
    const prompt = () => {
      rl.question('> ', (line) => {
        if (line === '') {
          rl.close();
          return;
        }
        lines.push(line);
        prompt();
      });
    };
    
    await new Promise<void>((resolve) => {
      rl.on('close', async () => {
        const config = loadConfig();
        
        if (lines.length > 0) {
          const feedback = lines.join('\n');
          
          // Save feedback to the draft file using proper frontmatter parsing
          const timestamp = new Date().toISOString();
          const parsed = parsePost(filePath);
          
          // Update frontmatter
          parsed.frontmatter.review_feedback = feedback;
          parsed.frontmatter.review_at = timestamp;
          
          // Rebuild file with updated frontmatter
          const yaml = Object.entries(parsed.frontmatter)
            .map(([key, value]) => {
              if (typeof value === 'string' && value.includes('\n')) {
                return `${key}: |\n  ${value.split('\n').join('\n  ')}`;
              } else if (Array.isArray(value)) {
                return `${key}: [${value.join(', ')}]`;
              } else if (typeof value === 'string') {
                return `${key}: ${value}`;
              }
              return `${key}: ${JSON.stringify(value)}`;
            })
            .join('\n');
          
          const newContent = `---\n${yaml}\n---\n${parsed.content}`;
          writeFileSync(filePath, newContent);
          appendThreadEntry(filePath, config, {
            author: process.env.USER || 'human',
            type: 'feedback',
            message: feedback,
          });
          
          // Move to reviewed/
          const reviewedDir = join(config.contentDir, 'reviewed');
          if (!existsSync(reviewedDir)) {
            mkdirSync(reviewedDir, { recursive: true });
          }
          const reviewedPath = join(reviewedDir, basename(filePath));
          renameSync(filePath, reviewedPath);
          console.log(chalk.green(`\n✓ Feedback saved, moved to reviewed/`));
          
          // Notify Clawdbot if configured
          if (config.clawdbotPath) {
            try {
              const revisedDir = join(config.contentDir, 'revised');
              const revisedPath = join(revisedDir, basename(reviewedPath));
              const message = `📝 Review feedback for ${basename(reviewedPath)}:\n\n"${feedback}"\n\nRead the draft at ${reviewedPath}, apply the feedback, then run:\n\ncontent-pipeline mv revised "${basename(reviewedPath)}"\n\nThen confirm what you changed (you can also add a note with: content-pipeline thread "${basename(reviewedPath)}" --from agent).`;
              
              let cmd = 'agent';
              const args: string[] = [];
              
              if (config.clawdbotTarget) {
                cmd = 'message';
                args.push('send', '--target', config.clawdbotTarget);
              } else {
                // Try to get current session id from clawdbot state
                let sessionId: string | undefined;
                const sessionsPath = join(homedir(), '.clawdbot', 'agents', 'main', 'sessions', 'sessions.json');
                try {
                  if (existsSync(sessionsPath)) {
                    const sessionsData = readFileSync(sessionsPath, 'utf8');
                    const sessions = JSON.parse(sessionsData);
                    sessionId = sessions['agent:main:main']?.sessionId;
                  }
                } catch (e) {
                  console.log(chalk.yellow('⚠ Could not read sessions:'), (e as Error).message);
                }
                
                if (sessionId) {
                  args.push('--session-id', sessionId);
                }
              }
              
              args.push('--message', message);
              
              // Fire and forget - spawn detached process
              const child = spawn(config.clawdbotPath, [cmd, ...args], {
                detached: true,
                stdio: 'ignore',
              });
              child.unref();
              console.log(chalk.green('✓ Notified agent to process feedback'));
            } catch (err) {
              console.log(chalk.yellow('⚠ Could not notify agent:'), (err as Error).message);
            }
          }
        } else {
          // No feedback - ask if they want to approve
          const rl2 = createInterface({ input: process.stdin, output: process.stdout });
          const approved = await new Promise<boolean>((res) => {
            rl2.question(chalk.yellow('\nNo feedback. Approve this content? [y/N] '), (answer) => {
              rl2.close();
              res(answer.toLowerCase() === 'y');
            });
          });
          
          if (approved) {
            const approver = process.env.USER || 'unknown';
            const timestamp = new Date().toISOString();
            const parsed = parsePost(filePath);
            
            // Update frontmatter
            parsed.frontmatter.status = 'approved';
            parsed.frontmatter.approved_by = approver;
            parsed.frontmatter.approved_at = timestamp;
            
            if (isSecureSigningEnabled()) {
              try {
                const signature = await signWithPassword(parsed.content);
                parsed.frontmatter.approval_signature = signature;
                parsed.frontmatter.content_hash = hashContent(parsed.content);
              } catch (err) {
                console.error(chalk.red(`Failed to sign content: ${(err as Error).message}`));
                process.exit(1);
              }
            }
            
            appendThreadEntry(filePath, config, {
              author: approver,
              type: 'approved',
              message: 'Approved',
            });
            
            // Rebuild file with updated frontmatter
            const yaml = Object.entries(parsed.frontmatter)
              .map(([key, value]) => {
                if (typeof value === 'string' && value.includes('\n')) {
                  return `${key}: |\n  ${value.split('\n').join('\n  ')}`;
                } else if (Array.isArray(value)) {
                  return `${key}: [${value.join(', ')}]`;
                } else if (typeof value === 'string') {
                  return `${key}: ${value}`;
                }
                return `${key}: ${JSON.stringify(value)}`;
              })
              .join('\n');
            
            const newContent = `---\n${yaml}\n---\n${parsed.content}`;
            
            // Move to approved/
            const approvedDir = join(config.contentDir, 'approved');
            if (!existsSync(approvedDir)) {
              mkdirSync(approvedDir, { recursive: true });
            }
            const approvedPath = join(approvedDir, basename(filePath));
            writeFileSync(approvedPath, newContent);
            unlinkSync(filePath);
            
            console.log(chalk.green(`✓ Approved by ${approver}`));
            console.log(chalk.gray(`  Moved to: ${approvedPath}`));
          } else {
            console.log(chalk.gray('No changes made.'));
          }
        }
        resolve();
      });
      
      prompt();
    });
  });

// List command
program
  .command('list')
  .description('List pending content')
  .action(() => {
    const config = loadConfig();
    const draftsDir = join(config.contentDir, 'drafts');
    const reviewedDir = join(config.contentDir, 'reviewed');
    const approvedDir = join(config.contentDir, 'approved');
    
    const listFiles = (dir: string) => {
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const stat = statSync(join(dir, f));
          const ago = formatTimeAgo(stat.mtimeMs);
          return { name: f, mtime: stat.mtimeMs, ago };
        })
        .sort((a, b) => b.mtime - a.mtime);
    };
    
    const formatTimeAgo = (ms: number) => {
      const diff = Date.now() - ms;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    };
    
    console.log(chalk.blue('📝 Drafts:'));
    const drafts = listFiles(draftsDir);
    if (drafts.length === 0) {
      console.log(chalk.gray('  (none)'));
    } else {
      drafts.forEach(f => console.log(`  ${f.name} ${chalk.gray(f.ago)}`));
    }
    
    console.log(chalk.blue('\n👀 Reviewed (awaiting revision):'));
    const reviewed = listFiles(reviewedDir);
    if (reviewed.length === 0) {
      console.log(chalk.gray('  (none)'));
    } else {
      reviewed.forEach(f => console.log(`  ${f.name} ${chalk.gray(f.ago)}`));
    }
    
    const revisedDir = join(config.contentDir, 'revised');
    console.log(chalk.blue('\n✏️ Revised (ready for another look):'));
    const revised = listFiles(revisedDir);
    if (revised.length === 0) {
      console.log(chalk.gray('  (none)'));
    } else {
      revised.forEach(f => console.log(`  ${f.name} ${chalk.gray(f.ago)}`));
    }
    
    console.log(chalk.blue('\n✅ Approved:'));
    const approved = listFiles(approvedDir);
    if (approved.length === 0) {
      console.log(chalk.gray('  (none)'));
    } else {
      approved.forEach(f => console.log(`  ${f.name} ${chalk.gray(f.ago)}`));
    }
  });

// Edit command - open file in editor
program
  .command('mv <dest> <file>')
  .description('Move a content file to a new location')
  .action((dest: string, file: string) => {
    const config = loadConfig();
    const resolvedFile = resolveContentFile(file, config);
    
    if (!resolvedFile) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const allowed = ['drafts', 'reviewed', 'revised', 'approved', 'posted', 'templates'];
    let targetPath: string;
    
    if (allowed.includes(dest)) {
      const destDir = join(config.contentDir, dest);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      targetPath = join(destDir, basename(resolvedFile));
    } else {
      const candidate = dest.startsWith('/') ? dest : join(config.contentDir, dest);
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        targetPath = join(candidate, basename(resolvedFile));
      } else {
        const destDir = dirname(candidate);
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        targetPath = candidate;
      }
    }
    
    renameSync(resolvedFile, targetPath);
    console.log(chalk.green(`✓ Moved to ${targetPath}`));
  });

program
  .command('edit <file>')
  .description('Open a content file in your editor')
  .action((file: string) => {
    const config = loadConfig();
    
    // Search in all content directories
    const searchDirs = [
      config.contentDir,
      join(config.contentDir, 'drafts'),
      join(config.contentDir, 'reviewed'),
      join(config.contentDir, 'revised'),
      join(config.contentDir, 'approved'),
      join(config.contentDir, 'posted'),
    ];
    
    let filePath = file;
    if (!existsSync(filePath)) {
      for (const dir of searchDirs) {
        const candidate = join(dir, file);
        if (existsSync(candidate)) {
          filePath = candidate;
          break;
        }
        const candidateBase = join(dir, basename(file));
        if (existsSync(candidateBase)) {
          filePath = candidateBase;
          break;
        }
      }
    }
    
    if (!existsSync(filePath)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    // Determine editor
    const editor = process.env.EDITOR || process.env.VISUAL || 'code';
    
    try {
      execSync(`${editor} "${filePath}"`, { stdio: 'inherit' });
    } catch {
      // Try fallbacks
      const fallbacks = ['code', 'nano', 'vim', 'vi'];
      for (const fb of fallbacks) {
        try {
          execSync(`which ${fb}`, { stdio: 'ignore' });
          execSync(`${fb} "${filePath}"`, { stdio: 'inherit' });
          return;
        } catch {
          continue;
        }
      }
      console.error(chalk.red('No editor found. Set $EDITOR or install code/nano/vim.'));
      process.exit(1);
    }
  });

// Platforms command
program
  .command('thread <file>')
  .description('Add a note to the review thread for a file')
  .option('--from <name>', 'Author name', 'agent')
  .action(async (file: string, options: { from: string }) => {
    const config = loadConfig();
    const resolvedFile = resolveContentFile(file, config);
    
    if (!resolvedFile) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(chalk.blue('💬 Note (Enter to finish, Ctrl+C to cancel):'));
    const lines: string[] = [];
    
    const prompt = () => {
      rl.question('> ', (line) => {
        if (line === '') {
          rl.close();
          return;
        }
        lines.push(line);
        prompt();
      });
    };
    
    await new Promise<void>((resolve) => {
      rl.on('close', () => {
        const message = lines.join('\n').trim();
        if (message.length === 0) {
          console.log(chalk.gray('No note added.'));
          resolve();
          return;
        }
        appendThreadEntry(resolvedFile, config, {
          author: options.from,
          type: 'note',
          message,
        });
        console.log(chalk.green('✓ Note added to thread'));
        resolve();
      });
      prompt();
    });
  });

program
  .command('platforms')
  .description('List available posting platforms')
  .action(async () => {
    const config = loadConfig();
    
    console.log(chalk.blue('Built-in platforms:'));
    console.log(chalk.green('  ✓ linkedin'));
    console.log(chalk.green('  ✓ x (twitter)'));
    console.log(chalk.green('  ✓ reddit (experimental)'));
    
    if (config.plugins.length > 0) {
      console.log(chalk.blue('\nExternal plugins:'));
      for (const name of config.plugins) {
        try {
          const plugin = await import(name);
          console.log(chalk.green(`  ✓ ${name}`), chalk.gray(`(platform: ${plugin.platform})`));
        } catch {
          console.log(chalk.red(`  ✗ ${name}`), chalk.gray('(not installed)'));
        }
      }
    }
  });

program.parse();
