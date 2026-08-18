#!/usr/bin/env node
/**
 * Export a live ~/.claude installation back into this repo.
 *
 * Blind copying is wrong: files we never touched may sit at an older revision
 * locally and would silently revert upstream fixes. So every file is classified
 * against git history first, and only genuine local edits are exported.
 *
 * Comparison happens AFTER sanitisation, so machine-specific paths never count
 * as a local edit.
 *
 * Usage: node tools/export-from-claude.mjs [--apply] [--json <file>]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CLAUDE = process.env.CLAUDE_DIR || join(homedir(), '.claude');
const APPLY = process.argv.includes('--apply');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

// Baseline for deletion detection: what we last published. A repo path missing
// locally only counts as "we deleted it" if it existed when we last pushed.
const BASELINE = process.env.EXPORT_BASELINE || 'fork/main';

const SETS = [
  { dir: 'agents', exts: ['.md'] },
  { dir: 'rules', exts: ['.md'], skip: ['archive/'] },
  { dir: 'skills', exts: ['.md', '.json', '.js', '.mjs', '.ts', '.sh', '.py', '.txt', '.yaml', '.yml'] },
  { dir: 'hooks/src', exts: ['.ts'] },
  { dir: 'hooks/dist', exts: ['.mjs'] },
  { dir: 'profiles', exts: ['.json'] },
  { dir: 'workflows', exts: ['.js', '.mjs'] },
  { dir: 'tools', exts: ['.mjs'], skip: ['dashboard/', 'vibeco/'] },
];

const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 });
const blobHash = (buf) => {
  const h = createHash('sha1');
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest('hex');
};

/**
 * Machine-specific values must never reach the repo. Every pattern is derived
 * from the environment rather than hard-coded, so this file itself stays clean.
 * Extra values can be redacted via EXPORT_REDACT="a@b.com,acme-internal".
 */
const HOME = homedir();
// Claude Code encodes a project path as a slug: /Users/foo -> -Users-foo
const HOME_SLUG = HOME.replaceAll('/', '-');
const gitEmail = (() => {
  try { return git(['config', 'user.email']).trim(); } catch { return ''; }
})();
const EXTRA = (process.env.EXPORT_REDACT || '').split(',').map((s) => s.trim()).filter(Boolean);

function sanitise(text) {
  let out = text
    .replaceAll(`${HOME}/.claude/projects/${HOME_SLUG}`, '~/.claude/projects/<project-slug>')
    .replaceAll(`~/.claude/projects/${HOME_SLUG}`, '~/.claude/projects/<project-slug>')
    .replaceAll(`${HOME}/.claude`, '~/.claude')
    .replaceAll(HOME, '$HOME');
  for (const value of [gitEmail, ...EXTRA]) {
    if (value) out = out.replaceAll(value, '<redacted>');
  }
  return out;
}

function walk(root, exts, skips = []) {
  const out = [];
  const rec = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      const rel = relative(root, p);
      if (skips.some((s) => rel.startsWith(s))) continue;
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (e.isDirectory()) rec(p);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  rec(root);
  return out;
}

// --- repo state -------------------------------------------------------------
const historyBlobs = new Set(git(['rev-list', '--objects', '--all']).split('\n').map((l) => l.split(' ')[0]));
const treeAt = (ref) => {
  const m = new Map();
  for (const line of git(['ls-tree', '-r', ref, '--format=%(objectname) %(path)']).split('\n')) {
    if (!line) continue;
    const i = line.indexOf(' ');
    m.set(line.slice(i + 1), line.slice(0, i));
  }
  return m;
};
const head = treeAt('HEAD');
const baseline = treeAt(BASELINE);
// Case-insensitive index so local skill.md maps onto repo SKILL.md.
const headByLower = new Map([...head.keys()].map((p) => [p.toLowerCase(), p]));

const result = { identical: [], localEdit: [], added: [], staleSkipped: [], deletedCandidates: [] };

