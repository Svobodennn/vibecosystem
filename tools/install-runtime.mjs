#!/usr/bin/env node
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { filterHookManifest, resolveProfile } from './profile-runtime.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_DIR = join(THIS_DIR, '..');
// tools/ also holds repo-only scripts (installer, exporter); only these ship.
const RUNTIME_TOOLS = ['cdp-browser.mjs'];

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walkFiles(path));
    else if (stat.isFile()) files.push(path);
  }
  return files;
}

function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function backupFile(source, backupRoot, relativePath) {
  const destination = join(backupRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function copyOwnedFile({ source, destination, relativePath, ownedBefore, desired, force, dryRun, backupRoot, stats }) {
  if (!existsSync(source)) return;
  if (existsSync(destination) && !force && !ownedBefore.has(relativePath)) {
    stats.conflicts += 1;
    stats.skipped += 1;
    return;
  }
  desired.add(relativePath);
  if (dryRun) {
    stats.added += existsSync(destination) ? 0 : 1;
    stats.overwritten += existsSync(destination) ? 1 : 0;
    return;
  }
  if (existsSync(destination) && backupRoot) backupFile(destination, backupRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  if (existsSync(destination)) stats.overwritten += ownedBefore.has(relativePath) ? 1 : 0;
  stats.added += ownedBefore.has(relativePath) ? 0 : 1;
}

function copyOwnedTree({ sourceDir, destinationDir, relativeRoot, selected, ...options }) {
  if (!existsSync(sourceDir)) return;
  const sourceFiles = selected === 'all'
    ? walkFiles(sourceDir)
    : selected.flatMap((name) => walkFiles(join(sourceDir, name)));
  for (const source of sourceFiles) {
    const relativePath = join(relativeRoot, relative(sourceDir, source));
    copyOwnedFile({
      ...options,
      source,
      destination: join(destinationDir, relative(sourceDir, source)),
      relativePath,
    });
  }
}

function listMatchingFiles(dir, suffix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name);
}

function listDirectories(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function backupAndPrune({ claudeDir, ownedBefore, desired, dryRun, backupRoot, stats }) {
  if (!ownedBefore.size) return;
  for (const relativePath of ownedBefore) {
    if (desired.has(relativePath)) continue;
    const path = join(claudeDir, relativePath);
    if (!existsSync(path)) continue;
    stats.pruned += 1;
    if (dryRun) continue;
    if (backupRoot) backupFile(path, backupRoot, relativePath);
    rmSync(path, { force: true });
    let parent = dirname(path);
    while (parent !== claudeDir && parent.startsWith(`${claudeDir}/`)) {
      if (!existsSync(parent) || readdirSync(parent).length > 0) break;
      rmSync(parent, { force: true, recursive: true });
      parent = dirname(parent);
    }
  }
}

function writePluginState(claudeDir, runtime, stats, dryRun, backupRoot) {
  const configPath = join(claudeDir, 'plugin-config.json');
  const config = readJson(configPath, {});
  const next = {
    ...config,
    activeProfile: runtime.profile,
    vibecosystem: {
      profile: runtime.profile,
      requestedProfile: runtime.requestedProfile,
      enabledAgents: runtime.agents,
      enabledSkills: runtime.skills,
      enabledRules: runtime.rules,
      enabledHooks: runtime.hooks,
      contextBudget: runtime.contextBudget,
      updatedAt: new Date().toISOString(),
    },
  };
  if (!dryRun) {
    if (existsSync(configPath) && backupRoot) backupFile(configPath, backupRoot, 'plugin-config.json');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  return { ...next, stats };
}

export function installClaude({
  repoDir,
  profile = 'core',
  force = false,
  prune = false,
  dryRun = false,
  claudeDir = join(homedir(), '.claude'),
  nonInteractive = false,
} = {}) {
  const runtime = resolveProfile(repoDir, profile);
  const statePath = join(claudeDir, 'vibecosystem-runtime.json');
  const previousState = readJson(statePath, {});
  const ownedBefore = new Set(previousState.ownedFiles || []);
  const desired = new Set();
  const stats = { added: 0, overwritten: 0, skipped: 0, conflicts: 0, pruned: 0 };
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = dryRun ? null : join(claudeDir, 'backups', `vibecosystem-${timestamp}`);

  const sourceAgents = join(repoDir, 'agents');
  const sourceSkills = join(repoDir, 'skills');
  const sourceRules = join(repoDir, 'rules');
  const sourceHooks = join(repoDir, 'hooks', 'dist');
  const sourceProfiles = join(repoDir, 'profiles');
  const hookManifestPath = join(repoDir, 'hooks', 'hooks.json');

  if (!dryRun) mkdirSync(claudeDir, { recursive: true });

  const agentNames = runtime.agents === 'all' ? listMatchingFiles(sourceAgents, '.md').map((f) => basename(f, '.md')) : runtime.agents;
  const skillNames = runtime.skills === 'all' ? listDirectories(sourceSkills) : runtime.skills;
  const ruleNames = runtime.rules === 'all' ? listMatchingFiles(sourceRules, '.md') : runtime.rules;
  const hookNames = runtime.hooks === 'all' ? listMatchingFiles(sourceHooks, '.mjs').map((f) => basename(f, '.mjs')) : runtime.hooks;

  for (const name of agentNames || []) {
    copyOwnedFile({
      source: join(sourceAgents, `${name}.md`),
      destination: join(claudeDir, 'agents', `${name}.md`),
      relativePath: join('agents', `${name}.md`),
      ownedBefore, desired, force, dryRun, backupRoot, stats,
    });
  }
  for (const name of skillNames || []) {
    copyOwnedTree({
      sourceDir: join(sourceSkills, name),
      destinationDir: join(claudeDir, 'skills', name),
      relativeRoot: join('skills', name),
      selected: 'all',
      ownedBefore, desired, force, dryRun, backupRoot, stats,
    });
  }
  for (const name of ruleNames || []) {
    copyOwnedFile({
      source: join(sourceRules, name),
      destination: join(claudeDir, 'rules', name),
      relativePath: join('rules', name),
      ownedBefore, desired, force, dryRun, backupRoot, stats,
    });
  }
  for (const name of hookNames || []) {
    copyOwnedFile({
      source: join(sourceHooks, `${name}.mjs`),
      destination: join(claudeDir, 'hooks', 'dist', `${name}.mjs`),
      relativePath: join('hooks', 'dist', `${name}.mjs`),
      ownedBefore, desired, force, dryRun, backupRoot, stats,
    });
  }

  if (existsSync(hookManifestPath)) {
    const fullManifest = readJson(hookManifestPath, {});
    const filteredManifest = filterHookManifest(fullManifest, runtime.hooks);
    const destination = join(claudeDir, 'hooks', 'hooks.json');
    const relativePath = join('hooks', 'hooks.json');
    const canWrite = !existsSync(destination) || force || ownedBefore.has(relativePath);
    if (!canWrite) {
      stats.conflicts += 1;
      stats.skipped += 1;
    } else {
      desired.add(relativePath);
    }
    if (!dryRun && canWrite) {
      if (existsSync(destination) && backupRoot) backupFile(destination, backupRoot, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, `${JSON.stringify(filteredManifest, null, 2)}\n`);
    }
  }

  for (const file of listMatchingFiles(sourceProfiles, '.json')) {
    copyOwnedFile({
      source: join(sourceProfiles, file),
      destination: join(claudeDir, 'profiles', file),
      relativePath: join('profiles', file),
      ownedBefore, desired, force, dryRun, backupRoot, stats,
    });
  }

  // Workflow scripts (council etc.) are invoked by name from ~/.claude/workflows.
  for (const file of listMatchingFiles(join(repoDir, 'workflows'), '.js')) {
    copyOwnedFile({
      source: join(repoDir, 'workflows', file),
      destination: join(claudeDir, 'workflows', file),
      relativePath: join('workflows', file),
      ownedBefore, desired, force, dryRun, backupRoot, stats,
    });
  }

  // Standalone runtime tools agents shell out to. Repo-only tooling stays out.
  for (const file of RUNTIME_TOOLS) {
    if (!existsSync(join(repoDir, 'tools', file))) continue;
    copyOwnedFile({
      source: join(repoDir, 'tools', file),
      destination: join(claudeDir, 'tools', file),
      relativePath: join('tools', file),
      ownedBefore, desired, force, dryRun, backupRoot, stats,
    });
  }

  copyOwnedTree({
    sourceDir: join(repoDir, 'tools', 'dashboard'),
    destinationDir: join(claudeDir, 'tools', 'dashboard'),
    relativeRoot: join('tools', 'dashboard'),
    selected: 'all',
    ownedBefore, desired, force, dryRun, backupRoot, stats,
  });

  if (prune) backupAndPrune({ claudeDir, ownedBefore, desired, dryRun, backupRoot, stats });

  const ownedFiles = prune
    ? [...desired]
    : [...new Set([...ownedBefore, ...desired])];
  const nextState = {
    ...previousState,
    activeProfile: runtime.profile,
    requestedProfile: runtime.requestedProfile,
    contextBudget: runtime.contextBudget,
    ownedFiles,
    updatedAt: new Date().toISOString(),
  };
  if (!dryRun) writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

  if (!dryRun && existsSync(hookManifestPath)) {
    try {
      execFileSync(process.execPath, [
        join(repoDir, 'tools', 'register-hooks.mjs'),
        hookManifestPath,
        join(claudeDir, 'settings.json'),
        claudeDir,
        profile,
        String(prune),
      ], { stdio: 'inherit' });
    } catch (error) {
      console.warn(`WARNING: hook registration failed: ${error.message}`);
    }
  }

  writePluginState(claudeDir, runtime, stats, dryRun, backupRoot);

  if (!dryRun && !nonInteractive) {
    console.log('');
  }
  console.log(`vibecosystem profile: ${runtime.profile}`);
  console.log(`  agents=${agentNames?.length ?? 0} skills=${skillNames?.length ?? 0} rules=${ruleNames?.length ?? 0} hooks=${hookNames?.length ?? 0}`);
  console.log(`  added=${stats.added} overwritten=${stats.overwritten} skipped=${stats.skipped} conflicts=${stats.conflicts} pruned=${stats.pruned}`);
  if (stats.conflicts > 0) console.log('  Existing non-vibecosystem files were preserved. Use --force only when intentional.');
  if (dryRun) console.log('  dry-run: no files or settings were changed.');
  return { runtime, stats, state: dryRun ? nextState : readJson(statePath, nextState) };
}

function parseArgs(argv) {
  const options = { profile: 'core', force: false, prune: false, dryRun: false, nonInteractive: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile') options.profile = argv[++i] || options.profile;
    else if (arg === '--force') options.force = true;
    else if (arg === '--prune') options.prune = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--non-interactive') options.nonInteractive = true;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const repoDir = process.env.VIBECO_REPO_DIR || DEFAULT_REPO_DIR;
  try {
    installClaude({ repoDir, ...options });
  } catch (error) {
    console.error(`vibecosystem install failed: ${error.message}`);
    process.exit(1);
  }
}
