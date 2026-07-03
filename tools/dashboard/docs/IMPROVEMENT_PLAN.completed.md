# Dashboard Improvement Plan — vibecosystem Agent Monitor v2.0

> Audit date: 2026-05-15. Plan version: **v2.0** (plan-reviewer feedback applied).
> Scope: feature gap + tech debt only. No rewrites.
> Behavior preservation: mevcut UI ve API contract'larını koru, sadece ekle/düzelt.
> Rollback policy: her C/H item'ında **ROLLBACK** satırı var — geri alma adımı net.

---

## 1. Özet

| Metric | Count |
|---|---|
| Tespit edilen iyileştirme | **18** |
| 🔴 Critical (data loss / yanlış bilgi) | **4** |
| 🟡 High-value (eksik özellik) | **9** |
| 🟢 Polish (UX/perf) | **5** |
| Etkilenen dosyalar | `server.js`, `index.html`, yeni `*.mjs` hook'lar |

**Kritik gözlem:** Dashboard "in-memory only" çalışıyor — restart edince tüm geçmiş kayboluyor. `~/.claude/agent-events.jsonl` referansı server.js:14'te var ama hiçbir hook bu dosyaya yazmıyor. `/api/tokens` ve `/api/costs` endpoint'leri mevcut ama UI'da hiç gösterilmiyor. Token-usage.jsonl dosyası dahi yok.

**Mevcut iyi tarafları:**
- WS broadcast mimarisi temiz: POST handling `server.js:193-227`, broadcast loop `server.js:213-216`, WS lifecycle `server.js:233-249`
- Tek dosya UI (`index.html` 648 satır) — bağımlılık sıfır
- Timeline + feed + breakdown ayrımı net
- CORS + security header'lar mevcut (`server.js:258-262`, 127.0.0.1 origin-restrict doğrulandı)
- escapeHtml() feed render'da kullanılıyor (`index.html:407,454-458` doğrulandı)
- Hook fix'imiz (substring → structured error detection) zaten devrede
- `server.js` = 350 satır (önceki taslakta yanlış yazılmıştı)

---

## 2. Phase Grouping

```
Phase 1 (P1) — Data integrity   : C1, C2, C3, C4   (paralel-safe, server tarafı)
Phase 2 (P2) — Existing data UI : H1, H2, H3       (UI sadece, server'a dokunmaz)
Phase 3 (P3) — Yeni özellikler  : H4, H5, H6, H7, H8, H9
Phase 4 (P4) — Polish & perf    : P1, P2, P3, P4, P5
```

P1 önce gelmeli (data persistence), sonra P2 (mevcut datayı göster), sonra P3 (yeni özellikler), sonra P4.

---

## 3. Kategori C — Critical (Data Integrity)

### C1 🔴 Persistence eksik — restart'ta tüm event'ler kaybolur [P1, parallel-safe]
**DOSYA:** `~/.claude/tools/dashboard/server.js:20-21` (eventStore decl), `36-83` (addEvent)
**SORUN:** `eventStore` sadece in-memory (`const eventStore = []`). Process restart edince 1000 event'in hepsi gider. Geriye dönük debug imkânsız.
**ÇÖZÜM:**
  1. `addEvent()` içinde `fs.appendFileSync(EVENTS_LOG, JSON.stringify(event) + '\n')` ekle (EVENTS_LOG referansı `server.js:14`'te zaten var).
  2. Startup'ta `loadRecentAgentEvents(1000)`'i çağırıp eventStore'u hydrate et.
  3. **MIGRATION**: `loadRecentAgentEvents()` zaten dosya yoksa boş array döner (`server.js:111`) — fresh install güvenli, ek migration yok.
**TAŞINACAK YER:** Aynı dosya, `addEvent()` içinde + startup'ta hydration.
**ETKİLENEN DOSYALAR:** Sadece `server.js`.
**RISK:** Düşük. Append-only write, mevcut WS broadcast'i etkilemez. Disk I/O her event'te (~kb), sustainable.
**ACCEPTANCE:**
  - Server'ı restart et → `~/.claude/agent-events.jsonl` dolu → UI eski event'leri gösteriyor.
  - Fresh install (jsonl yok) → server crash etmiyor, hydration boş array dönüyor.
**ROLLBACK:** `addEvent()`'ten `fs.appendFileSync` satırını sil; startup'taki hydration call'unu sil. Mevcut `agent-events.jsonl` zararsız orphan olarak kalır (silinmesi opsiyonel).
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Mevcut API contract'ları aynı kalır. UI hiç değişmez (sadece daha fazla history görür).

---

### C2 🔴 Session karışıklığı — 2-3 paralel Claude session aynı feed'de [P1, parallel-safe]
**DOSYA:** `index.html:445-470` (addFeedItem), `index.html:524-541` (updateAgentFilter — pattern reference), `server.js:283-287` (/api/events)
**SORUN:** Kullanıcı şu an 3 paralel session çalıştırıyor (`55e333ab`, `d0adc503`, `727b5e70`). Hepsi aynı dashboard'a event basıyor. Ayırt etme imkânı sıfır.
**ÇÖZÜM:**
  1. `event.sessionId` zaten gelmekte (`server.js:143`, dashboard-ws-emitter.ts:143). UI'da session filter dropdown ekle (mevcut agent filter'ın yanına, aynı pattern).
  2. Feed item'lara session ID badge (kısa, 8 char — Claude session ID standart truncation).
  3. Stats panel session-aware: "Active sessions: 3" yeni metric.
