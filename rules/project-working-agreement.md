# Project Working Agreement

Bir projede çalışırken, o projenin **kendi** anlaşmasına uyulur. Bu dosya yalnızca
başka kurallarda **olmayan** maddeleri taşır; örtüşenler için kaynağa bakılır:

| Konu | Kaynak |
|---|---|
| Katmanlı mimari, SRP, SOLID | `architecture-principles.md` |
| Test kapsamı + suite ne zaman koşar (Bitti-Gate) | `testing-policy.md` |
| Yorum disiplini, immutability, dosya boyutu | `coding-style.md` |
| Commit / PR / branch formatı | `commit-pr-linear-conventions.md` |
| Issue ve update yazımı | `linear-issue-writing.md`, `linear-update-writing.md` |

## 1. Kanonik referans dokümanı önce okunur

Proje bir **kanonik referans dokümanı** tanımlıyorsa (API paritesi, port kaynağı,
domain sözlüğü, kontrat listesi), ilgili işe başlamadan **önce** o okunur.

- Doküman "yeni değişiklikler / changelog" bölümü tutuyorsa **her iş öncesi taranır**;
  yeni satır varsa öncelikli uygulanır.
- Doküman eksik veya muğlaksa **kaynağa inilir** — referans implementasyonun kendisi
  okunur, çağrı şekli (request shape, error handling, fallback zinciri) orada
  doğrulanır, sonra aynı pattern uygulanır.
- Dokümana güvenip kaynağı atlamak, `claim-verification.md` ihlalidir: doküman
  bayatlamış olabilir.

## 2. İş bir portsa, parite kendi inisiyatifini yener

Çalışma bir referansın portu/klonuysa (görsel veya API paritesi), ilgili parça
referansta okunup **birebir** eşlenir. Hedef üründe kendi inisiyatifinle
iyileştirme/değişiklik eklenmez — parite bozulur ve doğrulanamaz hale gelir.
İyileştirme fikri varsa ayrı iş olarak önerilir.

## 3. Arayüz kataloğu güncel tutulur

Proje bir endpoint/arayüz katalog dosyası tutuyorsa, backend'e dokunan her iş sonrası:

- Katalog taranır — arayüz zaten var mı?
- **Yoksa**, ya da **varsa ama yeni bir feature'da kullanıldıysa** → kataloğa eklenir.
- Format projenin kendi formatıdır; uydurma.

## 4. Projenin mevcut konvansiyonları korunur

Dizin yapısı, isimlendirme, dosya başı direktifleri, framework idiomları — hepsi
olduğu gibi korunur. "Genel doğru" değil, **o proje için doğru** uygulanır.
Konvansiyon değiştirmek ayrı bir karardır, sessizce yapılmaz.

## 5. İş bitiminde anlaşma özeti

İş tamamlandığında **hangi maddelere uyulduğu kısaca listelenir.**

Amaç iki taraflı: anlaşmaya bağlı kalındığı doğrulanabilir olur, ve sohbet uzayıp
bağlam sıkışsa bile hangi kuralların yürürlükte olduğu kayda geçmiş olur.

Uyulamayan madde varsa **sebebiyle birlikte** yazılır — sessizce atlanmaz.
