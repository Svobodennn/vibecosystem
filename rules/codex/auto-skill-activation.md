# Auto Skill Activation — Codex

Bu kural otomatik sistem varmis gibi davranmaz; her aktivasyon runtime envanterine dayanir.

## Session baslangici

1. Proje manifestlerini ve uygulanabilir `AGENTS.md` talimatlarini oku.
2. Tech stack'i gercek dosyalardan dogrula.
3. `~/.agents/skills/*/SKILL.md` envanterini oku ve yalniz kurulu skill'leri `$skill-name` ile kullan.
4. Codex-native memory etkinse resmi memory yuzeyini kullan; SQLite dosyasina dogrudan yazma.
5. Kurulu roster gerekiyorsa `~/.codex/agents/*.toml` envanterini kontrol et. Roster bos veya uygun rol yoksa parent context'te calis.

## Olay → eylem

| Olay | Eylem |
|---|---|
| Kod yazildi | Ilgili dosyalari oku, focused review ve test yap |
| Secret goruldu | Dur, degeri ifsa etme, guvenli remediation oner |
| Build/type/test fail | Hatayi oku, root cause'u dogrula, minimal fix + yeniden kosum |
| Buyuk is | `$rule-pre-implementation-contract` kademesini uygula; gerekli onayi almadan baslama |
| Commit istendi | Degisiklikleri dogrula ve her git mutation icin ayri onay al |
| Belirsiz urun karari | En fazla bir net soru icin `request_user_input` kullan |

## Stack mapping

Skill adini uydurma. Manifest ve importlardan dili/framework'u tespit et; kurulu envanterde buna uyan skill varsa yukle. Eslesme yoksa proje konvansiyonlarini dogrudan oku.

## Hook kosulu

`~/.codex/hooks.json` varsa ve ilgili handler trusted ise hook sonucu dikkate alinir. Dogrulanmis handler yoksa review, learning, context injection veya enforcement otomatik sayilmaz; manuel sozlesme gecerlidir.
