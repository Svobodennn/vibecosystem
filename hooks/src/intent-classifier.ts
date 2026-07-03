/**
 * Intent Classifier - UserPromptSubmit hook
 * Kullanici prompt'unu analiz ederek intent tipini belirler.
 * Sonuc: ~/.claude/cache/current-intent.json
 *
 * Diger hook'lar (adaptive loader, smart compact) bu dosyayi okuyarak
 * kendilerini optimize eder.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { detectTask } from './shared/task-detector.js';

interface UserPromptSubmitInput {
  session_id: string;
  prompt: string;
}

interface ClassifiedIntent {
  ts: string;
  session_id: string;
  task_type: 'implementation' | 'research' | 'debug' | 'planning' | 'conversational';
  confidence: number;
  domain: string[];
  skills_needed: string[];
  agent_hint: string | null;
  complexity: number;        // 0-5 signal count
  complexity_signals: string[];
  needs_maestro: boolean;
}

// Domain pattern'leri
const DOMAIN_PATTERNS: Array<{ regex: RegExp; domain: string }> = [
  { regex: /\b(typescript|\.ts|\.tsx|react|next\.?js|node)\b/i, domain: 'typescript' },
  { regex: /\b(python|\.py|django|flask|fastapi)\b/i, domain: 'python' },
  { regex: /\b(go|golang|\.go)\b/i, domain: 'go' },
  { regex: /\b(rust|\.rs|cargo)\b/i, domain: 'rust' },
  { regex: /\b(sql|database|postgres|mysql|sqlite|prisma|migration)\b/i, domain: 'database' },
  { regex: /\b(docker|kubernetes|k8s|ci\/cd|deploy|infra)\b/i, domain: 'devops' },
  { regex: /\b(css|tailwind|styled|scss|styling|ui|component|dashboard|panel|sayfa|page|button|buton|input|form|card|modal|dialog|drawer|header|sidebar|footer|nav(bar|igation)?|layout|typography|spacing|color|palette|theme|dark[\s-]?mode|light[\s-]?mode|design[\s-]?system|wcag|a11y|accessibility)\b/i, domain: 'frontend' },
  { regex: /\b(api|endpoint|rest|graphql|grpc|webhook|websocket|sse)\b/i, domain: 'api' },
  { regex: /\b(service|servis|microservice|monolit|queue|worker|job|cron|scheduler|message|broker|kafka|rabbitmq|bullmq)\b/i, domain: 'backend' },
  { regex: /\b(test|spec|jest|vitest|playwright|e2e)\b/i, domain: 'testing' },
  { regex: /\b(auth|security|token|jwt|oauth|permission)\b/i, domain: 'security' },
  { regex: /\b(ai|llm|model|prompt|embedding|vector)\b/i, domain: 'ai' },
];

// Agent hint pattern'leri
const AGENT_HINTS: Array<{ regex: RegExp; agent: string }> = [
  { regex: /\b(fix|debug|bug|broken|not working|hata|calismıyor)\b/i, agent: 'sleuth' },
  { regex: /\b(refactor|clean|dead code|tech debt)\b/i, agent: 'janitor' },
  { regex: /\b(test|tdd|coverage)\b/i, agent: 'tdd-guide' },
  { regex: /\b(deploy|release|ci|cd)\b/i, agent: 'devops' },
  { regex: /\b(security|audit|vulnerability)\b/i, agent: 'security-reviewer' },
  { regex: /\b(review|code review)\b/i, agent: 'code-reviewer' },
  { regex: /\b(performance|slow|optimize|profil)\b/i, agent: 'profiler' },
];

/**
 * Planning intent — task isteminin "plan uret" mi yoksa "uygula" mi oldugunu ayirir.
 * Plan uretme istegi varsa dogru planner agent'i secer:
 *   - phoenix: refactor/migration planning
 *   - architect: system design, scalability, mimari karar
 *   - plan-reviewer: hazir planin gozden gecirilmesi
 *   - planner: yeni feature implementation roadmap (default)
 *
 * Plan uretme YOK ise null doner (normal flow'a devam).
 */
