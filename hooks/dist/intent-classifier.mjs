// src/intent-classifier.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// src/shared/task-detector.ts
var IMPLEMENTATION_INDICATORS = [
  { pattern: /\bimplement\b/i, keyword: "implement", type: "implementation", weight: 0.9 },
  { pattern: /\bbuild\b/i, keyword: "build", type: "implementation", weight: 0.9 },
  { pattern: /\bcreate\b/i, keyword: "create", type: "implementation", weight: 0.8 },
  { pattern: /\badd\s+(a\s+)?feature/i, keyword: "add feature", type: "implementation", weight: 0.85 },
  { pattern: /\bwrite\s+(a\s+)?(function|class|method|component|module)/i, keyword: "write", type: "implementation", weight: 0.85 },
  { pattern: /\bdevelop\b/i, keyword: "develop", type: "implementation", weight: 0.8 },
  { pattern: /\bset\s*up\b/i, keyword: "set up", type: "implementation", weight: 0.7 },
  { pattern: /\bconfigure\b/i, keyword: "configure", type: "implementation", weight: 0.7 },
  { pattern: /\brefactor\b/i, keyword: "refactor", type: "implementation", weight: 0.8 },
  { pattern: /\bmigrate\b/i, keyword: "migrate", type: "implementation", weight: 0.75 }
];
var DEBUG_INDICATORS = [
  { pattern: /\bdebug\b/i, keyword: "debug", type: "debug", weight: 0.9 },
  { pattern: /\bfix\s+(the\s+)?(bug|issue|error|problem)/i, keyword: "fix bug", type: "debug", weight: 0.9 },
  { pattern: /\binvestigate\b/i, keyword: "investigate", type: "debug", weight: 0.85 },
  { pattern: /\btroubleshoot\b/i, keyword: "troubleshoot", type: "debug", weight: 0.85 },
  { pattern: /\bdiagnose\b/i, keyword: "diagnose", type: "debug", weight: 0.8 },
  { pattern: /\bwhy\s+is\s+.*\b(failing|broken|not\s+working)/i, keyword: "why failing", type: "debug", weight: 0.75 },
  { pattern: /\bfix\b/i, keyword: "fix", type: "debug", weight: 0.6 }
];
var RESEARCH_INDICATORS = [
  { pattern: /\bhow\s+do\s+I\b/i, keyword: "how do I", type: "research", weight: 0.85 },
  { pattern: /\bfind\s+out\b/i, keyword: "find out", type: "research", weight: 0.8 },
  { pattern: /\bresearch\b/i, keyword: "research", type: "research", weight: 0.85 },
  { pattern: /\blook\s+into\b/i, keyword: "look into", type: "research", weight: 0.8 },
  { pattern: /\bexplore\s+(the\s+)?(options|possibilities|approaches)/i, keyword: "explore", type: "research", weight: 0.75 },
  { pattern: /\bwhat\s+are\s+(the\s+)?(best\s+practices|options|ways)/i, keyword: "best practices", type: "research", weight: 0.7 },
  { pattern: /\blearn\s+about\b/i, keyword: "learn about", type: "research", weight: 0.7 }
];
var PLANNING_INDICATORS = [
  { pattern: /\bplan\b/i, keyword: "plan", type: "planning", weight: 0.85 },
  { pattern: /\bdesign\b/i, keyword: "design", type: "planning", weight: 0.85 },
  { pattern: /\barchitect\b/i, keyword: "architect", type: "planning", weight: 0.9 },
  { pattern: /\boutline\b/i, keyword: "outline", type: "planning", weight: 0.75 },
  { pattern: /\bstrateg(y|ize)\b/i, keyword: "strategy", type: "planning", weight: 0.8 },
  { pattern: /\bpropose\b/i, keyword: "propose", type: "planning", weight: 0.7 },
  { pattern: /\bstructure\b/i, keyword: "structure", type: "planning", weight: 0.65 }
];
var CONVERSATIONAL_PATTERNS = [
  /\bwhat\s+is\b/i,
  /\bexplain\b/i,
  /\bshow\s+me\b/i,
  /\btell\s+me\s+about\b/i,
  /\bdescribe\b/i,
  /\bcan\s+you\s+explain\b/i,
  /\bhelp\s+me\s+understand\b/i,
  /\bwhat\s+does\b/i,
  /\bhow\s+does\b/i,
  /\bwhy\s+does\b/i,
  /\bwhat's\s+the\s+difference\b/i,
  /\bhello\b/i,
  /\bhi\b/i,
  /\bthanks?\b/i,
  /\bthank\s+you\b/i,
  /\bgreat\b/i,
  /\bnice\b/i,
  /\bgood\s+job\b/i,
  /\bwhat\s+happened\b/i
];
var ALL_TASK_INDICATORS = [
  ...IMPLEMENTATION_INDICATORS,
  ...DEBUG_INDICATORS,
  ...RESEARCH_INDICATORS,
  ...PLANNING_INDICATORS
];
function detectTask(prompt) {
  if (!prompt?.trim()) {
    return {
      isTask: false,
      confidence: 0,
      triggers: []
    };
  }
  const promptLower = prompt.toLowerCase();
  const conversationalMatches = CONVERSATIONAL_PATTERNS.filter((p) => p.test(promptLower));
  const matches = [];
  for (const indicator of ALL_TASK_INDICATORS) {
    if (indicator.pattern.test(promptLower)) {
      matches.push({ indicator, keyword: indicator.keyword });
    }
  }
  if (matches.length === 0) {
    return {
      isTask: false,
      confidence: 0,
      triggers: []
    };
  }
  let totalWeight = 0;
  for (const match of matches) {
    totalWeight += match.indicator.weight;
  }
  let confidence = totalWeight / matches.length;
  const uniqueTypes = new Set(matches.map((m) => m.indicator.type));
  if (uniqueTypes.size > 1) {
    confidence += 0.1;
  }
  if (matches.length > 2) {
    confidence += Math.min(0.05 * (matches.length - 2), 0.15);
  }
  if (conversationalMatches.length > 0) {
    confidence -= 0.3 * conversationalMatches.length;
  }
  if (confidence < 0.4) {
    return {
      isTask: false,
      confidence: Math.max(0, confidence),
      triggers: []
    };
  }
  confidence = Math.min(1, Math.max(0, confidence));
  const sortedMatches = [...matches].sort(
    (a, b) => b.indicator.weight - a.indicator.weight
  );
  const primaryType = sortedMatches[0].indicator.type;
  const triggers = [...new Set(matches.map((m) => m.keyword))];
  return {
    isTask: true,
    taskType: primaryType,
    confidence,
    triggers
  };
}

