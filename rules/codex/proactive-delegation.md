# Proactive Delegation — Codex

Delegasyon otomatik bir zorunluluk degildir. Yalniz kullanici veya uygulanabilir `AGENTS.md`/skill talimati subagent istiyorsa ve is gercekten bolunebiliyorsa kullan.

## Karar

| Durum | Eylem |
|---|---|
| Tek kisa soru veya 1-2 dosya | Parent context |
| Bagimli implementasyon | Sirali parent/tek agent |
| Bagimsiz read-heavy kesif | Kurulu roster'dan uygun rollerle paralel olabilir |
| Paralel write-heavy is | Cakisma riski nedeniyle varsayilan sirali |
| Roster bos/uygun rol yok | Parent context |

## Prosedur

1. `~/.codex/agents/*.toml` envanterini oku.
2. Yalniz kurulu rol kullan; isim tahmin etme.
3. `spawn_agent` mesajinda scope, sahip olunan dosyalar, beklenen kanit ve cikis formatini yaz.
4. Sonuc gerekiyorsa `wait_agent`; duzeltme icin ayni agente follow-up ver.
5. Mirror agent'in leaf sozlesmesini koru: spawn yapmaz, ek delegasyonu parent'a onerir.

Main context kullanici niyeti, kararlar, cakisma yonetimi ve final sentezden sorumludur.
