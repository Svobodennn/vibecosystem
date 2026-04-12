// src/skill-curator.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
var DRAFTS_DIR = join(homedir(), ".claude", "skills-drafts");
var ARCHIVE_DIR = join(DRAFTS_DIR, "archive");
var SKILLS_DIR = join(homedir(), ".claude", "skills");
var PROMOTION_CONFIDENCE = 80;
var ARCHIVE_CONFIDENCE = 50;
var MAX_DRAFT_AGE_DAYS = 14;
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"(.+)"$/, "$1");
    result[key] = value;
  }
  return result;
}
function loadDrafts() {
  if (!existsSync(DRAFTS_DIR)) return [];
  const drafts = [];
  try {
    const files = readdirSync(DRAFTS_DIR).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filepath = join(DRAFTS_DIR, file);
      try {
        const content = readFileSync(filepath, "utf-8");
        const fm = parseFrontmatter(content);
        if (!fm.name) continue;
        drafts.push({
          name: fm.name,
          description: fm.description || "",
          confidence: parseInt(fm.confidence || "0", 10),
          occurrences: parseInt(fm.occurrences || "0", 10),
          category: fm.category || "unknown",
          status: fm.status || "draft",
          generated_at: fm.generated_at || "",
          filepath
        });
      } catch {
      }
    }
  } catch {
  }
  return drafts;
}
function isDuplicateOfExisting(draft) {
  if (!existsSync(SKILLS_DIR)) return false;
  try {
    const existingSkills = readdirSync(SKILLS_DIR).filter((f) => {
      try {
        return statSync(join(SKILLS_DIR, f)).isDirectory();
      } catch {
        return false;
      }
    });
    if (existingSkills.includes(draft.name)) return true;
    for (const skill of existingSkills) {
      const skillFile = join(SKILLS_DIR, skill, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      try {
        const content = readFileSync(skillFile, "utf-8");
        const fm = parseFrontmatter(content);
        if (fm.category === draft.category && draft.description.length > 20) {
          const descWords = draft.description.toLowerCase().split(/\s+/).slice(0, 5);
          const existingDesc = (fm.description || "").toLowerCase();
          const overlap = descWords.filter((w) => existingDesc.includes(w)).length;
          if (overlap >= 4) return true;
        }
      } catch {
      }
    }
  } catch {
  }
  return false;
}
function daysOld(timestamp) {
  try {
    const then = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - then) / (1e3 * 60 * 60 * 24);
  } catch {
    return 0;
  }
}
function promoteDraft(draft) {
  const skillDir = join(SKILLS_DIR, draft.name);
  if (existsSync(skillDir)) return false;
  try {
    mkdirSync(skillDir, { recursive: true });
    const content = readFileSync(draft.filepath, "utf-8");
    const promoted = content.replace(/status: draft/, "status: active");
    writeFileSync(join(skillDir, "SKILL.md"), promoted);
    try {
      unlinkSync(draft.filepath);
    } catch {
    }
    return true;
  } catch {
    return false;
  }
}
function archiveDraft(draft) {
  try {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    const filename = draft.filepath.split("/").pop() || "unknown.md";
    const archivePath = join(ARCHIVE_DIR, filename);
    renameSync(draft.filepath, archivePath);
    return true;
  } catch {
    return false;
  }
}
function runHook() {
  let input;
  try {
    input = readFileSync(0, "utf-8");
  } catch {
    return;
  }
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return;
  }
  const phase = event.source ?? event.type;
  if (phase !== "startup" && phase !== "resume") return;
  if (!existsSync(DRAFTS_DIR)) return;
  const drafts = loadDrafts();
  if (drafts.length === 0) return;
  let promoted = 0;
  let archived = 0;
  for (const draft of drafts) {
    if (draft.confidence < ARCHIVE_CONFIDENCE) {
      if (archiveDraft(draft)) archived++;
      continue;
    }
    if (daysOld(draft.generated_at) > MAX_DRAFT_AGE_DAYS) {
      if (archiveDraft(draft)) archived++;
      continue;
    }
    if (draft.confidence >= PROMOTION_CONFIDENCE && !isDuplicateOfExisting(draft)) {
      if (promoteDraft(draft)) promoted++;
      continue;
    }
  }
  if (promoted > 0 || archived > 0) {
    const parts = ["[skill-curator]"];
    if (promoted > 0) parts.push(`Promoted ${promoted} draft${promoted === 1 ? "" : "s"} to active skills.`);
    if (archived > 0) parts.push(`Archived ${archived} low-quality draft${archived === 1 ? "" : "s"}.`);
    console.log(JSON.stringify({
      systemMessage: parts.join(" ")
    }));
  }
}
try {
  runHook();
} catch {
  process.exit(0);
}
