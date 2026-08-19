# Memory System — Codex Native

Codex memory icin canonical kaynak dosya-bazli Claude yolunu kullanma. Codex'in native store'u etkinse resmi memory yuzeyi kullanilir.

## Kurallar

1. Memory ozelligini runtime config'ten kontrol et; etkin degilse varmis gibi davranma.
2. Kaydetmeden once ayni olgunun zaten bulunup bulunmadigini resmi yuzeyden kontrol et.
3. Tek, spesifik ve kanitli olgulari kaydet; secret, credential veya gereksiz transcript kopyalama.
4. Proje kararlari icin once repo icindeki `AGENTS.md`, karar kaydi veya kullanicinin onayladigi notepad dosyasini tercih et.
5. `~/.codex/memories_1.sqlite` Codex'in implementation detail'idir. Dogrudan SQLite sorgusu, schema varsayimi veya dosyaya yazma YASAKTIR.
6. Native memory yuzeyi yoksa fallback olarak proje talimatlari/notepad kullan; hayali bir `<project-slug>` yolu uydurma.

Memory recall sonucu da kanit degildir; codebase hakkindaki guncel iddiayi gercek dosyadan dogrula.
