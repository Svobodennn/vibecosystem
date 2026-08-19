# Dev-QA Loop — Codex

Her implementasyon kanitli bir kalite kapisiyla kapanir.

## Dongu

1. ASSIGN — Kurulu roster'da uygun rol varsa kullan; yoksa parent uygular.
2. IMPLEMENT — En kucuk tam degisiklik.
3. REVIEW — Gercek diff ve ilgili dosyalar okunur.
4. VERIFY — Projenin build/type/lint/test komutlari ve kabul kriterleri kosulur.
5. KARAR — PASS tamam; FAIL geri bildirimle retry; ucuncu fail sonrasi reassign/decompose/revise/defer.

## Kanit

- “Testler gecti” demek icin basarili komut ciktisi gerekir.
- Grep tek basina davranis kaniti degildir.
- Kritik iddialar parent tarafindan ana calisma agacinda yeniden dogrulanir.
- Hook tabanli enforcement ancak `~/.codex/hooks.json` kaydi trusted ise ek kanittir; yoksa manuel gate gecerlidir.

## Retry

Ikinci ayni hatada varsayimlari yeniden kontrol et; blind retry yapma. Security fail normal retry'dan once izole edilir. Build/type/test/style kontrollerini yalniz etkiledigi kapida yeniden kos, finalde ilgili tam suite'i calistir.

Bagimsiz QA rolleri ancak roster'da varsa ve delegasyon talimati izin veriyorsa kullanilir. Somut agent adi uydurulmaz.
