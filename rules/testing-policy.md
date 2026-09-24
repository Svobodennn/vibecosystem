# Test Politikası (global)

Testle ilgili geçerli kural bu dosyadır. Diğer kurallar, agent ve skill tanımları, agent
hafızaları ve instinct'ler bununla çeliştiğinde bu dosya geçerlidir. Projede
`TESTING_POLICY.md` varsa o projeye özel ekleri taşır; bu dosyayla çeliştiğinde o geçerlidir.
Coverage hedefi yoktur. Test yazarken `tdd` skill'i kullanılır.

Bir testin değeri: davranış bozulunca kırılması, davranış korununca kırılmamasıdır.

## Kapsam — test zorunlu
Kapsam değişen satıra göre belirlenir ve port/kopya muafiyetini yener.

1. **Para, auth, izolasyon, veri kaybı** — ödeme, bakiye/kredi, yetki, tenant/kullanıcı
   izolasyonu, moderasyon ve yaş kapısı, silme, migration.
2. **Sessiz mantık** — "Bu yanlış çalışsa ekrana bakan biri fark eder mi?" Etmezse test
   yazılır: hesap/fiyat/puan, limit, regex, tarih, state machine, parser.
3. **Bug fix** — bug 1. ya da 2. maddedeki mantıktaysa önce bug'ı tekrar üreten test
   (RED), sonra fix (GREEN). Diğer fix'lerde tekrar-üretim kanıtı yeter.

Kapsam dışı (UI bağlantısı, metin/stil, config, birebir port, glue kod): build +
typecheck + ilgili mevcut testler. Projede `CRITICAL_FLOWS.md` varsa ve değişiklik bir
akışa dokunuyorsa o akış Claude in Chrome ile yürütülür.

Her değişiklik sınıfını planda ya da son raporda tek satırla yazar:
`Test: 1|2|3|dışı — neden`. Reviewer bu satırı denetler.

## Nasıl yazılır
- Önce "bu nasıl bozulur" listesi çıkarılır; testler o listeden türer.
- Mantığın girdisi ve çıktısı sınanır (saf fonksiyon, endpoint, event). Çağrı sayısı ve
  iç sıra sınanmaz.
- Beklenen değer spec'ten, gerçek bir örnekten ya da değişmez bir kuraldan gelir; test
  edilen koddan okunmaz.
- Mock yalnız sistem sınırında: dış API, DB (ORM modelleri dahil), dosya sistemi, saat,
  rastgelelik.

## Kanıt
Kapsam dışı işin raporunda komut + çıktı (tsc, build, curl) ya da ekran görüntüsü / GIF
yolu bulunur.

## Test kırılınca
- Önce kod şüpheli sayılır. Beklenen değer yalnız davranış bilerek değiştiyse değişir;
  nedeni rapora yazılır.
- **Yapısal kırılma** (mock yolu, mock şekli ya da iç çağrı sırası kırıldı, davranış
  sağlam) regresyon sayılmaz. Tek bir mekanik düzeltme denenir; tutmazsa test
  karantinaya alınır.
- **Karantina:** `skip` + tek satır neden + projenin `KNOWN_BROKEN_TESTS.md` dosyasına bir
  satır (yoksa oluşturulur). Test silinmez; silme kararı kullanıcınındır.
- "İç yapıyı sınayan test" bulgusu yalnız bu diff'te yazılan testlere uygulanır.

## Bitti-Gate
- Çalışırken yalnız değişen dosyalarla ilgili testler koşulur (ör. `vitest related --run`,
  `jest --findRelatedTests <dosyalar> --passWithNoTests`, `pytest <dosya>`,
  `go test ./<paket>`). İlgili test yoksa rapora "ilgili test yok" yazılır.
- Commit öncesi tüm suite bir kez koşulur ve yeşildir. Verifier PASS raporuna
  `git diff HEAD | shasum` yazar; değer aynıysa suite tekrar koşulmaz.
- **Regresyon varsa iş bitmemiştir.** Karantina listesi baseline'dır; baseline için repo
  klonlanmaz.

## Mevcut testler
- Toplu silme yapılmaz.
- Bir testin değeri geçmişinden ölçülür: yakaladığı gerçek bug sayısı ile kodla birlikte
  düzenlendiği sayı karşılaştırılır (git log).
- Mutation testing yalnız kapsam 1–2'deki kod için yapılır; kaçan mutant rapora yazılır,
  otomatik test yazılmaz.

## E2E
E2E, projenin `CRITICAL_FLOWS.md` listesinin Claude in Chrome ile yürütülmesidir.
Playwright/Cypress altyapısı ancak ayrıca onaylanan bir iş olarak kurulur.
