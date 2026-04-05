---
name: content-marketing
description: Icerik pazarlama ve SEO odakli yazi uretimi. AI slop temizleme (30+ pattern), icerik kalite skorlama (5 boyut), watermark temizleme, copywriting formulleri (AIDA, PAS, BAB), programmatic SEO ve icerik stratejisi.
---

# Content Marketing

AI destekli icerik uretimi icin kalite kontrol, SEO optimizasyonu ve pazarlama psikolojisi.

## AI Slop Detector (30+ Pattern)

AI tarafindan yazildigini ele veren kaliplari tespit et ve temizle.

### Yasak Acilis Cumleri

```
TESPIT ET VE SIL:
- "In today's digital landscape..."
- "In the ever-evolving world of..."
- "Let's dive in..."
- "Let's dive deep into..."
- "In this comprehensive guide..."
- "Welcome to our deep dive..."
- "Are you ready to discover..."
- "Have you ever wondered..."
- "In an era where..."
- "The landscape of X is rapidly changing..."
```

### Yasak Kelimeler ve Ifadeler

```
YUKSEK RISK (hemen degistir):
- "leverage" → "use" veya "apply"
- "utilize" → "use"
- "delve" → "explore" veya "look at"
- "tapestry" → SIL veya yeniden yaz
- "paradigm shift" → "change" veya "new approach"
- "synergy" → SIL
- "holistic" → "complete" veya "full"
- "robust" → "strong" veya "reliable"
- "seamless" → "smooth" veya "easy"
- "cutting-edge" → "modern" veya "new"
- "game-changer" → spesifik etkiyi yaz
- "revolutionize" → ne degistigini yaz
- "empower" → ne yaptigini yaz
- "streamline" → nasil basitlestirdigini yaz

ORTA RISK (context'e gore):
- "It's worth noting that..." → direkt soyle
- "It's important to understand..." → direkt soyle
- "Interestingly enough..." → SIL
- "As we all know..." → SIL
- "At the end of the day..." → SIL
- "Moving forward..." → SIL
- "That being said..." → SIL
- "Without further ado..." → SIL
```

### Yapi Kaliplari

```
TESPIT ET:
- Her paragraf tam 3 cumle (AI pattern)
- Her baslik soru formunda (AI pattern)
- "First... Second... Third..." listeleme (dogal degil)
- Her bolum ayni uzunlukta (insan boyle yazmaz)
- Emoji arasinda icerik (LinkedIn AI slop)
```

### Regex Tarama

```bash
# AI slop tarama script'i
grep -inE "(let's dive|in today's|ever-evolving|comprehensive guide|paradigm shift|leverage|utilize|delve|tapestry|synergy|holistic|robust|seamless|cutting-edge|game-changer|revolutionize|empower|streamline)" "$1" | while read line; do
  echo "SLOP TESPIT: $line"
done
```

## Icerik Kalite Skorlama (5 Boyut)

Her icerik parcasini 5 boyutta skorla. Toplam 100 puan, gecme esigi 70.

| Boyut | Agirlik | Olcum |
|-------|---------|-------|
| Insanilik | %30 | AI slop pattern sayisi (az = iyi), kisisel ton, gercek ornekler |
| Spesifiklik | %25 | Somut rakamlar, gercek isimler, detayli ornekler (belirsiz = dusuk skor) |
| Yapi Dengesi | %20 | Paragraf uzunlugu varyasyonu, baslik cesitliligi, liste/metin dengesi |
| SEO | %15 | Keyword yogunlugu (%1-3), baslik optimizasyonu, meta description, internal link |
| Okunabilirlik | %10 | Cumle uzunlugu varyasyonu, aktif dil, gereksiz kelime orani |

### Skorlama Formulu

```
Insanilik = 30 - (slop_pattern_sayisi * 3)  // max 30
Spesifiklik = somut_ornek_sayisi * 5         // max 25
Yapi = paragraf_varyasyon_skoru              // max 20
SEO = keyword_skor + meta_skor + link_skor   // max 15
Okunabilirlik = cumle_varyasyon + aktif_oran  // max 10

TOPLAM = Insanilik + Spesifiklik + Yapi + SEO + Okunabilirlik

70+ = YAYINLA
50-69 = REVIZE ET (otomatik, max 2 deneme)
<50 = YENIDEN YAZ
```

## AI Watermark Temizleme

AI uretimi metinlerde gorunmeyen Unicode karakterler olabilir:

```bash
# Gorunmeyen watermark'lari temizle
sed -i '' 's/\xe2\x80\x8b//g' "$1"    # Zero-width space (U+200B)
sed -i '' 's/\xe2\x80\x8c//g' "$1"    # Zero-width non-joiner (U+200C)
sed -i '' 's/\xe2\x80\x8d//g' "$1"    # Zero-width joiner (U+200D)
sed -i '' 's/\xef\xbb\xbf//g' "$1"    # BOM (U+FEFF)
sed -i '' 's/\xc2\xad//g' "$1"        # Soft hyphen (U+00AD)

# Em dash asiri kullanimi (AI belirtisi)
# 3+ em dash varsa 1'e dusur
sed -i '' 's/—/--/g' "$1"  # em dash -> double hyphen
```

## Copywriting Formulleri

### AIDA (Attention-Interest-Desire-Action)

