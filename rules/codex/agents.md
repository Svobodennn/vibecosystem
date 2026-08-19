# Agent Orchestration — Codex

## Kaynak

Kurulu roller `~/.codex/agents/*.toml` altindadir. Her gorevden once envanteri oku; var olmayan veya eski isimli bir agent'i cagirma. Roster bos ya da uygun rol yoksa parent context'te calis.

## Kullanma

- `spawn_agent`: kurulu bir role sinirli gorev ver.
- `wait_agent`: sonuc gercekten gerekliyse bekle.
- Mevcut agente follow-up: ayni isin duzeltmesini isterken yeni agent acma.
- Bagimsiz calisma ancak kullanici veya uygulanabilir talimat bunu istiyorsa paralellestirilir.

## Leaf sozlesmesi

Mirror roster rolleri leaf-agent'tir. Baska agent spawn etmez, arka plan filosu kurmaz ve worktree olusturmaz. Ek uzmanlik gerekiyorsa parent'a rol ve gerekce onerir. Parent roster'i yeniden kontrol edip karari verir.

## Dev-QA dongusu

1. Uygun implementer veya parent uygular.
2. Degisiklik gercek dosyalardan okunur.
3. Uygun review/test rolu roster'da varsa ayrica cagrilir; yoksa parent dogrular.
4. PASS kanitla kapanir. FAIL feedback ile en fazla uc deneme; sonra reassign/decompose/revise/defer karari.

Somut assignment proseduru icin `$rule-agent-assignment-matrix`, kalite dongusu icin `$rule-qa-loop` skill'ini yukle.
