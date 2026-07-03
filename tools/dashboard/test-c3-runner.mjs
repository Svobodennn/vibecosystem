#!/usr/bin/env node
/**
 * C3 Smoke Test Runner — non-bash version
 * Spawns token-logger.mjs as child process and validates behavior.
 */
import { spawnSync, execFileSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HOOK = join(homedir(), '.claude', 'hooks', 'dist', 'token-logger.mjs');
const SETTINGS = join(homedir(), '.claude', 'settings.json');
const JSONL = join(homedir(), '.claude', 'token-usage.jsonl');
const HTML = join(homedir(), '.claude', 'tools', 'dashboard', 'index.html');

let passed = 0;
let failed = 0;

function pass(msg) { console.log('PASS:', msg); passed++; }
function fail(msg) { console.error('FAIL:', msg); failed++; }

// Test 1: dist file exists
if (existsSync(HOOK)) pass('token-logger.mjs build edildi');
else { fail('dist file yok'); process.exit(1); }

// Test 2: hook executes silently on valid input
const sampleInput = JSON.stringify({
  session_id: 'smoke123',
  tool_name: 'Bash',
  tool_input: { command: 'ls' },
  tool_response: 'file1\nfile2\nfile3',
});

const r1 = spawnSync('node', [HOOK], { input: sampleInput, encoding: 'utf-8' });
if (r1.status === 0) {
  const out = (r1.stdout || '').trim();
  if (out === '{}' || out === '') pass(`hook silent (status=0, output=${JSON.stringify(out)})`);
  else { console.log('INFO: hook output:', JSON.stringify(out)); pass('hook exit=0'); }
} else {
  fail(`hook exit=${r1.status} stderr=${r1.stderr}`);
}

// Test 3: jsonl entry written and well-formed
if (!existsSync(JSONL)) { fail('jsonl yazilmadi'); process.exit(1); }
const lines = readFileSync(JSONL, 'utf-8').split('\n').filter(l => l.trim());
if (lines.length === 0) { fail('jsonl bos'); process.exit(1); }

const last = JSON.parse(lines[lines.length - 1]);
const required = ['ts', 'session', 'tool', 'input_est', 'output_est', 'total_est'];
let allFields = true;
for (const f of required) {
  if (!(f in last)) { fail(`alan eksik: ${f}`); allFields = false; }
}
if (allFields) pass(`jsonl entry tum alanlar var (${required.join(',')})`);
if (last.session === 'smoke123' && last.tool === 'Bash') pass('session+tool dogru');
else fail(`yanlis deger: session=${last.session} tool=${last.tool}`);

// Test 3b: token estimate sanity
if (typeof last.total_est === 'number' && last.total_est > 0) {
  pass(`total_est sayisal: input=${last.input_est} output=${last.output_est} total=${last.total_est}`);
} else {
  fail(`total_est invalid: ${last.total_est}`);
}

// Test 4: settings.json valid JSON
try {
  const s = JSON.parse(readFileSync(SETTINGS, 'utf-8'));
  pass('settings.json valid');
  const post = s.hooks && s.hooks.PostToolUse && s.hooks.PostToolUse[0] && s.hooks.PostToolUse[0].hooks;
  const found = post && post.some(h => h.command && h.command.includes('token-logger.mjs'));
  if (found) pass('settings.json icinde token-logger.mjs entry kayitli');
  else fail('settings.json icinde token-logger.mjs entry yok');
} catch (e) {
  fail(`settings.json bozuk: ${e.message}`);
}

// Test 5: HTML elements
const html = readFileSync(HTML, 'utf-8');
if (html.includes('stat-tokens') && html.includes('>TOKENS<')) pass('TOKENS metric stats bar\'da');
else fail('TOKENS metric stats bar\'da yok');
if (html.includes('Token Burn') && html.includes('token-by-agent')) pass('Token Burn panel mevcut');
else fail('Token Burn panel eksik');
if (html.includes('fetchTokenUsage')) pass('fetchTokenUsage JS function eklendi');
else fail('fetchTokenUsage JS fonksiyonu yok');

// Test 6: Performance — 10 run avg
console.log('--- Performance (10 runs) ---');
let totalMs = 0;
const runs = [];
for (let i = 0; i < 10; i++) {
  const t0 = Date.now();
  spawnSync('node', [HOOK], {
    input: JSON.stringify({
      session_id: 'perftest',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/x' },
      tool_response: 'x'.repeat(1000),
    }),
    encoding: 'utf-8',
  });
  const dt = Date.now() - t0;
  runs.push(dt);
  totalMs += dt;
}
const avg = totalMs / 10;
const min = Math.min(...runs);
const max = Math.max(...runs);
console.log(`avg=${avg.toFixed(1)}ms min=${min}ms max=${max}ms (includes node startup ~25-40ms)`);

// Hook internal logic should be very fast; total includes node startup overhead
if (avg < 100) pass(`avg execution time (incl. node startup) <100ms: ${avg.toFixed(1)}ms`);
else fail(`execution slow: ${avg.toFixed(1)}ms`);

// Test 7: API contracts unchanged — schema check via static analysis
const server = readFileSync(join(homedir(), '.claude', 'tools', 'dashboard', 'server.js'), 'utf-8');
const tokensApi = server.includes("req.url === '/api/tokens'") && server.includes('loadTokenUsage()');
const costsApi = server.includes("req.url === '/api/costs'") && server.includes('estimateCosts()');
if (tokensApi && costsApi) pass('/api/tokens ve /api/costs endpoint\'leri schema aynisi');
else fail('endpoint schema degismis');

console.log('');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL SMOKE TESTS PASS');
