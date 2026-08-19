# Agent Error Reporting — Codex Manual Contract

Hook payload semasi bu ortamda dogrulanmadikca otomatik hata enforcement'i aktif sayilmaz. `~/.codex/hooks.json` yoksa veya ilgili handler trusted degilse asagidaki sozlesme manueldir.

## Leaf-agent cikisi

Bir agent tool/komut hatasi aldiysa final mesajinda sunlari verir:

```markdown
## HATA RAPORU
1. <komut/tool> → <hata> | Ne yaptim: fixed/workaround/skipped | Etki: <var/yok>
TASK STATUS: COMPLETE | PARTIAL — <eksik kalan>
```

- `PARTIAL` tamamlanmis sayilmaz.
- Test/build basarisi ancak agent transcript'inde gercek basarili kosum varsa kesin ifade edilir.
- Blind retry yapilmaz; her denemede hata bilgisi kullanilir ve yaklasim gerekirse degistirilir.
- Sandbox veya permission hatasi parent'ta otomatik tekrar kosulmaz; parent mevcut izin politikasina uyar.

## Parent dogrulamasi

1. Agent'in ozetini kanit degil hipotez say.
2. Kritik dosyalari oku ve gerekli build/test komutlarini ana calisma agacinda yeniden kos.
3. Kurulu handler gercekten trusted ve event ile eslesiyorsa otomatik enforcement sonucunu ek kanit say; aksi halde manuel sozlesmeyi uygula.
4. Codex payload'i `agent_id`, `agent_type` veya `agent_transcript_path` saglarsa attribution icin dogrudan bu alanlari kullan. Alan yoksa tahmin etme.

Codex 0.147.0 testinde custom roster agent'lari icin SubagentStart/Stop event'leri ateslenmedi. Bu kalici varsayim degildir: handler event alirsa payload attribution'ini kullan; almazsa Stop payload'indaki `transcript_path` ve session rollout kayitlarindaki `parent_thread_id` / `agent_role` alanlariyla kontrollu fallback yap. Bu fallback'i gercek handler kurulmadan aktif sayma.