**TAŞINACAK YER:** `index.html` (UI ekleme), `server.js` (stats hesaplamasında session count).
**ETKİLENEN DOSYALAR:** 2 dosya.
**RISK:** Düşük. Mevcut data zaten geliyor, sadece görselleştirme.
**ACCEPTANCE:**
  - İki ayrı Claude session başlat → dropdown'da ikisi de gözüksün → filter çalışsın.
  - Filter "all" seçili → mevcut davranış aynen.
**ROLLBACK:** Dropdown HTML'i sil + filter logic'i kaldır + stats'tan session count'u çıkar. Backend tarafında değişiklik yok (read-only).
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Filter "all" default kalır → mevcut davranış değişmez. SessionId hep event'te vardı, sadece görselleştiriliyor.
**VARSAYIM:** 8 char session ID prefix benzersiz (Claude session ID UUID v4 — 8 char ~1B kombinasyon, paralel session sayısı <10 olduğu sürece çakışma 0).

---

### C3 🟠 Token usage hiç gözükmüyor — endpoint var, UI yok [P1, **NOT parallel-safe with C4**]
**DOSYA:** `server.js:124-172` (loadTokenUsage, estimateCosts), `index.html` (UI eksik), yeni `~/.claude/hooks/src/token-logger.ts`, `~/.claude/settings.json`
**SORUN:** Server `/api/tokens` ve `/api/costs` endpoint'lerini expose ediyor (`server.js:301-310`). UI hiç fetch etmiyor. Ayrıca `~/.claude/token-usage.jsonl` dosyası **mevcut değil** — yazan hook eksik.
**ÇÖZÜM:**
  1. Token logger hook yaz (`~/.claude/hooks/src/token-logger.ts`) — PostToolUse'da agent/tool token tahmini hesaplayıp `~/.claude/token-usage.jsonl`'a yazsın.
  2. UI'da yeni "Token Burn" paneli: total + by-agent breakdown + USD cost estimate.
  3. Stats bar'a "TOKENS: 1.2M" metric ekle.
**TAŞINACAK YER:** Yeni hook + `index.html` UI + `settings.json` hook registration.
**ETKİLENEN DOSYALAR:** 3 dosya.
**SEQUENCING:** C3 ve C4 **ikisi de** `settings.json`'a hook registration ekler. Aynı anda yazıldıklarında merge conflict riski. **Sequencing:** C3 → C4 (tek dosya değiştiğinde diğeri bekler) veya C3+C4 birlikte tek commit'te yapılır.
**RISK:** Orta. Hook her tool call'da çalışacak — performans önemli. Estimate basit (char/4) kalmalı, tokenizer çağırma. settings.json çakışma riski yukarıda not edildi.
**ACCEPTANCE:**
  - Yeni Claude task çalıştır → `token-usage.jsonl` dolu → UI'da token sayacı artıyor.
  - Hook 50ms altında çalışıyor (hook-perf.jsonl ile doğrula).
  - settings.json valid JSON kalıyor.
