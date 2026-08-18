# Paralel Agent Çalışması — İş Bölümü & Branch Disiplini

> Birden fazla agent'ın **çakışmadan** paralel çalışması için iş bölümü. İlke: **dosya/dizin sahipliği** —
> her akış kendi dizinlerinde çalışır, aynı dosyaya iki agent dokunmaz.
>
> Bu dosya *kimin nerede çalıştığını* tanımlar. *Hangi görevin kime gittiği* implementasyon planının
> Agent Roster'ında.

---

## 1. Akışlar (dosya-sahipliği ekseni)

> Akışları **mimarinin kendi sınırından** böl. İyi bölünmüş mimaride sahiplik sınırı bedava gelir.

| | **Akış A — <çekirdek>** | **Akış B — <sunum>** | **Akış C — İçerik/Asset** |
|---|---|---|---|
| **Ana agent** | `<agent>` (TDD zorunlu) | `<agent>` | `<agent>` + 👤 kullanıcı |
| **SAHİP olduğu** | `<dizinler>` | `<dizinler>` | `<dizinler>` |
| **DOKUNMAZ** | `<diğer dizinler>` | `<diğer dizinler>` | `src/` tamamı |
| **Yedek** | `<agent>` | `<agent>` | `<agent>` |
| **QA** | code-reviewer + tdd-guide | code-reviewer | <görsel/tutarlılık kontrolü> |

**Neden çakışmasız:** <mimari sınıra referans — ADR-00N>

**Akış C kod yazmaz.** İmplementasyonu bloklamaz: placeholder ile A ve B ilerler, asset hazır oldukça takılır.

---

## 2. Sınır-aşan görevler (→ DOSYAYA göre bölünür, **çekirdek API'si ÖNCE**)

| Görev tipi | Akış A (önce) | Akış B (sonra tüketir) |
|---|---|---|
| <görev> | <çekirdekte ne yapar> | <sunumda ne yapar> |

**Kural:** A önce API'yi merge eder, B sonra tüketir. Aynı dosyaya asla iki agent aynı anda dokunmaz —
bölme **dosya** düzeyinde yapılır, satır düzeyinde değil.

**Bağımlılık yönü:** <çekirdek> önce, <sunum> sonra. Ama B baştan bloklanmaz — <motor beklemeden
kurulabilecekler>.

---

## 3. Tek paylaşılan dosya: `<implementasyon planı>`

- Yalnız KENDİ görev satırını düzenle (satır-yerel → git çoğu zaman temiz birleşir)
- Merge öncesi `git rebase main`; çakışırsa **lokal çöz, her iki satırı da koru**
- "Sıradaki işaretsiz görev" özetini akışlar ayrı ayrı güncellemez — tek yerden toparlanır

---

## 4. Branch, worktree ve PR disiplini

- **`main`** = entegrasyon dalı. Doğrudan push YOK; commit'ler kullanıcı onayıyla
- **Görev-başı branch:** `feat/<faz>-<kısa>`
- **Worktree izolasyonu:** aynı anda dosya değiştiren birden fazla agent varsa `isolation: worktree`
- **WORKTREE HANDOFF ZORUNLU:** worktree'de dosya değiştiren agent commit atmadan dönmez;
  çıktısına branch + commit hash yazar. **Commit'siz dönen agent'ın işi strand kalır ve
  `git worktree prune` ile kaybolabilir.**

### Doğrulama kapısı (her görev sonunda)

| Kapı | Akış A | Akış B | Akış C |
|---|---|---|---|
| Tip kontrolü / derleme | ✅ | ✅ | — |
| Lint | ✅ | ✅ | — |
| Testler yeşil | ✅ **zorunlu** (TDD) | ✅ ilgili | — |
| <anayasa grep'i> | ✅ **zorunlu** | — | — |
| Görsel/cihaz doğrulaması | — | ✅ mümkünse | ✅ |
| Determinizm | ✅ <varsa> | — | — |

**Anayasa grep'leri** (yazılı kuralı makine kontrolüne bağla):
```bash
# <kural: çekirdek katman saflığı>
grep -rEn "<yasak import deseni>" <çekirdek dizin> && echo "İHLAL"
# <kural: determinizm>
grep -rEn "\b(Math\.random|Date\.now|new Date\(\))" <çekirdek dizin> && echo "İHLAL"
```

---

## 5. Maestro dikte protokolü

`maestro` kendi subagent'ını spawn **edemez**. Akış:

```
1. maestro  → YAML directive: phase · parallel_group · dependencies · accept_criteria · owner_flow
2. parent   → aynı parallel_group'u TEK mesajda paralel Agent() ile başlatır
3. her agent → kendi akışının dizininde (§1) + doğrulama kapısı (§4)
4. QA        → qa-loop: implement → code-reviewer + verifier → PASS / retry(≤3) / escalate
5. parent    → plan-doc'taki görev satırlarını işaretler + WORK_LOG'a kanıtlı blok ekler
```

**Paralel grup kuralı:** grup içindeki görevlerin dosya kümeleri **ayrık** olmalı.
**Escalation:** 3 kez QA'den geçemeyen görev → `qa-loop.md` (reassign / parçala / yaklaşım değiştir / ertele).

---

## 6. Çakışma önleme — özet

1. **Kendi dizininde kal**
2. **Sınır-aşan görevde dosyaya göre böl** + çekirdek API'sini önce merge et
3. **Plan-doc:** yalnız kendi satırın + merge öncesi rebase
4. **Görev-başı branch**, `main` korumalı, commit'ler kullanıcı onayıyla
5. **Worktree kullanan agent commit atmadan dönmez**
6. **Paralel grup = ayrık dosya kümesi**

---

*Oluşturma: <tarih>. <Akış atamalarının hangi karara bağlı olduğu.>*
