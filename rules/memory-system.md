# Memory System

> NOT (2026-06-05): Eski `scripts/core/recall_learnings.py` ve `store_learning.py`
> script'leri sistemde MEVCUT DEGIL (`~/.claude/scripts/` sadece `mcp/` iceriyor).
> Birincil memory artik dosya-bazli persistent memory'dir.

## Birincil: Dosya-Bazli Memory

Konum: `~/.claude/projects/<project-slug>/memory/`

### Store (Ogrenim Kaydet)
1. Tek olgu = tek dosya, frontmatter ile (`name`, `description`, `metadata.type`)
2. `MEMORY.md` index'ine tek satirlik pointer ekle
3. Tipler: `user` | `feedback` | `project` | `reference`
4. Kaydetmeden once mevcut dosyalari kontrol et — duplicate yerine guncelle

### Recall (Gecmis Ogrenimleri Cek)
- `MEMORY.md` her session'da otomatik yuklenir
- Detay icin ilgili memory dosyasini Read et
- Ek arama: `grep -ril "<terim>" ~/.claude/projects/<project-slug>/memory/`

## Ne Zaman Kaydet
- Zor sorun cozunce
- Mimari karar alinca
- Codebase pattern kesfedince
- Calismayan bir sey bulunca

## Agent'lar ve Memory

- Agent'lar ise baslamadan once memory'ye baksin
- MEMORY MATCH bulunursa kullaniciya kisa bahset
- Cok alakaliysa detay goster, az alakaliysa atla
- Her memory match'i soyleme, gereksiz gurultu yapma

## Legacy Backend (devre disi)

Eski PostgreSQL/SQLite tabanli sistem; script'leri kayip oldugu icin kullanilamaz.
Geri getirilirse: Docker `~/.claude/docker/opc/docker-compose.yml`,
Env `~/.claude/.env` (CONTINUOUS_CLAUDE_DB_URL, EMBEDDING_PROVIDER).
Script cagrisi fail ederse fallback: dosya-bazli memory (yukarisi) veya CLAUDE.md.
