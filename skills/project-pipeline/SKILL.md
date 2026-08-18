---
name: project-pipeline
description: Yeni proje icin gate'li, asamali dokuman pipeline'i kurar (anayasa + asama belgeleri + canli yonetim katmani + agent roster + paralel calisma disiplini). Kullan: sifirdan proje baslatirken, ozellikle bir referans urunu inceleyip kendi versiyonunu yapacakken; "docs olustur", "plan yapisi kur", "yeni proje baslat", "demon-tide gibi docs" istendiginde. Multi-agent paralel calisma ve maestro dikte protokolu dahil. NOT FOR: mevcut projede tek feature plani (plan-documentation), 3-dosyali hafif takip (persistent-planning), brownfield kesif (onboard).
---

# Project Pipeline — Gate'li Proje Dokümanı Yapısı

Sıfırdan bir ürün geliştirirken kurulan doküman iskeleti. `demon-tide` projesinde geliştirilip
`cebinden-clone`'da uyarlanan yapı. Amacı üç şey:

1. **Kararı koddan önce yazmak** — her aşama bir kapıyla kapanır, kapı geçilmeden sonraki aşama başlamaz
2. **Doküman driftini kapatmak** — tek kaynak ilkesi: hiçbir sayı/ID iki yerde yazılmaz
3. **Paralel agent çalışmasını çakışmasız kılmak** — dosya sahipliği ekseni mimari sınırla aynı yerden geçer

---

## Ne zaman kur

| Durum | Kur? |
|---|---|
| Sıfırdan yeni ürün (özellikle referans ürün inceleyip kendi versiyonu) | ✅ evet |
| Çok fazlı, çok agent'lı iş | ✅ evet |
| Mevcut projede tek feature planı | ❌ `plan-documentation` |
| Hafif 3 dosyalı ilerleme takibi | ❌ `persistent-planning` |
| Var olan kod tabanını keşif | ❌ `onboard` |

---

## Üç katmanlı belge hiyerarşisi

### Katman 1 — Anayasa (değişmez; ihlal edilirse plan hatası olarak raporlanır)

| Dosya | İçerik |
|---|---|
| `konsept-ve-plan.md` | **ANA doküman, single source of truth.** Vizyon · Referanstan KORUNAN / EKLENEN · Kilitlenen Kararlar (+ elenenler) · Çekirdek Sistemler · Riskler · MVP Tanımı (§8.1 tek cümle / §8.2 içeride / §8.3 bilinçli dışarıda / §8.5 ölçülebilir eşikler) · Aşama Pipeline'ı · Değişiklik Günlüğü |
| `asama2-mimari.md` | Teknik anayasa: katman mimarisi, **numaralı Anayasa Kuralları (8–10 madde)**, API kontratı, veri şemaları, formüller, repo/CI |
| `gate-a-urun-tanimi.md` | Hedef kullanıcı · çekirdek haz · kapsam kararları kalem kalem · **Epic/Story tabloları (kabul kriterli)** · eşik değerlendirmesi · varsayımlar · GATE önerisi |

### Katman 2 — Aşama belgeleri (sıralı, her biri kapıyla kapanır)

```
asama1: <referans>-analiz.md      → referans ürün teknik/tasarım incelemesi
asama2: gate-a-urun-tanimi.md     → GATE A: ürün tanımı
        stack-degerlendirmesi.md  → GATE A: teknoloji kararı (adaylar + karşılaştırma + şerh)
        asama2-mimari.md          → anayasa (2 ile paralel yürür)
asama3: asama3-prototip-plani.md  → en riskli varsayımı sınayan prototip
        gate-b-olcum-runbook.md   → GATE B: ölçüm prosedürü (ölçümden ÖNCE yazılır)
asama4: asama4-<gorsel/asset>.md  → görsel dil + asset stratejisi
asama5: asama5-mvp-plani.md       → GATE C: implementasyon planı + agent roster
```

### Katman 3 — Canlı yönetim (her oturum güncellenir, sabit şablon)

