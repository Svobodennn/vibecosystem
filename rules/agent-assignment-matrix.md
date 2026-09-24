# Agent Assignment Matrix

**Task → agent yonlendirmesi burada DEGIL.** Her agent'in kendi `description`'i o
bilgiyi tasiyor ve arac tanimina bagli olarak yuklu; iki kaynak ayni seyi soyledigi
zaman araca bagli olan kazaniyor. Bu dosyadaki 114 satirlik yonlendirme tablosu
(Developer / Arastirma / Review Assignment) tam bu yuzden okunmuyordu -- **Ana Agent**
kolonu kaldirildi. Hangi agent ne zaman: `Agent` aracinin agent listesine bak.

**Yedek Agent kolonu kaldirilMADI** -- o bilgi hicbir agent aciklamasinda yok ve
`maestro` ona bagli ("agent 2 kez fail ederse matrix'ten alternatif bul"). Asagida.
Kaybedilen ve geri getirilmeyen tek sey: `profiler + experiment-loop` skill esleсmesi
(perf optimizasyon dongusu) ve Hizir-Only tablosundaki `psyche` = "agent basarisizlik
analizi" cercevesi -- ikincisi zaten agent'in kendi aciklamasiyla celisiyordu.

Asagidaki uc sey agent aciklamalarinda YOK, o yuzden burada duruyor.

## Orkestrasyon katmani

Uretici degil, meta: `maestro`, `swarm-optimizer`, `psyche`, `reputation-engine`,
`cost-tracker`, `session-replay-analyzer`, `tech-radar`, `tech-lead`,
`dependency-graph-analyzer`. Bunlar is yapmaz, isi duzenler/olcer.


## Yedek Agent (ana agent 2 kez fail ederse)

`maestro` bunu okur. `USE INSTEAD` bunun yerine gecmez: o "yanlis kapsam -> baska
yere git" haritasi, bu ise "birincil basarisiz oldu -> bunu dene" haritasi.
Buradaki esleсmeler hicbir agent `description`'inda yok.

| Ana | Yedek |
|-----|-------|
| api-versioning-expert | backend-dev |
| build-error-resolver | devops |
| catalyst | frontend-dev |
| config-validator | devops |
| elasticsearch-expert | backend-dev |
| feature-flag-expert | backend-dev |
| growth | project-manager |
| log-analyzer | profiler |
| profiler | backend-dev |
| project-manager | planner |
| redis-expert | backend-dev |
| schema-validator | database-reviewer |
| security-reviewer | config-validator |
| session-replay-analyzer | data-analyst |
| swift-expert | frontend-dev |
| tdd-guide | qa-engineer |
| technical-writer | api-designer |

Kalan agent'lar icin yedek yok; escalation zinciri (asagi) veya
`auto-skill-activation.md`'deki Fallback Zinciri gecerli.

## Escalation Zinciri

Task 3 kez QA'den gecemezse:

| Basarisiz Agent | Escalation |
|-----------------|------------|
| spark | kraken'e devret (TDD ile) |
| kraken | parcala → spark'lara dagit |
| frontend-dev | designer + frontend-dev birlikte |
| backend-dev | architect ile mimari review → tekrar |
| devops | backend-dev ile birlikte |
| migrator | devops + architect birlikte |
| coroner | sleuth + manual review |
| replay | sleuth + coroner birlikte |
| ddd-expert | architect escalation |
| cqrs-expert | architect escalation |
| clean-arch-expert | architect escalation |
| event-sourcing-expert | architect escalation |
| i18n-expert | babel + frontend-dev |
| seo-specialist | web-perf-expert + frontend-dev |
| micro-frontend-expert | frontend-dev + architect |
| compliance-expert | security-analyst + security-reviewer |
| browser-agent | e2e-runner + manual browser testing |
| harvest | oracle + WebFetch manual extraction |

## Severity → Response Mapping

| Severity | Response Time | Agent Sayisi | Ornek |
|----------|--------------|-------------|-------|
| P0 Critical | HEMEN | 3-5 agent paralel | Production down, data loss |
| P1 High | < 1 saat | 2-3 agent | Major feature broken |
| P2 Medium | < 4 saat | 1-2 agent | Minor feature broken |
| P3 Low | Sonraki sprint | 1 agent | Kozmetik, typo |

## Swarm Phase → Agent Mapping

```
Phase 1 (Kesif):       scout + project-manager + architect + harvest (dis arastirma)
                        (+ tech-lead, tech-radar gerekirse)
Phase 2 (Gelistirme):  backend-dev + frontend-dev + designer + devops
                        (+ ai-engineer, kraken, browser-agent gerekirse)
                        Specialist havuzu (task'a gore): websocket-expert, redis-expert,
                        ddd-expert, cqrs-expert, event-sourcing-expert, i18n-expert,
                        seo-specialist, web-perf-expert, micro-frontend-expert,
                        spectre, babel, vault, harvest
Phase 3 (Review):      code-reviewer + security-reviewer + qa-engineer + data-analyst
                        (+ compliance-expert, a11y-expert gerekirse)
                        (+ browser-agent deploy dogrulama gerekirse)
Phase 4 (Duzeltme):    spark/kraken + tdd-guide + verifier
Phase 5 (Final):       self-learner + technical-writer + growth
                        (+ session-replay-analyzer, reputation-engine)
```