**ROLLBACK:**
  1. `settings.json`'dan token-logger.mjs hook entry'sini sil.
  2. `~/.claude/hooks/dist/token-logger.mjs` ve `src/token-logger.ts` sil.
  3. `index.html`'den Token Burn paneli HTML/JS bloğunu sil.
  4. `token-usage.jsonl` orphan kalır (zararsız, manuel sil).
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Mevcut endpoint'ler aynı response döner (`/api/tokens` ve `/api/costs` schema değişmez).

---

### C4 🔴 Sub-agent hiyerarşisi yok — maestro→kraken→arbiter düz liste [P1, **NOT parallel-safe with C3**]
**DOSYA:** `~/.claude/hooks/src/dashboard-ws-emitter.ts:140-148` (event payload), `server.js:36-83` (addEvent), `index.html:350-430` (timeline)
**SORUN:** Maestro kraken'ı, kraken arbiter'ı spawn edince timeline 3 ayrı satır gösteriyor. Parent→child ilişkisi yok. Senin kraken Faz 4 raporunda 100 component üretti — eğer her component için sub-agent spawn olsaydı 100 satır görürdün, hangi maestro phase'ine ait olduğu kayıp.
**ÇÖZÜM:** Event'e `parentAgentId` alanı ekle. Process env `CLAUDE_PARENT_AGENT_ID` ile geçir (zaten `CLAUDE_AGENT_ID` var). UI'da timeline'da indent + tree expand.
**TAŞINACAK YER:** Hook (`dashboard-ws-emitter.ts`) + UI (`index.html`).
**ETKİLENEN DOSYALAR:** 2 dosya.
**SEQUENCING:** Bkz C3 — `settings.json` çakışmasını önlemek için C3 ile sıralı yap.
**RISK:** **Yüksek**, sebepleri:
  - Env var propagation Claude Code internal — her sub-agent spawn'ında otomatik ayarlanmıyor olabilir, manuel test şart.
  - parentId yanlış set edilirse tree silently flat görünür (sessiz hata).
  - Mevcut event'lerde alan yok → UI fallback şart.
**RISK MITIGATION:**
  - Pre-implementation spike: `console.error` ekle ve gerçek session'da test et — `CLAUDE_PARENT_AGENT_ID` env'de gelecek mi?
  - UI'da null/undefined parentId için **flat-fallback** zorunlu (hata değil, geriye uyum).
  - parentId set edildiğinde "✓ tree-aware" gibi opt-in indicator.
**ACCEPTANCE:**
  - Maestro spawn et → kraken alt-agent olarak gözüksün (indent + parent link).
  - **Null parentId fallback**: eski event'ler (parentId yok) flat olarak gözüksün, hata vermesin.
  - Env var gelmiyorsa graceful: console warning + flat mode'a düş, dashboard çalışmaya devam etsin.
**ROLLBACK:**
  1. Hook'tan `parentAgentId` alanını sil, rebuild et.
  2. `index.html` timeline'dan indent/tree logic'ini sil — flat render'a dön.
  3. Mevcut jsonl'daki parentId alanları zararsız extra field olarak kalır.
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Eski event'lerde parentId null kalır, UI flat-fallback gösterir. Hook fail edip event yayınlamasa bile fire-and-forget pattern korunur.

---

## 4. Kategori H — High-Value (Existing data + new features)

