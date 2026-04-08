#!/usr/bin/env node
// vibeco - vibecosystem CLI
// Zero dependencies, pure Node.js ESM

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { get } from 'node:http';

const VERSION = '3.1.0';
const CLAUDE_DIR = join(homedir(), '.claude');
const PROFILES_DIR = join(CLAUDE_DIR, 'profiles');
const PLUGIN_CONFIG = join(CLAUDE_DIR, 'plugin-config.json');
const DASHBOARD_PORT = 3848;
const DASHBOARD_SCRIPT = join(CLAUDE_DIR, 'tools', 'dashboard', 'server.js');

// ─── ANSI Colors ───
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};
const green = s => `${c.green}${s}${c.reset}`;
const red = s => `${c.red}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const cyan = s => `${c.cyan}${s}${c.reset}`;
const bold = s => `${c.bold}${s}${c.reset}`;
const dim = s => `${c.dim}${s}${c.reset}`;
const magenta = s => `${c.magenta}${s}${c.reset}`;

// ─── Utilities ───
function countFiles(dir, pattern) {
  try {
    const entries = readdirSync(dir);
    if (pattern === 'dir') return entries.filter(e => statSync(join(dir, e)).isDirectory()).length;
    return entries.filter(e => e.endsWith(pattern)).length;
  } catch { return 0; }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      fm[key] = val;
    }
  }
  return fm;
}

function readPluginConfig() {
  try {
    return JSON.parse(readFileSync(PLUGIN_CONFIG, 'utf-8'));
  } catch { return {}; }
}

function writePluginConfig(config) {
  writeFileSync(PLUGIN_CONFIG, JSON.stringify(config, null, 2) + '\n');
}

function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = createConnection({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

function getRepoDir() {
  // vibeco.mjs is at repo/tools/vibeco/vibeco.mjs
  const scriptPath = new URL(import.meta.url).pathname;
  const toolsDir = join(scriptPath, '..', '..', '..');
  try {
    const resolved = execSync(`cd "${toolsDir}" && git rev-parse --show-toplevel 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (resolved && existsSync(join(resolved, 'install.sh'))) return resolved;
  } catch {}
  // fallback: ~/.vibecosystem
  const fallback = join(homedir(), '.vibecosystem');
  if (existsSync(join(fallback, 'install.sh'))) return fallback;
  return null;
}

// ─── Commands ───

function help() {
  console.log(`
${c.bold}${c.cyan} vibecosystem${c.reset} ${dim(`v${VERSION}`)}
${dim('Your AI software team. Built on Claude Code.')}

${bold('USAGE')}
  ${cyan('vibeco')} ${dim('<command>')} ${dim('[options]')}

${bold('COMMANDS')}
  ${green('help')}                          Show this help
  ${green('version')}                       Show version
  ${green('stats')}                         Ecosystem statistics
  ${green('list')} ${dim('<agents|skills|hooks|rules>')}  Browse components
    ${dim('--search <term>')}              Filter by name/description
  ${green('dashboard')}                     Start monitoring dashboard
  ${green('doctor')}                        Health check
  ${green('profile')} ${dim('<name>')}                Set active profile
    ${dim('minimal | frontend | backend | fullstack | devops | all')}
  ${green('search')} ${dim('<term> [term2 ...]')}          Search agents and skills by keyword
  ${green('update')}                        Pull latest & reinstall

${bold('EXAMPLES')}
  ${dim('$')} vibeco stats
  ${dim('$')} vibeco search database
  ${dim('$')} vibeco list agents --search security
  ${dim('$')} vibeco profile frontend
  ${dim('$')} vibeco doctor

${dim(`github.com/vibeeval/vibecosystem`)}
`);
}

function version() {
  console.log(`vibecosystem v${VERSION}`);
}

