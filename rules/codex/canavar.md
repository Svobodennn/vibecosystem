# Canavar — Codex Durumu

Canavar otomasyonunu kurulu varsayma. `~/.codex/hooks.json` yoksa, ilgili handler kayitli degilse veya trust pending ise hata ledger'i, cross-training, dashboard yayini ve Stop enforcement'i yoktur.

## Manuel sozlesme

- Agent hatalari `$rule-agent-error-reporting` formatinda raporlanir.
- Parent kritik iddialari ana calisma agacinda dogrular.
- Tekrarlanan hata bir proje ogrenimiyse onayli proje notuna veya Codex-native memory yuzeyine kaydedilir; `~/.codex/memories_1.sqlite` dosyasina dogrudan yazilmaz.
- Bir handler aktif denmeden once `~/.codex/hooks.json` kaydi ve trusted durumu kontrol edilir.

Bu kurulum profilinde handler sayisi veya canavar veri yolu hakkinda sabit iddia yazma; runtime envanterini oku.