### H1 🟡 Skill matrix UI'da yok — server yüklüyor ama göstermiyor [P2]
**DOSYA:** `server.js:100-107` (loadSkillMatrix), `server.js:289-293` (/api/matrix), `index.html` eksik
**SORUN:** `loadSkillMatrix()` çağrılıyor, `/api/matrix` endpoint var. UI hiç fetch etmiyor. Canavar'ın `skill-matrix.json`'unda agent success rate'leri var.
**ÇÖZÜM:** "Agent Health" panel ekle (Agent Breakdown'un altına). Her agent için success rate %, total runs, last failure. Renk kodu: >90% yeşil, 70-90% sarı, <70% kırmızı.
**RISK:** Düşük.
**ACCEPTANCE:** Skill matrix data'sı varsa UI'da rendering yapılsın. `skill-matrix.json` yoksa panel boş "No data yet" göstersin.
**ROLLBACK:** Agent Health panel HTML/JS bloğunu sil. Backend tarafı zaten read-only.

---

### H2 🟡 Error context yok — "ERROR refactor-cleaner" diyor, sebep yok [P2]
**DOSYA:** `~/.claude/hooks/src/dashboard-ws-emitter.ts` (response payload) + `index.html:494-500` (formatEventDetail), `index.html:454-458` (escape pattern reference)
**SORUN:** Hata event'inde `metadata.responseLength` var ama responseStr içeriği yok. Tıklayınca açılan detail yok. Hata sebebi görülemiyor.
**ÇÖZÜM:**
  1. Error event'inde response'un ilk 500 char'ını metadata.errorContext'e ekle (sadece `is_error===true` veya structured error case'inde, normal output'ta DEĞİL — token tasarrufu).
  2. UI'da feed item'a tıklanınca expand → tam metadata.
**XSS GUARD (kritik):** Agent çıktısı `<script>` veya HTML içerebilir (agent kod yazıyor). **Zorunlu**: expand render'ında `textContent` kullan (innerHTML değil). Mevcut `escapeHtml()` pattern'ini referans al (`index.html:407,454-458`). Test: response'a `<img src=x onerror=alert(1)>` koyup render et → execute olmamalı.
**RISK:** Düşük (truncate + escape ile büyüme/XSS yok).
**ACCEPTANCE:**
  - Hatalı agent çıktısı dashboard'da görülebilsin (ilk 500 char).
  - XSS payload (`<img src=x onerror=alert(1)>`) execute olmasın — sadece text olarak görünsün.
**ROLLBACK:** Hook'tan `metadata.errorContext` setini sil + UI'da expand JS bloğunu sil. Eski event'lerde extra field kalır (zararsız).
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Normal complete event'lerde değişiklik yok. Sadece error case'inde extra alan.

---

### H3 🟡 Hook performance metrics gözükmüyor [P2]
**DOSYA:** `~/.claude/cache/hook-perf.jsonl` (mevcut), yeni endpoint `server.js`, UI panel `index.html`
**SORUN:** Hook performansı (`startTimer`/`endTimer`) cache dosyasına yazılıyor. UI'da hiç gösterilmiyor. Hangi hook yavaş?
**ÇÖZÜM:**
  1. `/api/hook-perf` endpoint ekle (`server.js`) — son 100 entry'yi parse edip p50/p95 hesapla.
  2. "Hook Performance" panel — top 10 yavaş hook, latency dağılımı.
**RISK:** Düşük.
**ACCEPTANCE:** Hook çalıştır → latency dashboard'da gözüksün. Cache dosyası yoksa "No data" göster.
**ROLLBACK:** Endpoint + UI panel'i sil. hook-perf.jsonl dosyası diğer hook'lar tarafından yazılmaya devam eder (zararsız).

---

### H4 🟡 Reconnection logic yok — WS düşünce manuel refresh şart [P3]
**DOSYA:** `index.html:271-330` (connect function)
**SORUN:** WS koparsa kullanıcı F5 yapmak zorunda. Agent çalışırken event kaçırır.
**ÇÖZÜM:** Exponential backoff reconnect (1s → 2s → 4s → max 30s). `connect()` recursive call ekle, `ws.onclose` içinde retry trigger et.
**RISK:** Düşük. Tek dikkat: storm avoidance — başarısız bağlantıda hemen retry yapma, backoff şart.
**ACCEPTANCE:**
  - Server restart et → UI 30 sn içinde reconnect olsun.
  - Server kapalıyken sayfa açılırsa 30 sn'ye kadar deniyor sonra "disconnected" göstersin.
**ROLLBACK:** `connect()` içindeki retry logic'i sil. Manuel F5 davranışına geri dön.

---

### H5 🟡 Stuck agent detection yok [P3]
**DOSYA:** `index.html:350-377` (timeline) + yeni alert logic
**SORUN:** Bir agent 5+ dakika "running" kalırsa kimse fark etmez. Diğer session'da 5m 28s kraken çalıştı — bu OK ama 15 dk takılan agent nasıl tespit edilecek?
**PERFORMANCE BASELINE GEREK:** Mevcut ortalama agent süresi ölçülmeli. Faz 4 kraken = 5m 28s. Agresif threshold (10 dk) false positive üretebilir. **Önerilen baseline ölçümü**: H5 implement etmeden önce mevcut `agentDurations` array'inden p50/p95 hesapla, threshold'u p95 + 2× olarak ayarla.
**ÇÖZÜM:** Threshold: **p95 × 2** sarı uyarı, **p95 × 4** kırmızı + opsiyonel push notification (browser API, kullanıcı izniyle).
**RISK:** Orta — baseline yanlış set edilirse spam üretir.
**ACCEPTANCE:**
  - Uzun süre running kalan agent'a uyarı çıksın.
  - p95'in altındaki agent'larda uyarı **yok**.
**ROLLBACK:** Alert logic'i sil — timeline davranışı eski haline döner.

---

### H6 🟡 Replay/export yok — session debug için yetersiz [P3]
**DOSYA:** Yeni endpoint `server.js` + UI button `index.html`
**SORUN:** Bug raporlamak için event'leri paylaşmak istesen mümkün değil. Geçmiş session'ı replay edemiyorsun.
**ÇÖZÜM:**
  1. `/api/export?session=<id>` — session event'lerini JSON döndür
  2. UI'da "Export" butonu (header'a)
  3. Bonus: "Replay" — export'u upload edip animasyonla göster
