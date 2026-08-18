# Dev-QA Loop - Surekli Kalite Dongusu

Her task implement edildikten sonra QA dogrulamasi ZORUNLU.
Agency-agents NEXUS framework'unden adapte edildi.

## Core Mekanik

```
HER task ICIN:
  1. ASSIGN → Uygun developer agent'a ver (assignment-matrix'e bak)
  2. IMPLEMENT → Agent task'i implement eder
  3. QA → @code-reviewer + @verifier kontrol eder
  4. KARAR:
     PASS → Task tamamlandi, sonraki task'a gec
     FAIL (deneme < 3) → QA feedback'i developer'a gonder, tekrar dene
     FAIL (deneme >= 3) → ESCALATE (reassign, parcala, ertele)
  5. STATUS → Pipeline durumunu guncelle
```

## QA Kontrol Listesi

Her task icin su kontroller yapilir:

| # | Kontrol | Agent |
|---|---------|-------|
| 1 | Kod kalitesi, pattern uyumu | @code-reviewer |
| 2 | Build basarili | @verifier (build) |
| 3 | Testler geciyor | @verifier (test) |
| 4 | Security check | @security-reviewer (auth/data isleri) |
| 5 | Type check | @verifier (tsc/pyright) |

## Retry Logic

### Deneme 1 basarisiz:
- QA feedback'ini developer agent'a gonder (handoff-templates #3)
- Agent SADECE belirtilen sorunlari duzeltir
- Yeni ozellik EKLEMEZ
- Tekrar QA'ye gonder

### Deneme 2 basarisiz:
- **ONCE: orijinal Assumptions'a don — hangi varsayim yanlisti?**
  Iki kez ayni sekilde fail etmek genelde plan hatasi degil varsayim hatasidir.
  Yanlis varsayimi duzeltmeden retry gondermek 3. denemeyi de yakar.
  Curuyen varsayim bulunursa `@self-learner` ile kaydet
  (`pre-implementation-contract.md` §5).
- Birikimli feedback gonder
- Agent dogru secim mi? Farkli agent daha uygun olabilir
- Daha fazla context ekle
- Tekrar QA (veya `council.md` esigi karsilaniyorsa 3. retry yerine konsey)

### Deneme 3 basarisiz → ESCALATION:
- Escalation mesaji gonder (handoff-templates #4)
- Secenekler:
  a) **Reassign** → Farkli agent'a ver (kraken → spark, veya tersi)
  b) **Decompose** → Task'i daha kucuk parcalara bol
  c) **Revise** → Yaklasimi/mimariyi degistir
  d) **Defer** → Sonraki sprint'e ertele
  e) **Accept** → Mevcut durumu kabul et, bilinen sinirlamalari dokumante et

## Paralel Task Yonetimi

```
BAGIMSIZ task'lar varsa:
  → Farkli agent'lara AYNI ANDA ver
  → Her biri bagimsiz QA dongusu calistirir
  → Tamamlananlar dependency sirasina gore merge edilir

BAGIMLI task varsa:
  → Dependency QA'den gecene kadar BEKLE
  → Sonra bagimli task'i ata
  → Handoff'a dependency context'ini ekle
```

## Quality Gate (Phase Gecisi)

Bir phase'den digerine gecmek icin TUM kriterler saglanmali:

| # | Kriter | Kanit |
|---|--------|-------|
| 1 | Tum task'lar QA'den gecti | code-reviewer + verifier raporlari |
| 2 | Critical/high bug yok | Bug listesi temiz |
| 3 | Build basarili | verifier PASS |
| 4 | Test coverage yeterli | Coverage raporu |
| 5 | Security audit temiz | security-reviewer raporu |

## Maestro Entegrasyonu

Maestro `/swarm` calistirdiginda bu donguyu otomatik uygular:
- Phase 2 (Gelistirme) sirasinda her task icin Dev-QA loop calisir
- Phase 3 (Review) tum task'lar QA'den gectikten sonra baslar
- Phase gecislerinde quality gate kontrol edilir

## Event-Driven Conditional Routing

QA sonucuna gore otomatik yonlendirme:

```
QA Result → Route Decision:

SECURITY_FAIL:
  → Bypass normal retry
  → Route to security-reviewer + spark (minimal fix)
  → Re-run ONLY security check
  → Normal QA'ye donme

BUILD_FAIL:
  → Route to build-error-resolver
  → Re-run ONLY build check
  → Build PASS ise normal QA'ye don

TYPE_FAIL:
  → Route to build-error-resolver (type fix mode)
  → Re-run ONLY type check

TEST_FAIL:
  → Analyze: flaky mi, logic error mi?
  → Flaky: retry once, sonra @replay
  → Logic: normal retry with feedback

STYLE_FAIL:
  → Auto-fix (prettier/eslint --fix)
  → Re-run ONLY style check
  → Sayilmaz retry olarak
```

## Output Validation

Her agent ciktisi kabul edilmeden once:

| Check | Ne Kontrol Eder |
|-------|----------------|
| Format | Beklenen output yapisi dogru mu? |
| Completeness | Tum gerekli alanlar var mi? |
| Consistency | Onceki adimlarla celisiyor mu? |
| Scope | Agent scope disina cikti mi? |

Validation basarisiz → agent'a spesifik feedback, yeniden dene.

## Auto-Retry Pattern (ModelRetry)

Agent tool call basarisiz oldugunda:

```
Attempt 1: Normal calistir
  FAIL → Parse error message
  → Inject error as feedback to agent
Attempt 2: Agent hata bilgisiyle yeniden dener
  FAIL → Parse + accumulate errors
  → Inject accumulated feedback
Attempt 3: Son deneme
  FAIL → Escalate to alternate agent or user
```

Bu pattern her agent tool call'unda uygulanir. Blind retry YAPMA, her seferinde hata bilgisini geri besle.

## Metrikler (Comms Uzerinden Takip)

- Task first-pass QA orani (ilk denemede gecen)
- Ortalama retry sayisi per task
- Escalation sayisi
- Phase tamamlanma suresi
