#!/usr/bin/env node

// vibecosystem npm CLI
// npx vibecosystem [command] [options]

import { existsSync, mkdirSync, cpSync, readdirSync, statSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_DIR = join(__dirname, '..');
const CLAUDE_DIR = join(homedir(), '.claude');
const VERSION = '3.3.0';

const VALID_PROFILES = new Set(['minimal', 'frontend', 'backend', 'fullstack', 'devops', 'all', 'smart']);

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function c(color, text) { return `${COLORS[color]}${text}${COLORS.reset}`; }

function countFiles(dir, pattern) {
  try {
    if (pattern === 'dirs') return readdirSync(dir).filter(f => statSync(join(dir, f)).isDirectory()).length;
    return readdirSync(dir).filter(f => f.endsWith(pattern)).length;
  } catch { return 0; }
}

function smartCopy(src, dest, force = false) {
  let added = 0, skipped = 0;
  if (!existsSync(src)) return { added, skipped };

  if (statSync(src).isDirectory()) {
    if (force || !existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true });
      added++;
    } else { skipped++; }
  } else {
    if (force || !existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest);
      added++;
    } else { skipped++; }
  }
  return { added, skipped };
}

function install(options = {}) {
  const { force = false, profile = 'all' } = options;
  let totalAdded = 0, totalSkipped = 0;

  const track = (result) => { totalAdded += result.added; totalSkipped += result.skipped; };

  console.log(c('bold', '\nvibecosystem installer'));
  console.log('======================\n');
  console.log(`Installing into ${c('cyan', '~/.claude/')}:`);
  console.log(`  - 138 agents  -> ~/.claude/agents/`);
  console.log(`  - 296 skills  -> ~/.claude/skills/`);
  console.log(`  - 74 hooks    -> ~/.claude/hooks/`);
  console.log(`  - 20 rules    -> ~/.claude/rules/`);
  console.log(`\nMode: ${force ? c('yellow', 'OVERWRITE') : c('green', 'MERGE')} | Profile: ${c('blue', profile)}\n`);

  // Agents
  process.stdout.write('Installing agents...');
  mkdirSync(join(CLAUDE_DIR, 'agents'), { recursive: true });
  const agentDir = join(REPO_DIR, 'agents');
  if (existsSync(agentDir)) {
    for (const f of readdirSync(agentDir).filter(f => f.endsWith('.md'))) {
      track(smartCopy(join(agentDir, f), join(CLAUDE_DIR, 'agents', f), force));
    }
  }
  console.log(c('green', ' done'));

  // Skills
  process.stdout.write('Installing skills...');
  mkdirSync(join(CLAUDE_DIR, 'skills'), { recursive: true });
  const skillDir = join(REPO_DIR, 'skills');
  if (existsSync(skillDir)) {
    for (const d of readdirSync(skillDir)) {
      const fullPath = join(skillDir, d);
      if (statSync(fullPath).isDirectory()) {
        track(smartCopy(fullPath, join(CLAUDE_DIR, 'skills', d), force));
      }
    }
  }
  console.log(c('green', ' done'));

  // Hooks (pre-built dist)
  process.stdout.write('Installing hooks...');
  mkdirSync(join(CLAUDE_DIR, 'hooks', 'dist'), { recursive: true });
  const distDir = join(REPO_DIR, 'hooks', 'dist');
  if (existsSync(distDir)) {
    for (const f of readdirSync(distDir).filter(f => f.endsWith('.mjs'))) {
      track(smartCopy(join(distDir, f), join(CLAUDE_DIR, 'hooks', 'dist', f), force));
    }
  }
  // Copy hooks.json if exists
  const hooksJson = join(REPO_DIR, 'hooks', 'hooks.json');
  if (existsSync(hooksJson)) {
    track(smartCopy(hooksJson, join(CLAUDE_DIR, 'hooks', 'hooks.json'), force));
  }
  console.log(c('green', ' done'));

  // Register hooks in settings.json - copied hooks never fire without this
  if (existsSync(hooksJson)) {
    console.log('Registering hooks in settings.json...');
    try {
      execFileSync('node', [
        join(REPO_DIR, 'tools', 'register-hooks.mjs'),
        hooksJson,
        join(CLAUDE_DIR, 'settings.json'),
        CLAUDE_DIR,
      ], { stdio: 'inherit' });
    } catch {
      console.log(c('yellow', '  WARNING: hook registration failed - merge hooks/hooks.json into ~/.claude/settings.json manually'));
    }
  }

  // Rules
  process.stdout.write('Installing rules...');
  mkdirSync(join(CLAUDE_DIR, 'rules'), { recursive: true });
  const rulesDir = join(REPO_DIR, 'rules');
  if (existsSync(rulesDir)) {
    for (const f of readdirSync(rulesDir).filter(f => f.endsWith('.md'))) {
      track(smartCopy(join(rulesDir, f), join(CLAUDE_DIR, 'rules', f), force));
    }
  }
  console.log(c('green', ' done'));

  // Profiles
  process.stdout.write('Installing profiles...');
  mkdirSync(join(CLAUDE_DIR, 'profiles'), { recursive: true });
  const profilesDir = join(REPO_DIR, 'profiles');
  if (existsSync(profilesDir)) {
    for (const f of readdirSync(profilesDir).filter(f => f.endsWith('.json'))) {
      track(smartCopy(join(profilesDir, f), join(CLAUDE_DIR, 'profiles', f), force));
    }
  }
  console.log(c('green', ' done'));

  // Tools
  process.stdout.write('Installing tools...');
  const dashboardDir = join(REPO_DIR, 'tools', 'dashboard');
  if (existsSync(dashboardDir)) {
    mkdirSync(join(CLAUDE_DIR, 'tools', 'dashboard'), { recursive: true });
    for (const f of readdirSync(dashboardDir)) {
      const fullPath = join(dashboardDir, f);
      if (statSync(fullPath).isFile()) {
        track(smartCopy(fullPath, join(CLAUDE_DIR, 'tools', 'dashboard', f), force));
      }
    }
  }
  console.log(c('green', ' done'));

  // vibeco CLI symlink
  process.stdout.write('Setting up vibeco CLI...');
  const vibecoSrc = join(REPO_DIR, 'tools', 'vibeco', 'vibeco.mjs');
  if (existsSync(vibecoSrc)) {
    const binDir = join(homedir(), '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const symlink = join(binDir, 'vibeco');
    try { unlinkSync(symlink); } catch {}
    try { symlinkSync(vibecoSrc, symlink); } catch {}
  }
  console.log(c('green', ' done'));

  // Apply profile - writes the same plugin-config.json schema as vibeco.mjs
  // (activeProfile + agents/skills disable maps) so both CLIs stay in sync
  if (profile !== 'all') {
    process.stdout.write(`Applying profile: ${profile}...`);
    const profileFile = join(CLAUDE_DIR, 'profiles', `${profile}.json`);
    if (existsSync(profileFile)) {
      try {
        const configPath = join(CLAUDE_DIR, 'plugin-config.json');
        let config = {};
        if (existsSync(configPath)) {
          try { config = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
        }

        if (profile === 'smart') {
          // smart = everything enabled, token-optimized injection budgets
          const { agents: _agents, skills: _skills, ...rest } = config;
          config = { ...rest, activeProfile: profile };
        } else {
          const profileData = JSON.parse(readFileSync(profileFile, 'utf-8'));
          const enabledAgents = new Set(profileData.agents || []);
          const enabledSkills = new Set(profileData.skills || []);

          const allAgents = readdirSync(join(CLAUDE_DIR, 'agents'))
            .filter(f => f.endsWith('.md'))
            .map(f => f.replace(/\.md$/, ''));
          const allSkills = readdirSync(join(CLAUDE_DIR, 'skills'))
            .filter(f => statSync(join(CLAUDE_DIR, 'skills', f)).isDirectory());

          const disabledAgents = {};
          for (const a of allAgents) {
            if (enabledAgents.size > 0 && !enabledAgents.has(a)) disabledAgents[a] = { enabled: false };
          }
          const disabledSkills = {};
          for (const s of allSkills) {
            if (enabledSkills.size > 0 && !enabledSkills.has(s)) disabledSkills[s] = { enabled: false };
          }

          config = { ...config, activeProfile: profile, agents: disabledAgents, skills: disabledSkills };
        }

        writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(c('green', ' done'));
      } catch (err) {
        console.log(c('yellow', ` failed: ${err.message}`));
      }
    } else {
      console.log(c('yellow', ` profile not found, using all`));
    }
  }

  // Summary
  console.log(`\n${c('bold', 'Installation complete!')}`);
  console.log(`  ${c('green', 'Added:')}   ${totalAdded} files`);
  console.log(`  ${c('dim', 'Skipped:')} ${totalSkipped} files (already existed)`);
  console.log(`\n  Agents: ${countFiles(join(CLAUDE_DIR, 'agents'), '.md')}`);
  console.log(`  Skills: ${countFiles(join(CLAUDE_DIR, 'skills'), 'dirs')}`);
  console.log(`  Hooks:  ${countFiles(join(CLAUDE_DIR, 'hooks', 'dist'), '.mjs')}`);
  console.log(`  Rules:  ${countFiles(join(CLAUDE_DIR, 'rules'), '.md')}`);

  if (totalSkipped > 0) {
    console.log(`\n  Tip: Use ${c('yellow', 'npx vibecosystem init --force')} to overwrite existing files.`);
  }

  console.log(`\n  Run ${c('cyan', 'vibeco doctor')} to verify your setup.`);
  console.log(`  Run ${c('cyan', 'vibeco stats')} to see component counts.\n`);
}

function showHelp() {
  console.log(`
${c('bold', 'vibecosystem')} v${VERSION} - AI software team for Claude Code

${c('bold', 'USAGE')}
  npx vibecosystem [command] [options]

${c('bold', 'COMMANDS')}
  init              Install vibecosystem into ~/.claude/
  init --force      Overwrite existing files
  init --profile X  Install with specific profile (minimal/frontend/backend/fullstack/devops/smart/all)
  doctor            Run health check on installation
  version           Show version
  help              Show this help

${c('bold', 'EXAMPLES')}
  npx vibecosystem init                    # Install with all components
  npx vibecosystem init --profile minimal  # Install minimal profile
  npx vibecosystem init --force            # Overwrite existing setup

${c('bold', 'PROFILES')}
  minimal    15 agents, ~40 skills   Core review/test/verify only
  frontend   30 agents, ~60 skills   React/Next.js/CSS/a11y
  backend    44 agents, ~74 skills   API/DB/security
  fullstack  59 agents, ~96 skills   Frontend + backend combined
  devops     33 agents, ~61 skills   CI/CD/K8s/cloud
  smart      138 agents, 296 skills  Everything enabled, token-optimized injection budgets
  all        138 agents, 296 skills  Everything (default)

${c('dim', 'https://github.com/vibeeval/vibecosystem')}
`);
}

function doctor() {
  console.log(`\n${c('bold', 'vibecosystem doctor')} - Health Check\n`);
  const checks = [
    { name: 'Agents directory', path: join(CLAUDE_DIR, 'agents'), type: 'dir' },
    { name: 'Skills directory', path: join(CLAUDE_DIR, 'skills'), type: 'dir' },
    { name: 'Hooks dist', path: join(CLAUDE_DIR, 'hooks', 'dist'), type: 'dir' },
    { name: 'Rules directory', path: join(CLAUDE_DIR, 'rules'), type: 'dir' },
    { name: 'Profiles', path: join(CLAUDE_DIR, 'profiles'), type: 'dir' },
    { name: 'Dashboard', path: join(CLAUDE_DIR, 'tools', 'dashboard', 'server.js'), type: 'file' },
  ];

  let pass = 0, fail = 0;
  for (const check of checks) {
    const exists = existsSync(check.path);
    const status = exists ? c('green', 'PASS') : c('red', 'FAIL');
    console.log(`  ${status}  ${check.name}`);
    if (exists) pass++; else fail++;
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) {
    console.log(`  Run ${c('cyan', 'npx vibecosystem init')} to fix.\n`);
  }
}

// Parse args
const args = process.argv.slice(2);
const command = args[0] || 'help';

switch (command) {
  case 'init': {
    const force = args.includes('--force');
    const profileIdx = args.indexOf('--profile');
    let profile = 'all';
    if (profileIdx !== -1) {
      const next = args[profileIdx + 1];
      if (!next || next.startsWith('--')) {
        console.error(c('red', 'Error: --profile requires a value'));
        console.error(`  Valid: ${[...VALID_PROFILES].join(', ')}`);
        process.exit(1);
      }
      if (!VALID_PROFILES.has(next)) {
        console.error(c('red', `Error: invalid profile "${next}"`));
        console.error(`  Valid: ${[...VALID_PROFILES].join(', ')}`);
        process.exit(1);
      }
      profile = next;
    }
    install({ force, profile });
    break;
  }
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
  default:
    showHelp();
    break;
}