for (const set of SETS) {
  const localRoot = join(CLAUDE, set.dir);
  if (!existsSync(localRoot)) continue;
  for (const abs of walk(localRoot, set.exts, set.skip)) {
    const relLocal = `${set.dir}/${relative(localRoot, abs)}`;
    const clean = Buffer.from(sanitise(readFileSync(abs, 'utf8')), 'utf8');
    const localHash = blobHash(clean);
    const repoPath = headByLower.get(relLocal.toLowerCase()) ?? relLocal;
    const repoHash = head.get(repoPath);

    if (!repoHash) { result.added.push({ path: repoPath, from: abs, buf: clean }); continue; }
    if (repoHash === localHash) { result.identical.push(repoPath); continue; }
    // Content the repo has seen before => local copy is simply behind. Keep the repo's.
    if (historyBlobs.has(localHash)) { result.staleSkipped.push(repoPath); continue; }
    result.localEdit.push({ path: repoPath, from: abs, buf: clean });
  }
}

// Deletions are only trustworthy where install.sh copies the whole set.
// hooks/ is excluded: tests and unregistered hooks are legitimately absent
// locally. For skills the unit is the directory, because a local skill may
// still sit in the obsolete prompt.md format rather than SKILL.md.
const FLAT_SETS = ['agents', 'rules', 'profiles'];
const seenSkillDirs = new Set();
for (const [p] of baseline) {
  if (!head.has(p)) continue; // already gone from the repo
  if (p.endsWith('/.gitkeep')) continue;

  if (FLAT_SETS.some((d) => p.startsWith(`${d}/`))) {
    if (!existsSync(join(CLAUDE, p))) result.deletedCandidates.push(p);
    continue;
  }
  if (p.startsWith('skills/')) {
    const dir = p.split('/').slice(0, 2).join('/');
    if (seenSkillDirs.has(dir)) continue;
    seenSkillDirs.add(dir);
    if (!existsSync(join(CLAUDE, dir))) result.deletedCandidates.push(`${dir}/`);
  }
}

// --- report -----------------------------------------------------------------
const n = (a) => String(a.length).padStart(4);
console.log(`export-from-claude  (${APPLY ? 'APPLY' : 'dry-run'})`);
console.log(`  source   ${CLAUDE}`);
console.log(`  repo     ${REPO}  @ ${git(['rev-parse', '--short', 'HEAD']).trim()}`);
console.log(`  baseline ${BASELINE}\n`);
console.log(`${n(result.identical)}  identical        repo already matches`);
console.log(`${n(result.staleSkipped)}  stale-skipped    local copy is an older repo revision`);
console.log(`${n(result.localEdit)}  local-edit       our change -> export`);
console.log(`${n(result.added)}  added            new file    -> export`);
console.log(`${n(result.deletedCandidates)}  deleted          gone locally, still in repo\n`);

const preview = (label, arr, key = (x) => x.path ?? x) => {
  if (!arr.length) return;
  console.log(`── ${label} ──`);
  for (const x of arr.slice(0, 12)) console.log(`   ${key(x)}`);
  if (arr.length > 12) console.log(`   … +${arr.length - 12}`);
  console.log();
};
preview('local-edit', result.localEdit);
preview('added', result.added);
preview('deleted (NOT applied automatically)', result.deletedCandidates);

if (APPLY) {
  let written = 0;
  for (const item of [...result.localEdit, ...result.added]) {
    const dest = join(REPO, item.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, item.buf);
    written++;
  }
  console.log(`wrote ${written} files. Deletions were left alone - review the list above.`);
}

if (JSON_OUT) {
  const strip = (a) => a.map((x) => x.path ?? x);
  writeFileSync(JSON_OUT, JSON.stringify({
    generatedFrom: CLAUDE, baseline: BASELINE,
    identical: result.identical, staleSkipped: result.staleSkipped,
    localEdit: strip(result.localEdit), added: strip(result.added),
    deletedCandidates: result.deletedCandidates,
  }, null, 2));
  console.log(`manifest -> ${JSON_OUT}`);
}