**SECURITY NOTE:** Endpoint sadece **127.0.0.1 bind**'da güvenli (mevcut `wsHttpServer.listen(WS_PORT, '127.0.0.1', ...)` ve `httpServer.listen(HTTP_PORT, '127.0.0.1', ...)` — `server.js:251,331` doğrulandı). Export agent prompt'larını, çıktı snippet'lerini ve session ID'leri içerir. **Eğer ileride public bind'a geçilirse auth eklemek ZORUNLU** — plan'ın gelecek revizyonunda not düş.
**ÖNERİLEN AGENT:** **spark** (20 satırlık izole HTTP handler — backend-dev overkill).
**RISK:** Düşük (export, localhost-only). Replay opsiyonel.
**ACCEPTANCE:**
  - Session ID ile export → download çalışsın.
  - Yanlış session ID → 404 dönsün (info leak değil).
**ROLLBACK:** Endpoint handler'ı `server.js`'den sil + Export butonunu `index.html`'den kaldır. 2 dakikalık iş.
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Mevcut endpoint'ler etkilenmez. Server bind aynı kalır (127.0.0.1).

---

### H7 🟡 Trend grafikleri yok — sadece anlık metrikler [P3]
**DOSYA:** `index.html` stats bar
**SORUN:** Error rate %50 görürsün ama trendi göremezsin (artıyor mu, düşüyor mu?). Token burn rate trend yok.
**ÇÖZÜM:** **Inline SVG sparkline** (zero-dep, vanilla) — son 60 dk'da error rate, token burn, agent spawn rate. **Chart.js veya başka kütüphane KULLANILMAYACAK** (Section 8 zero-dep kuralı).
**IMPLEMENTATION HINT:** Basit polyline path — `<svg viewBox="0 0 100 30"><polyline points="0,15 10,8 20,12 ..." stroke="#22c55e" fill="none"/></svg>`. 60 data point yeter, normalize edip path string olarak render et.
**RISK:** Düşük (önceden "Orta" yazılıydı — kütüphane bağımlılığı yok artık, complexity SVG inline'da minimal).
**ACCEPTANCE:**
  - Son 60 dk'lık 3 sparkline gözüksün.
  - `package.json`'a yeni dependency eklenmesin (`cat package.json | jq '.dependencies'` öncekiyle aynı).
**ROLLBACK:** 3 sparkline div'ini `index.html`'den sil. CSS/JS'de başka değişiklik yok.
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Mevcut stats bar metrikleri aynen kalır, sparkline'lar yanlarına eklenir.

---

### H8 🟡 Search/filter eksik — 200+ event'te işe yaramaz [P3]
**DOSYA:** `index.html:432-470` (feed addFeedItem + setFeedTab)
**SORUN:** Feed'de "refactor-cleaner" arıyorsan scroll etmen lazım. 200 item'da çalışmaz.
**ÇÖZÜM:** Header'a search input → agent name + prompt summary'de substring match (fuzzy gerekmiyor — yavaş, overkill).
**RISK:** Düşük.
**ACCEPTANCE:** Search "krak" → kraken event'leri filter olsun. Boş input → tüm event'ler.
**ROLLBACK:** Search input ve filter logic'i sil.

---

### H9-SPIKE 🔍 taskId mevcut mu — ön araştırma [P3, **H9'dan önce zorunlu**]
**DOSYA:** `~/.claude/hooks/src/dashboard-ws-emitter.ts`, `~/.claude/hooks/dist/dashboard-ws-emitter.mjs`
**AMAÇ:** H9 retry tracking için `taskId` (veya benzer correlation ID) hook input'ta mevcut mu doğrula.
**ADIM:**
  1. `dashboard-ws-emitter.ts`'de `console.error(JSON.stringify(input))` ekle (stderr, Claude görmez).
  2. Rebuild + bir Agent task spawn et.
  3. stderr çıktısında `tool_input.id`, `task_id`, `correlation_id` veya benzer alan var mı kontrol et.
  4. Mevcut değilse: hook'a kendi correlation ID üreten logic ekle (`agentType + sessionId + spawn-timestamp` hash'i).
  5. Bulguyu doğrudan H9 implementation öncesi belgele.