```
ATTENTION: Dikkat cekici baslik veya istatistik
  "Kullanicilarin %73'u ilk 3 saniyede karar veriyor"

INTEREST: Problemi detaylandir, empati kur
  "Her gun saatlerce icerik yazip sonuc alamiyorsun"

DESIRE: Cozumun faydasini goster
  "Bu framework ile 30 dakikada SEO-optimized icerik uret"

ACTION: Net CTA
  "Simdi dene -- ilk 7 gun ucretsiz"
```

### PAS (Problem-Agitate-Solve)

```
PROBLEM: Sorunu tanimla
  "Blog'un organik trafik almiyor"

AGITATE: Sorunun etkilerini buyut
  "Her gun rakiplerin senden once siralamalara giriyor.
   Her gecen gun daha fazla potansiyel musteri kaybediyorsun."

SOLVE: Cozumu sun
  "Keyword research + content cluster stratejisi ile
   3 ayda organik trafigi 5x artir"
```

### BAB (Before-After-Bridge)

```
BEFORE: Mevcut durum
  "Haftalik 2 blog yazisi, 500 organik ziyaretci"

AFTER: Hedef durum
  "Haftalik 5 optimized yazi, 5000 organik ziyaretci"

BRIDGE: Nasil ulasacaksin
  "Content cluster + pillar page stratejisi"
```

## SEO Icerik Checklist

### Yazi Oncesi

```
[ ] Keyword research yapildi (ana + 5-10 long-tail)
[ ] Search intent belirlendi (informational/transactional/navigational)
[ ] Rakip analizi yapildi (ilk 5 sonuc incelendi)
[ ] Content outline olusturuldu (H2/H3 yapisi)
[ ] Internal link firsatlari belirlendi
```

### Yazi Icinde

```
[ ] Baslik keyword iceriyor (ilk 60 karakter)
[ ] Meta description yazildi (155 karakter, CTA iceriyor)
[ ] H1 tek ve keyword iceriyor
[ ] H2'ler keyword varyasyonlari iceriyor
[ ] Ilk 100 kelimede ana keyword var
[ ] Keyword yogunlugu %1-3 arasi
[ ] Internal link'ler eklendi (min 3)
[ ] External link'ler eklendi (otorite kaynaklara, min 2)
[ ] Gorseller alt text iceriyor
[ ] URL slug kisa ve keyword iceriyor
```

### Yazi Sonrasi

```
[ ] AI slop taramasi yapildi (0 pattern)
[ ] Kalite skoru 70+ (5 boyut)
[ ] Watermark temizligi yapildi
[ ] Okunabilirlik kontrolu (Hemingway Grade 6-8)
[ ] Mobil gorunum kontrolu
[ ] Schema markup eklendi (Article/HowTo/FAQ)
```

## Programmatic SEO

Sablonla olceklenebilir icerik uretimi:

```
SABLON: "[Sehir]'de En Iyi [Kategori] [Yil]"
  → "Istanbul'da En Iyi Kahve Dukkanlari 2026"
  → "Ankara'da En Iyi Co-working Alanlari 2026"
  → "Izmir'de En Iyi Vegan Restoranlar 2026"

VERI KAYNAKLARI:
  - Sehir listesi (81 il)
  - Kategori listesi (50+ is tipi)
  - Google Places API (isletme verileri)

URETIM:
  81 sehir x 50 kategori = 4,050 sayfa
  Her sayfa benzersiz veri iceriyor (template degil)
```

## Content Cluster Stratejisi

```
PILLAR PAGE (3000+ kelime):
  "Mobil Uygulama Monetizasyonu Rehberi"
    │
    ├── CLUSTER 1: "Freemium vs Premium Model Karsilastirmasi"
    ├── CLUSTER 2: "In-App Purchase Stratejileri"
    ├── CLUSTER 3: "Subscription Pricing Rehberi"
    ├── CLUSTER 4: "Paywall Tasarim Best Practices"
    ├── CLUSTER 5: "A/B Test ile Fiyat Optimizasyonu"
    └── CLUSTER 6: "Regional Pricing (PPP) Uygulama"

Her cluster pillar page'e link verir.
Pillar page her cluster'a link verir.
Topical authority olusur.
```

## Icerik Uretim Pipeline

```
1. KEYWORD RESEARCH
   └─ Ana keyword + 10 long-tail sec

2. OUTLINE
   └─ H2/H3 yapisi olustur (rakip analizi bazli)

3. DRAFT
   └─ Yazildi (AI veya insan)

4. SLOP CHECK
   └─ 30+ pattern taramasi
   └─ Bulunan pattern'leri temizle

5. QUALITY SCORE
   └─ 5 boyut skorlama
   └─ 70+ = devam, <70 = revize

6. WATERMARK CLEAN
   └─ Unicode temizligi

7. SEO CHECK
   └─ Keyword, meta, link kontrolu

8. PUBLISH
```

## vibecosystem Entegrasyonu

- **copywriter agent**: Bu skill'i birincil referans olarak kullanir
- **growth agent**: Content stratejisi ve programmatic SEO icin
- **seo-specialist agent**: Teknik SEO kontrollerini uygular
- **ai-slop-cleaner skill**: Slop pattern'leri bu skill'den besler
- **technical-writer agent**: Dokumantasyonda da slop kontrolu yapar
