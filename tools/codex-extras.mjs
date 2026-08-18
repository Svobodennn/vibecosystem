#!/usr/bin/env node
/**
 * Install the parts of vibecosystem that install-codex.sh deliberately leaves
 * out: agent definitions, rules, and (optionally) the hook chain.
 *
 * Skills are NOT handled here - use install-codex.sh for those.
 *
 * Rules are split rather than concatenated. A single AGENTS.md holding every
 * rule would sit in the context of every request; Codex loads a skill only when
 * its description matches, so long procedural rules become skills and only the
 * short always-on ones are inlined.
 *
 * Usage:
 *   node tools/codex-extras.mjs [--agents] [--rules] [--hooks] [--all]
 *                               [--dry-run] [--codex-home DIR] [--skills-home DIR]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : fallback;
};

const ALL = flag('all');
const DRY = flag('dry-run');
const CODEX_HOME = opt('codex-home', process.env.CODEX_HOME || join(homedir(), '.codex'));
const SKILLS_HOME = opt('skills-home', join(homedir(), '.agents', 'skills'));
// Rules at or below this stay in AGENTS.md; longer ones become on-demand skills.
const INLINE_MAX_BYTES = Number(opt('inline-max', 3500));
// Short but situational: never worth spending always-on context on.
const FORCE_SKILL = new Set(['vibecosystem-welcome', 'hooks', 'incremental-writing', 'pre-compact-state']);

const write = (path, body) => {
  if (DRY) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
};

function splitFrontmatter(text) {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: text };
  const raw = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n+/, '');
  const meta = {};
  let key = null;
  for (const line of raw.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (m) {
      key = m[1];
      meta[key] = m[2].trim().replace(/^["'](.*)["']$/s, '$1');
    } else if (key && /^\s*-\s+/.test(line)) {
      meta[key] = [].concat(meta[key] === '' ? [] : meta[key], line.replace(/^\s*-\s+/, '').trim());
    }
  }
  return { meta, body };
}

/** TOML multi-line string that survives regexes and backslashes in prose. */
function tomlBlock(text) {
  if (!text.includes("'''")) return `'''\n${text}\n'''`;
  return `"""\n${text.replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"')}\n"""`;
}
const tomlString = (s) => `"${String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

// --- agents -----------------------------------------------------------------
function installAgents() {
  const src = join(REPO, 'agents');
  const dest = join(CODEX_HOME, 'agents');
  let n = 0;
  for (const file of readdirSync(src).filter((f) => f.endsWith('.md')).sort()) {
    const slug = basename(file, '.md');
    const { meta, body } = splitFrontmatter(readFileSync(join(src, file), 'utf8'));
    // Codex has no tools field. Losing it silently would widen the agent's
    // remit, so it is restated as an instruction instead.
    const tools = Array.isArray(meta.tools)
      ? meta.tools.join(', ')
      : String(meta.tools || '').replace(/[[\]"']/g, '').trim();
    const preamble = tools ? `Tools available to you: ${tools}.\n\n` : '';
    const lines = [
      `# Generated from agents/${file} - edit the source, not this file.`,
      `name = ${tomlString(slug.replaceAll('-', '_'))}`,
      `description = ${tomlString(meta.description || slug)}`,
      `developer_instructions = ${tomlBlock(preamble + body.trim())}`,
    ];
    write(join(dest, `${slug}.toml`), `${lines.join('\n')}\n`);
    n++;
  }
  return n;
}

