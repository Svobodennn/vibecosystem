# <PROJE> (çalışma adı) — Konsept & Planlama Dokümanı

> **ROL: Bu dosya projenin ANA dokümanıdır (single source of truth).** Tüm konsept/plan güncellemeleri
> bu dosya üzerinden yapılır; her değişiklik en alttaki Değişiklik Günlüğü'ne işlenir.
> Agent'lar işe başlamadan önce bu dosyayı okur.
>
> **Sürüm:** v0.1
> **Durum:** <hangi aşama kapandı, hangisi aktif, sırada ne var>
> **Tarih:** <YYYY-MM-DD>
> **Referans analiz:** <varsa referans ürün analiz dosyası>
> **Klasör adı notu:** <dizin adı ile ürün adı farklıysa açıkla>
>
> **TEK KAYNAK İLKESİ:** Epic/story ID'leri, eşikler, ADR'ler, şema alanları, formül katsayıları
> **KOPYALANMAZ** — bölüm referansı verilir. Bu dosya *ne* ve *neden*i tutar;
> *nasıl* mimariye, *bitti mi* implementasyon planına aittir.

---

## 1. Vizyon / Pitch

> **Tek cümle:** _"<X'in şu yanı × Y'nin şu yanı × kendi twist'imiz>"_

<Bir paragraf: ürün ne, çekirdek haz ne. "Kullanıcı ne yapar ve neden keyif alır."
Teknoloji anlatmaz.>

---

## 2. Referans ve Çıkış Noktası

Referans: **<ürün>** — detaylı analiz `<analiz-dosyasi>.md`'de.

### Referanstan KORUNAN çekirdek (çalıştığı görülen formül)
- <kanıtlanmış mekanik/karar>

### Referansa EKLENEN sistemler (farklılaşma — tema değil, sistem farkı)
> ⏳ Kararlaşmadıysa: bu bölüm ÖNERİDİR, onay bekliyor → OPEN_QUESTIONS S-N

1. **<sistem>** — referansta <ne eksik>; bizde <ne var>. <Neden mekanik fark yaratır.>

<Öneri gerekçesi: bu eklemelerin maliyeti/getirisi neden dengeli.>

---

## 3. Kiletlenen Konsept Kararları

| Karar | Sonuç |
|---|---|
| <eksen> | <karar + tarih + kim verdi> |
| <kararlaşmayan eksen> | ⏳ <öneri>, <hangi kapıda> kilitlenir |

### Karar sürecinin özeti (değerlendirilip elenenler)
- **<alternatif>** → elendi: <gerekçe>
- **Nihai yön (kullanıcı kararı, <tarih>):** <ne>

---

## 4. Çekirdek Sistemler

> Formüller ve şema alanları burada DEĞİL — `asama2-mimari.md`'de. Bu bölüm *ne olduğunu* tanımlar.

### 4.1 <sistem>
<Ne olduğu + hangi tasarım kısıtı taşıdığı. Tuzağı varsa yaz:
"X yapılırsa Y kaybolur" cümlesi bu bölümün en değerli kısmıdır.>

---

## 5. İçerik Mimarisi
<İçerik ne kadar, nasıl üretilir, varyasyon nereden gelir.>

## 6. Farklılaşma & Pazarlama Açıları
<Rakipten ayrıldığı noktalar; mağaza/pazar dilinde.>

## 7. Riskler

| Risk | Neden yapısal | Nerede kapanır |
|---|---|---|
| <risk> | <neden> | <aşama/kapı> |

---

## 8. MVP Tanımı ve Tamamlanma Kriterleri

### 8.1 MVP nedir (tek cümle)
MVP **<neyi kanıtlar>**: <somut hedef durum>.

### 8.2 Kapsam: MVP'ye GİREN
- <kalem>

### 8.3 Bilinçli DIŞARIDA bırakılanlar (görev YAZILMAZ)
- **<kalem>** — <nereye ertelendi + neden>

### 8.5 Ölçülebilir eşikler

| Eşik | Hedef | Nerede ölçülür |
|---|---|---|
| <eşik> | <sayı> | <aşama> |

---

## 9. Aşama Pipeline'ı

| Aşama | Çıktı | Kapı | Durum |
|---|---|---|---|
| **1** <ad> | `<dosya>` | — | ✅ kapandı |
| **2** <ad> | `<dosya>` | **GATE A** | 🔄 aktif |
| **3** <ad> | `<dosya>` | **GATE B** (<eşikler>) | ⬜ iskelet |

---

## 10. Değişiklik Günlüğü

| Sürüm | Tarih | Değişiklik |
|---|---|---|
| v0.1 | <tarih> | İlk sürüm. <hangi kararlar kilitlendi, ne açık kaldı> |