function detectPlannerAgent(prompt: string): string | null {
  // "plan" kelimesi - Turkce ekleri (plani, planli, planlama) ve snake_case
  // (REFACTOR_PLAN) dahil. \b sorunlu cunku _ word-char sayilir.
  const hasPlanWord =
    /(?:^|[^a-z])plan\w*/i.test(prompt) ||
    /\b(roadmap|strateji|strategy|design[\s-]?doc(ument)?|tasarla)\w*/i.test(prompt);
  if (!hasPlanWord) return null;

  // Execution intent override: "plani uygula", "execute the plan", "implement plan"
  // bu durumlar planlama DEGIL, uygulama. Planner agent yerine maestro yonlendir.
  const executionVerbs = /\b(uygula|gercekle[sş]tir|implement(?!.*\b(plan|tasarla))|execute|run\s+the\s+plan|apply\s+(the\s+)?plan|hayata\s+gecir)/i;
  if (executionVerbs.test(prompt)) {
    return null; // null = normal flow (maestro/kraken/...)
  }

  // Plan review - "plani incele", "REFACTOR_PLAN'i degerlendir" vb
  const reviewVerbs = /\b(review|incele|g[oö]zden\s+ge[cç]ir|de[gğ]erlendir|critique|eksik(lik|ler)?\s+(bul|yakala))/i;
  if (reviewVerbs.test(prompt)) {
    return 'plan-reviewer';
  }

  // Refactor/migration planning
  const refactorSignals = /\b(refactor\w*|migrat\w*|tech[\s-]?debt|restructure|reorganize|cleanup|yeniden\s+(yaz|tasarla|kur|d[uü]zenle)|temizle|ay[iı]kla|consolidate|extract|split|ta[sş][iı]|d[uü]zenle)/i;
  if (refactorSignals.test(prompt)) {
    return 'phoenix';
  }

  // Architecture / system design
  const archSignals = /\b(architect(ure)?|system[\s-]?design|scalab\w*|distributed|microservice\w*|monolit\w*|domain[\s-]?driven|ddd|cqrs|event[\s-]?driven|hexagonal|clean[\s-]?arch)/i;
  if (archSignals.test(prompt)) {
    return 'architect';
  }

  // Default: feature/implementation planning
  return 'planner';
}

// Skill pattern'leri
const SKILL_PATTERNS: Array<{ regex: RegExp; skill: string }> = [
  { regex: /\b(react|component|hook|useState|useEffect)\b/i, skill: 'frontend-patterns' },
  { regex: /\b(api|endpoint|route|middleware)\b/i, skill: 'backend-patterns' },
  { regex: /\b(test|spec|mock|fixture)\b/i, skill: 'testing-patterns' },
  { regex: /\b(sql|query|schema|migration)\b/i, skill: 'database-patterns' },
  { regex: /\b(docker|k8s|pipeline)\b/i, skill: 'devops-patterns' },
];

/**
 * Complexity scoring — agresif tetik.
 * 2+ sinyal varsa maestro orchestration onerilir.
 */
