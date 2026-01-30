#!/usr/bin/env node
/**
 * OpenClaw Content Kit CLI
 */

import { program } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readdirSync, renameSync, readFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { parsePost, validatePost } from './parser.js';
import { loadPlugins, getPluginForPlatform } from './plugins.js';
import { getBuiltinPoster, linkedinAuth, xAuth } from './posters/index.js';
import type { PostOptions, PosterPlugin } from './types.js';
import { initSecureSigning, signWithPassword, verifySignature, loadPublicKey, isSecureSigningEnabled, hashContent } from './signing.js';

const VERSION = '0.1.0';

program
  .name('content-kit')
  .description('Safe content automation for AI agents')
  .version(VERSION);

// Init command
program
  .command('init')
  .description('Initialize content structure in current directory')
  .option('--secure', 'Enable cryptographic approval signatures')
  .action(async (options: { secure?: boolean }) => {
    const dirs = ['content/drafts', 'content/approved', 'content/posted', 'content/templates'];
    
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(chalk.green(`✓ Created ${dir}/`));
      } else {
        console.log(chalk.gray(`  ${dir}/ already exists`));
      }
    }
    
    // Create config if missing
    if (!existsSync('.content-kit.json')) {
      writeFileSync('.content-kit.json', JSON.stringify({
        contentDir: './content',
        plugins: [],
        dryRun: true,
        requireApproval: true
      }, null, 2));
      console.log(chalk.green('✓ Created .content-kit.json'));
    }
    
    // Create AGENT.md if missing
    if (!existsSync('AGENT.md')) {
      writeFileSync('AGENT.md', `# Content Kit — Agent Instructions

## Your permissions

✅ Write to \`content/drafts/\`
✅ Read all content
❌ Write to \`content/approved/\` or \`content/posted/\`
❌ Set \`status: approved\` or \`approved_by\`

## Creating a draft

1. Create file: \`content/drafts/YYYY-MM-DD-<platform>-<slug>.md\`
2. Use frontmatter: platform, title, status: draft
3. Tell the human the draft is ready

## Revising

When the human gives feedback, revise the draft and let them know.
Keep iterating until they're happy, then they'll approve it.
`);
      console.log(chalk.green('✓ Created AGENT.md'));
    }
    
    // Set up secure signing if requested
    if (options.secure) {
      console.log(chalk.blue('\n🔐 Setting up secure approval signatures...'));
      try {
        const { publicKey } = await initSecureSigning();
        console.log(chalk.green('✓ Signing key created'));
        console.log(chalk.gray('  Private key encrypted and stored in .content-kit-key'));
        console.log(chalk.gray('  Add .content-kit-key to .gitignore!'));
        
        // Update config to require signatures
        const configPath = '.content-kit.json';
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        config.requireSignature = true;
        writeFileSync(configPath, JSON.stringify(config, null, 2));
      } catch (err) {
        console.error(chalk.red(`Failed to set up signing: ${(err as Error).message}`));
        process.exit(1);
      }
    }
    
    console.log(chalk.blue('\n✨ Content kit initialized!'));
    console.log('\nBuilt-in platforms: linkedin, x');
    console.log('To authenticate:');
    console.log(chalk.gray('  content-kit auth linkedin'));
    console.log(chalk.gray('  content-kit auth x'));
    
    if (!options.secure && !isSecureSigningEnabled()) {
      console.log(chalk.yellow('\n💡 Tip: Run with --secure to enable cryptographic approval'));
    }
  });

// Auth command
program
  .command('auth <platform>')
  .description('Authenticate with a platform (linkedin, x)')
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
      default:
        console.error(chalk.red(`Unknown platform: ${platform}`));
        console.log(chalk.gray('Available: linkedin, x'));
        process.exit(1);
    }
  });

