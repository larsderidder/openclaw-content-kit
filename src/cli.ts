#!/usr/bin/env node
/**
 * OpenClaw Content Kit CLI
 */

import { program } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readdirSync, renameSync, readFileSync, unlinkSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { join, basename } from 'path';
import { homedir } from 'os';
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
    const dirs = ['content/suggestions', 'content/drafts', 'content/approved', 'content/posted', 'content/templates'];
    
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
        contentDir: './content',
        plugins: [],
        dryRun: true,
        requireApproval: true,
      };
      
      if (clawdbotPath) {
        config.clawdbotPath = clawdbotPath;
        console.log(chalk.green(`✓ Found clawdbot — review feedback will notify your agent`));
      }
      
      writeFileSync('.content-kit.json', JSON.stringify(config, null, 2));
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
    
    const filePath = resolveContentFile(file, config);
    if (!filePath) {
      console.error(chalk.red(`File not found: ${file}`));
      console.error(chalk.gray(`  Checked: ${file}, content/drafts/${file}, content/approved/${file}`));
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
    
    const filePath = resolveContentFile(file, config);
    if (!filePath) {
      console.error(chalk.red(`File not found: ${file}`));
      console.error(chalk.gray(`  Checked: ${file}, content/drafts/${file}`));
      process.exit(1);
    }
    
    const post = parsePost(filePath);
    
    if (post.frontmatter.status === 'approved') {
      console.log(chalk.yellow('Already approved'));
      process.exit(0);
    }
    
    if (post.frontmatter.status === 'posted') {
      console.error(chalk.red('Cannot approve: already posted'));
      process.exit(1);
    }
    
    // Read original file
    const fileContent = readFileSync(filePath, 'utf-8');
    
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
    
    const newPath = join(approvedDir, basename(filePath));
    writeFileSync(newPath, newContent);
    unlinkSync(filePath);
    
    console.log(chalk.green(`✓ Approved by ${approver}`));
    console.log(chalk.gray(`  Moved to: ${newPath}`));
  });

// Helper to resolve file path (checks drafts/, approved/, then literal path)
function resolveContentFile(file: string, config: ReturnType<typeof loadConfig>): string | null {
  // Try literal path first
  if (existsSync(file)) return file;
  
  // Try in drafts/
  const inDrafts = join(config.contentDir, 'drafts', file);
  if (existsSync(inDrafts)) return inDrafts;
  
  // Try in approved/
  const inApproved = join(config.contentDir, 'approved', file);
  if (existsSync(inApproved)) return inApproved;
  
  return null;
}

// Review command - show content and prompt for feedback
program
  .command('review <file>')
  .description('Review a draft and provide feedback')
  .action(async (file: string) => {
    const config = loadConfig();
    const resolvedFile = resolveContentFile(file, config);
    
    if (!resolvedFile) {
      console.error(chalk.red(`File not found: ${file}`));
      console.error(chalk.gray(`  Checked: ${file}, content/drafts/${file}, content/approved/${file}`));
      process.exit(1);
    }
    
    const filePath = resolvedFile;
    
    const post = parsePost(filePath);
    
    console.log(chalk.blue(`\n📄 ${basename(filePath)}`));
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
      rl.on('close', () => {
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
          console.log(chalk.green('\n✓ Feedback saved to draft'));
          
          // Notify Clawdbot if configured (internal session message)
          if (config.clawdbotPath) {
            try {
              const message = `📝 Review feedback for ${basename(filePath)}:\n\n"${feedback}"\n\nRead the draft at ${filePath}, apply the feedback, and save the revised version. Then confirm what you changed, including the filename (${basename(filePath)}).`;
              
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
              
              const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
              const cmd = sessionId
                ? `"${config.clawdbotPath}" agent --session-id "${sessionId}" --message "${escapedMessage}"`
                : `"${config.clawdbotPath}" agent --message "${escapedMessage}"`;
              
              // Fire and forget - spawn detached process
              const child = spawn('/bin/sh', ['-c', cmd], {
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
          console.log(chalk.gray('\nNo feedback provided.'));
          console.log(chalk.blue('If the draft looks good, approve it:'));
          console.log(chalk.gray(`  content-kit approve ${basename(filePath)}`));
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
    const suggestionsDir = join(config.contentDir, 'suggestions');
    const draftsDir = join(config.contentDir, 'drafts');
    const approvedDir = join(config.contentDir, 'approved');
    
    console.log(chalk.blue('💡 Suggestions:'));
    if (existsSync(suggestionsDir)) {
      const suggestions = readdirSync(suggestionsDir).filter(f => f.endsWith('.md'));
      if (suggestions.length === 0) {
        console.log(chalk.gray('  (none)'));
      } else {
        suggestions.forEach(f => console.log(`  ${f}`));
      }
    } else {
      console.log(chalk.gray('  (none)'));
    }
    
    console.log(chalk.blue('\n📝 Drafts:'));
    if (existsSync(draftsDir)) {
      const drafts = readdirSync(draftsDir).filter(f => f.endsWith('.md'));
      if (drafts.length === 0) {
        console.log(chalk.gray('  (none)'));
      } else {
        drafts.forEach(f => console.log(`  ${f}`));
      }
    }
    
    console.log(chalk.blue('\n✅ Approved:'));
    if (existsSync(approvedDir)) {
      const approved = readdirSync(approvedDir).filter(f => f.endsWith('.md'));
      if (approved.length === 0) {
        console.log(chalk.gray('  (none)'));
      } else {
        approved.forEach(f => console.log(`  ${f}`));
      }
    }
  });

// Draft command - promote suggestion to draft
program
  .command('draft <file>')
  .description('Promote a suggestion to a draft')
  .action((file: string) => {
    const config = loadConfig();
    const suggestionsDir = join(config.contentDir, 'suggestions');
    const draftsDir = join(config.contentDir, 'drafts');
    
    // Find the file
    let sourcePath = file;
    if (!existsSync(sourcePath)) {
      sourcePath = join(suggestionsDir, file);
    }
    if (!existsSync(sourcePath)) {
      sourcePath = join(suggestionsDir, basename(file));
    }
    
    if (!existsSync(sourcePath)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    // Create drafts dir if needed
    if (!existsSync(draftsDir)) {
      mkdirSync(draftsDir, { recursive: true });
    }
    
    // Read and update content
    let content = readFileSync(sourcePath, 'utf8');
    
    // Update status if frontmatter exists
    if (content.startsWith('---')) {
      content = content.replace(/status:\s*suggestion/i, 'status: draft');
      // Add status if not present
      if (!content.includes('status:')) {
        content = content.replace(/^---\n/, '---\nstatus: draft\n');
      }
    }
    
    const destPath = join(draftsDir, basename(sourcePath));
    writeFileSync(destPath, content);
    unlinkSync(sourcePath);
    
    console.log(chalk.green(`✓ Promoted to draft: ${basename(destPath)}`));
  });

// View command - open file in editor
program
  .command('view <file>')
  .description('Open a content file in your editor')
  .action((file: string) => {
    const config = loadConfig();
    
    // Search in all content directories
    const searchDirs = [
      config.contentDir,
      join(config.contentDir, 'suggestions'),
      join(config.contentDir, 'drafts'),
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
