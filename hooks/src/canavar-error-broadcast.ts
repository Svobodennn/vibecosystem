/**
 * Canavar Error Broadcast - PostToolUse hook (Bash)
 * Bash ciktisinda hata tespit ederse error-ledger.jsonl'e yazar.
 * Tum agent'lar session basinda bu hatalardan haberdar olur.
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { notify } from './shared/notify.js';
import { getCurrentRepo, createIssue } from './shared/github-bridge.js';
import { ERROR_PATTERNS } from './shared/error-patterns.js';

interface PostToolInput {
  session_id: string;
  tool_name: string;
  tool_input: {
    command?: string;
    file_path?: string;
    // Agent tool alanları
    subagent_type?: string;
    description?: string;
    prompt?: string;
  };
  tool_response?: string | { stdout?: string; stderr?: string };
  // Agent tool çıktısı
  tool_output?: string;
  // Subagent içindeki tool call'larda Claude Code bu alanları input'a koyar
  // (2026-06-04 probe ile doğrulandı; env var DEĞİL)
  agent_id?: string;
  agent_type?: string;
}

interface ErrorEntry {
  ts: string;
  session: string;
  agent_id: string;
  agent_type: string;
  error_type: string;
  error_pattern: string;
  detail: string;
  file: string;
  lesson: string;
  command?: string;
  source?: string;
}

// ERROR_PATTERNS artık shared/error-patterns.ts içinde (test edilebilir ortak kütüphane)

function extractFile(output: string, command?: string): string {
  // Dosya adini hata ciktisindan cikar
  const fileMatch = output.match(/(?:(?:\/|[A-Z]:\\)[\w\/.\\-]+\.\w+)/);
  if (fileMatch) return fileMatch[0].replace(/\\/g, '/');
  // Command'dan cikar
  if (command) {
    const cmdFile = command.match(/(?:(?:\/|[A-Z]:\\)[\w\/.\\-]+\.\w+)/);
    if (cmdFile) return cmdFile[0].replace(/\\/g, '/');
  }
  return 'unknown';
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { return; }
  if (!raw) { console.log('{}'); return; }

  let input: PostToolInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  // Agent tool mu yoksa Bash tool mu - buna göre çıktıyı ve agent_type'ı belirle
  const isAgentTool = input.tool_name === 'Agent';

  // Agent tool'u için: subagent_type'ı agent kimliği olarak kullan
  // Diğer tool'lar için: hook input'undaki agent_id/agent_type alanları
  // (subagent içindeki çağrılarda dolu gelir, main context'te yoktur)
  const sessionId = input.session_id?.slice(0, 8) || 'unknown';
  const agentId = isAgentTool
    ? (input.tool_input?.subagent_type || 'unknown-agent')
    : (input.agent_id || 'main');
  const agentType = isAgentTool
    ? (input.tool_input?.subagent_type || 'unknown-agent')
    : (input.agent_type || 'main');

  // Çıktıyı al: Agent tool için tool_output, Bash için tool_response
  // Bash tool_response objedir: {stdout, stderr, ...} (probe ile doğrulandı)
  let output: string;
  if (isAgentTool) {
    output = typeof input.tool_output === 'string' ? input.tool_output : '';
  } else if (typeof input.tool_response === 'string') {
    output = input.tool_response;
  } else if (input.tool_response && typeof input.tool_response === 'object') {
    const r = input.tool_response;
    output = [r.stdout, r.stderr].filter(Boolean).join('\n') || JSON.stringify(r);
  } else {
    output = '';
  }

  if (!output || output.length < 10) {
    console.log('{}');
    return;
  }

  const errors: ErrorEntry[] = [];

  for (const ep of ERROR_PATTERNS) {
    const match = ep.regex.exec(output);
    if (match) {
      errors.push({
        ts: new Date().toISOString(),
        session: sessionId,
        agent_id: agentId,
        agent_type: agentType,
        error_type: ep.type,
        error_pattern: ep.pattern,
        detail: match[0].slice(0, 200),
        // Agent tool için dosya adını çıktıdan çıkar; Bash için komuttan da bak
        file: extractFile(output, isAgentTool ? undefined : input.tool_input?.command),
        lesson: ep.lesson(match),
        command: input.tool_input?.command?.slice(0, 200),
        source: 'posttooluse-scan',
      });
    }
  }

  // Tum hatalari kaydet (main dahil - feedback loop icin gerekli)
  if (errors.length > 0) {
    const canavarDir = join(homedir(), '.claude', 'canavar');
    if (!existsSync(canavarDir)) mkdirSync(canavarDir, { recursive: true });
    const ledgerPath = join(canavarDir, 'error-ledger.jsonl');

    for (const err of errors) {
      appendFileSync(ledgerPath, JSON.stringify(err) + '\n');
    }

    // Kritik hatalarda masaustu bildirimi
    const criticalErrors = errors.filter(e => e.error_type === 'build_fail' || e.error_type === 'runtime_error');
    if (criticalErrors.length > 0) {
      notify('Hizir: Hata Tespit', `${criticalErrors.length} kritik hata: ${criticalErrors[0].error_pattern}`, 'critical');
    }

    // 3+ kez tekrarlayan hata pattern'i varsa opsiyonel GitHub issue olustur
    try {
      const ledgerPath2 = join(homedir(), '.claude', 'canavar', 'error-ledger.jsonl');
      // E4 guard: rotation normalde dosyayı küçük tutar; yine de 1.5MB üstünde
      // tüm-dosya sayımını atla (hot-path'te O(n) okuma yapma)
      if (existsSync(ledgerPath2) && statSync(ledgerPath2).size <= 1_500_000) {
        const allLines = readFileSync(ledgerPath2, 'utf-8').split('\n').filter(l => l.trim());
        const patternCounts = new Map<string, number>();
        for (const line of allLines) {
          try {
            const entry = JSON.parse(line);
            patternCounts.set(entry.error_pattern, (patternCounts.get(entry.error_pattern) || 0) + 1);
          } catch { /* skip */ }
        }
        for (const err of errors) {
          const count = patternCounts.get(err.error_pattern) || 0;
          if (count >= 3 && getCurrentRepo()) {
            createIssue(
              `[Canavar] Tekrarlayan hata: ${err.error_pattern} (${count}x)`,
              `## Hata Detayi\n\n- **Pattern:** ${err.error_pattern}\n- **Tip:** ${err.error_type}\n- **Tekrar:** ${count} kez\n- **Son ders:** ${err.lesson}\n- **Dosya:** ${err.file}\n\n_Otomatik olusturuldu by Canavar_`,
              ['bug', 'canavar']
            );
            break; // Session basina max 1 issue burada
          }
        }
      }
    } catch { /* GitHub issue opsiyonel, hata olursa sessizce devam */ }
  }

  console.log('{}');
}

main();