**SÜRESİ:** 15-30 dakika.
**ACCEPTANCE:** Spike sonunda H9 için "✓ taskId var" veya "✗ correlation ID üretmek lazım, plan: ..." raporu var.

---

### H9 🟡 Retry/escalation görünmüyor [P3, **depends-on: H9-SPIKE**]
**DOSYA:** Hook'ta correlation ID + `server.js` event store'da retry detection + `index.html` timeline badge
**SORUN:** qa-loop.md'de "max 3 retry, sonra escalate" yazıyor. Dashboard'da retry counter yok. Aynı agent 3x spawn olduğunda escalation yaklaştığını göremezsin.
**ÇÖZÜM:**
  1. Spike sonucuna göre `taskId` veya synthetic correlation ID kullan.
  2. addEvent içinde aynı taskId ile spawn'ları say.
  3. UI timeline'da retry badge ("RETRY 2/3" formatında).
**RISK:** Orta. **H9-SPIKE BİTMEDEN BAŞLAMA** — yoksa yanlış varsayımla ilerlenir.
**ACCEPTANCE:**
  - Aynı task'ı 3 kez başlat → "RETRY 3/3" badge gözüksün.
  - Farklı task'lar ayrı sayılsın (correlation correct).
**ROLLBACK:** Hook'tan correlation logic'i sil + UI'dan retry badge'i kaldır + server'daki retry counter logic'i sil.
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Yeni correlation field opsiyonel — event şeması backward compat.

---

## 5. Kategori P — Polish

### P1 🟢 Timeline sıralama belirsiz — kronolojik olsun [P4]
**DOSYA:** `index.html:404` (`types.forEach`)
**SORUN:** `Object.keys()` V8'de string key'lerde insertion order korur ama bu deterministik UI için yetersiz. İlk başlayan agent en üstte olmalı.
**ÇÖZÜM:** `types.sort((a,b) => firstStart(a) - firstStart(b))` — ilk spawn timestamp'ine göre sırala.
**VERIFICATION STEP:** Implement öncesi mevcut davranışı `console.log(Object.keys(agentTimelines))` ile yakala. Implementation sonrası kronolojik mi karşılaştır.
**RISK:** Düşük.
**ACCEPTANCE:** Maestro önce başlayan en üstte gözüksün. Verification log'u console'da kanıt göstersin.
**ROLLBACK:** Sort call'u sil — `Object.keys()` davranışına geri dön.

---

### P2 🟢 Long-running agent renderTimeline pahalı [P4]
**DOSYA:** `index.html:379-430`
**SORUN:** Her event geldiğinde tüm timeline yeniden çiziliyor (O(n*m)). 200 event sonrası yavaşlama hissedilir.
**ÇÖZÜM:** `requestAnimationFrame` throttle + sadece etkilenen agent row'unu re-render et.
**RISK:** Orta.
**ACCEPTANCE:** 500 event sonrası UI lag olmasın (frame >16ms hiç olmamalı).
**ROLLBACK:** rAF throttle wrapper'ı sil, eski `renderTimeline()` direct call'a dön.

---

### P3 🟢 Mobile responsive değil [P4]
**DOSYA:** `index.html` Tailwind classes
**SORUN:** Sabit grid layout, telefonda kullanılamaz.
**ÇÖZÜM:** Tailwind `md:` / `lg:` breakpoint'ler — mobilde tek sütun, tablet 2, desktop 3.
**RISK:** Düşük.
**ACCEPTANCE:** Telefonda (375px) tüm panel'lar dikey stack olsun, scrollable.
**ROLLBACK:** Eklenen `md:`/`lg:` class'ları sil — sabit grid'e geri dön.

