// src/canavar-cli.ts
import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";

// src/shared/agent-error-scan.ts
import { join, dirname } from "path";
import { homedir } from "os";
var SUBCOMMAND_TOOLS = /* @__PURE__ */ new Set([
  "git",
  "npm",
  "pnpm",
  "yarn",
  "npx",
  "bun",
  "go",
  "cargo",
  "docker",
  "kubectl",
  "dotnet",
  "pip",
  "pip3",
  "python",
  "python3",
  "node",
  "deno",
  "gh",
  "terraform",
  "helm",
  "make",
  "gradle",
  "mvn",
  "composer",
  "bundle"
]);
function normalizeCommandHead(command) {
  if (!command) return "unknown";
  let cmd2 = command.trim();
  const segments = cmd2.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
  const NEVER_FAIL = /^(?:echo|printf|true|:|exit)\b/;
  let seg = "";
  let firstNonCd = "";
  for (const s of segments) {
    if (/^(?:cd|pushd)\s/.test(s)) continue;
    if (!firstNonCd) firstNonCd = s;
    if (!NEVER_FAIL.test(s)) {
      seg = s;
      break;
    }
  }
  seg = seg || firstNonCd || segments[0] || cmd2;
  const tokens = seg.split(/\s+/).filter((t) => !/^[A-Z_][A-Z0-9_]*=/.test(t) && t !== "sudo");
  if (tokens.length === 0) return "unknown";
  const head = (tokens[0].split("/").pop() || tokens[0]).toLowerCase();
  if (SUBCOMMAND_TOOLS.has(head) && tokens[1] && !tokens[1].startsWith("-")) {
    const sub = (tokens[1].split("/").pop() || tokens[1]).slice(0, 40);
    return `${head} ${sub}`;
  }
  return head.slice(0, 50);
}
var LOOKBACK_BYTES = 256 * 1024;
var CANAVAR_DIR = join(homedir(), ".claude", "canavar");
var LEDGER_PATH = join(CANAVAR_DIR, "error-ledger.jsonl");
var MATRIX_PATH = join(CANAVAR_DIR, "skill-matrix.json");

