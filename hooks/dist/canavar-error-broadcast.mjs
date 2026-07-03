// src/canavar-error-broadcast.ts
import { readFileSync as readFileSync2, appendFileSync, mkdirSync as mkdirSync2, existsSync as existsSync2, statSync } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";

// src/shared/notify.ts
import { execFileSync } from "child_process";
function notify(title, message, level = "info") {
  try {
    const subtitle = level === "critical" ? "CRITICAL" : level === "warning" ? "WARNING" : "";
    const script = `display notification "${esc(message)}" with title "${esc(title)}" ${subtitle ? `subtitle "${esc(subtitle)}"` : ""} sound name "Submarine"`;
    execFileSync("osascript", ["-e", script], { timeout: 2e3, stdio: "ignore" });
  } catch {
  }
}
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").replace(/\r/g, " ").slice(0, 200);
}

// src/shared/github-bridge.ts
import { execFileSync as execFileSync2 } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var RATE_LIMIT_PATH = join(homedir(), ".claude", "cache", "github-rate-limit.json");
var MAX_ISSUES_PER_SESSION = 3;
function loadRateLimit() {
  try {
    if (existsSync(RATE_LIMIT_PATH)) {
      return JSON.parse(readFileSync(RATE_LIMIT_PATH, "utf-8"));
    }
  } catch {
  }
  return { session_id: "unknown", issues_created: 0, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
}
function saveRateLimit(state) {
  try {
    const cacheDir = join(homedir(), ".claude", "cache");
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync(RATE_LIMIT_PATH, JSON.stringify(state, null, 2));
  } catch {
  }
}
function getCurrentRepo() {
  try {
    const result = execFileSync2("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}
function createIssue(title, body, labels) {
  const state = loadRateLimit();
  if (state.issues_created >= MAX_ISSUES_PER_SESSION) {
    return null;
  }
  try {
    const args = ["issue", "create", "--title", title.slice(0, 256), "--body", body.slice(0, 4e3)];
    if (labels && labels.length > 0) {
      args.push("--label", labels.join(","));
    }
    const result = execFileSync2("gh", args, {
      encoding: "utf-8",
      timeout: 1e4,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    state.issues_created++;
    state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    saveRateLimit(state);
    return result || null;
  } catch {
    return null;
  }
}

// src/shared/error-patterns.ts
var ERROR_PATTERNS = [
  // --- Build / TypeScript ---
  {
    regex: /error TS(\d+):\s*(.+)/,
    type: "build_fail",
    pattern: "typescript-error",
    lesson: (m) => `TS${m[1]}: ${m[2].slice(0, 80)}`
  },
  {
    regex: /Cannot find module ['"](.+?)['"]/i,
    type: "build_fail",
    pattern: "missing-import",
    lesson: (m) => `${m[1]} import'u eksik`
  },
  {
    regex: /Property ['"](.+?)['"] does not exist/i,
    type: "type_error",
    pattern: "missing-property",
    lesson: (m) => `'${m[1]}' property'si yok`
  },
  {
    regex: /Type ['"](.+?)['"] is not assignable to type ['"](.+?)['"]/i,
    type: "type_error",
    pattern: "type-mismatch",
    lesson: (m) => `${m[1]} \u2192 ${m[2]} atanamaz`
  },
  // --- C# / .NET (Godot C# projeleri dahil) ---
  {
    regex: /error CS(\d{4}):?\s*(.+)/,
    type: "build_fail",
    pattern: "csharp-error",
    lesson: (m) => `CS${m[1]}: ${m[2].slice(0, 80)}`
  },
  {
    regex: /error MSB(\d{4}):?\s*(.+)/,
    type: "build_fail",
    pattern: "msbuild-error",
    lesson: (m) => `MSB${m[1]}: ${m[2].slice(0, 80)}`
  },
  // --- Godot ---
  {
    regex: /SCRIPT ERROR:\s*(.+)/,
    type: "runtime_error",
    pattern: "godot-script-error",
    lesson: (m) => `Godot script: ${m[1].slice(0, 80)}`
  },
  {
    regex: /USER ERROR:\s*(.+)/,
    type: "runtime_error",
    pattern: "godot-user-error",
    lesson: (m) => `Godot: ${m[1].slice(0, 80)}`
  },
  {
    regex: /(?:export template|export preset).{0,50}(?:missing|not found|invalid)/i,
    type: "build_fail",
    pattern: "godot-export-error",
    lesson: () => "Godot export template/preset sorunu \u2014 export ayarlar\u0131n\u0131 kontrol et"
  },
  // --- Rust ---
  {
    regex: /error\[E(\d{4})\]:?\s*(.+)/,
    type: "build_fail",
    pattern: "rust-error",
    lesson: (m) => `rustc E${m[1]}: ${m[2].slice(0, 80)}`
  },
  // --- Test failures (daraltılmış: test-runner biçimleri, düzyazı DEĞİL) ---
  {
    // vitest/jest dosya satırı: "FAIL src/foo.test.ts" — token uzantılı dosya olmalı
    regex: /^\s*(?:✗\s*)?FAIL\s+(\S*\.(?:m?[jt]sx?|py|go|rs|cs|java|rb|php)\b\S*)/m,
    type: "test_fail",
    pattern: "test-failure",
    lesson: (m) => `Test FAIL: ${m[1].slice(0, 80)}`
  },
  {
    // go test özeti: "FAIL\tgithub.com/x/y\t0.123s"
    regex: /^FAIL\s+(\S+)\s+[\d.]+s/m,
    type: "test_fail",
    pattern: "go-test-failure",
    lesson: (m) => `go test FAIL: ${m[1].slice(0, 80)}`
  },
  {
    // pytest: "FAILED tests/test_x.py::test_y"
    regex: /^FAILED\s+(\S+::\S+)/m,
    type: "test_fail",
    pattern: "pytest-failure",
    lesson: (m) => `pytest FAILED: ${m[1].slice(0, 80)}`
  },
  {
    regex: /(\d+) failed/i,
    type: "test_fail",
    pattern: "test-failure",
    lesson: (m) => `${m[1]} test basarisiz`
  },
  // --- Boş test koşumu (false-green: "0 test koştu" = doğrulama YOK) ---
  {
    regex: /No test files? found/i,
    type: "empty_test_run",
    pattern: "empty-test-run",
    lesson: () => 'Test dosyas\u0131 bulunamad\u0131 \u2014 "ye\u015Fil" sayma, test pattern/path yanl\u0131\u015F olabilir'
  },
  {
    regex: /collected 0 items/,
    type: "empty_test_run",
    pattern: "empty-test-run",
    lesson: () => "pytest 0 test toplad\u0131 \u2014 do\u011Frulama yap\u0131lmad\u0131"
  },
  {
    regex: /testing:\s+warning:\s+no tests to run/,
    type: "empty_test_run",
    pattern: "empty-test-run",
    lesson: () => "go test ko\u015Facak test bulamad\u0131 \u2014 do\u011Frulama yap\u0131lmad\u0131"
  },
  {
    regex: /Tests:\s*0 passed,?\s*0 total/,
    type: "empty_test_run",
    pattern: "empty-test-run",
    lesson: () => "Jest 0 test ko\u015Ftu \u2014 do\u011Frulama yap\u0131lmad\u0131"
  },
  // --- Lint ---
  {
    // eslint özeti: "✖ 12 problems (3 errors, 9 warnings)"
    regex: /✖\s+\d+\s+problems?\s+\((\d+)\s+errors?/,
    type: "lint_fail",
    pattern: "eslint-errors",
    lesson: (m) => `eslint: ${m[1]} error`
  },
  // --- Runtime ---
  {
    regex: /TypeError:\s*(.+)/,
    type: "runtime_error",
    pattern: "type-runtime-error",
    lesson: (m) => `TypeError: ${m[1].slice(0, 80)}`
  },
  {
    regex: /ReferenceError:\s*(.+)/,
    type: "runtime_error",
    pattern: "reference-error",
    lesson: (m) => `ReferenceError: ${m[1].slice(0, 80)}`
  },
  {
    regex: /SyntaxError:\s*(.+)/,
    type: "build_fail",
    pattern: "syntax-error",
    lesson: (m) => `SyntaxError: ${m[1].slice(0, 80)}`
  },
  {
    regex: /(?:ENOENT|no such file|ENOENT: no such file or directory)[,:\s]+(?:open|stat|lstat|access|unlink|rename|read)?\s*['"](.+?)['"]/i,
    type: "runtime_error",
    pattern: "missing-file",
    lesson: (m) => `Dosya bulunamadi: ${m[1]}`
  },
  // --- Go build ---
  {
    regex: /undefined:\s*(\w+)/,
    type: "build_fail",
    pattern: "go-undefined",
    lesson: (m) => `${m[1]} tanimlanmamis`
  },
  // --- Python ---
  {
    regex: /ModuleNotFoundError:\s*No module named ['"](.+?)['"]/,
    type: "runtime_error",
    pattern: "python-missing-module",
    lesson: (m) => `Python modul eksik: ${m[1]}`
  }
];

// src/canavar-error-broadcast.ts
function extractFile(output, command) {
  const fileMatch = output.match(/(?:(?:\/|[A-Z]:\\)[\w\/.\\-]+\.\w+)/);
  if (fileMatch) return fileMatch[0].replace(/\\/g, "/");
  if (command) {
    const cmdFile = command.match(/(?:(?:\/|[A-Z]:\\)[\w\/.\\-]+\.\w+)/);
    if (cmdFile) return cmdFile[0].replace(/\\/g, "/");
  }
  return "unknown";
}
function main() {
  let raw = "";
  try {
    raw = readFileSync2(0, "utf-8");
  } catch {
    return;
  }
  if (!raw) {
    console.log("{}");
    return;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    console.log("{}");
    return;
  }
  const isAgentTool = input.tool_name === "Agent";
  const sessionId = input.session_id?.slice(0, 8) || "unknown";
  const agentId = isAgentTool ? input.tool_input?.subagent_type || "unknown-agent" : input.agent_id || "main";
  const agentType = isAgentTool ? input.tool_input?.subagent_type || "unknown-agent" : input.agent_type || "main";
  let output;
  if (isAgentTool) {
    output = typeof input.tool_output === "string" ? input.tool_output : "";
  } else if (typeof input.tool_response === "string") {
    output = input.tool_response;
  } else if (input.tool_response && typeof input.tool_response === "object") {
    const r = input.tool_response;
    output = [r.stdout, r.stderr].filter(Boolean).join("\n") || JSON.stringify(r);
  } else {
    output = "";
  }
  if (!output || output.length < 10) {
    console.log("{}");
    return;
  }
  const errors = [];
  for (const ep of ERROR_PATTERNS) {
    const match = ep.regex.exec(output);
    if (match) {
      errors.push({
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        session: sessionId,
        agent_id: agentId,
        agent_type: agentType,
        error_type: ep.type,
        error_pattern: ep.pattern,
        detail: match[0].slice(0, 200),
        // Agent tool için dosya adını çıktıdan çıkar; Bash için komuttan da bak
        file: extractFile(output, isAgentTool ? void 0 : input.tool_input?.command),
        lesson: ep.lesson(match),
        command: input.tool_input?.command?.slice(0, 200),
        source: "posttooluse-scan"
      });
    }
  }
  if (errors.length > 0) {
    const canavarDir = join2(homedir2(), ".claude", "canavar");
    if (!existsSync2(canavarDir)) mkdirSync2(canavarDir, { recursive: true });
    const ledgerPath = join2(canavarDir, "error-ledger.jsonl");
    for (const err of errors) {
      appendFileSync(ledgerPath, JSON.stringify(err) + "\n");
    }
    const criticalErrors = errors.filter((e) => e.error_type === "build_fail" || e.error_type === "runtime_error");
    if (criticalErrors.length > 0) {
      notify("Hizir: Hata Tespit", `${criticalErrors.length} kritik hata: ${criticalErrors[0].error_pattern}`, "critical");
    }
    try {
      const ledgerPath2 = join2(homedir2(), ".claude", "canavar", "error-ledger.jsonl");
      if (existsSync2(ledgerPath2) && statSync(ledgerPath2).size <= 15e5) {
        const allLines = readFileSync2(ledgerPath2, "utf-8").split("\n").filter((l) => l.trim());
        const patternCounts = /* @__PURE__ */ new Map();
        for (const line of allLines) {
          try {
            const entry = JSON.parse(line);
            patternCounts.set(entry.error_pattern, (patternCounts.get(entry.error_pattern) || 0) + 1);
          } catch {
          }
        }
        for (const err of errors) {
          const count = patternCounts.get(err.error_pattern) || 0;
          if (count >= 3 && getCurrentRepo()) {
            createIssue(
              `[Canavar] Tekrarlayan hata: ${err.error_pattern} (${count}x)`,
              `## Hata Detayi

- **Pattern:** ${err.error_pattern}
- **Tip:** ${err.error_type}
- **Tekrar:** ${count} kez
- **Son ders:** ${err.lesson}
- **Dosya:** ${err.file}

_Otomatik olusturuldu by Canavar_`,
              ["bug", "canavar"]
            );
            break;
          }
        }
      }
    } catch {
    }
  }
  console.log("{}");
}
main();