function calculateComplexity(prompt: string, domains: string[]): {
  score: number;
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;

  // Sinyal 1: Multi-domain (3+ direkt 2 sinyal = guclu)
  if (domains.length >= 3) {
    score += 2;
    signals.push(`${domains.length} domain (${domains.slice(0, 3).join(', ')})`);
  } else if (domains.length === 2) {
    score++;
    signals.push(`2 domain (${domains.join(', ')})`);
  }

  // Sinyal 2: Multi-step (birden fazla eylem)
  // - "X ve Y" + iki ayri fiil
  // - "X, Y, Z" virgulle ayrilmis fiil listesi
  // - "sonra/then/ardindan" sirali eylem
  const multiVerbCount = (prompt.match(/\b(et|yap|ekle|yaz|olu[sş]tur|test|deploy|commit|fix|build|implement|create)\b/gi) || []).length;
  const multiStepPatterns = [
    /\b(sonra|hemen|then|after\s+that|also|ardindan)\b/i,
    /,\s*\w+\s+(et|yap|ekle|yaz|baglansin|olsun)\b/i, // "X, Y et"
  ];
  const hasSequenceMarker = multiStepPatterns.some((re) => re.test(prompt));
  // Component/item list: "X, Y ve Z" veya "X, Y, Z" (3+ oge)
  // Strateji: virgul + bağlaç birlikte = 3+ ogeli liste
  const commaCount = (prompt.match(/,/g) || []).length;
  const conjCount = (prompt.match(/\b(ve|and|ile|veya|or)\b/gi) || []).length;
  const longListPattern = /(\w+,\s*){2,}\w+/; // "A, B, C" virgulle 3+
  const hasComponentList =
    (commaCount >= 1 && conjCount >= 1) || longListPattern.test(prompt);
  if (hasComponentList) {
    // 3+ ogeli liste = multi-file is = guclu sinyal
    score += 2;
    signals.push('list-of-3+');
  } else if (hasSequenceMarker || multiVerbCount >= 3) {
    score++;
    signals.push(`multi-step (${multiVerbCount} verbs)`);
  }

  // "tum X ve Y" / "all X and Y" pattern - bulk operation
  if (/\b(t[uü]m|all|entire|b[uü]t[uü]n)\b[^.!?]{0,30}\b(ve|and|ile)\b/i.test(prompt)) {
    score++;
    signals.push('bulk-targets');
  }

  // Sinyal 3a: High-scope (gevsek match, +1)
  const highScopePatterns = [
    /\byeni\s+\w+(\s+\w+){0,2}\s+(feature|modul|sistem|servis|sayfa|component|api|endpoint|module|service|page)\b/i,
    /\byeni\s+(feature|modul|sistem|servis|sayfa|component|api|endpoint|module|service|page)\b/i,
    /\b(t[uü]m|b[uü]t[uü]n|all|entire|complete)\s+\w+/i,
    /\b(end[\s-]?to[\s-]?end|ba[sş]tan\s+sona|fullstack|full[\s-]?stack)\b/i,
  ];
  if (highScopePatterns.some((re) => re.test(prompt))) {
    score++;
    signals.push('high-scope');
  }

  // Sinyal 3b: Critical action verbs (+2, tek basina maestro tetikler)
  // Bu fiiller projeyle-genis kapsamli isi isaret eder
  const criticalActionPatterns = [
    /\b(refactor|migrate|rewrite|yeniden\s+yaz|yeniden\s+tasarla)\b/i,
    /\b(implement|build|create|olu[sş]tur|geli[sş]tir)\b.{0,60}\b(feature|module|sistem|servis|sayfa|component|api|endpoint|service|page|dashboard|panel|hook|integration|flow|pipeline|microservice|monolit)\b/i,
    /\b(implement|build|create)\s+(a\s+)?(new\s+)?(feature|module|system|service|api|page|integration|microservice)/i,
    // Extraction/split: monolitten servis ayirma, modul bolme vb
    /\b(extract|split|ayir|cikar|bol|divide|separate)\b.{0,60}\b(service|servis|module|modul|microservice|monolit|component|context)\b/i,
    /\b(monolit\w*)\b.{0,40}\b(servis|service|microservice|ayir|cikar|extract|split)/i,
  ];
  if (criticalActionPatterns.some((re) => re.test(prompt))) {
    score += 2;
    signals.push('critical-action');
  }

  // Sinyal 4: Multi-file (3+ dosya/path referansi)
  const fileMatches = prompt.match(/[\w/-]+\.\w{1,5}\b/g) || [];
  const uniqueFiles = new Set(fileMatches);
  if (uniqueFiles.size >= 3) {
    score++;
    signals.push(`${uniqueFiles.size} files mentioned`);
  }

  // Sinyal 5: Coordination keyword (acik orchestration istegi)
  const coordPatterns = [
    /\b(plan(la)?|tasarla|koordinasyon|orchestrate|maestro|swarm)\b/i,
    /\b(end[\s-]?to[\s-]?end|baştan\s+sona|tamamlay)\b/i,
    /\b(t[uü]m\s+ekib?i|whole\s+team|all\s+agents)\b/i,
    /\b(devreye\s+sok|hep\s+birlikte|paralel(de)?\s+calist)\b/i,
  ];
  if (coordPatterns.some((re) => re.test(prompt))) {
    score++;
    signals.push('coordination-keyword');
  }

  // Negatif sinyal: tek dosya kucuk fix (overrride)
  const trivialPatterns = [
    /^(typo|imla|sil|rename|yeniden\s+adlandir)\b/i,
  ];
  // "40 char alti" kuralini coordination keyword varsa atla
  const isShort = prompt.trim().length < 40 && !signals.includes('coordination-keyword');
  const matchesTrivial = trivialPatterns.some((re) => re.test(prompt.trim()));
  if ((matchesTrivial || isShort) && score < 3) {
    return { score: 0, signals: ['trivial-override'] };
  }

  // Pozitif override: "swarm/orchestrate/maestro/tum ekip" gecerse 2'ye yukselt
  if (signals.includes('coordination-keyword') && score < 2) {
    score = 2;
    signals.push('coord-boost');
  }

  return { score, signals };
}