// src/canavar-cli.ts
var canavarDir = join2(homedir2(), ".claude", "canavar");
var matrixPath = join2(canavarDir, "skill-matrix.json");
var ledgerPath = join2(canavarDir, "error-ledger.jsonl");
function loadMatrix() {
  if (!existsSync(matrixPath)) return { agents: {}, updated_at: "" };
  try {
    return JSON.parse(readFileSync(matrixPath, "utf-8"));
  } catch {
    return { agents: {}, updated_at: "" };
  }
}
function loadErrors() {
  if (!existsSync(ledgerPath)) return [];
  const lines = readFileSync(ledgerPath, "utf-8").split("\n").filter((l) => l.trim());
  const results = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch {
    }
  }
  return results;
}
function recentErrors(days = 7) {
  const cutoff = /* @__PURE__ */ new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return loadErrors().filter((e) => new Date(e.ts) >= cutoff);
}
function cmdReport() {
  const matrix = loadMatrix();
  const errors = loadErrors();
  const recent = recentErrors();
  const agents = Object.entries(matrix.agents);
  console.log("=== CANAVAR RAPOR ===\n");
  console.log(`Toplam agent: ${agents.length}`);
  console.log(`Toplam hata (tum zamanlar): ${errors.length}`);
  console.log(`Son 7 gun hata: ${recent.length}`);
  console.log(`Son guncelleme: ${matrix.updated_at || "henuz yok"}
`);
  if (agents.length > 0) {
    console.log("--- Agent Ozeti ---");
    const sorted = agents.sort((a, b) => b[1].total_tasks - a[1].total_tasks);
    for (const [name, profile] of sorted.slice(0, 10)) {
      const rate = (profile.success_rate * 100).toFixed(0);
      console.log(`  ${name}: ${profile.total_tasks} gorev, %${rate} basari, ${profile.failures} hata`);
    }
  }
  if (recent.length > 0) {
    console.log("\n--- Son 7 Gun Hatalar ---");
    const patternCounts = /* @__PURE__ */ new Map();
    for (const e of recent) {
      const key = `${e.agent_type}: ${e.error_pattern}`;
      patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
    }
    const sorted = [...patternCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key, count] of sorted.slice(0, 10)) {
      console.log(`  [${count}x] ${key}`);
    }
  }
}
function cmdAgent(name) {
  const matrix = loadMatrix();
  const profile = matrix.agents[name];
  if (!profile) {
    console.log(`Agent '${name}' bulunamadi.`);
    console.log(`Mevcut agent'lar: ${Object.keys(matrix.agents).join(", ") || "henuz yok"}`);
    return;
  }
  console.log(`=== ${name.toUpperCase()} PROFILI ===
`);
  console.log(`Toplam gorev: ${profile.total_tasks}`);
  console.log(`Basari: ${profile.successes} | Hata: ${profile.failures}`);
  console.log(`Basari orani: %${(profile.success_rate * 100).toFixed(0)}`);
  console.log(`Son aktif: ${profile.last_active || "bilinmiyor"}`);
  const skills = Object.entries(profile.skills);
  if (skills.length > 0) {
    console.log("\n--- Skill'ler ---");
    for (const [skill, stats] of skills) {
      console.log(`  ${skill}: ${stats.attempts} deneme, %${(stats.rate * 100).toFixed(0)} basari`);
    }
  }
  if (profile.common_errors.length > 0) {
    console.log("\n--- Sik Hatalar ---");
    for (const err of profile.common_errors) {
      console.log(`  - ${err}`);
    }
  }
}
function cmdErrors() {
  const recent = recentErrors();
  if (recent.length === 0) {
    console.log("Son 7 gunde hata yok.");
    return;
  }
  console.log(`=== SON 7 GUN HATALARI (${recent.length} toplam) ===
`);
  const patternCounts = /* @__PURE__ */ new Map();
  for (const e of recent) {
    const existing = patternCounts.get(e.error_pattern);
    if (existing) {
      existing.count++;
      existing.agents.add(e.agent_type);
      if (existing.lessons.length < 2 && !existing.lessons.includes(e.lesson)) {
        existing.lessons.push(e.lesson);
      }
    } else {
      patternCounts.set(e.error_pattern, {
        count: 1,
        lessons: [e.lesson],
        agents: /* @__PURE__ */ new Set([e.agent_type])
      });
    }
  }
  const sorted = [...patternCounts.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [pattern, data] of sorted) {
    const agents = [...data.agents].join(", ");
    console.log(`[${data.count}x] ${pattern} (${agents})`);
    for (const lesson of data.lessons) {
      console.log(`  -> ${lesson}`);
    }
  }
}
function cmdWeak() {
  const matrix = loadMatrix();
  const agents = Object.entries(matrix.agents).filter(([, p]) => p.total_tasks >= 2).sort((a, b) => a[1].success_rate - b[1].success_rate);
  if (agents.length === 0) {
    console.log("Yeterli veri yok (en az 2 gorev gerekli).");
    return;
  }
  console.log("=== EN ZAYIF AGENT'LAR ===\n");
  for (const [name, profile] of agents.slice(0, 5)) {
    const rate = (profile.success_rate * 100).toFixed(0);
    console.log(`${name}: %${rate} basari (${profile.failures}/${profile.total_tasks} hata)`);
    if (profile.common_errors.length > 0) {
      console.log(`  Zayif noktalar: ${profile.common_errors.join(", ")}`);
    }
    const weakSkills = Object.entries(profile.skills).filter(([, s]) => s.rate < 0.7 && s.attempts >= 2).sort((a, b) => a[1].rate - b[1].rate);
    if (weakSkills.length > 0) {
      console.log(`  Zayif skill'ler: ${weakSkills.map(([s, st]) => `${s}(%${(st.rate * 100).toFixed(0)})`).join(", ")}`);
    }
  }
}
function cmdLeaderboard() {
  const matrix = loadMatrix();
  const agents = Object.entries(matrix.agents).filter(([, p]) => p.total_tasks >= 1).sort((a, b) => {
    if (b[1].success_rate !== a[1].success_rate) return b[1].success_rate - a[1].success_rate;
    return b[1].total_tasks - a[1].total_tasks;
  });
  if (agents.length === 0) {
    console.log("Henuz veri yok.");
    return;
  }
  console.log("=== AGENT LEADERBOARD ===\n");
  console.log("  #  Agent              Gorev  Basari  Hata  Oran");
  console.log("  -- ----               -----  ------  ----  ----");
  agents.forEach(([name, profile], i) => {
    const rank = i + 1;
    const rate = (profile.success_rate * 100).toFixed(0);
    const medal = rank <= 3 ? ["1.", "2.", "3."][i] : `${rank}.`;
    console.log(`  ${medal.padEnd(3)} ${name.padEnd(18)} ${String(profile.total_tasks).padEnd(6)} ${String(profile.successes).padEnd(7)} ${String(profile.failures).padEnd(5)} %${rate}`);
  });
}
function cmdCmdFail(daysArg) {
  const days = parseInt(daysArg, 10) || 30;
  const recent = recentErrors(days);
  const byCommand = /* @__PURE__ */ new Map();
  let scanned = 0;
  for (const e of recent) {
    const head = e.command_head || (e.command ? normalizeCommandHead(e.command) : null);
    if (!head) continue;
    scanned++;
    let stats = byCommand.get(head);
    if (!stats) {
      stats = { count: 0, agents: /* @__PURE__ */ new Map(), classifications: /* @__PURE__ */ new Map(), lastExample: "", lastLesson: "", lastTs: "" };
      byCommand.set(head, stats);
    }
    stats.count++;
    stats.agents.set(e.agent_type, (stats.agents.get(e.agent_type) || 0) + 1);
    stats.classifications.set(e.error_type, (stats.classifications.get(e.error_type) || 0) + 1);
    if (e.ts >= stats.lastTs) {
      stats.lastTs = e.ts;
      stats.lastExample = (e.command || e.detail || "").slice(0, 100);
      stats.lastLesson = e.lesson || "";
    }
  }
  console.log(`=== KOMUT BAZLI FAIL RAPORU (son ${days} gun) ===
`);
  if (byCommand.size === 0) {
    console.log("Komut bilgisi iceren hata kaydi yok.");
    console.log(`(Taranan hata: ${recent.length} \u2014 eski kayitlarda command alani bulunmuyor.)`);
    console.log("Subagent error scan aktif oldukca yeni kayitlar komut bilgisiyle birikecek.");
    return;
  }
  console.log(`Komut bilgili hata: ${scanned}/${recent.length}
`);
  console.log("  #   Komut                      Fail  Siniflar                  Agent'lar");
  console.log("  --  -----                      ----  --------                  --------");
  const sorted = [...byCommand.entries()].sort((a, b) => b[1].count - a[1].count);
  sorted.slice(0, 20).forEach(([head, stats], i) => {
    const classes = [...stats.classifications.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}(${n})`).join(", ");
    const agents = [...stats.agents.entries()].sort((a, b) => b[1] - a[1]).map(([a2, n]) => `${a2}(${n})`).join(", ");
    console.log(`  ${String(i + 1).padEnd(3)} ${head.padEnd(26)} ${String(stats.count).padEnd(5)} ${classes.slice(0, 25).padEnd(25)} ${agents.slice(0, 50)}`);
  });
  console.log("\n--- Ilk 5 icin son ornek + ders ---");
  for (const [head, stats] of sorted.slice(0, 5)) {
    console.log(`
[${head}] (${stats.count}x, son: ${stats.lastTs.slice(0, 16)})`);
    if (stats.lastExample) console.log(`  ornek: ${stats.lastExample}`);
    if (stats.lastLesson) console.log(`  ders:  ${stats.lastLesson}`);
  }
}
function cmdHealth() {
  const issues = [];
  const ok = [];
  const claudeDir = join2(homedir2(), ".claude");
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(join2(claudeDir, "settings.json"), "utf-8"));
  } catch {
    issues.push("settings.json okunamad\u0131/bozuk");
  }
  const registered = /* @__PURE__ */ new Map();
  let missingDist = 0;
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    for (const g of groups || []) {
      for (const h of g.hooks || []) {
        const m = /\/dist\/([\w-]+\.mjs)/.exec(h.command || "");
        if (!m) continue;
        const list = registered.get(event) || [];
        list.push(m[1]);
        registered.set(event, list);
        const distPath = join2(claudeDir, "hooks", "dist", m[1]);
        if (!existsSync(distPath)) {
          issues.push(`${event}: ${m[1]} kay\u0131tl\u0131 ama dist dosyas\u0131 YOK`);
          missingDist++;
        }
      }
    }
  }
  if (missingDist === 0 && registered.size > 0) {
    ok.push(`T\xFCm kay\u0131tl\u0131 hook dist dosyalar\u0131 mevcut (${[...registered.values()].flat().length} hook)`);
  }
  const critical = [
    ["SubagentStop", "subagent-stop-learner.mjs"],
    ["SubagentStart", "canavar-subagent-tracker.mjs"],
    ["Stop", "canavar-main-scan.mjs"],
    ["PostToolUse", "canavar-error-broadcast.mjs"]
  ];
  for (const [event, file] of critical) {
    if ((registered.get(event) || []).includes(file)) {
      ok.push(`${event} \u2192 ${file} kay\u0131tl\u0131`);
    } else {
      issues.push(`KR\u0130T\u0130K: ${event} \u2192 ${file} settings.json'da KAYITLI DE\u011E\u0130L`);
    }
  }
  const lastTs = (entries) => entries.length ? entries[entries.length - 1].ts : "";
  const errors = loadErrors();
  const matrix = loadMatrix();
  if (existsSync(ledgerPath)) {
    const sizeKb = Math.round(statSync(ledgerPath).size / 1024);
    ok.push(`Ledger: ${errors.length} kay\u0131t, ${sizeKb}KB, son: ${lastTs(errors).slice(0, 16) || "-"}`);
    if (sizeKb > 1024) issues.push(`Ledger ${sizeKb}KB \u2014 rotation bekleniyor (1MB e\u015Fik), main-scan \xE7al\u0131\u015F\u0131yor mu?`);
  } else {
    issues.push("error-ledger.jsonl yok (hen\xFCz hata kaydedilmedi ya da zincir kopuk)");
  }
  const archiveDir = join2(canavarDir, "archive");
  if (existsSync(archiveDir)) {
    ok.push(`Ar\u015Fiv: ${readdirSync(archiveDir).length} devir dosyas\u0131`);
  }
  ok.push(`Matrix: ${Object.keys(matrix.agents).length} agent profili, g\xFCncelleme: ${(matrix.updated_at || "-").slice(0, 16)}`);
  const runningPath = join2(canavarDir, "running-agents.json");
  try {
    if (existsSync(runningPath)) {
      const running = JSON.parse(readFileSync(runningPath, "utf-8"));
      const names = Object.values(running).map((r) => r.agent_type);
      ok.push(`\xC7al\u0131\u015Fan agent kayd\u0131: ${names.length}${names.length ? ` (${names.slice(0, 5).join(", ")})` : ""}`);
    }
  } catch {
    issues.push("running-agents.json bozuk");
  }
  try {
    const eventsPath = join2(claudeDir, "agent-events.jsonl");
    if (existsSync(eventsPath)) {
      const raw = readFileSync(eventsPath, "utf-8");
      const lastLine = raw.trimEnd().split("\n").pop() || "";
      const lastEventTs = Date.parse(JSON.parse(lastLine).timestamp || "");
      const lastCanavarTs = Math.max(Date.parse(lastTs(errors) || "0") || 0, Date.parse(matrix.updated_at || "0") || 0);
      const DAY = 24 * 36e5;
      if (Number.isFinite(lastEventTs) && Date.now() - lastEventTs < DAY && lastCanavarTs && lastEventTs - lastCanavarTs > DAY) {
        issues.push("HEARTBEAT: Son 24h'te agent aktivitesi var ama Canavar 24h+ yazmam\u0131\u015F \u2014 hook zinciri sessizce \xF6lm\xFC\u015F olabilir");
      } else {
        ok.push("Heartbeat: agent aktivitesi ile Canavar yaz\u0131m\u0131 tutarl\u0131");
      }
    }
  } catch {
  }
  console.log("=== CANAVAR HEALTH ===\n");
  for (const line of ok) console.log(`  [OK]   ${line}`);
  if (issues.length === 0) {
    console.log("\nSONU\xC7: SA\u011ELIKLI \u2014 t\xFCm zincir yerinde.");
  } else {
    console.log("");
    for (const line of issues) console.log(`  [WARN] ${line}`);
    console.log(`
SONU\xC7: ${issues.length} sorun bulundu.`);
  }
}
function cmdTune() {
  const cacheDir = join2(homedir2(), ".claude", "cache");
  const reportPath = join2(cacheDir, "tuning-recommendations.json");
  if (!existsSync(reportPath)) {
    console.log('Tuning raporu bulunamadi. Once "node dist/agent-tuner.mjs" calistirin.');
    return;
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    console.log(`=== TUNING ONERILERI (${report.ts}) ===
`);
    console.log(`Toplam: ${report.recommendations?.length || 0} oneri
`);
    for (const rec of report.recommendations || []) {
      const icon = rec.action === "retrain" ? "[!]" : rec.action === "specialize" ? "[~]" : rec.action === "reassign" ? "[-]" : "[+]";
      console.log(`${icon} ${rec.agent} \u2192 ${rec.action.toUpperCase()} (${rec.priority})`);
      console.log(`   ${rec.reason}`);
      console.log(`   ${rec.details}
`);
    }
  } catch (e) {
    console.log("Tuning raporu okunamadi:", e);
  }
}
var args = process.argv.slice(2);
var cmd = args[0] || "report";
switch (cmd) {
  case "report":
    cmdReport();
    break;
  case "agent":
    cmdAgent(args[1] || "");
    break;
  case "errors":
    cmdErrors();
    break;
  case "weak":
    cmdWeak();
    break;
  case "leaderboard":
    cmdLeaderboard();
    break;
  case "tune":
    cmdTune();
    break;
  case "cmdfail":
    cmdCmdFail(args[1] || "30");
    break;
  case "health":
    cmdHealth();
    break;
  default:
    console.log("Canavar CLI - Agent Cross-Training System");
    console.log("Komutlar:");
    console.log("  report        - Genel durum raporu");
    console.log("  agent <isim>  - Tek agent detay");
    console.log("  errors        - Son 7 gun hatalari");
    console.log("  weak          - En zayif agent'lar");
    console.log("  leaderboard   - Basari siralamas\u0131");
    console.log("  tune          - Agent tuning onerileri");
    console.log("  cmdfail [gun] - Agent'lar hangi komutlarda fail yiyor (varsayilan 30 gun)");
    console.log("  health        - Hook zinciri saglik kontrolu (kayitlar, dist, heartbeat)");
}
