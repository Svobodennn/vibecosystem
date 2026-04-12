// src/model-router.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
var VALID_AGENT_NAME = /^[a-zA-Z0-9_-]+$/;
var TIER_MODELS = {
  2: "sonnet",
  3: "opus"
};
var TIER_LABELS = {
  2: "standard (dev, review, test)",
  3: "complex (architecture, investigation, large refactor)"
};
var DEFAULT_TIERS = {
  architect: 3,
  planner: 3,
  "tech-lead": 3,
  kraken: 3,
  sleuth: 3,
  "ai-engineer": 3,
  "ddd-expert": 3,
  "clean-arch-expert": 3,
  "security-analyst": 3,
  "data-modeler": 3
};
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split("\n")) {
    const [key, ...valueParts] = line.split(":");
    if (!key || !valueParts.length) continue;
    const value = valueParts.join(":").trim();
    if (key.trim() === "name") result.name = value;
    if (key.trim() === "model") result.model = value;
    if (key.trim() === "tier") result.tier = parseInt(value, 10);
  }
  return result;
}
function getAgentTier(agentName) {
  if (!VALID_AGENT_NAME.test(agentName)) return 2;
  const agentPaths = [
    join(homedir(), ".claude", "agents", `${agentName}.md`),
    join(process.cwd(), "agents", `${agentName}.md`)
  ];
  for (const agentPath of agentPaths) {
    if (existsSync(agentPath)) {
      try {
        const content = readFileSync(agentPath, "utf-8");
        const fm = parseFrontmatter(content);
        if (fm.tier && (fm.tier === 2 || fm.tier === 3)) return fm.tier;
      } catch {
      }
    }
  }
  return DEFAULT_TIERS[agentName] || 2;
}
function runHook() {
  let input;
  try {
    input = readFileSync(0, "utf-8");
  } catch {
    return;
  }
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }
  if (data.tool_name !== "Agent") return;
  const agentType = data.tool_input?.subagent_type;
  if (!agentType || typeof agentType !== "string") return;
  if (data.tool_input?.model) return;
  const tier = getAgentTier(agentType);
  if (tier === 2) return;
  const recommendedModel = TIER_MODELS[tier];
  const tierLabel = TIER_LABELS[tier];
  const context = `[Model Router] Agent "${agentType}" is tier ${tier} (${tierLabel}). Recommended model: ${recommendedModel}.`;
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: context
    }
  }));
}
try {
  runHook();
} catch {
  process.exit(0);
}