`PROJECT_CONTEXT.md` · `WORK_LOG.md` · `ARCHITECTURE_DECISIONS.md` · `RISK_REGISTER.md` ·
`OPEN_QUESTIONS.md` · `collaboration-split.md`

Şablonlar: `templates/` dizininde. Kopyala, projeye göre doldur.

---

## Beş bağlayıcı disiplin

### 1. TEK KAYNAK İLKESİ
Epic/story ID'leri, eşikler, ADR'ler, şema alanları, formül katsayıları, palet değerleri
**KOPYALANMAZ** — bölüm referansı verilir: `"gate-a §Epic-3 / Story 3.2"`, `"mimari §4.1"`, `"GATE B / G1"`.
Plan dosyası yalnızca **"ne + nerede + bitti mi"** taşır. Bu kural olmadan dokümanlar birbirinden kopar
ve hangisinin doğru olduğu belirsizleşir.

### 2. Görev satırı — tek satır, altı alan
```
- [ ] **M1-3 — <başlık>** | <dosya yolları> | Bağımlılık: <ID'ler>
      | Bitti: <ÖLÇÜLEBİLİR kriter> | Agent: <isim> | S|M|L
```
`Bitti:` alanı ölçülebilir olmak zorunda. **"Çalışıyor" bir kabul kriteri değildir.**