---

### P4 🟢 Dashboard'ın kendi sağlığı gözükmüyor [P4]
**DOSYA:** `server.js` (yeni `/api/self-stats` endpoint) + `index.html` footer
**SORUN:** Dashboard process'inin uptime, WS connection count, memory usage gözükmüyor.
**ÇÖZÜM:** `/api/self-stats` → `process.uptime()`, `wss.clients.size`, `process.memoryUsage().heapUsed`. Footer'a "Dashboard: 2h uptime · 3 WS clients · 42MB heap".
**RISK:** Düşük.
**ACCEPTANCE:** Footer'da self-stats gözüksün, 5 sn'de bir refresh olsun.
**ROLLBACK:** `/api/self-stats` endpoint'ini ve footer JS'ini sil.

---

### P5 🟢 Notification badge / favicon dynamic [P4]
**DOSYA:** `index.html`
**SORUN:** Tab arka plandayken yeni hata olduğunu fark etmiyorsun.
**ÇÖZÜM:** Favicon'a "!" badge (canvas overlay), tab title'a "(1) vibecosystem ..." sayacı.
**RISK:** Düşük.
**ACCEPTANCE:** Tab arka plandayken hata gelince badge gözüksün.
**ROLLBACK:** Title update ve canvas favicon logic'ini sil.

---

### P6 🟢 jsonl log rotation — sınırsız büyüme [P4]
**DOSYA:** `server.js` (yeni rotation logic) — C1 sonrası `agent-events.jsonl` sınırsız büyüyebilir
**SORUN:** C1 ile persistence ekleniyor ama dosya rotasyonu yok. Uzun süre çalışan dashboard'da gigabyte'larca jsonl birikir.
**ÇÖZÜM:** Startup'ta dosya boyutu kontrolü — >10MB ise `agent-events-{date}.jsonl.bak` olarak rename et, yeni boş dosyaya devam et. Son N=3 archive tut, eskisini sil.
**ÖNERİLEN AGENT:** **spark** (30 satırlık utility).
**RISK:** Düşük. Rotation zamanlaması önemli: startup'ta yap, runtime'da değil (race condition).
**ACCEPTANCE:**
  - jsonl 10MB'a ulaşınca rotation tetiklensin.
  - Eski archive (>3) silinsin.
  - Aktif dosya hep <10MB kalsın.
**ROLLBACK:** Rotation function'unu sil. Mevcut archive .bak dosyaları korunabilir veya silinebilir.
**BU DEĞİŞİKLİK NEYİ BOZMAZ:** Mevcut event akışı etkilenmez. UI history hâlâ son 1000 event'i gösterir (in-memory cap).

---

### P7 🟢 Accessibility — keyboard navigation eksik [P4]
**DOSYA:** `index.html` (feed, tabs, filter)
**SORUN:** Tab tuşuyla feed'de gezilemiyor. Filter dropdown keyboard-accessible ama feed items focusable değil.
**ÇÖZÜM:** Feed item'lara `tabindex="0"` + visible focus ring. ARIA labels tab'lara.
**RISK:** Düşük.
**ACCEPTANCE:** Tab tuşuyla feed item'ları gezilebilsin, screen reader event tipini okusun.
**ROLLBACK:** tabindex attribute'larını ve ARIA label'ları sil.

---

## 6. Implementation Order (v2 — dependency-aware)

```
Sprint 1a (Persistence + UI prep, ~45 dk):
  C1 (persistence)           [parallel-safe]
  C2 (session filter)        [parallel-safe with C1]

Sprint 1b (Hook + settings.json changes, ~45 dk):
  C3 (token usage logger)    [sequential — settings.json yazıyor]
  C4 (sub-agent hierarchy)   [sequential — settings.json yazıyor]
  ↑ Bu ikisini tek commit veya sıralı yap, paralel YAPMA.

Sprint 2 (High-value UI, ~1 saat):
  H1 (skill matrix UI)       [parallel-safe]
  H2 (error context + XSS guard)
  H3 (hook perf)

Sprint 3a (Spike + dependent, ~45 dk):
  H9-SPIKE (taskId araştır)  [H9 öncesi zorunlu]
  H4 (reconnect)             [parallel ile H9-SPIKE]
  H5 (stuck detection — baseline ölçümü dahil)

Sprint 3b (New features, ~1.5 saat):
  H6 (export, spark)         [paralel-safe]
  H7 (sparklines, SVG only)  [paralel-safe]
  H8 (search)                [paralel-safe]
  H9 (retry tracking)        [SPIKE sonrası]

Sprint 4 (Polish, ~45 dk):
  P1-P7 (paralel-safe hepsi)
```

