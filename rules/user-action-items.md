# User Action Items — the 🔴 SENDE block

Kullanıcının kendi yapması gereken işler mesajın içine gömülü kalmasın. Her yanıtın
**sonunda**, sadece ona ait aksiyonlar tek blokta toplanır.

## Format

```
> ### 🔴 SENDE
> 1. <yapılacak iş — neden gerektiği tek cümleyle>
> 2. <ikinci iş>
```

- Blok **mesajın en sonunda** durur, blockquote içinde.
- Maddeler **numaralı** ve **öncelik sırasında** (en kritik en üstte).
- Her madde tek satır: ne yapılacak + neden. Uzun gerekçe yukarıdaki gövdede kalır.
- İngilizce yanıtlarda başlık **`🔴 YOUR TURN`** olur; yapı aynıdır.

## Tek kural: 🔴 başka hiçbir yerde kullanılmaz

Kırmızı daire **yalnızca** bu bloğa ait. Severity göstermek için mesaj gövdesinde
kullanma — gövdede 🔴 varsa kullanıcı göz taradığında hangisinin kendi işi olduğunu
ayırt edemez, blok anlamını yitirir. Gövdede önem belirtmek gerekirse **bold**,
`⚠️`, `‼️` veya "kritik/acil" gibi kelimeler kullan.

## Ne girer, ne girmez

**Girer:** kullanıcının erişimi/yetkisi olan ama benim olmayan işler — panel/UI ayarı,
üçüncü taraf dashboard (ödeme sağlayıcı, DNS, bulut konsolu), IP whitelist, kimlik
bilgisi/erişim talebi, onay bekleyen karar, başkasına sorulacak soru, fiziksel/manuel adım.

**Girmez:** benim yapabileceğim hiçbir şey. Bir işi bloğa koymadan önce sor: "bunu
gerçekten ben yapamıyor muyum?" Yapabiliyorsam yaparım, bloğa koymam.

## Boşsa yazma

Kullanıcıya düşen iş yoksa blok **hiç konmaz**. Her mesaja refleks olarak eklenen boş
bir "SENDE" bloğu, dolu olanın dikkat çekiciliğini öldürür.

## Neden

Kullanıcı uzun teknik yanıtlarda kendi yapması gereken 2-3 şeyi kaybediyordu. Terminal
markdown render ettiği için gerçek renk yok (ANSI kaçış kodları ya temizleniyor ya
ekrana çöp basıyor) — bu yüzden renk yerine sabit bir görsel işaret kullanılıyor.