function stats() {
  const agents = countFiles(join(CLAUDE_DIR, 'agents'), '.md');
  const skills = countFiles(join(CLAUDE_DIR, 'skills'), 'dir');
  const hooks = countFiles(join(CLAUDE_DIR, 'hooks', 'dist'), '.mjs');
  const rules = countFiles(join(CLAUDE_DIR, 'rules'), '.md');

  // Error count
  let errors = 0;
  const ledger = join(CLAUDE_DIR, 'canavar', 'error-ledger.jsonl');
  try {
    const content = readFileSync(ledger, 'utf-8');
    errors = content.split('\n').filter(l => l.trim()).length;
  } catch {}

  // Instinct count
  let instincts = 0;
  const instinctsFile = join(CLAUDE_DIR, 'instincts.jsonl');
  try {
    const content = readFileSync(instinctsFile, 'utf-8');
    instincts = content.split('\n').filter(l => l.trim()).length;
  } catch {}

  // Active profile
  const config = readPluginConfig();
  const profile = config.activeProfile || 'all';

  console.log(`
${bold('vibecosystem stats')}
${dim('─'.repeat(40))}

  ${cyan('Agents')}     ${bold(String(agents))}
  ${cyan('Skills')}     ${bold(String(skills))}
  ${cyan('Hooks')}      ${bold(String(hooks))}
  ${cyan('Rules')}      ${bold(String(rules))}

  ${cyan('Profile')}    ${bold(profile)}
  ${cyan('Errors')}     ${errors > 0 ? yellow(String(errors)) : green('0')}
  ${cyan('Instincts')}  ${bold(String(instincts))}

${dim('─'.repeat(40))}
  ${dim(`v${VERSION} | github.com/vibeeval/vibecosystem`)}
`);
}

function list() {
  const type = process.argv[3];
  if (!type || !['agents', 'skills', 'hooks', 'rules'].includes(type)) {
    console.log(`${red('Usage:')} vibeco list <agents|skills|hooks|rules> [--search <term>]`);
    return;
  }

  const searchIdx = process.argv.indexOf('--search');
  const search = searchIdx > -1 ? (process.argv[searchIdx + 1] || '').toLowerCase() : null;

  const items = [];

  if (type === 'agents') {
    const dir = join(CLAUDE_DIR, 'agents');
    try {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
        const name = basename(file, '.md');
        const content = readFileSync(join(dir, file), 'utf-8');
        const fm = parseFrontmatter(content);
        const desc = fm.description || '';
        const shortDesc = desc.length > 70 ? desc.slice(0, 67) + '...' : desc;
        items.push({ name, desc: shortDesc });
      }
    } catch {}
  } else if (type === 'skills') {
    const dir = join(CLAUDE_DIR, 'skills');
    try {
      for (const entry of readdirSync(dir).sort()) {
        const skillDir = join(dir, entry);
        if (!statSync(skillDir).isDirectory()) continue;
        const skillFile = existsSync(join(skillDir, 'SKILL.md')) ? 'SKILL.md' : 'prompt.md';
        const filePath = join(skillDir, skillFile);
        let desc = '';
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          const fm = parseFrontmatter(content);
          desc = fm.description || '';
        }
        const shortDesc = desc.length > 70 ? desc.slice(0, 67) + '...' : desc;
        items.push({ name: entry, desc: shortDesc });
      }
    } catch {}
  } else if (type === 'hooks') {
    const dir = join(CLAUDE_DIR, 'hooks', 'dist');
    try {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) {
        const name = basename(file, '.mjs');
        items.push({ name, desc: '' });
      }
    } catch {}
  } else if (type === 'rules') {
    const dir = join(CLAUDE_DIR, 'rules');
    try {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
        const name = basename(file, '.md');
        items.push({ name, desc: '' });
      }
    } catch {}
  }

  // Filter
  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search) || i.desc.toLowerCase().includes(search))
    : items;

  // Display
  console.log(`\n${bold(`${type}`)} ${dim(`(${filtered.length}${search ? ` matching "${search}"` : ''})`)}\n`);

  const maxName = Math.min(Math.max(...filtered.map(i => i.name.length), 10), 35);
  for (const item of filtered) {
    const paddedName = item.name.padEnd(maxName);
    if (item.desc) {
      console.log(`  ${cyan(paddedName)}  ${dim(item.desc)}`);
    } else {
      console.log(`  ${cyan(paddedName)}`);
    }
  }
  console.log();
}

