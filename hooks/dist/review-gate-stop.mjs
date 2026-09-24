#!/usr/bin/env node

// src/review-gate-stop.ts
import { readFileSync, existsSync, appendFileSync, mkdirSync, statSync } from "fs";
import { join, dirname, isAbsolute, resolve } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
var CODE_EXT = "ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|rb|php|c|h|hpp|cpp|cs|sh|zsh|bash|sql|vue|svelte|scss|sass|css|gd|lua";
var EXCLUDE_SEG = /\/(?:node_modules|dist|build|out|\.git|scratchpad|backups|\.archive|coverage|__pycache__|vendor|\.next|\.venv|tmp)\//;
var EXCLUDE_ROOT = /^(?:\/private)?\/tmp\/|^\/var\/folders\//;
var LIB_DENY = /* @__PURE__ */ new Set([
  "next.js",
  "node.js",
  "nuxt.js",
  "vue.js",
  "three.js",
  "d3.js",
  "express.js",
  "react.js",
  "chart.js",
  "alpine.js",
  "ember.js",
  "backbone.js",
  "jquery.js",
  "socket.js",
  "nest.js",
  "remix.js",
  "astro.js",
  "svelte.js",
  "solid.js",
  "qwik.js",
  "discord.js",
  "video.js",
  "pixi.js",
  "p5.js",
  "anime.js"
]);
var PATH_SRC = `[\\w./~@+$-]*[\\w+-]+\\.(?:${CODE_EXT})(?![\\w.])`;
var PATH_RE = new RegExp(PATH_SRC, "g");
var TARGET_EXTRACTORS = [
  new RegExp(`\\bsed\\s+(?:-[a-zA-Z]+\\s+)*-i(?:\\s+\\S+)?\\s+["']?(${PATH_SRC})`, "g"),
  // Solda ayirici sart: onsuz HTML etiketleri, arrow fonksiyonlari ve ASCII
  // oklari shell yonlendirmesi sanildi -- "<code>x.mjs", "cols.map(r => r.c)",
  // "-> http.ts" hepsi hedef olarak sayiliyordu. Sayi yazmiyorum: olcum korpusu
  // (transcript'ler) bu regex'i tartisan oturumlari da iceriyor, o yuzden her
  // olcum kendi kendini besleyip yukari suruklenir.
  // \d{0,2} ayiricidan SONRA geldigi icin "2>f.py" / "10>f.py" fd
  // yonlendirmesini kapsar ama "<h2>report.ts" FP'sini acmaz.
  // Karakter sinifina " EKLEMEYIN: 'class="m">dosya.py' bicimindeki HTML
  // attribute kapanislarini geri getirir. (' pratikte hicbir sey getirmiyor;
  // is yapan karakter " -- FP'nin sekli shell tirnagi degil HTML attribute'u.)
  new RegExp(`(?:^|[\\s;|&()])\\d{0,2}?>>?\\s*["']?(${PATH_SRC})`, "g"),
  new RegExp(`\\btee\\s+(?:-a\\s+)?["']?(${PATH_SRC})`, "g"),
  new RegExp(`\\b(?:cp|mv|install)\\s+(?:-\\S+\\s+)*\\S+\\s+["']?(${PATH_SRC})`, "g"),
  new RegExp(`\\bopen\\(\\s*["'](${PATH_SRC})["']\\s*,\\s*["'][wax]`, "g"),
  new RegExp(`\\b(?:writeFileSync|appendFileSync)\\(\\s*["'](${PATH_SRC})["']`, "g")
];
var WRITE_SIGNAL_DEFS = [
  // open(<literal>,'w') TIER 1'de var; open(<degisken>,'w') gorunmez.
  { re: /\bopen\([^)]*["'][wax]/, opaque: false },
  { re: /\bopen\(\s*[^"'\s)][^)]*["'][wax]/, opaque: true },
  { re: /\b(?:writeFileSync|appendFileSync)\(/, opaque: false },
  { re: /\b(?:writeFileSync|appendFileSync)\(\s*[^"'\s)]/, opaque: true },
  // write_text'in literal karsiligi hic yok -- her zaman opaque.
  { re: /\.write_text\(/, opaque: true },
  // sed -i dosyayi YERINDE degistirir, yani tanimi geregi gercek bir kaynak
  // mutasyonu. Hedefi olculdu: 92 komutun 6'sinda TIER 1 bir sey yakaliyor,
  // o 6'nin 5'inde yakaladigi sey dosya degil sed IFADESI. Yani pratikte
  // gorunmez => opaque. Bunu kacirmak "sed -i ... src/real.ts  # log > /tmp/o.ts"
  // gibi bir komutta gercek edit'i sessizce dusuruyordu.
  { re: /\bsed\s+(?:-[a-zA-Z]+\s+)*-i\b/, opaque: true },
  { re: /\bgit\s+apply\b|\bpatch\s+-p\d/, opaque: true },
  // TIER 1'deki ayni ayirici sarti burada da olmali: onsuz 'echo "a=>$b"' veya
  // '-> $TMPD' gibi bir prose oku yazma sinyali sayiliyor ve TIER 2 komuttaki
  // ilk kod yolunu hedef olarak dondururuyor -- hicbir sey yazilmadigi halde.
  // OPAQUE degil: hedef "$VAR/..." formunda TIER 1 tarafindan GORULUR; cozulup
  // dislanmasi ile cozulememesi ayri seyler ve bu ayrimi cagri yeri yapar.
  { re: /(?:^|[\s;|&()])\d{0,2}?>>?\s*["']?\$/, opaque: false }
];
var WRITE_SIGNALS = WRITE_SIGNAL_DEFS.map((d) => d.re);
var OPAQUE_WRITE_SIGNALS = WRITE_SIGNAL_DEFS.filter((d) => d.opaque).map((d) => d.re);
var REVIEW_AGENTS = /* @__PURE__ */ new Set([
  "code-reviewer",
  "verifier",
  "security-reviewer",
  "python-reviewer",
  "go-reviewer",
  "database-reviewer",
  "review-agent"
]);
function resolveDollarPath(path, command, usePos) {
  if (!path.includes("$")) {
    return path;
  }
  const m = /^\$(\w+)(.*)$/.exec(path);
  if (!m) {
    return null;
  }
  const [, varName, rest] = m;
  const assign = new RegExp(
    `(?:^|[\\s;&|(])${varName}=(?:"([^"]*)"|'([^']*)'|([^\\s;&|)"']+))`,
    "g"
  );
  let chosen = null;
  for (const hit of command.matchAll(assign)) {
    if (hit.index !== void 0 && hit.index >= usePos) {
      break;
    }
    chosen = hit[1] ?? hit[2] ?? hit[3] ?? "";
  }
  if (!chosen || chosen.includes("$")) {
    return null;
  }
  let value = chosen;
  if (value.startsWith("~")) {
    value = homedir() + value.slice(1);
  }
  const resolved = value.replace(/\/+$/, "") + rest;
  if (resolved.includes("$")) {
    return null;
  }
  return resolved;
}
var CODE_FILE_RE = new RegExp(`\\.(?:${CODE_EXT})$`);
var MAX_TRANSCRIPT_BYTES = 120 * 1024 * 1024;
var MAX_FILES_IN_MESSAGE = 6;
function isRealCodePath(p) {
  if (!p || EXCLUDE_SEG.test(p) || EXCLUDE_ROOT.test(p)) {
    return false;
  }
  const base = (p.split("/").pop() || "").toLowerCase();
  return !LIB_DENY.has(base);
}
function bashTargets(command) {
  let sawExcluded = false;
  let sawUnresolvable = false;
  const accept = (raw, usePos, out) => {
    const resolved = resolveDollarPath(raw, command, usePos);
    if (resolved === null) {
      sawUnresolvable = true;
      return;
    }
    if (!isRealCodePath(resolved)) {
      sawExcluded = true;
      return;
    }
    out.push(resolved);
  };
  const found = [];
  for (const re of TARGET_EXTRACTORS) {
    re.lastIndex = 0;
    let m2;
    while ((m2 = re.exec(command)) !== null) {
      if (m2[1]) {
        accept(m2[1], m2.index + m2[0].lastIndexOf(m2[1]), found);
      }
    }
  }
  if (found.length > 0) {
    return found;
  }
  if (sawExcluded && !sawUnresolvable && !OPAQUE_WRITE_SIGNALS.some((sig) => sig.test(command))) {
    return [];
  }
  if (!WRITE_SIGNALS.some((s) => s.test(command))) {
    return [];
  }
  const fallback = [];
  PATH_RE.lastIndex = 0;
  let m;
  while ((m = PATH_RE.exec(command)) !== null) {
    accept(m[0], m.index, fallback);
    if (fallback.length > 0) {
      break;
    }
  }
  PATH_RE.lastIndex = 0;
  return fallback;
}
function scanTranscript(path) {
  const files = /* @__PURE__ */ new Set();
  const reviewers = /* @__PURE__ */ new Set();
  const raw = readFileSync(path, "utf-8");
  for (const line of raw.split("\n")) {
    if (!line.includes('"tool_use"')) {
      continue;
    }
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry.message;
    const content = message?.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const b = block;
      if (b.type !== "tool_use") {
        continue;
      }
      const input = b.input || {};
      if (b.name === "Edit" || b.name === "Write" || b.name === "NotebookEdit") {
        const fp = String(input.file_path || input.notebook_path || "");
        if (CODE_FILE_RE.test(fp) && isRealCodePath(fp)) {
          files.add(fp);
        }
      } else if (b.name === "Bash") {
        for (const t of bashTargets(String(input.command || ""))) {
          files.add(t);
        }
      } else if (b.name === "Agent" || b.name === "Task") {
        const st = String(input.subagent_type || "");
        if (REVIEW_AGENTS.has(st)) {
          reviewers.add(st);
        }
      }
    }
  }
  return { files: [...files], reviewers: [...reviewers] };
}
function recordEvasion(sessionId, fileCount) {
  try {
    const dir = join(homedir(), ".claude", "canavar");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(join(dir, "error-ledger.jsonl"), JSON.stringify({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      session: sessionId.slice(0, 8),
      agent_id: "main",
      agent_type: "main",
      error_type: "review_gate_evaded",
      error_pattern: "code edited, no reviewer spawned, gate passed on second stop",
      detail: `${fileCount} kod dosyasi degisti, review/verify agent'i sevk edilmedi`,
      file: "",
      lesson: "Kod yazildiginda code-reviewer sevki zorunlu (auto-skill-activation.md)",
      source: "review-gate-stop"
    }) + "\n");
  } catch {
  }
}
var NUDGE_DIR = join(homedir(), ".claude", "canavar", "review-gate-nudged");
function nudgeMarker(sessionId) {
  return join(NUDGE_DIR, `${sessionId.replace(/[^\w-]/g, "_").slice(0, 64)}.marker`);
}
function alreadyNudged(sessionId) {
  try {
    return existsSync(nudgeMarker(sessionId));
  } catch {
    return false;
  }
}
function markNudged(sessionId) {
  try {
    if (!existsSync(NUDGE_DIR)) {
      mkdirSync(NUDGE_DIR, { recursive: true });
    }
    appendFileSync(nudgeMarker(sessionId), (/* @__PURE__ */ new Date()).toISOString() + "\n");
  } catch {
  }
}
function keepActuallyChanged(files) {
  const kept = [];
  for (const f of files) {
    let provenClean = false;
    try {
      const abs = isAbsolute(f) ? f : resolve(process.cwd(), f);
      let dir = dirname(abs);
      while (dir !== dirname(dir) && !existsSync(dir)) {
        dir = dirname(dir);
      }
      const out = execFileSync("git", ["status", "--porcelain", "--", abs], {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3e3
      });
      provenClean = out.trim() === "";
    } catch {
      provenClean = false;
    }
    if (!provenClean) {
      kept.push(f);
    }
  }
  return kept;
}
function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
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
  if (input.hook_event_name !== "Stop" || !input.transcript_path) {
    console.log("{}");
    return;
  }
  let scan;
  try {
    if (!existsSync(input.transcript_path)) {
      console.log("{}");
      return;
    }
    if (statSync(input.transcript_path).size > MAX_TRANSCRIPT_BYTES) {
      console.log("{}");
      return;
    }
    scan = scanTranscript(input.transcript_path);
  } catch {
    console.log("{}");
    return;
  }
  if (scan.files.length === 0 || scan.reviewers.length > 0) {
    console.log("{}");
    return;
  }
  const changed = keepActuallyChanged(scan.files);
  if (changed.length === 0) {
    console.log("{}");
    return;
  }
  if (input.stop_hook_active === true) {
    recordEvasion(input.session_id || "unknown", changed.length);
    console.log("{}");
    return;
  }
  const sid = input.session_id || "unknown";
  if (alreadyNudged(sid)) {
    recordEvasion(sid, changed.length);
    console.log("{}");
    return;
  }
  markNudged(sid);
  const shown = changed.slice(0, MAX_FILES_IN_MESSAGE);
  const rest = changed.length - shown.length;
  const fileList = shown.map((f) => `  - ${f}`).join("\n") + (rest > 0 ? `
  - ... (+${rest} dosya daha)` : "");
  console.log(JSON.stringify({
    decision: "block",
    reason: [
      `Bu oturumda ${changed.length} kod dosyasi degisti ama hicbir review/verify agent'i sevk edilmedi.`,
      "",
      "Degisen dosyalar:",
      fileList,
      "",
      "Yapilacak: `code-reviewer` sevk et (auto-skill-activation.md -- kod yazildi -> review OTOMATIK).",
      "Is tamamlandiysa `verifier` de calistir (build + test + lint + type check).",
      "Auth/user-input/API/hassas veri dokunulduysa `security-reviewer` ekle.",
      "",
      "Agent sevki kalici onaylidir (CLAUDE.md STANDING AUTHORIZATION) -- izin isteme, sevk et.",
      "Review gercekten gerekmiyorsa tekrar durabilirsin; bu kapi bir kez durtur, ikinci kez bloklamaz."
    ].join("\n")
  }));
}
main();
export {
  bashTargets,
  resolveDollarPath
};
