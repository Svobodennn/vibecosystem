# Canavar: Agent Cross-Training

- Hata yapan agent'in hatasi TUM ekibe yayilir (error-ledger.jsonl)
- Session basinda takim hatalari context'e enjekte edilir
- Her producer agent spawn sonrasi otomatik review hatirlatmasi yapilir
- Agent performansi skill-matrix.json'da takip edilir

## CLI Komutlari

```bash
node ~/.claude/hooks/dist/canavar-cli.mjs report       # Genel durum
node ~/.claude/hooks/dist/canavar-cli.mjs agent <isim>  # Agent detay
node ~/.claude/hooks/dist/canavar-cli.mjs errors        # Son 7 gun hatalari
node ~/.claude/hooks/dist/canavar-cli.mjs weak          # En zayif agent'lar
node ~/.claude/hooks/dist/canavar-cli.mjs leaderboard   # Basari siralaması
node ~/.claude/hooks/dist/canavar-cli.mjs cmdfail [gun] # Agent'lar hangi komutlarda fail yiyor
```

Subagent hata yakalama + HATA RAPORU zorlamasi: `agent-error-reporting.md`

## Veri Dosyalari

| Dosya | Icerik |
|-------|--------|
| `~/.claude/canavar/error-ledger.jsonl` | Tum hatalar (agent, tip, ders) |
| `~/.claude/canavar/skill-matrix.json` | Agent profilleri ve basari oranlari |
