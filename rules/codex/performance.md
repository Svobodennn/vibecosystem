# Performance & Agent Limits — Codex

## Model

Custom roster agent'i spawn ederken model tahmin etme ve Claude model metadata'sini tasima. Acik bir kullanici/config tercihi yoksa model ve reasoning effort'u omit et; parent/default zinciri belirlesin.

## Agent sinirlari

- `[agents].max_concurrent_threads_per_session = 4`
- `[agents].max_depth = 1`
- Mirror agent'lar leaf'tir; nested spawn yapmaz.
- Bagimsiz olmayan isleri paralellestirme.
- Sonuc gerekmeden poll etme; gerekliyse `wait_agent` kullan.

## Context

Ana context'te karar ve sentezi tut; buyuk, bagimsiz ve kullanici/talimat tarafindan delegasyonu istenmis okuma islerini sinirli agent'lara ver. Roster bos veya uygun rol yoksa parent context'te calis.

Build hatasinda hata mesajini oku, root cause'u dogrula, minimal duzeltme yap ve focused gate'i yeniden kos.