// Post command
program
  .command('post <file>')
  .description('Post a content file')
  .option('-x, --execute', 'Actually post (default is dry-run)', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (file: string, options: { execute: boolean; verbose: boolean }) => {
    const config = loadConfig();
    
    if (!existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const post = parsePost(file);
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
        console.error(chalk.gray('   Run: content-kit approve <draft>'));
        process.exit(1);
      }
      
      // Verify the content hasn't been tampered with
      const currentHash = hashContent(post.content);
      if (currentHash !== storedHash) {
        console.error(chalk.red('❌ Content has been modified since approval.'));
        console.error(chalk.gray('   The content hash does not match the signed hash.'));
        console.error(chalk.gray('   Re-approve the content: content-kit approve <draft>'));
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
      console.log(chalk.gray('Built-in platforms: linkedin, x'));
      console.log(chalk.gray('For other platforms, add a plugin to .content-kit.json'));
      process.exit(1);
    }
    
    const postOptions: PostOptions = {
      execute: options.execute,
      dryRun: !options.execute,
      verbose: options.verbose,
      config,
    };
    
    // Dry-run or execute
    if (!options.execute) {
      console.log(chalk.blue('🔸 DRY RUN — use --execute to actually post\n'));
      console.log(chalk.gray('Platform:'), post.frontmatter.platform);
      console.log(chalk.gray('\nContent:\n'));
      console.log(post.content);
      return;
    }
    
    console.log(chalk.blue(`Posting to ${post.frontmatter.platform}...`));
    
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
        const newPath = join(postedDir, `${timestamp}-${basename(file)}`);
        renameSync(file, newPath);
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

// Approve command
program
  .command('approve <file>')
  .description('Approve a draft (moves to approved/ and updates frontmatter)')
  .option('--by <name>', 'Approver name (default: current user)')
  .option('--force', 'Skip interactive check (use with caution)')
  .action(async (file: string, options: { by?: string; force?: boolean }) => {
    const config = loadConfig();
    
    // Require interactive TTY to prevent AI/script approval
    if (!process.stdin.isTTY && !options.force) {
      console.error(chalk.red('❌ Approval requires an interactive terminal.'));
      console.error(chalk.gray('   This prevents AI agents from approving content.'));
      console.error(chalk.gray('   Use --force to override (not recommended).'));
      process.exit(1);
    }
    
    if (!existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const post = parsePost(file);
    
    if (post.frontmatter.status === 'approved') {
      console.log(chalk.yellow('Already approved'));
      process.exit(0);
    }
    
    if (post.frontmatter.status === 'posted') {
      console.error(chalk.red('Cannot approve: already posted'));
      process.exit(1);
    }
    
    // Read original file
    const fileContent = readFileSync(file, 'utf-8');
    
    // Update frontmatter
    const approver = options.by || process.env.USER || 'unknown';
    const timestamp = new Date().toISOString();
    
    let newContent = fileContent
      .replace(/^status:\s*draft\s*$/m, 'status: approved')
      .replace(/^(status:\s*approved)\s*$/m, `$1\napproved_by: "${approver}"\napproved_at: "${timestamp}"`);
    
    // Sign content if secure signing is enabled
    let signature: string | undefined;
    if (isSecureSigningEnabled()) {
      console.log(chalk.blue('🔐 Signing approval...'));
      try {
        // Sign the content (not the frontmatter, just the body)
        signature = await signWithPassword(post.content);
        const contentHash = hashContent(post.content);
        
        // Add signature to frontmatter
        newContent = newContent.replace(
          /^(approved_at:\s*"[^"]+")$/m,
          `$1\napproval_signature: "${signature}"\ncontent_hash: "${contentHash}"`
        );
        console.log(chalk.green('✓ Content signed'));
      } catch (err) {
        console.error(chalk.red(`Signing failed: ${(err as Error).message}`));
        process.exit(1);
      }
    }
    
    // Move to approved directory
    const approvedDir = join(config.contentDir, 'approved');
    if (!existsSync(approvedDir)) {
      mkdirSync(approvedDir, { recursive: true });
    }
    
    const newPath = join(approvedDir, basename(file));
    writeFileSync(newPath, newContent);
    unlinkSync(file);
    
    console.log(chalk.green(`✓ Approved by ${approver}`));
    console.log(chalk.gray(`  Moved to: ${newPath}`));
  });

// Review command - show content and prompt for feedback
program
  .command('review <file>')
  .description('Review a draft and provide feedback')
  .action(async (file: string) => {
    if (!existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const post = parsePost(file);
    
    console.log(chalk.blue(`\n📄 ${basename(file)}`));
    console.log(chalk.gray(`Platform: ${post.frontmatter.platform}`));
    console.log(chalk.gray(`Status: ${post.frontmatter.status}`));
    console.log(chalk.gray(`─`.repeat(50)));
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
    
    console.log(chalk.blue('💬 Your feedback (paste to your AI agent to request changes):'));
    console.log(chalk.gray('   Press Enter twice to finish, or Ctrl+C to cancel.\n'));
    
    const lines: string[] = [];
    let emptyLineCount = 0;
    
    const prompt = () => {
      rl.question('', (line) => {
        if (line === '') {
          emptyLineCount++;
          if (emptyLineCount >= 2) {
            rl.close();
            return;
          }
        } else {
          emptyLineCount = 0;
          lines.push(line);
        }
        prompt();
      });
    };
    
    await new Promise<void>((resolve) => {
      rl.on('close', () => {
        const config = loadConfig();
        
        if (lines.length > 0) {
          const feedback = lines.join('\n');
          
          // Save feedback to the draft file
          const fileContent = readFileSync(file, 'utf-8');
          const timestamp = new Date().toISOString();
          
          // Add review feedback to frontmatter
          let newContent: string;
          if (fileContent.includes('review_feedback:')) {
            // Replace existing feedback
            newContent = fileContent.replace(
              /review_feedback:[\s\S]*?(?=\n\w+:|---)/,
              `review_feedback: |\n  ${feedback.split('\n').join('\n  ')}\nreview_at: "${timestamp}"\n`
            );
          } else {
            // Add new feedback after status line
            newContent = fileContent.replace(
              /^(status:\s*\w+)$/m,
              `$1\nreview_feedback: |\n  ${feedback.split('\n').join('\n  ')}\nreview_at: "${timestamp}"`
            );
          }
          
          writeFileSync(file, newContent);
          console.log(chalk.green('\n✓ Feedback saved to draft'));
          
          // Notify Clawdbot if configured
          if (config.clawdbotPath && config.clawdbotTarget) {
            try {
              const message = `📝 Review feedback for ${basename(file)}:\n\n${feedback}\n\nPlease revise the draft at: ${file}`;
              execSync(`"${config.clawdbotPath}" message send --target "${config.clawdbotTarget}" --message "${message.replace(/"/g, '\\"')}"`, {
                stdio: 'pipe',
              });
              console.log(chalk.green('✓ Notified Clawdbot to process feedback'));
            } catch (err) {
              console.log(chalk.yellow('⚠ Could not notify Clawdbot:'), (err as Error).message);
              console.log(chalk.gray('  Configure clawdbotPath and clawdbotTarget in .content-kit.json'));
            }
          } else {
            console.log(chalk.gray('\nTip: Configure clawdbotPath and clawdbotTarget to auto-notify your agent'));
          }
        } else {
          console.log(chalk.gray('\nNo feedback provided.'));
          console.log(chalk.blue('If the draft looks good, approve it:'));
          console.log(chalk.gray(`  content-kit approve ${file}`));
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
    const approvedDir = join(config.contentDir, 'approved');
    
    console.log(chalk.blue('📝 Drafts:'));
    if (existsSync(draftsDir)) {
      const drafts = readdirSync(draftsDir).filter(f => f.endsWith('.md'));
      if (drafts.length === 0) {
        console.log(chalk.gray('  (none)'));
      } else {
        drafts.forEach(f => console.log(`  ${join(draftsDir, f)}`));
      }
    }
    
    console.log(chalk.blue('\n✅ Approved:'));
    if (existsSync(approvedDir)) {
      const approved = readdirSync(approvedDir).filter(f => f.endsWith('.md'));
      if (approved.length === 0) {
        console.log(chalk.gray('  (none)'));
      } else {
        approved.forEach(f => console.log(`  ${join(approvedDir, f)}`));
      }
    }
  });

// Platforms command
program
  .command('platforms')
  .description('List available posting platforms')
  .action(async () => {
    const config = loadConfig();
    
    console.log(chalk.blue('Built-in platforms:'));
    console.log(chalk.green('  ✓ linkedin'));
    console.log(chalk.green('  ✓ x (twitter)'));
    
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