**Total: ~5-6 saat (eski ~5-7 saat tahmininde idi, sequencing netleşti).**

## 7. Önerilen Agent Atama

| Item | Önerilen agent | Sebep |
|------|---------------|-------|
| C1, C2, C3 (server-side) | **kraken** (TDD) veya **backend-dev** | Server.js değişiyor, test şart |
| C4 (hook + UI) | **kraken** | Hem hook hem UI, TDD ile güvenli |
| H1-H3, P3, P4 | **frontend-dev** | Pure UI ekleme |
| H4-H5 (WS logic) | **websocket-expert** | Reconnection pattern uzmanı |
| H6 (export endpoint) | **spark** | 20 satırlık izole handler, backend-dev overkill |
| H7 (sparklines) | **frontend-dev** + **designer** | Görsel + dataviz |
| H8 (search) | **frontend-dev** | Filter logic |
| H9 (retry tracking) | **kraken** | Hook + data model + UI |
| P1-P2, P5 | **spark** | Küçük UI tweak'ler |

## 8. AGENTS.md Notu

vibecosystem dashboard'unun `package.json`'da Express/React yok — saf vanilla Node.js HTTP + Tailwind CDN. **Bağımlılık eklenmesin** (Chart.js gibi). Sparkline (H7) için SVG inline yazılmalı.

## 9. Behavior Preservation

- Mevcut API endpoint contract'larını **bozma** (response shape aynı kalsın)
- WS event şemasını **bozma** (eski hook'lar hâlâ çalışmalı; yeni alanlar opsiyonel)
- 1000 event cap'i kaldırma — disk yazımı eklendiğinde memory'de cap kalsın
- Dashboard çalışmadığında hook'lar fail etmesin (mevcut `req.on('error', resolve)` fire-and-forget korunsun)
- `127.0.0.1` bind'ı **değiştirme** — public bind H6 export security garantisini bozar

## 10. Changelog (v2.0)

Plan-reviewer feedback uygulanarak v1.0 → v2.0:

**Düzeltmeler:**
- `server.js` satır sayısı 236 → **350** (doğru)
- WS broadcast referansı `server.js:233-249` → **183-227** ana POST handler, **213-216** broadcast, **233-249** WS lifecycle (ayrı ayrı)
- Her C ve H item'ına **ROLLBACK** satırı eklendi (önceki v1.0'da yoktu)
- H7'den **"Chart.js veya"** ifadesi silindi → sadece inline SVG (Section 8 kuralına uyum)
- H6 önerilen agent: backend-dev → **spark** (20 satırlık iş)
- H6'ya 127.0.0.1 bind security note eklendi
- H2'ye **XSS guard** açıkça yazıldı (textContent + escapeHtml zorunlu)
- C4 risk justification ve mitigation eklendi (env var test, null fallback)
- C3-C4 settings.json çakışması belirtildi — **paralel-safe değil**, sequencing eklendi

**Yeni eklenenler:**
- **H9-SPIKE** — H9 öncesi taskId araştırma item'ı (15-30 dk)
- **P6** — jsonl rotation (sınırsız büyüme riski)
- **P7** — Accessibility (keyboard navigation)
- C1'e **MIGRATION** notu (fresh install güvenli)
- H5'e **PERFORMANCE BASELINE** gereksinimi (p95 × 2 threshold)
- P1'e **VERIFICATION STEP** (alfabetik vs insertion order kanıtı)

**Implementation Order yeniden yapılandırıldı:**
- Sprint 1 → Sprint 1a (C1+C2 paralel) + Sprint 1b (C3 sıralı C4)
- Sprint 3 → Sprint 3a (spike + paralel) + Sprint 3b (post-spike)
- Total süre: 5-7 saat → ~5-6 saat (sequencing netleşti)

**Plan-reviewer verdict:** REQUEST_CHANGES → bu güncellemelerle **APPROVE** beklenir.
