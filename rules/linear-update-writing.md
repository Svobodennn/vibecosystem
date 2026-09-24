# Linear Update — Paydaş İlerleme Yazısı

Kullanıcı "Linear task'ına yazı çıkar / update yaz / progress paylaş" dediğinde
bu kurala göre yazılır. Issue'nun kendisini yazmak için: `linear-issue-writing.md`.

Ritim: **her üye kendi task'ında haftada en fazla bir anlamlı update.** Daha sık
yazmak gürültü, hiç yazmamak görünmezlik.

## Kim okuyor

Teknik olmayan ama işi takip eden **paydaş**. Kodu değil, *ne yapıldı + hangi
durumda* olduğunu anlamalı. Cevaplaması gereken soru: **"benim için ne değişti,
ne çalışıyor, neyi bekliyoruz?"**

## Dil

İngilizce.

## Yapı

**1. Açılış — 1-2 cümle.** Özelliği tek cümlede tarif et + net durum: çalışıyor mu,
mock data mı, bir şeye mi bloke. Abartma, dürüst ol.

> "The Explore gallery is fully built and working on the frontend … currently running
> on mock data. It can go live the moment we have a public-feed API endpoint, which
> doesn't exist on the backend yet."

**2. `What works now` başlığı + bullet listesi.**
Her bullet: **Özellik adı** — kullanıcının gördüğü davranış, sonra sade "nasıl".

- **Somut ol.** Belirsiz sıfat yerine ölçü: gerçek sayılar, gerçek davranışlar
  ("rate-limit safe, one request in flight, ~0.3s debounce"). "Hızlandırıldı" değil,
  "800ms → 120ms".
- **İş bir referansın portu/klonuysa pariteyi vurgula** ("mirrors X", "word-for-word",
  "same as X"). Parite = bitti demektir; paydaş için en güçlü güven sinyali budur.

**3. `Blocked on <taraf> — what we need` — yalnızca bloke varsa.**
Net blocker + nasıl doğrulandığı ("verified across routes + controllers") + karşı
tarafta tam olarak ne gerektiği. Bloke yoksa bu bölüm hiç yazılmaz.

**4. `Surface touched` — her zaman, en sonda.**
Bu iş sırasında **eklenen** veya mevcut olup **yeni bir yerde kullanılan** tüm
arayüzler: endpoint, socket event, feature flag, env değişkeni.
Satır stili: `**METHOD /path** (auth) — page; description` ·
socket için: `Socket \`event-name\` (WS) — page; description`.
Yol değişmeden yeni alan okunuyorsa o da girer — açıklamada belirt
("now reads `approvalStatus`").
Bu bölüm teknik ekip için referanstır; paydaş isterse atlar.
Projenin kendi arayüz katalog dosyası varsa satır stili **onunla birebir aynı** olur.

## Ton

- **Somut + dürüst.** Eksikler, mock veriler, "no after-auth resume yet" gibi sınırlar açıkça.
- **Paydaş-erişilebilir.** Önce "ne işe yarar", sonra kısa teknik.
- **Öz tut.** Her bullet ideali tek satır. Paydaş hızlı tarar.

## Kaçın

- Ham commit listesi, dosya yolları (`src/...`), iç jargon (reducer, memoization,
  SRP, useEffect). Paydaş bunları okumaz.
- "Refactor ettim / hook yazdım" gibi geliştirici-içi dil → "şu artık çalışıyor" de.
- Plan/faz/sprint dili — issue'da yasak olan burada da yasak.
- Abartı ve söz verme. Yalnızca gerçekten bitmiş **ve test edilmiş** olan "çalışıyor" sayılır.

## İskelet

```
[1-2 cümle: özellik + dürüst durum]

## What works now
- **[Özellik]** — [kullanıcı davranışı] + [sade nasıl]. [parite / somut sayı].
- …

## Blocked on <taraf> — what we need     (yalnızca bloke varsa)
[Net blocker] — [nasıl doğrulandı] — [karşı tarafta ne gerek].

## Surface touched
- **METHOD /path** (auth) — page; description.
- Socket `event-name` (WS) — page; description.
```

Update paylaşmak **dışa dokunan** bir eylemdir: gönderilmeden önce kullanıcıya
gösterilir ve onay alınır.