function classifyIntent(input: UserPromptSubmitInput): ClassifiedIntent {
  const prompt = input.prompt || '';
  const detection = detectTask(prompt);

  // Task type belirleme
  let taskType: ClassifiedIntent['task_type'] = 'conversational';
  if (detection.isTask && detection.taskType && detection.taskType !== 'unknown') {
    taskType = detection.taskType as ClassifiedIntent['task_type'];
  }

  // Domain tespiti
  const domains: string[] = [];
  for (const dp of DOMAIN_PATTERNS) {
    if (dp.regex.test(prompt)) {
      domains.push(dp.domain);
    }
  }

  // Agent hint
  // Onceligi planner-detector'a ver (plan request'lerini dogru planner'a yonlendir)
  let agentHint: string | null = detectPlannerAgent(prompt);
  if (!agentHint) {
    for (const ah of AGENT_HINTS) {
      if (ah.regex.test(prompt)) {
        agentHint = ah.agent;
        break;
      }
    }
  }

  // Skill tespiti
  const skillsNeeded: string[] = [];
  for (const sp of SKILL_PATTERNS) {
    if (sp.regex.test(prompt)) {
      skillsNeeded.push(sp.skill);
    }
  }

  const complexity = calculateComplexity(prompt, domains);

  // Score 2+ → maestro. task_type'a guvenme (detectTask bazi prompt'lari
  // yanlis "conversational" diye etiketliyor). Trivial filter zaten
  // calculateComplexity icinde uygulandi.
  // Salt-soru/research'i ekstra eleyelim ki cevap isteyen "X nedir?" tipi
  // prompt'larda maestro tetiklenmesin.
  const isPureQuestion = /^(ne(\s|den|dir)|why|what|how|when|where|kim|nasil|nedir|nicin)\b.*\?\s*$/i.test(prompt.trim());

  // Plan uretme istekleri tek-agent isi (phoenix/architect/planner).
  // Maestro multi-phase EXECUTION icin, planning icin overkill.
  const isPlanningTask = agentHint !== null && ['phoenix', 'architect', 'planner', 'plan-reviewer'].includes(agentHint);

  const needsMaestro = complexity.score >= 2 && !isPureQuestion && !isPlanningTask;

  // Maestro tetiklenirse onun routing'ini agent_hint olarak set et
  // Planning task ise agentHint zaten dogru planner'i isaret ediyor
  const finalAgentHint = needsMaestro ? 'maestro' : agentHint;

  return {
    ts: new Date().toISOString(),
    session_id: input.session_id?.slice(0, 8) || 'unknown',
    task_type: taskType,
    confidence: detection.confidence,
    domain: domains,
    skills_needed: skillsNeeded,
    agent_hint: finalAgentHint,
    complexity: complexity.score,
    complexity_signals: complexity.signals,
    needs_maestro: needsMaestro,
  };
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf-8'); } catch { return; }
  if (!raw) { console.log('{}'); return; }

  let input: UserPromptSubmitInput;
  try { input = JSON.parse(raw); } catch { console.log('{}'); return; }

  const intent = classifyIntent(input);

  // Cache'e yaz (session-specific dosya + current symlink)
  const cacheDir = join(homedir(), '.claude', 'cache');
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const intentPath = join(cacheDir, 'current-intent.json');

  try {
    // Session ID'yi dosyaya dahil et, staleness kontrolu icin ts zaten var
    writeFileSync(intentPath, JSON.stringify(intent, null, 2));
  } catch { /* skip */ }

  // Hook output - Claude'a gorunen yonlendirme.
  // skill-activation-prompt pattern'i: raw stdout = additionalContext.
  if (intent.needs_maestro) {
    const signals = intent.complexity_signals.join(', ');
    const domainList = intent.domain.length > 0 ? intent.domain.join(', ') : 'n/a';

    // Guclu oneri (user "Guclu oneri" sectigi icin override mumkun)
    const lines = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🎼 AUTO-ORCHESTRATOR ROUTING',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Complexity score: ${intent.complexity}/5`,
      `Signals: ${signals}`,
      `Domains: ${domainList}`,
      `Task type: ${intent.task_type}`,
      '',
      'STRONGLY RECOMMENDED: Spawn @maestro via the Agent tool',
      'instead of subdividing this task manually.',
      '',
      'Maestro will:',
      '  • Pick the right specialist agents (assignment-matrix)',
      '  • Run them in proper phases (research → plan → impl → review)',
      '  • Enforce Dev-QA loop (max 3 retries before escalation)',
      '  • Handle handoffs and conflict resolution',
      '',
      'Override ONLY if this is genuinely a single-file 1-shot fix.',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ];
    console.log(lines.join('\n'));
  } else if (intent.agent_hint) {
    // Tekil agent hint - daha hafif oneri
    console.log(`\n→ Suggested agent: @${intent.agent_hint}  (task: ${intent.task_type}, domain: ${intent.domain.join(',') || 'n/a'})\n`);
  }
  // else: hicbir cikti yok (sessiz)
}

main();
