# Hooks System

74 TypeScript hook, `hooks/src/` altinda. Build: esbuild -> `hooks/dist/*.mjs`.
Kayit: `hooks/hooks.json` manifesti install sirasinda `~/.claude/settings.json`'a merge edilir (`tools/register-hooks.mjs`).

## Hook Tipleri

- **PreToolUse**: Tool calistirilmadan once (validasyon, context injection, deny)
- **PostToolUse**: Tool calistiktan sonra (kontrol, ogrenme, broadcast)
- **UserPromptSubmit**: Prompt gonderilince (intent siniflandirma, skill onerisi)
- **SessionStart**: Session basinda (banner, recall, instinct yukleme)
- **Stop**: Turn bitince (konsolidasyon, analytics)
- **SessionEnd / PreCompact**: Temizlik ve context korunmasi

## Mevcut Hook'lar (kayitli olanlar - tam liste hooks/hooks.json)

### PreToolUse
- credential-deny: hassas dosyalara erisimi engelle (symlink-aware)
- epistemic-reminder: Grep sonrasi claim-verification uyarisi
- smart-search-router: Grep'i daha iyi arama stratejisine yonlendir
- tldr-context-inject + arch-context-inject: agent spawn'a context enjekte et
- agent-memory-loader: agent'a kalici hafizasini yukle
- file-claims, edit-context-inject, signature-helper: edit oncesi koruma/baglam
- path-rules, magic-doc-tracker, tldr-read-enforcer, mcp-discovery, agent-observer, pre-tool-use-broadcast

### PostToolUse
- typescript-preflight: .ts/.tsx edit sonrasi tsc + lint kontrolu
- compiler-in-the-loop, post-edit-diagnostics, impact-refactor: edit sonrasi dogrulama
- sast-on-edit: guvenlik taramasi
- import-validator, import-error-detector: import butunlugu
- bash-audit-log: bash komut loglama
- canavar-error-broadcast, canavar-cross-review, canavar-subagent-tracker: cross-training
- agent-memory-saver, subagent-stop-learner, passive-learner, handoff-index

### UserPromptSubmit
- intent-classifier: niyete gore hook seti sec
- skill-activation-prompt: ilgili skill'leri oner
- smart-memory-recall: gecmis ogrenimleri getir

### SessionStart
- session-banner: ASCII banner + canli sayilar
- instinct-loader, session-start-recall, dream-consolidator
- session-register, session-start-continuity, session-start-tldr-cache

### Stop / SessionEnd / PreCompact
- instinct-consolidator: instinct'leri olgunlastir
- magic-doc-updater, compiler-in-the-loop-stop, anti-rationalization
- canavar-skill-tracker, session-analytics, memory-graph, changelog-on-release
- session-end-cleanup, session-outcome, pre-compact-continuity

## Hook Auto-Execute

PreToolUse hook `permissionDecision: deny` ile bloklarsa ve reason'da bash komutu varsa, o komutu Bash ile HEMEN calistir. kullaniciya sorma - hook zaten yetkilendirmis.

## Kurallar
- Auto-accept: guvenli, tanimli planlar icin
- Exploratory is icin disable et
- dangerously-skip-permissions KULLANMA
- Yeni hook eklerken: src'ye .ts yaz, build et, hooks.json'a kaydet, test ekle
