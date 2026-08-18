# <PROJE> — Aşama 5: MVP İmplementasyon Planı

> **Üretici:** planner agent · **Pipeline aşaması:** 5 · **Durum:** <⬜ iskelet | 🔄 aktif>
>
> **Anayasa (değişmez):** `asama2-mimari.md` — katman mimarisi (§1), Anayasa Kuralları (§2),
> API kontratı (§3), şemalar (§4). Bu plan onları **İHLAL EDEMEZ**; çelişki görülürse önce raporlanır.
> **Kapsam sınırı (değişmez):** `konsept-ve-plan.md` **Bölüm 8**. §8.3'e görev **YAZILMAZ**.
> Gereksinim referansı: `gate-a-urun-tanimi.md` (<N> epic / <M> story).
> **Girdiler:** <prototip çıktısı + ölçüm raporu> · <görsel dil kilidi> · `collaboration-split.md`
>
> **TEK KAYNAK İLKESİ:** ID'ler, eşikler, ADR'ler, şema alanları **KOPYALANMAZ** — bölüm referansı verilir.
> Bu dosya yalnızca **"ne yapılacak + nerede + bitti mi"**yı takip eder.
>
> **SIRALAMA STRATEJİSİ:** Önce **oynanabilir/kullanılabilir dikey dilim**, sonra sistem derinliği,
> sonra içerik + gelir, en son cila + yayın. **Her faz sonu çalışır + test edilir.**

---

## Kaldığımız Yer (her oturum sonu güncellenir)

- **🔖 <TARİH> — <faz/iş> ✓:** <ne bitti> **Doğrulama: <kanıt: test sayısı, build, hash, komut çıktısı>.**
  <Varsa tuzak/ders.> **Commit: `<hash>`** <veya "commit bekliyor">
- **Aktif faz:** <faz>
- **Sıradaki işaretsiz görev:** <ID + kısa açıklama>
- **Açık karar/blokaj:** <var/yok + ne>

---

## MVP'nin Tek Amacı
MVP **<neyi kanıtlar>**. Kapsam içi/dışı: konsept §8.2 / §8.3 (**DEĞİŞMEZ**).

## Ortam
<Doğrulanmış sürümler: runtime, SDK, test koşucusu, CI job'ları.>

---

## Faz Özeti

**Toplam <N> görev, <M> faz.** 👤 = kullanıcı/asset işbirliği görevi (paralel hat, implementasyonu bloklamaz).

| Faz | Ne teslim eder (çalışır durum) | Görev | Ana agent(lar) | Epic kapsamı |
|---|---|---|---|---|
| **M0** <ad> | <çalışır durum> | <n> | <agent> | <epic> |
| **M1** DİKEY DİLİM | <uçtan uca minimal döngü> | <n> | <agent> | <epic> |

---

## Agent Roster

> Kaynak: `agent-assignment-matrix.md`. <Çekirdek alan> = **<agent>** (TDD zorunlu — anayasa §2);
> <sunum alanı> = **<agent>**; içerik/asset = **<agent> + 👤**. Her fazda QA: **code-reviewer** varsayılan;
> **security-reviewer** (<hangi alanlarda>), **verifier** final gate.

| Faz | Ana Agent | Yedek | QA Agent(lar) | Paralel |
|---|---|---|---|---|
| M0: <ad> | <agent> (<alan>) | <agent> | code-reviewer | <ne ile paralel> |

### Matris sapma gerekçeleri
- <Matriste X yazıyor ama Y seçildi çünkü ...>
- **Dev-QA loop (qa-loop.md) HER görevde:** implement → code-reviewer + verifier →
  PASS / retry (max 3) / escalate. Faz geçişinde quality gate: <kriterler>.

---

## Yürütme Protokolü (maestro dikte + paralel)

```
1. maestro → YAML directive: phase · parallel_group · dependencies · accept_criteria · owner_flow
2. parent  → aynı parallel_group'u TEK mesajda paralel Agent() ile başlatır
3. agent   → kendi dizininde çalışır + doğrulama kapısı + (worktree ise) commit & handoff
4. QA      → qa-loop: code-reviewer + verifier → PASS / retry(≤3) / escalate
5. parent  → görev satırlarını işaretler + WORK_LOG'a kanıtlı blok ekler
```

**Paralel grup kuralı:** grup içindeki görevlerin dosya kümeleri **ayrık** olmalı — directive
üretilirken kontrol edilir, çalışma anında değil.

---

## Görev Satırı Formatı

```
- [ ] **M1-3 — <başlık>** | <dosya yolları> | Bağımlılık: <ID'ler>
      | Bitti: <ÖLÇÜLEBİLİR kriter> | Agent: <isim> | S|M|L
```
`Bitti:` ölçülebilir olmak zorunda. **"Çalışıyor" kabul kriteri değildir.**

---

## Faz M0 — <ad>

> **Amaç:** <ne kurulur, neden ilk>
> **Agents:** <ana> (<alan>) + <ana2> (<alan>) → <QA>. **Paralel:** <ne ile>

- [ ] **M0-1 — <başlık>** | <dosyalar> | Bağımlılık: yok | Bitti: <kriter> | Agent: <isim> | S

> **M0 çıkışı:** <çalışır durum tanımı> + <test/kanıt bandı>. <Sonraki faz ne kurabilir.>
