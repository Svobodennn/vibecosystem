#!/usr/bin/env node

// vibecosystem npm CLI
// npx vibecosystem [command] [options]

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { installClaude } from '../tools/install-runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_DIR = join(dirname(__filename), '..');
const CLAUDE_DIR = join(homedir(), '.claude');
const VERSION = '3.4.0';

const VALID_PROFILES = new Set([
  'core', 'quality', 'context', 'memory', 'orchestration', 'full',
  'minimal', 'frontend', 'backend', 'fullstack', 'devops', 'all', 'smart',
]);

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', red: '\x1b[31m',
};

function c(color, value) {
  return `${COLORS[color]}${value}${COLORS.reset}`;
}

function countFiles(dir, pattern) {
  try {
    const entries = readdirSync(dir);
    if (pattern === 'dirs') return entries.filter((entry) => statSync(join(dir, entry)).isDirectory()).length;
    return entries.filter((entry) => entry.endsWith(pattern)).length;
  } catch {
    return 0;
  }
}

function showHelp() {
  console.log(`
${c('bold', 'vibecosystem')} v${VERSION} - bounded AI software runtime

${c('bold', 'USAGE')}
  npx vibecosystem [command] [options]

${c('bold', 'COMMANDS')}
  init              Install or update the Claude runtime
  doctor            Run a basic installation health check
  version           Show version
  help              Show this help

${c('bold', 'INIT OPTIONS')}
  --profile X       core, quality, context, memory, orchestration or full
  --force           Overwrite conflicting files after creating backups
  --prune           Remove only files owned by a previous vibecosystem install
  --dry-run         Show the plan without changing files

${c('bold', 'EXAMPLES')}
  npx vibecosystem init                    # bounded core profile (default)
  npx vibecosystem init --profile full     # all legacy capabilities
  npx vibecosystem init --profile core --prune

${c('bold', 'PROFILES')}
  core          12 agents, 32 skills    Low-noise bounded runtime
  quality       Core + focused edit and verification checks
  context       Core + targeted context retrieval
  memory        Core + opt-in memory and learning hooks
  orchestration Core + explicit multi-agent workflows
  full          138 agents, 296 skills  All legacy capabilities
  minimal/smart Alias for core; all Alias for full

${c('dim', 'https://github.com/vibeeval/vibecosystem')}
`);
}

function doctor() {
  console.log(`\n${c('bold', 'vibecosystem doctor')} - Health Check\n`);
  const checks = [
    { name: 'Agents directory', path: join(CLAUDE_DIR, 'agents') },
    { name: 'Skills directory', path: join(CLAUDE_DIR, 'skills') },
    { name: 'Hooks dist', path: join(CLAUDE_DIR, 'hooks', 'dist') },
    { name: 'Rules directory', path: join(CLAUDE_DIR, 'rules') },
    { name: 'Profiles', path: join(CLAUDE_DIR, 'profiles') },
    { name: 'Dashboard', path: join(CLAUDE_DIR, 'tools', 'dashboard', 'server.js') },
  ];

  let pass = 0;
  let fail = 0;
  for (const check of checks) {
    const ok = existsSync(check.path);
    console.log(`  ${ok ? c('green', 'PASS') : c('red', 'FAIL')}  ${check.name}`);
    if (ok) pass += 1;
    else fail += 1;
  }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) console.log(`  Run ${c('cyan', 'npx vibecosystem init')} to fix.\n`);
}

function parseInitArgs(args) {
  const options = { force: false, prune: false, dryRun: false, profile: 'core' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force') options.force = true;
    else if (arg === '--prune') options.prune = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--profile') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--profile requires a value');
      options.profile = value;
      index += 1;
    } else if (arg.startsWith('--profile=')) {
      options.profile = arg.slice('--profile='.length);
    } else if (!arg.startsWith('--')) {
      throw new Error(`Unknown init argument: ${arg}`);
    }
  }
  if (!VALID_PROFILES.has(options.profile)) throw new Error(`Invalid profile: ${options.profile}`);
  return options;
}

const args = process.argv.slice(2);
const command = args[0] || 'help';

try {
  switch (command) {
    case 'init':
      installClaude({ repoDir: REPO_DIR, ...parseInitArgs(args.slice(1)), nonInteractive: true });
      break;
    case 'doctor':
      doctor();
      break;
    case 'version':
    case '--version':
    case '-v':
      console.log(`vibecosystem v${VERSION}`);
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      showHelp();
      process.exitCode = 1;
  }
} catch (error) {
  console.error(c('red', `[ERROR] ${error.message}`));
  process.exitCode = 1;
}
