import { readFileSync } from 'node:fs';

const denied = /(?:\.ssh|\.aws|\.kube|\.gnupg|\.env\b|id_rsa|id_ed25519|terraform\.tfstate)/i;

function block(reason) {
  console.log(JSON.stringify({ decision: 'block', reason }));
}

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

try {
  const input = JSON.parse(raw || '{}');
  if (denied.test(JSON.stringify(input.tool_input || {}))) block('sensitive credential path');
  else console.log('{}');
} catch {
  block('malformed input');
}
