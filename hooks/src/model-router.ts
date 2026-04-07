/**
 * model-router.ts - Multi-LLM Model Routing Hook
 *
 * PreToolUse hook for Agent tool calls.
 * Suggests optimal model tier based on agent's tier metadata.
 * Does NOT force - uses additionalContext to recommend.
 *
 * Tier 1 (Haiku):  doc-updater, technical-writer, scribe, catalyst, etc.
 * Tier 2 (Sonnet):  code-reviewer, frontend-dev, backend-dev, etc. (default)
 * Tier 3 (Opus):   architect, planner, kraken, sleuth, etc.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface HookInput {
  tool_name: string;
  tool_input: {
    subagent_type?: string;
    model?: string;
    prompt?: string;
  };
}

interface AgentFrontmatter {
  name?: string;
  model?: string;
  tier?: number;
}

const TIER_MODELS: Record<number, string> = {
  1: 'haiku',
  2: 'sonnet',
  3: 'opus',
};

const TIER_LABELS: Record<number, string> = {
  1: 'lightweight (docs, scaffold, i18n)',
  2: 'standard (dev, review, test)',
  3: 'complex (architecture, investigation, large refactor)',
};

// Default tier assignments for known agents
const DEFAULT_TIERS: Record<string, number> = {
  // Tier 1 - Lightweight
  'doc-updater': 1, 'technical-writer': 1, 'scribe': 1,
  'catalyst': 1, 'template-engine': 1, 'code-generator': 1,
  'babel': 1, 'i18n-expert': 1, 'copywriter': 1,
  'herald': 1, 'api-doc-generator': 1, 'schema-validator': 1,
  'config-validator': 1, 'community-manager': 1,

  // Tier 3 - Complex
  'architect': 3, 'planner': 3, 'tech-lead': 3,
  'kraken': 3, 'sleuth': 3, 'ai-engineer': 3,
  'ddd-expert': 3, 'clean-arch-expert': 3,
  'security-analyst': 3, 'data-modeler': 3,
};

function parseFrontmatter(content: string): AgentFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: AgentFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const [key, ...valueParts] = line.split(':');
    if (!key || !valueParts.length) continue;
    const value = valueParts.join(':').trim();
    if (key.trim() === 'name') result.name = value;
    if (key.trim() === 'model') result.model = value;
    if (key.trim() === 'tier') result.tier = parseInt(value, 10);
  }
  return result;
}

function getAgentTier(agentName: string): number {
  // Check agent file for tier metadata
  const agentPaths = [
    join(homedir(), '.claude', 'agents', `${agentName}.md`),
    join(process.cwd(), 'agents', `${agentName}.md`),
  ];

  for (const agentPath of agentPaths) {
    if (existsSync(agentPath)) {
      try {
        const content = readFileSync(agentPath, 'utf-8');
        const fm = parseFrontmatter(content);
        if (fm.tier) return fm.tier;
      } catch {}
    }
  }

  // Fallback to default tier map
  return DEFAULT_TIERS[agentName] || 2;
}

async function main() {
  let input: string;
  try {
    input = readFileSync('/dev/stdin', 'utf-8');
  } catch {
    process.exit(0);
  }

  let data: HookInput;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  // Only process Agent tool calls
  if (data.tool_name !== 'Agent') {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const agentType = data.tool_input?.subagent_type;
  if (!agentType) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // If model is already explicitly set, don't override
  if (data.tool_input?.model) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const tier = getAgentTier(agentType);
  const recommendedModel = TIER_MODELS[tier];
  const tierLabel = TIER_LABELS[tier];

  // Only add context if tier differs from default (sonnet)
  if (tier === 2) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const context = `[Model Router] Agent "${agentType}" is tier ${tier} (${tierLabel}). Recommended model: ${recommendedModel}. Set model: "${recommendedModel}" for optimal cost/quality balance.`;

  console.log(JSON.stringify({
    result: 'approve',
    additionalContext: context,
  }));
}

main().catch(() => process.exit(0));
