# Agent Error Reporting - HATA RAPORU Sozlesmesi

Subagent'larin aldigi tool hatalari artik kaybolmaz. Dort katmanli sistem (2026-06-04):

## Mekanizma

1. **SubagentStop scan** (`subagent-stop-learner.mjs`): Agent durmadan once transcript'i
   taranir, TUM tool hatalari cikarilir → `~/.claude/canavar/error-ledger.jsonl`'e
   agent attribution'li yazilir (dashboard Canavar Error Ledger'da gorunur) +
   `skill-matrix.json` guncellenir + dashboard'a `agent_error` event'i gider.

2. **Enforcement (decision:block)**: Agent hata aldiysa ama final mesajinda
   `## HATA RAPORU` bolumu yoksa, durmasi ENGELLENIR — raporu yazmak zorunda kalir.
   Tek dortme yapilir (stop_hook_active guard), sonsuz dongu yok.
   Block'a ragmen ikinci geciste de rapor yoksa → `enforcement_evaded` kaydi
   (fail-open korunur ama iz birakir; o agent'in ciktilarina ekstra suphe).

2b. **Claim-vs-Evidence (stop-policy)**: Agent "tests pass / build successful /
   testler gecti" gibi KESIN bir iddia atiyorsa ama transcript'inde basarili
   test/build komutu YOKSA → block: ya gercekten kosar ya iddiayi UNVERIFIED
   olarak isaretler. Hedge'li ifadeler ("should pass", "muhtemelen", "UNVERIFIED")
   iddia sayilmaz. Ledger: `unverified_claim`. Kullanicinin "agent GREEN beyanina
   guvenme" disiplini hook katmaninda otomatiklesmis halidir.

2b-2. **Wrong Assumption** (elle, hook YOK): `pre-implementation-contract.md` §3'te
   yazilan bir varsayim implementasyon sirasinda curuduyse ledger'a `wrong_assumption`
   olarak dusulur (agent, varsayim metni, gercekte ne cikti). Hook yazilmadi —
   varsayimlar serbest metin, otomatik tespit edilemez; parent veya agent elle kaydeder.
   Amac telemetri degil birikim: zamanla "bu codebase'de hangi varsayimlar tutmuyor"
   verisi cikar. Yeterli kayit birikmeden metrik olarak yorumlama.

2c. **Retry Storm**: Ayni komut ayni task icinde 3+ kez fail ettiyse →
   `retry_storm` kaydi. Sonunda gecse bile kirilganlik sinyalidir; agent
   korlemesine retry yerine yaklasim degistirmeli/parent'a bildirmeli.

3. **PostToolUse scan** (`canavar-error-broadcast.mjs`): Basarili komut ciktilarinda
   gomulu hata pattern'leri agent_id/agent_type attribution'li yakalanir.
   Pattern kutubhanesi: `shared/error-patterns.ts` (TS, C# CSxxxx/MSB, Godot
   SCRIPT/USER ERROR + export, rust E####, vitest/jest/pytest/go test, eslint).

4. **Main scan** (`canavar-main-scan.mjs`, Stop hook): ANA transcript'i cursor'li
   incremental tarar — subagent-scan'in goremedigi uc sinif:
   - `spawn_fail`: Fail eden Agent cagrilari (worktree hatasi, agent crash) —
     baska hicbir katman bunlari goremez (PostToolUse fail'de atesleNMEZ)
   - Parent'in kendi Bash/Edit/tool hatalari (agent_type: main)
   - Cursor: `canavar/scan-cursors/<session>.json` — cift kayit imkansiz

4b. **P3 incelikleri**:
   - Attribution: SubagentStop input'unda agent_type yoksa transcript yanindaki
     `agent-<id>.meta.json`'dan cozulur; o da yoksa matrix istatistigi YAZILMAZ
     (unknown-agent kirliligi onlendi; ledger'a yine dusebilir).
   - `empty_test_run`: "No test files found" / "collected 0 items" gibi
     0-test kosumu false-green sayilir ve yakalanir.
   - MCP govde-ici hata: `mcp__*` tool'lari is_error:false donup JSON'da
     `error` alani tasiyabilir — bunlar da tool_error olarak taranir.
   - `compactions` metrigi: agent calisirken context compaction yasandiysa
     skill-matrix'e islenir (talimat kaybi = kalite riski sinyali).
   - `canavar-cli health`: hook zinciri saglik kontrolu — kayitlar, dist
     dosyalari, ledger/matrix yasi, heartbeat (fail-silent'in telafisi).

5. **Watchdog + hijyen** (main-scan icinde, P2):
   - `hung_agent`: SubagentStart aldi ama 30dk+ Stop vermedi (askida process,
     stdin bekleyen interactive komut). Kayit: `canavar/running-agents.json`
     (Start'ta yazilir, GERCEK durusta silinir — block'lu devam sayilmaz).
   - `resource_conflict` / `parallel_conflict`: EADDRINUSE, database locked,
     lock dosyasi gibi sinyaller; 2dk icinde FARKLI agent'tan da ayni sinif
     geldiyse paralel cakisma olarak korelasyon kaydi dusulur.
   - Ledger rotation: error-ledger.jsonl 1MB'i asinca eski satirlar
     `canavar/archive/`a TASINIR (silinmez), aktifte son 500 satir kalir.

## HATA RAPORU Formati (agent'lardan beklenen)

```
## HATA RAPORU
1. <komut/tool> → <hata> | Ne yaptim: fixed/workaround/skipped | Etki: <var/yok>
TASK STATUS: COMPLETE  veya  TASK STATUS: PARTIAL — <eksik kalan>
```

## Parent (Hizir) Davranis Kurallari

- Agent final mesajinda `TASK STATUS: PARTIAL` goruyorsan task TAMAMLANMADI say.
  qa-loop'a gore: feedback ile retry (max 3) veya escalate. Sessiz gecme.
- `## HATA RAPORU` icindeki permission_denied/sandbox_block hatalari icin:
  o komutu PARENT'ta calistir (sandbox kisiti agent'a ozgu olabilir).
- Agent'in "her sey yesil" demesi yetmez — kritik komutlari ana agacta dogrula
  (agent-output-dogrulama-disiplini).

## Komut Bazli Fail Analizi

Agent'larin hangi komutlarda fail yedigini gormek icin:

```bash
node ~/.claude/hooks/dist/canavar-cli.mjs cmdfail        # son 30 gun
node ~/.claude/hooks/dist/canavar-cli.mjs cmdfail 7      # son 7 gun
```

Rapor: komut basi fail sayisi, siniflar (command_not_found / permission_denied /
sandbox_block / timeout / command_fail / tool_error / spawn_fail / retry_storm /
unverified_claim / enforcement_evaded), hangi agent'lar, son ornek + ders.
Ozel bucket'lar: `agent:<tip>` = spawn hatasi, `claim:<test|build>` = kanitsiz
iddia, `enforcement:evaded` = rapor zorlamasi atlatildi.

Davranis metrikleri skill-matrix.json'da agent basina birikir:
`tool_errors`, `failing_commands`, `retry_storms`, `unverified_claims`,
`enforcement_evasions` → reputation/tuning analizlerine girdi.

## Veri Akisi

```
Subagent tool hatasi
  → transcript (agent-<id>.jsonl, is_error:true)
  → SubagentStop: scan + ledger + matrix + dashboard + (gerekirse) block
  → Agent HATA RAPORU yazar → Parent final mesajda gorur
  → cmdfail raporu komut bazli birikimi gosterir
```
