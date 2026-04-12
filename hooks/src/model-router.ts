/**
 * model-router.ts - Multi-LLM Model Routing Hook
 *
 * PreToolUse hook for Agent tool calls.
 * Suggests optimal model tier based on agent's tier metadata.
 * Does NOT force - uses additionalContext to recommend.
 *
 * Tier 2 (Sonnet): default for most agents
 * Tier 3 (Opus):   complex agents (architecture, investigation, large refactor)
 *
 * Note: Tier 1 (Haiku) is disabled per user preference.
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

// Valid agent name pattern - prevents path traversal
const VALID_AGENT_NAME = /^[a-zA-Z0-9_-]+$/;

const TIER_MODELS: Record<number, string> = {
  2: 'sonnet',
  3: 'opus',
};

const TIER_LABELS: Record<number, string> = {
  2: 'standard (dev, review, test)',
  3: 'complex (architecture, investigation, large refactor)',
};

// Tier 3 agents - complex work worth Opus
const DEFAULT_TIERS: Record<string, number> = {
  architect: 3,
  planner: 3,
  'tech-lead': 3,
  kraken: 3,
  sleuth: 3,
  'ai-engineer': 3,
  'ddd-expert': 3,
  'clean-arch-expert': 3,
  'security-analyst': 3,
  'data-modeler': 3,
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
  // Validate name before using in paths (prevents traversal)
  if (!VALID_AGENT_NAME.test(agentName)) return 2;

  const agentPaths = [
    join(homedir(), '.claude', 'agents', `${agentName}.md`),
    join(process.cwd(), 'agents', `${agentName}.md`),
  ];

  for (const agentPath of agentPaths) {
    if (existsSync(agentPath)) {
      try {
        const content = readFileSync(agentPath, 'utf-8');
        const fm = parseFrontmatter(content);
        if (fm.tier && (fm.tier === 2 || fm.tier === 3)) return fm.tier;
      } catch { /* skip */ }
    }
  }

  return DEFAULT_TIERS[agentName] || 2;
}

function runHook(): void {
  let input: string;
  try {
    input = readFileSync(0, 'utf-8');
  } catch { return; }

  let data: HookInput;
  try {
    data = JSON.parse(input);
  } catch { return; }

  if (data.tool_name !== 'Agent') return;

  const agentType = data.tool_input?.subagent_type;
  if (!agentType || typeof agentType !== 'string') return;

  // Don't override explicit model choice
  if (data.tool_input?.model) return;

  const tier = getAgentTier(agentType);

  // Only suggest context when tier differs from default (Sonnet)
  if (tier === 2) return;

  const recommendedModel = TIER_MODELS[tier];
  const tierLabel = TIER_LABELS[tier];

  const context = `[Model Router] Agent "${agentType}" is tier ${tier} (${tierLabel}). Recommended model: ${recommendedModel}.`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: context,
    },
  }));
}

try { runHook(); } catch { process.exit(0); }