// --- rules ------------------------------------------------------------------
function firstMeaningfulLine(body) {
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('>')) continue;
    return t.replace(/[*`]/g, '').slice(0, 180);
  }
  return '';
}

function installRules() {
  const src = join(REPO, 'rules');
  const files = readdirSync(src).filter((f) => f.endsWith('.md')).sort();
  const inline = [];
  const asSkills = [];
  for (const file of files) {
    const slug = basename(file, '.md');
    const text = readFileSync(join(src, file), 'utf8');
    (Buffer.byteLength(text) <= INLINE_MAX_BYTES && !FORCE_SKILL.has(slug)
      ? inline : asSkills).push({ slug, text });
  }

  for (const { slug, text } of asSkills) {
    const title = text.match(/^#\s+(.+)$/m)?.[1] || slug;
    const summary = firstMeaningfulLine(text) || title;
    const front = `---\nname: rule-${slug}\ndescription: ${title} - ${summary} Apply when the task touches this area.\n---\n\n`;
    write(join(SKILLS_HOME, `rule-${slug}`, 'SKILL.md'), front + text);
  }

  const head = [
    '# vibecosystem',
    '',
    'Always-on operating rules. Longer procedures are installed as `rule-*` skills',
    'and load on demand; consult them when a task touches their area.',
    '',
    `On-demand rule skills: ${asSkills.map((r) => `rule-${r.slug}`).join(', ')}`,
    '',
  ].join('\n');
  const body = inline.map(({ slug, text }) => `\n---\n\n<!-- rules/${slug}.md -->\n\n${text.trim()}\n`).join('\n');
  write(join(CODEX_HOME, 'AGENTS.md'), `${head}${body}`);
  return { inline: inline.length, skills: asSkills.length, bytes: Buffer.byteLength(head + body) };
}

// --- hooks ------------------------------------------------------------------
// Hooks keep running from ~/.claude/hooks/dist so both runtimes share one
// ledger. Events whose payload Codex does not provide are left out rather than
// installed broken.
const HOOK_DENY = new Set(['subagent-stop-learner', 'canavar-main-scan']);

function installHooks() {
  const manifestPath = join(REPO, 'hooks', 'hooks.json');
  if (!existsSync(manifestPath)) return { events: 0, hooks: 0, skipped: 0 };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const distDir = join(homedir(), '.claude', 'hooks', 'dist');
  const out = {};
  let kept = 0;
  let skipped = 0;
  for (const [event, matchers] of Object.entries(manifest.hooks || {})) {
    const keptMatchers = [];
    for (const matcher of matchers) {
      const hooks = (matcher.hooks || []).filter((h) => {
        const name = h.command?.match(/dist\/([\w.-]+)\.mjs/)?.[1];
        if (!name || HOOK_DENY.has(name)) { skipped++; return false; }
        if (!existsSync(join(distDir, `${name}.mjs`))) { skipped++; return false; }
        return true;
      }).map((h) => ({
        ...h,
        command: h.command.replace(/^.*?dist\//, `node ${distDir}/`).replace('node node ', 'node '),
      }));
      if (hooks.length) { keptMatchers.push({ ...matcher, hooks }); kept += hooks.length; }
    }
    if (keptMatchers.length) out[event] = keptMatchers;
  }
  write(join(CODEX_HOME, 'hooks.json'), `${JSON.stringify({ hooks: out }, null, 2)}\n`);
  return { events: Object.keys(out).length, hooks: kept, skipped };
}

// --- run --------------------------------------------------------------------
console.log(`codex-extras ${DRY ? '(dry-run)' : ''}`);
console.log(`  repo        ${REPO}`);
console.log(`  codex home  ${CODEX_HOME}`);
console.log(`  skills home ${SKILLS_HOME}\n`);

if (ALL || flag('agents')) console.log(`  agents  -> ${installAgents()} .toml written`);
if (ALL || flag('rules')) {
  const r = installRules();
  console.log(`  rules   -> AGENTS.md ${(r.bytes / 1024).toFixed(1)} KB (${r.inline} inlined), ${r.skills} rule-* skills`);
}
if (ALL || flag('hooks')) {
  const h = installHooks();
  console.log(`  hooks   -> ${h.hooks} across ${h.events} events (${h.skipped} skipped)`);
}
if (!ALL && !flag('agents') && !flag('rules') && !flag('hooks')) {
  console.log('  nothing selected. Pass --agents, --rules, --hooks, or --all.');
}
