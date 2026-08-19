# vibecosystem — Codex Profili

Bu profil sabit envanter sayisi iddia etmez; kurulum kullanici dosyalari ve secilen fazlara gore degisir.

## Runtime envanteri

| Katman | Nasil dogrulanir |
|---|---|
| Skills | `find ~/.agents/skills -mindepth 1 -maxdepth 1 -type d` ile kurulu dizinleri say |
| Agents | `~/.codex/agents/*.toml` dosyalarini oku; yalniz bulunan rolleri kullan |
| Rules | Global `~/.codex/AGENTS.md` ve `~/.agents/skills/rule-*/SKILL.md` dosyalarini kontrol et |
| Hooks | `~/.codex/hooks.json` varsa ve handler'lari trusted ise aktif; yoksa yok |

## Kullanma

Skill'leri `$skill-name` ile yukle. Agent gerekiyorsa roster'i okuyup `spawn_agent` kullan. Hook enforcement'i payload semasi ve trust dogrulanmadan aktif sayma.

Canonical repo Claude ve Codex icin ortak kaynaktir; Codex'e ozel rule/agent farklari overlay ve deterministic transform ile uretilir.
