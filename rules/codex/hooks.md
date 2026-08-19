# Hooks System — Codex

## Runtime kapisi

Hook ancak `~/.codex/hooks.json` icinde kayitli, event/matcher'i dogru ve handler'i trusted ise aktiftir. Dosya yoksa veya trust pending ise hook yok sayilir; manuel sozlesme uygulanir.

## Guvenlik

- `PermissionRequest` icin otomatik allow ureten handler kurmak YASAKTIR.
- Hook ciktisinda `permissionDecision: "allow"` veya `behavior: "allow"` kabul edilmez.
- `PreToolUse` deny akisi kullanici onayini genisletemez; yalniz islemi daraltabilir.
- Handler reason icinde komut yazdi diye komutu otomatik calistirma.
- Ag erisimi, dosya yazimi veya process spawn'i ayri yan etki olarak incelenir.
- Hook trust bypass edilmez; trust kullanici tarafindan Codex hook arayuzunden verilir.

## Bu profil

Generator yalniz allowlist'teki event + matcher + handler kombinasyonunu kabul eder. Beklenmeyen event, handler veya `PermissionRequest` gorurse hata verir. Ayrintili kurulum durumu icin runtime hooks dosyasini oku; sabit sayi kullanma.