async function dashboard() {
  const running = await isPortOpen(DASHBOARD_PORT);
  if (running) {
    console.log(`${green('[OK]')} Dashboard already running at ${cyan(`http://127.0.0.1:${DASHBOARD_PORT}`)}`);
    return;
  }

  if (!existsSync(DASHBOARD_SCRIPT)) {
    console.log(`${red('[ERROR]')} Dashboard not found at ${DASHBOARD_SCRIPT}`);
    console.log(`${dim('Run install.sh to install the dashboard')}`);
    return;
  }

  console.log(`Starting dashboard...`);
  const child = spawn('node', [DASHBOARD_SCRIPT], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Wait a moment for startup
  await new Promise(r => setTimeout(r, 1500));

  const ok = await isPortOpen(DASHBOARD_PORT);
  if (ok) {
    console.log(`${green('[OK]')} Dashboard running at ${cyan(`http://127.0.0.1:${DASHBOARD_PORT}`)}`);
  } else {
    console.log(`${yellow('[WARN]')} Dashboard may still be starting. Check ${cyan(`http://127.0.0.1:${DASHBOARD_PORT}`)}`);
  }
}

function profile() {
  const name = process.argv[3];
  const validProfiles = ['minimal', 'frontend', 'backend', 'fullstack', 'devops', 'all'];

  if (!name || !validProfiles.includes(name)) {
    const config = readPluginConfig();
    const current = config.activeProfile || 'all';
    console.log(`\n${bold('Profiles')}\n`);
    for (const p of validProfiles) {
      const marker = p === current ? green(' (active)') : '';
      console.log(`  ${p === current ? bold(cyan(p)) : dim(p)}${marker}`);
    }
    console.log(`\n${dim('Usage:')} vibeco profile <name>\n`);
    return;
  }

  const profileFile = join(PROFILES_DIR, `${name}.json`);
  if (!existsSync(profileFile)) {
    console.log(`${red('[ERROR]')} Profile "${name}" not found at ${profileFile}`);
    console.log(`${dim('Run install.sh or vibeco update to install profiles')}`);
    return;
  }

  const profileData = JSON.parse(readFileSync(profileFile, 'utf-8'));
  const config = readPluginConfig();

  if (name === 'all') {
    // Remove all disabled entries
    delete config.agents;
    delete config.skills;
    config.activeProfile = 'all';
    writePluginConfig(config);
    console.log(`${green('[OK]')} Profile set to ${bold('all')} - everything enabled`);
    return;
  }

  // Get full lists
  const allAgents = [];
  const allSkills = [];
  try {
    for (const f of readdirSync(join(CLAUDE_DIR, 'agents'))) {
      if (f.endsWith('.md')) allAgents.push(basename(f, '.md'));
    }
  } catch {}
  try {
    for (const d of readdirSync(join(CLAUDE_DIR, 'skills'))) {
      if (statSync(join(CLAUDE_DIR, 'skills', d)).isDirectory()) allSkills.push(d);
    }
  } catch {}

  // Compute disabled sets
  const enabledAgents = new Set(profileData.agents || []);
  const enabledSkills = new Set(profileData.skills || []);

  const disabledAgents = {};
  for (const a of allAgents) {
    if (!enabledAgents.has(a)) disabledAgents[a] = { enabled: false };
  }

  const disabledSkills = {};
  for (const s of allSkills) {
    if (!enabledSkills.has(s)) disabledSkills[s] = { enabled: false };
  }

  config.activeProfile = name;
  config.agents = disabledAgents;
  config.skills = disabledSkills;
  writePluginConfig(config);

  const enabledA = enabledAgents.size;
  const enabledS = enabledSkills.size;
  const disabledA = Object.keys(disabledAgents).length;
  const disabledS = Object.keys(disabledSkills).length;

  console.log(`${green('[OK]')} Profile set to ${bold(name)}`);
  console.log(`  ${cyan('Agents')}  ${green(String(enabledA))} enabled, ${dim(String(disabledA))} disabled`);
  console.log(`  ${cyan('Skills')}  ${green(String(enabledS))} enabled, ${dim(String(disabledS))} disabled`);
  console.log(`  ${dim(`Description: ${profileData.description || name}`)}`);
}

async function doctor() {
  console.log(`\n${bold('vibeco doctor')}`);
  console.log(dim('='.repeat(40)));

  let pass = 0;
  let warn = 0;
  let fail = 0;

  function check(status, msg, hint) {
    if (status === 'pass') { pass++; console.log(`  ${green('[PASS]')} ${msg}`); }
    else if (status === 'warn') { warn++; console.log(`  ${yellow('[WARN]')} ${msg}${hint ? dim(` (${hint})`) : ''}`); }
    else { fail++; console.log(`  ${red('[FAIL]')} ${msg}${hint ? dim(` (${hint})`) : ''}`); }
  }

  // 1. ~/.claude/ exists
  check(existsSync(CLAUDE_DIR) ? 'pass' : 'fail', '~/.claude/ directory');

  // 2. Agent count
  const agents = countFiles(join(CLAUDE_DIR, 'agents'), '.md');
  check(agents >= 130 ? 'pass' : agents >= 50 ? 'warn' : 'fail', `Agents: ${agents}`, agents < 130 ? 'expected >= 130' : '');

  // 3. Skill count
  const skills = countFiles(join(CLAUDE_DIR, 'skills'), 'dir');
  check(skills >= 250 ? 'pass' : skills >= 100 ? 'warn' : 'fail', `Skills: ${skills}`, skills < 250 ? 'expected >= 250' : '');

  // 4. Hook count
  const hooks = countFiles(join(CLAUDE_DIR, 'hooks', 'dist'), '.mjs');
  check(hooks >= 55 ? 'pass' : hooks >= 30 ? 'warn' : 'fail', `Hooks: ${hooks} compiled`, hooks < 55 ? 'expected >= 55' : '');

  // 5. Rule count
  const rules = countFiles(join(CLAUDE_DIR, 'rules'), '.md');
  check(rules >= 18 ? 'pass' : rules >= 10 ? 'warn' : 'fail', `Rules: ${rules}`, rules < 18 ? 'expected >= 18' : '');

  // 6. settings.json hooks
  try {
    const settings = JSON.parse(readFileSync(join(CLAUDE_DIR, 'settings.json'), 'utf-8'));
    const hasHooks = settings.hooks && Object.keys(settings.hooks).length > 0;
    check(hasHooks ? 'pass' : 'fail', 'Hook registrations in settings.json', hasHooks ? '' : 'no hooks registered');
  } catch {
    check('fail', 'settings.json', 'file not found or invalid');
  }

  // 7. Dashboard
  const dashRunning = await isPortOpen(DASHBOARD_PORT);
  check(dashRunning ? 'pass' : 'warn', `Dashboard${dashRunning ? ' running' : ' not running'}`, dashRunning ? '' : 'vibeco dashboard');

  // 8. Memory DB
  const canavarDir = join(CLAUDE_DIR, 'canavar');
  const hasCanavar = existsSync(canavarDir);
  if (hasCanavar) {
    const ledger = join(canavarDir, 'error-ledger.jsonl');
    const matrix = join(canavarDir, 'skill-matrix.json');
    const hasData = existsSync(ledger) || existsSync(matrix);
    check(hasData ? 'pass' : 'warn', 'Canavar data', hasData ? '' : 'no error ledger or skill matrix');
  } else {
    check('warn', 'Canavar directory', 'not found');
  }

  // 9. Active profile
  const config = readPluginConfig();
  const activeProfile = config.activeProfile || 'all';
  check('pass', `Profile: ${activeProfile}`);

  // 10. PATH
  const pathIncludesLocal = (process.env.PATH || '').includes(join(homedir(), '.local', 'bin'));
  check(pathIncludesLocal ? 'pass' : 'warn', '~/.local/bin in PATH', pathIncludesLocal ? '' : 'add to PATH for vibeco command');

  // 11. Node.js version
  const nodeVer = parseInt(process.version.slice(1));
  check(nodeVer >= 18 ? 'pass' : nodeVer >= 16 ? 'warn' : 'fail', `Node.js ${process.version}`, nodeVer < 18 ? 'recommended >= 18' : '');

  // Summary
  const total = pass + warn + fail;
  const score = Math.round((pass / total) * 100);
  const status = fail > 0 ? red('UNHEALTHY') : warn > 0 ? yellow('MOSTLY HEALTHY') : green('HEALTHY');
  console.log(`\n${dim('─'.repeat(40))}`);
  console.log(`  Health: ${bold(`${pass}/${total}`)} (${score}%) ${status}\n`);
}

function search() {
  const terms = process.argv.slice(3);
  if (terms.length === 0) {
    console.log(`${red('Usage:')} vibeco search <term> [term2 ...]`);
    return;
  }

  const lowerTerms = terms.map(t => t.toLowerCase());
  const exactPhrase = lowerTerms.join(' ');

  function score(name, desc) {
    const lName = name.toLowerCase();
    const lDesc = desc.toLowerCase();
    let s = 0;
    if (lName.includes(exactPhrase)) s += 10;
    for (const word of lowerTerms) {
      if (lName.includes(word)) s += 5;
      if (lDesc.includes(word)) s += 3;
    }
    return s;
  }

  // Load agents
  const agents = [];
  const agentsDir = join(CLAUDE_DIR, 'agents');
  try {
    for (const file of readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort()) {
      const name = basename(file, '.md');
      const content = readFileSync(join(agentsDir, file), 'utf-8');
      const fm = parseFrontmatter(content);
      const desc = fm.description || '';
      const s = score(name, desc);
      if (s > 0) agents.push({ name, desc, score: s });
    }
  } catch {}
  agents.sort((a, b) => b.score - a.score);
  const topAgents = agents.slice(0, 10);

  // Load skills
  const skills = [];
  const skillsDir = join(CLAUDE_DIR, 'skills');
  try {
    for (const entry of readdirSync(skillsDir).sort()) {
      const skillDir = join(skillsDir, entry);
      if (!statSync(skillDir).isDirectory()) continue;
      const skillFile = existsSync(join(skillDir, 'SKILL.md')) ? 'SKILL.md' : 'prompt.md';
      const filePath = join(skillDir, skillFile);
      let desc = '';
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        const fm = parseFrontmatter(content);
        desc = fm.description || '';
      }
      const s = score(entry, desc);
      if (s > 0) skills.push({ name: entry, desc, score: s });
    }
  } catch {}
  skills.sort((a, b) => b.score - a.score);
  const topSkills = skills.slice(0, 10);

  const totalMatches = agents.length + skills.length;
  if (totalMatches === 0) {
    console.log(`\n${dim(`No results for "${terms.join(' ')}"`)}\n`);
    return;
  }

  function printSection(title, items) {
    if (items.length === 0) return;
    const shown = items.length;
    const total = title === 'Agents' ? agents.length : skills.length;
    const label = shown < total ? `${shown} of ${total} matches` : `${shown} match${shown !== 1 ? 'es' : ''}`;
    console.log(`  ${bold(title)} ${dim(`(${label})`)}`);
    const maxName = Math.min(Math.max(...items.map(i => i.name.length), 10), 35);
    for (const item of items) {
      const paddedName = item.name.padEnd(maxName);
      const shortDesc = item.desc.length > 60 ? item.desc.slice(0, 57) + '...' : item.desc;
      if (shortDesc) {
        console.log(`    ${cyan(paddedName)}  ${dim(shortDesc)}`);
      } else {
        console.log(`    ${cyan(paddedName)}`);
      }
    }
    console.log();
  }

  console.log();
  printSection('Agents', topAgents);
  printSection('Skills', topSkills);
}

async function update() {
  const repoDir = getRepoDir();
  if (!repoDir) {
    console.log(`${red('[ERROR]')} Cannot find vibecosystem repo`);
    console.log(`${dim('Expected at ~/.vibecosystem/ or linked from this script')}`);
    return;
  }

  console.log(`Updating from ${dim(repoDir)}...`);

  try {
    execSync('git pull --ff-only', { cwd: repoDir, stdio: 'inherit' });
  } catch {
    console.log(`${red('[ERROR]')} git pull failed`);
    return;
  }

  console.log(`\nReinstalling...`);
  try {
    execSync('bash install.sh --non-interactive', { cwd: repoDir, stdio: 'inherit' });
  } catch {
    // Fallback without --non-interactive for older install.sh
    try {
      execSync('echo y | bash install.sh', { cwd: repoDir, stdio: 'inherit' });
    } catch {
      console.log(`${red('[ERROR]')} install.sh failed`);
      return;
    }
  }

  console.log(`\n${green('[OK]')} vibecosystem updated`);
}

// ─── Router ───
const COMMANDS = {
  help,
  version,
  stats,
  list,
  search,
  dashboard,
  profile,
  doctor,
  update,
  '-h': help,
  '--help': help,
  '-v': version,
  '--version': version,
};

const cmd = process.argv[2] || 'help';
const handler = COMMANDS[cmd];

if (!handler) {
  console.log(`${red('Unknown command:')} ${cmd}`);
  console.log(`${dim('Run')} vibeco help ${dim('for available commands')}`);
  process.exit(1);
}

const result = handler();
if (result instanceof Promise) result.catch(err => { console.error(red(err.message)); process.exit(1); });
