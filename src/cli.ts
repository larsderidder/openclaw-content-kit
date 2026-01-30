#!/usr/bin/env node
/**
 * OpenClaw Content Kit CLI
 */

import { program } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readdirSync, renameSync, readFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { loadConfig } from './config.js';
import { parsePost, validatePost } from './parser.js';
import { loadPlugins, getPluginForPlatform } from './plugins.js';
import { getBuiltinPoster, linkedinAuth, xAuth } from './posters/index.js';
import type { PostOptions, PosterPlugin } from './types.js';

const VERSION = '0.1.0';

program
  .name('content-kit')
  .description('Safe content automation for AI agents')
  .version(VERSION);

// Init command
program
  .command('init')
  .description('Initialize content structure in current directory')
  .action(() => {
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
`);
      console.log(chalk.green('✓ Created AGENT.md'));
    }
    
    console.log(chalk.blue('\n✨ Content kit initialized!'));
    console.log('\nBuilt-in platforms: linkedin, x');
    console.log('To authenticate:');
    console.log(chalk.gray('  content-kit auth linkedin'));
    console.log(chalk.gray('  content-kit auth x'));
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
    
    // Try built-in poster first, then external plugins
    let plugin: PosterPlugin | undefined = getBuiltinPoster(post.frontmatter.platform);
    
    if (!plugin) {
      // Fall back to external plugins
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
      
      // Show markup info if present
      if (post.markup.hasMarkup) {
        console.log(chalk.yellow(`\n📝 CriticMarkup found (${post.markup.items.length} items):`));
        for (const item of post.markup.items) {
          const typeColors: Record<string, typeof chalk.yellow> = {
            comment: chalk.cyan,
            deletion: chalk.red,
            addition: chalk.green,
            substitution: chalk.magenta,
            highlight: chalk.yellow,
          };
          const color = typeColors[item.type] || chalk.white;
          console.log(color(`  [${item.type}] ${item.content}${item.replacement ? ` → ${item.replacement}` : ''}`));
        }
        console.log(chalk.gray('\n(Markup will be stripped when posting)'));
      }
      
      if (post.discussion) {
        console.log(chalk.blue('\n💬 Discussion:'));
        console.log(chalk.gray(post.discussion));
      }
      
      console.log(chalk.gray('\nClean content (will be posted):'));
      console.log(chalk.white(post.content));
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

// Approve command - move draft to approved
program
  .command('approve <file>')
  .description('Approve a draft (moves to approved/ and updates frontmatter)')
  .option('--by <name>', 'Approver name (default: current user)')
  .option('--accept', 'Accept all CriticMarkup suggestions before approving')
  .action((file: string, options: { by?: string; accept?: boolean }) => {
    const config = loadConfig();
    
    if (!existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const post = parsePost(file);
    
    // Check if already approved
    if (post.frontmatter.status === 'approved') {
      console.log(chalk.yellow('Already approved'));
      process.exit(0);
    }
    
    if (post.frontmatter.status === 'posted') {
      console.error(chalk.red('Cannot approve: already posted'));
      process.exit(1);
    }
    
    // Warn about unresolved markup
    const unresolvedComments = post.markup.comments.length;
    if (unresolvedComments > 0) {
      console.log(chalk.yellow(`⚠ ${unresolvedComments} unresolved comment(s) in draft`));
    }
    
    // Read original file
    const fileContent = readFileSync(file, 'utf-8');
    
    // Update content - optionally accept suggestions
    let newContent: string;
    if (options.accept && post.markup.hasMarkup) {
      // Replace content with accepted version
      const contentStart = fileContent.indexOf('---', 3) + 3;
      const frontmatterPart = fileContent.slice(0, contentStart);
      newContent = frontmatterPart + '\n' + post.markup.accepted;
      console.log(chalk.green('✓ Accepted all CriticMarkup suggestions'));
    } else {
      newContent = fileContent;
    }
    
    // Update frontmatter
    const approver = options.by || process.env.USER || 'unknown';
    const timestamp = new Date().toISOString();
    
    // Replace status and add approved_by
    newContent = newContent
      .replace(/^status:\s*draft\s*$/m, 'status: approved')
      .replace(/^(status:\s*approved)\s*$/m, `$1\napproved_by: "${approver}"\napproved_at: "${timestamp}"`);
    
    // Move to approved directory
    const approvedDir = join(config.contentDir, 'approved');
    if (!existsSync(approvedDir)) {
      mkdirSync(approvedDir, { recursive: true });
    }
    
    const newPath = join(approvedDir, basename(file));
    
    // Write updated content to new location
    writeFileSync(newPath, newContent);
    
    // Remove original
    unlinkSync(file);
    
    console.log(chalk.green(`✓ Approved by ${approver}`));
    console.log(chalk.gray(`  Moved to: ${newPath}`));
  });

// Review command - show markup and discussion
program
  .command('review <file>')
  .description('Review a draft with CriticMarkup and discussion')
  .option('--accept', 'Show content with all suggestions accepted')
  .option('--reject', 'Show content with all suggestions rejected')
  .action((file: string, options: { accept?: boolean; reject?: boolean }) => {
    if (!existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const post = parsePost(file);
    
    console.log(chalk.blue(`📄 ${basename(file)}`));
    console.log(chalk.gray(`Platform: ${post.frontmatter.platform}`));
    console.log(chalk.gray(`Status: ${post.frontmatter.status}`));
    
    if (post.markup.hasMarkup) {
      console.log(chalk.yellow(`\n📝 CriticMarkup (${post.markup.items.length} items):\n`));
      
      for (const item of post.markup.items) {
        const prefix = {
          comment: '💬',
          deletion: '❌',
          addition: '✅',
          substitution: '🔄',
          highlight: '🔆',
        }[item.type] || '•';
        
        const line = chalk.gray(`L${item.position.line}`);
        
        if (item.type === 'substitution') {
          console.log(`  ${prefix} ${line} "${item.content}" → "${item.replacement}"`);
        } else if (item.type === 'comment') {
          console.log(`  ${prefix} ${line} ${chalk.cyan(item.content)}`);
        } else if (item.type === 'deletion') {
          console.log(`  ${prefix} ${line} ${chalk.red(item.content)}`);
        } else if (item.type === 'addition') {
          console.log(`  ${prefix} ${line} ${chalk.green(item.content)}`);
        } else {
          console.log(`  ${prefix} ${line} ${item.content}`);
        }
      }
    } else {
      console.log(chalk.gray('\n(No CriticMarkup found)'));
    }
    
    if (post.discussion) {
      console.log(chalk.blue('\n💬 Discussion:\n'));
      console.log(post.discussion);
    }
    
    // Show requested version
    if (options.accept) {
      console.log(chalk.green('\n✅ With suggestions ACCEPTED:\n'));
      console.log(post.markup.accepted);
    } else if (options.reject) {
      console.log(chalk.red('\n❌ With suggestions REJECTED:\n'));
      console.log(post.markup.rejected);
    } else {
      console.log(chalk.blue('\n📤 Clean (ready to post):\n'));
      console.log(post.content);
    }
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

// Platforms command - show available platforms
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
