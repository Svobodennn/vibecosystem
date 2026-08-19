# Agent Assignment Matrix — Codex

Somut rol isimleri kurulum envanterinden gelir; bu kural sabit bir roster varsaymaz.

## Runtime roster kapisi

1. `~/.codex/agents/*.toml` dosyalarini oku.
2. Yalniz `name` ve `description` alani gercekten bulunan rolleri aday say.
3. Role ait talimat dosyasi yoksa o rolu uydurma; parent context'te calis.
4. Bir rol goreve uygun degilse yakin isim tahmin etme. Mevcut roller arasindan sec veya parent'a geri don.

## Gorev eslestirme

| Gorev sinifi | Aranacak uzmanlik | Ikinci bakis |
|---|---|---|
| Codebase kesfi | salt-okunur kesif, control-flow izleme | parent kanit kontrolu |
| Implementasyon | dil/framework ve degisiklik kapsaminda uzmanlik | kod review + test |
| Guvenlik | auth, secret, input, dependency veya infra guvenligi | manuel security checklist |
| Veri | schema, query, migration veya veri modeli | rollback ve veri butunlugu |
| Test | unit/integration/E2E veya test stratejisi | kabul kriteri dogrulamasi |
| Infra | CI/CD, container, cloud veya observability | rollback/smoke test |
| Dokumantasyon | API, README, runbook veya release anlatimi | teknik dogruluk review'u |
| Planlama | dosya-bazli plan, risk ve dependency analizi | plan review |

## Spawn sozlesmesi

- Parent, uygun rol varsa `spawn_agent` ile sinirli ve somut bir gorev verir.
- Bagimsiz gorevler ancak kullanici veya uygulanabilir proje/skill talimati delegasyon istiyorsa paralel calistirilir.
- Sonuc gerekiyorsa `wait_agent`; ek yonlendirme gerekiyorsa mevcut agente follow-up kullanilir.
- Mirror agent'lar leaf'tir: baska agent spawn etmez; ek delegasyon gereksinimini parent'a onerir.
- `max_depth = 1` nedeniyle nested delegation tasarlama.

## Escalation

Ayni yaklasim iki kez basarisizsa varsayimi yeniden kontrol et. Ucuncu basarisizlikta rolu degistir, isi parcala, yaklasimi revize et veya kullanici karari iste. Mevcut olmayan bir role yonlendirme yapma.
