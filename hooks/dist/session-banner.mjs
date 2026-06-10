// src/session-banner.ts
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var INJECT_THRESHOLD = 5;
var MAX_INJECT = 10;
var TEAM_ERRORS_DAYS = 7;
var MAX_TEAM_ERRORS = 5;
var BOX_W = 74;
function countFiles(dir, ext) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return "?";
  }
}
function countDirs(dir) {
  try {
    return readdirSync(dir).filter((f) => {
      try {
        return statSync(join(dir, f)).isDirectory();
      } catch {
        return false;
      }
    }).length;
  } catch {
    return "?";
  }
}
function pad(str, w) {
  const len = [...str].length;
  return len >= w ? str.slice(0, w) : str + " ".repeat(w - len);
}
function boxLine(str) {
  return `  \u2502 ${pad(str, BOX_W - 6)} \u2502`;
}
function loadPatterns() {
  const maturePath = join(homedir(), ".claude", "mature-instincts.json");
  if (!existsSync(maturePath)) return [];
  try {
    const instincts = JSON.parse(readFileSync(maturePath, "utf-8"));
    return instincts.filter((i) => i.confidence >= INJECT_THRESHOLD).sort((a, b) => b.confidence - a.confidence).slice(0, MAX_INJECT);
  } catch {
    return [];
  }
}
function loadTeamErrors() {
  const ledgerPath = join(homedir(), ".claude", "canavar", "error-ledger.jsonl");
  if (!existsSync(ledgerPath)) return [];
  const cutoff = /* @__PURE__ */ new Date();
  cutoff.setDate(cutoff.getDate() - TEAM_ERRORS_DAYS);
  const lines = readFileSync(ledgerPath, "utf-8").split("\n").filter((l) => l.trim());
  const recent = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (new Date(entry.ts) >= cutoff) recent.push(entry);
    } catch {
    }
  }
  if (recent.length === 0) return [];
  const grouped = /* @__PURE__ */ new Map();
  for (const e of recent) {
    const key = `${e.agent_type}:${e.error_pattern}`;
    const existing = grouped.get(key);
    if (existing) existing.count++;
    else grouped.set(key, { count: 1, agent: e.agent_type, lesson: e.lesson });
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, MAX_TEAM_ERRORS);
}
function main() {
  try {
    readFileSync(0, "utf-8");
  } catch {
  }
  const patterns = loadPatterns();
  const errors = loadTeamErrors();
  const banner = [
    "",
    "        __   _(_) |__   ___  ___ ___  ___ _   _ ___| |_ ___ _ __ ___",
    "        \\ \\ / / | '_ \\ / _ \\/ __/ _ \\/ __| | | / __| __/ _ \\ '_ ` _ \\",
    "         \\ V /| | |_) |  __/ (_| (_) \\__ \\ |_| \\__ \\ ||  __/ | | | | |",
    "          \\_/ |_|_.__/ \\___|\\___|___/|___/\\__, |___/\\__\\___|_| |_| |_|",
    "                                          |___/",
    "                              v3.3 \xB7 by @vibeeval",
    "",
    `          ${countFiles(join(homedir(), ".claude", "agents"), ".md")} agents  \xB7  ${countDirs(join(homedir(), ".claude", "skills"))} skills  \xB7  ${countFiles(join(homedir(), ".claude", "hooks", "dist"), ".mjs")} hooks`
  ];
  if (patterns.length > 0) {
    const sep = "\u2500".repeat(BOX_W - 4);
    banner.push("");
    banner.push(`  \u250C\u2500 Patterns ${sep.slice(12)}\u2510`);
    for (const p of patterns) {
      const label = p.pattern.replace(/-/g, " ");
      const promoted = p.promoted ? " \u2605" : "";
      banner.push(boxLine(`${label} (${p.count}x)${promoted}`));
    }
    if (errors.length > 0) {
      banner.push(`  \u251C\u2500 Errors (${TEAM_ERRORS_DAYS}d) ${sep.slice(13)}\u2524`);
      for (const e of errors) {
        const lesson = e.lesson.split("\n")[0].slice(0, BOX_W - 16);
        banner.push(boxLine(`[${e.count}x] ${e.agent}: ${lesson}`));
      }
    }
    banner.push(`  \u2514${"\u2500".repeat(BOX_W - 2)}\u2518`);
  }
  const systemMsg = banner.join("\n");
  const patternInfo = patterns.length > 0 ? `${patterns.length} patterns` : "";
  const errorInfo = errors.length > 0 ? ` + ${errors.length} errors` : "";
  console.log(JSON.stringify({
    result: `vibecosystem ready \xB7 ${patternInfo}${errorInfo}`,
    systemMessage: systemMsg
  }));
}
main();