// src/intent-classifier.ts
var DOMAIN_PATTERNS = [
  { regex: /\b(typescript|\.ts|\.tsx|react|next\.?js|node)\b/i, domain: "typescript" },
  { regex: /\b(python|\.py|django|flask|fastapi)\b/i, domain: "python" },
  { regex: /\b(go|golang|\.go)\b/i, domain: "go" },
  { regex: /\b(rust|\.rs|cargo)\b/i, domain: "rust" },
  { regex: /\b(sql|database|postgres|mysql|sqlite|prisma|migration)\b/i, domain: "database" },
  { regex: /\b(docker|kubernetes|k8s|ci\/cd|deploy|infra)\b/i, domain: "devops" },
  { regex: /\b(css|tailwind|styled|scss|styling|ui|component|dashboard|panel|sayfa|page|button|buton|input|form|card|modal|dialog|drawer|header|sidebar|footer|nav(bar|igation)?|layout|typography|spacing|color|palette|theme|dark[\s-]?mode|light[\s-]?mode|design[\s-]?system|wcag|a11y|accessibility)\b/i, domain: "frontend" },
  { regex: /\b(api|endpoint|rest|graphql|grpc|webhook|websocket|sse)\b/i, domain: "api" },
  { regex: /\b(service|servis|microservice|monolit|queue|worker|job|cron|scheduler|message|broker|kafka|rabbitmq|bullmq)\b/i, domain: "backend" },
  { regex: /\b(test|spec|jest|vitest|playwright|e2e)\b/i, domain: "testing" },
  { regex: /\b(auth|security|token|jwt|oauth|permission)\b/i, domain: "security" },
  { regex: /\b(ai|llm|model|prompt|embedding|vector)\b/i, domain: "ai" }
];
var AGENT_HINTS = [
  { regex: /\b(fix|debug|bug|broken|not working|hata|calismıyor)\b/i, agent: "sleuth" },
  { regex: /\b(refactor|clean|dead code|tech debt)\b/i, agent: "janitor" },
  { regex: /\b(test|tdd|coverage)\b/i, agent: "tdd-guide" },
  { regex: /\b(deploy|release|ci|cd)\b/i, agent: "devops" },
  { regex: /\b(security|audit|vulnerability)\b/i, agent: "security-reviewer" },
  { regex: /\b(review|code review)\b/i, agent: "code-reviewer" },
  { regex: /\b(performance|slow|optimize|profil)\b/i, agent: "profiler" }
];
function detectPlannerAgent(prompt) {
  const hasPlanWord = /(?:^|[^a-z])plan\w*/i.test(prompt) || /\b(roadmap|strateji|strategy|design[\s-]?doc(ument)?|tasarla)\w*/i.test(prompt);
  if (!hasPlanWord) return null;
  const executionVerbs = /\b(uygula|gercekle[sş]tir|implement(?!.*\b(plan|tasarla))|execute|run\s+the\s+plan|apply\s+(the\s+)?plan|hayata\s+gecir)/i;
  if (executionVerbs.test(prompt)) {
    return null;
  }
  const reviewVerbs = /\b(review|incele|g[oö]zden\s+ge[cç]ir|de[gğ]erlendir|critique|eksik(lik|ler)?\s+(bul|yakala))/i;
  if (reviewVerbs.test(prompt)) {
    return "plan-reviewer";
  }
  const refactorSignals = /\b(refactor\w*|migrat\w*|tech[\s-]?debt|restructure|reorganize|cleanup|yeniden\s+(yaz|tasarla|kur|d[uü]zenle)|temizle|ay[iı]kla|consolidate|extract|split|ta[sş][iı]|d[uü]zenle)/i;
  if (refactorSignals.test(prompt)) {
    return "phoenix";
  }
  const archSignals = /\b(architect(ure)?|system[\s-]?design|scalab\w*|distributed|microservice\w*|monolit\w*|domain[\s-]?driven|ddd|cqrs|event[\s-]?driven|hexagonal|clean[\s-]?arch)/i;
  if (archSignals.test(prompt)) {
    return "architect";
  }
  return "planner";
}
var SKILL_PATTERNS = [
  { regex: /\b(react|component|hook|useState|useEffect)\b/i, skill: "frontend-patterns" },
  { regex: /\b(api|endpoint|route|middleware)\b/i, skill: "backend-patterns" },
  { regex: /\b(test|spec|mock|fixture)\b/i, skill: "testing-patterns" },
  { regex: /\b(sql|query|schema|migration)\b/i, skill: "database-patterns" },
  { regex: /\b(docker|k8s|pipeline)\b/i, skill: "devops-patterns" }
];
function calculateComplexity(prompt, domains) {
  const signals = [];
  let score = 0;
  if (domains.length >= 3) {
    score += 2;
    signals.push(`${domains.length} domain (${domains.slice(0, 3).join(", ")})`);
  } else if (domains.length === 2) {
    score++;
    signals.push(`2 domain (${domains.join(", ")})`);
  }
  const multiVerbCount = (prompt.match(/\b(et|yap|ekle|yaz|olu[sş]tur|test|deploy|commit|fix|build|implement|create)\b/gi) || []).length;
  const multiStepPatterns = [
    /\b(sonra|hemen|then|after\s+that|also|ardindan)\b/i,
    /,\s*\w+\s+(et|yap|ekle|yaz|baglansin|olsun)\b/i
    // "X, Y et"
  ];
  const hasSequenceMarker = multiStepPatterns.some((re) => re.test(prompt));
  const commaCount = (prompt.match(/,/g) || []).length;
  const conjCount = (prompt.match(/\b(ve|and|ile|veya|or)\b/gi) || []).length;
  const longListPattern = /(\w+,\s*){2,}\w+/;
  const hasComponentList = commaCount >= 1 && conjCount >= 1 || longListPattern.test(prompt);
  if (hasComponentList) {
    score += 2;
    signals.push("list-of-3+");
  } else if (hasSequenceMarker || multiVerbCount >= 3) {
    score++;
    signals.push(`multi-step (${multiVerbCount} verbs)`);
  }
  if (/\b(t[uü]m|all|entire|b[uü]t[uü]n)\b[^.!?]{0,30}\b(ve|and|ile)\b/i.test(prompt)) {
    score++;
    signals.push("bulk-targets");
  }
  const highScopePatterns = [
    /\byeni\s+\w+(\s+\w+){0,2}\s+(feature|modul|sistem|servis|sayfa|component|api|endpoint|module|service|page)\b/i,
    /\byeni\s+(feature|modul|sistem|servis|sayfa|component|api|endpoint|module|service|page)\b/i,
    /\b(t[uü]m|b[uü]t[uü]n|all|entire|complete)\s+\w+/i,
    /\b(end[\s-]?to[\s-]?end|ba[sş]tan\s+sona|fullstack|full[\s-]?stack)\b/i
  ];
  if (highScopePatterns.some((re) => re.test(prompt))) {
    score++;
    signals.push("high-scope");
  }
  const criticalActionPatterns = [
    /\b(refactor|migrate|rewrite|yeniden\s+yaz|yeniden\s+tasarla)\b/i,
    /\b(implement|build|create|olu[sş]tur|geli[sş]tir)\b.{0,60}\b(feature|module|sistem|servis|sayfa|component|api|endpoint|service|page|dashboard|panel|hook|integration|flow|pipeline|microservice|monolit)\b/i,
    /\b(implement|build|create)\s+(a\s+)?(new\s+)?(feature|module|system|service|api|page|integration|microservice)/i,
    // Extraction/split: monolitten servis ayirma, modul bolme vb
    /\b(extract|split|ayir|cikar|bol|divide|separate)\b.{0,60}\b(service|servis|module|modul|microservice|monolit|component|context)\b/i,
    /\b(monolit\w*)\b.{0,40}\b(servis|service|microservice|ayir|cikar|extract|split)/i
  ];
  if (criticalActionPatterns.some((re) => re.test(prompt))) {
    score += 2;
    signals.push("critical-action");
  }
  const fileMatches = prompt.match(/[\w/-]+\.\w{1,5}\b/g) || [];
  const uniqueFiles = new Set(fileMatches);
  if (uniqueFiles.size >= 3) {
    score++;
    signals.push(`${uniqueFiles.size} files mentioned`);
  }
  const coordPatterns = [
    /\b(plan(la)?|tasarla|koordinasyon|orchestrate|maestro|swarm)\b/i,
    /\b(end[\s-]?to[\s-]?end|baştan\s+sona|tamamlay)\b/i,
    /\b(t[uü]m\s+ekib?i|whole\s+team|all\s+agents)\b/i,
    /\b(devreye\s+sok|hep\s+birlikte|paralel(de)?\s+calist)\b/i
  ];
  if (coordPatterns.some((re) => re.test(prompt))) {
    score++;
    signals.push("coordination-keyword");
  }
  const trivialPatterns = [
    /^(typo|imla|sil|rename|yeniden\s+adlandir)\b/i
  ];
  const isShort = prompt.trim().length < 40 && !signals.includes("coordination-keyword");
  const matchesTrivial = trivialPatterns.some((re) => re.test(prompt.trim()));
  if ((matchesTrivial || isShort) && score < 3) {
    return { score: 0, signals: ["trivial-override"] };
  }
  if (signals.includes("coordination-keyword") && score < 2) {
    score = 2;
    signals.push("coord-boost");
  }
  return { score, signals };
}
function classifyIntent(input) {
  const prompt = input.prompt || "";
  const detection = detectTask(prompt);
  let taskType = "conversational";
  if (detection.isTask && detection.taskType && detection.taskType !== "unknown") {
    taskType = detection.taskType;
  }
  const domains = [];
  for (const dp of DOMAIN_PATTERNS) {
    if (dp.regex.test(prompt)) {
      domains.push(dp.domain);
    }
  }
  let agentHint = detectPlannerAgent(prompt);
  if (!agentHint) {
    for (const ah of AGENT_HINTS) {
      if (ah.regex.test(prompt)) {
        agentHint = ah.agent;
        break;
      }
    }
  }
  const skillsNeeded = [];
  for (const sp of SKILL_PATTERNS) {
    if (sp.regex.test(prompt)) {
      skillsNeeded.push(sp.skill);
    }
  }
  const complexity = calculateComplexity(prompt, domains);
  const isPureQuestion = /^(ne(\s|den|dir)|why|what|how|when|where|kim|nasil|nedir|nicin)\b.*\?\s*$/i.test(prompt.trim());
  const isPlanningTask = agentHint !== null && ["phoenix", "architect", "planner", "plan-reviewer"].includes(agentHint);
  const needsMaestro = complexity.score >= 2 && !isPureQuestion && !isPlanningTask;
  const finalAgentHint = needsMaestro ? "maestro" : agentHint;
  return {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    session_id: input.session_id?.slice(0, 8) || "unknown",
    task_type: taskType,
    confidence: detection.confidence,
    domain: domains,
    skills_needed: skillsNeeded,
    agent_hint: finalAgentHint,
    complexity: complexity.score,
    complexity_signals: complexity.signals,
    needs_maestro: needsMaestro
  };
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
  const intent = classifyIntent(input);
  const cacheDir = join(homedir(), ".claude", "cache");
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const intentPath = join(cacheDir, "current-intent.json");
  try {
    writeFileSync(intentPath, JSON.stringify(intent, null, 2));
  } catch {
  }
  if (intent.needs_maestro) {
    const signals = intent.complexity_signals.join(", ");
    const domainList = intent.domain.length > 0 ? intent.domain.join(", ") : "n/a";
    const lines = [
      "",
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      "\u{1F3BC} AUTO-ORCHESTRATOR ROUTING",
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      `Complexity score: ${intent.complexity}/5`,
      `Signals: ${signals}`,
      `Domains: ${domainList}`,
      `Task type: ${intent.task_type}`,
      "",
      "STRONGLY RECOMMENDED: Spawn @maestro via the Agent tool",
      "instead of subdividing this task manually.",
      "",
      "Maestro will:",
      "  \u2022 Pick the right specialist agents (assignment-matrix)",
      "  \u2022 Run them in proper phases (research \u2192 plan \u2192 impl \u2192 review)",
      "  \u2022 Enforce Dev-QA loop (max 3 retries before escalation)",
      "  \u2022 Handle handoffs and conflict resolution",
      "",
      "Override ONLY if this is genuinely a single-file 1-shot fix.",
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      ""
    ];
    console.log(lines.join("\n"));
  } else if (intent.agent_hint) {
    console.log(`
\u2192 Suggested agent: @${intent.agent_hint}  (task: ${intent.task_type}, domain: ${intent.domain.join(",") || "n/a"})
`);
  }
}
main();