### 3. GATE sistemi
Kapı = `plan-reviewer` verdict + **kullanıcı onayı**. Verdict formatı:
`APPROVED` · `APPROVED WITH CHANGES` (blocker'lar listelenir, uygulanır, sonra onay) · `REJECTED`.

Ölçüm kapıları (GATE B tipi) için eşikler **ölçümden önce** yazılır ve üç sonuç tanımlanır:
`PASS` · `PASS WITH NOTES` · `FAIL` (→ sonraki aşama başlamaz).

### 4. "Kaldığımız Yer" bölümü
Implementasyon planının **en üstünde**, her oturum sonu güncellenen devir notu:
- `🔖` işaretli oturum devirleri, her birinde **kanıt** (test sayısı, hash, komut çıktısı, commit)
- `Aktif faz:` · `Sıradaki işaretsiz görev:` · `Açık karar/blokaj:`

Session-to-session süreklilik buradan yürür. Kanıtsız devir notu yazılmaz.

### 5. Doğrulama kanıtı zorunlu
`WORK_LOG.md`'de Verification bölümü komut + sonuç taşır. Yapılamayan doğrulama
**yapılmış gibi yazılmaz** — "SDK yok, build koşulamadı" yazmak doğru davranıştır.
Analiz dosyalarında her iddia işaretlenir: `✓` doğrulandı · `?` çıkarım · `~` zayıf kaynak · `✗` ölçülemedi.

---

## Paralel agent çalışması

### Dosya sahipliği = mimari sınır
Akışları **mimarinin kendi sınırından** böl. İyi bölünmüş bir mimaride sahiplik sınırı bedava gelir.

| Akış | Sahip olduğu | Dokunmaz | Ana agent örneği |
|---|---|---|---|
| A — Çekirdek/mantık | `src/<core>/`, `tests/<core>/` | sunum dizinleri | `kraken` (TDD zorunlu) |
| B — Sunum/UI | `src/app|ui|features/` | çekirdek dizini | `spectre` (mobil) / `frontend-dev` (web) / `godot-expert` (oyun) |
| C — İçerik/asset | `content/`, `assets/` | `src/` tamamı | `art-director` skill + 👤 kullanıcı |

**Sınır-aşan görev:** dosyaya göre bölünür ve **çekirdek API'si ÖNCE merge edilir**; sunum sonra tüketir.
Aynı dosyaya iki agent asla aynı anda dokunmaz.

**Tek paylaşılan dosya** implementasyon planıdır: yalnız kendi görev satırını düzenle + merge öncesi rebase.

### Maestro dikte protokolü
`maestro` kendi subagent'ını spawn **edemez**. Akış:
```
1. maestro → YAML directive: phase · parallel_group · dependencies · accept_criteria · owner_flow
2. parent  → aynı parallel_group'u TEK mesajda paralel Agent() ile başlatır
3. agent   → kendi dizininde çalışır + doğrulama kapısı + (worktree ise) commit & handoff
4. QA      → qa-loop: code-reviewer + verifier → PASS / retry(≤3) / escalate
5. parent  → görev satırlarını işaretler + WORK_LOG'a kanıtlı blok
```
**Paralel grup kuralı:** grup içindeki görevlerin dosya kümeleri **ayrık** olmalı. Directive üretilirken
kontrol edilir, çalışma anında değil.

**Worktree handoff:** worktree'de dosya değiştiren agent commit atmadan dönmez; çıktısına branch + commit
hash yazar. Commit'siz dönen agent'ın işi strand kalır ve `git worktree prune` ile kaybolabilir.

### Agent Roster (implementasyon planının içinde)
İki tablo + bir bölüm:
1. **Faz Özeti:** faz | teslim (çalışır durum) | ana agent(lar) | epic kapsamı
2. **Agent Roster:** faz | ana agent | yedek | QA agent(lar) | paralel
3. **Matris sapma gerekçeleri:** `agent-assignment-matrix.md`'den her sapma tek cümleyle gerekçelenir

Ayrıca her faz başlığının altına satır içi atama:
`> Agents: <ana> (<alan>) + <ana2> (<alan>) → <QA>. Paralel: <ne ile>`

### Makine kontrolleri (anayasa kurallarını grep'e bağla)
Yazılı kural yeterli değil — kontrol edilebilir hâle getir. Örnekler:
```bash
# Çekirdek katman saflığı (UI/framework sızmasın)
grep -rEn "from ['\"](react|react-native|expo)" src/core/ && echo "İHLAL"
# Determinizm (zaman/rastgelelik enjekte edilir, içeriden çağrılmaz)
grep -rEn "\b(Math\.random|Date\.now|new Date\(\))" src/core/ && echo "İHLAL"
```
Bu grep'ler doğrulama kapısının parçası olur ve CI'a girer.

---

## Kurulum sırası

```
1. git init + .gitignore (+ main branch)
2. mkdir docs
3. Aşama 1: referans/keşif analizi  → GERÇEK içerik (veri elde varsa)
4. konsept-ve-plan.md               → GERÇEK içerik; kararlaşmayanı ⏳ + OPEN_QUESTIONS'a taşı
5. Aşama 2: gate-a + stack değerlendirmesi → GERÇEK içerik, GATE A önerisiyle bitir
6. Yönetim katmanı (templates/)     → GERÇEK, projeye göre doldurulmuş
7. collaboration-split.md           → GERÇEK (akışlar mimari sınırdan)
8. Kalan aşama dosyaları            → İSKELET: başlık + durum + "neden şimdi yazılmıyor"
9. Commit → KULLANICI ONAYI ŞART
```

**Önemli: sonraki aşamaları şimdi doldurmaya çalışma.** Kanıtlanmamış varsayım üstüne yazılan
implementasyon planı, sonradan atılacak plandır. İskelet dosyaya *neden* boş olduğunu yaz —
bu bir eksik değil, sıra disiplinidir.

---

## Kalite kontrolü

Pipeline kurulduktan sonra:
- Her aşama dosyası üstünde **durum satırı** var mı? (`✅ kapandı` / `🔄 aktif` / `⬜ iskelet`)
- Her dosya anayasaya ve kapsam sınırına **referans veriyor** mu?
- Hiçbir sayı/ID iki dosyada tekrar ediyor mu? (tek kaynak ihlali)
- Kararlaşmamış her şey `OPEN_QUESTIONS.md`'de, önerilen varsayılanıyla mı?
- `konsept-ve-plan.md` Aşama Pipeline tablosu gerçek dosya durumlarıyla tutuyor mu?
- Analiz dosyalarında doğrulama işaretleri (`✓ ? ~ ✗`) var mı?
