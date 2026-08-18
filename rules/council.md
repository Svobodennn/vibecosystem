# Council — Adversarial Konsey

Tek-yargıçlı QA'nın yetmediği yerde toplanan konsey. Oy saymaz; **çürütür ve kanıtlar**.

Script: `~/.claude/workflows/council.js` · Üyeler: `agents/council-*.md`
Oy kaydı: `~/.claude/canavar/council-votes.jsonl`

## Neden oy sayımı yok

Araştırma net: 7 model ailesinden 9 yargıçlı bir panel efektif olarak **~2 bağımsız oy**
üretiyor; bağımsızlığın dörtte üçü korele hatalarla kayboluyor ve en iyi tek yargıç
paneli yakalıyor ya da geçiyor. Bizim konseyin tamamı aynı model ailesi — korelasyon
riski daha da yüksek. Bu yüzden konsey **çoğunluk oyuyla** karar vermez.

Ayrıca müzakere büyük ölçüde tiyatro: 12 kişilik jüri simülasyonunda koşum başına
ortalama **1.0 oy değişimi** ölçülüyor, 18 koşumun 17'si hung jury. Ajanlar konuşuyor,
kimse fikrini değiştirmiyor.

İnancı değiştiren tek şey **kanıt**: ampirik doğrulama katmanı false positive'i
%88.6 azaltıyor (recall kaybı %3.1), adversarial stage-gate adayların ~%79'unu öldürüyor.

Tasarım sonucu: **rol asimetrisi + bağlam asimetrisi + ampirik kapı.** Daha fazla oy değil.

## İki hat (lane)

| | defect | structural |
|---|---|---|
| Ne | çalıştırılarak reprodüce edilebilir hata | reprodüce edilemez yapısal risk |
| Kapı | **Kanıtçı** — reprodüksiyon zorunlu | **Yıkım Yarıçapı** — güzergâh + geri alınabilirlik |
| Kanıtçı vetosu | mutlak | **geçmez** |
| Bloklayabilir mi | evet | yalnızca adlandırılmış `irreversible` mekanizmayla |

Mimari kokular bu yüzden kaybolmuyor: ampirik kapıdan geçmiyorlar ama `advisory` olarak
kayda geçiyorlar; tek yönlü bir hataya işaret ediyorlarsa Yıkım Yarıçapı onları
bloklayıcıya yükseltebiliyor.

`unproven` üçüncü bir sonuç: "reprodüce edemedim" ≠ "hata yok". Bloklamaz, **silinmez**.
Sonradan bug çıkarsa `coroner` için birincil veri.

## Ne zaman toplanır — mekanik, "gerektiğinde" değil

> `psyche` ve adversarial-verify hiç ateşlenmedi çünkü tetikleyicileri yoktu.
> Tetikleyicisi olmayan agent = ölü agent. Aşağıdakiler dosya/sayı temelli olmak zorunda.

**Yol bazlı** (diff bu yollara dokunuyorsa):
`**/auth/**`, `**/payment/**`, `**/billing/**`, `**/migrations/**`, `**/*.sql`,
public API surface, `.claude/hooks/**`, `.github/workflows/**`

**Boyut bazlı:** diff > ~200 satır **veya** > 5 dosya

**qa-loop entegrasyonu:** retry sayacı **2'ye ulaştıysa 3. retry yerine konsey.**
İki kez aynı şekilde fail etmek, tek yargıcın yetmediğinin kanıtıdır — escalation'ın yeri burası.

**Çelişki bazlı:** code-reviewer PASS + security-reviewer FAIL (veya tersi) → otomatik konsey.

**Güven bazlı:** ledger'da bu session için `unverified_claim` / `enforcement_evaded` /
`empty_test_run` varsa, o agent'ın çıktısı konseye gider.

**Asla:** typo, tek satırlık fix, yalnız-doküman değişikliği, formatlama. Konsey pahalı.

## Çalıştırma

```
Workflow({ scriptPath: '~/.claude/workflows/council.js',
           args: { target: 'git diff HEAD~1', maxClaims: 5 } })
```

`args.claims` verilirse toplama aşaması atlanır — qa-loop'tan gelen FAIL bulgularını
doğrudan konseye sokmanın yolu bu. `maxClaims` maliyet kapısı; sınırı aşan iddialar
**sessizce düşmez**, `log()` ve raporda `unjudged` olarak görünür.

## GÖLGE MOD (aktif — 2026-07-30'dan beri)

Konsey şu an **gözlem modunda**. `BLOCK` verdiğinde işi durdurmaz; karar kayda geçer,
ilerlemeye devam edilir. Sebebi: `flip` metriği henüz yorumlanabilir değil ve
güvenilmeyen bir metriğe iş akışını bağlamak erken.

Gölge modda:
- Gate sonucu **öneri** olarak aktarılır, commit/merge engellenmez.
- Bulgular kullanıcıya sunulur, düzeltip düzeltmemek onun kararı.
- Her koşum ledger'a yazılır — asıl amaç bu.
- **Tetikleyici hook'u YAZILMADI.** Konsey elle (`/council`) çağrılır. Konseyin ne zaman
  işe yaradığını görmeden hangi yolda otomatik ateşleneceğini kodlamak ters sıra.

Hedef: **8-10 gerçek diff.** Toplanan veriden üç şey aranıyor:
kör turun ne sıklıkla yanlış oy verdiği, bloklayıcıların kaçının gerçekten
düzeltmeye değdiği, anlaşmazlıkların hangi hatta çıktığı.

Maliyet: koşum başına ~400k subagent token ölçüldü. Yalnızca yıkım yarıçapı
yüksek diff'lerde koştur — her commit'te değil.

Gölge mod çıkışı: metrik yeniden tasarlanıp tetikleyici hook'u yazıldığında.

### Koşum kaydı

| # | Tarih | Hedef | Gate | Bloklayıcı | flip | Not |
|---|---|---|---|---|---|---|
| 1 | 2026-07-30 | sql-heist HEAD~5..HEAD (35 dosya/1024+) | PASS_WITH_NOTES | 0 | 0/3 | 14 iddia (4 defect + 10 structural). **3/3 defect kör turda öldü** — gerekçeler güçlü (spec + testler + ön koşul). Tüm değer structural hatta: 7 advisory / 3 rejected. Kanıtçı hiç koşmadı. D4 maxClaims'e takıldı. 625k token / 8.4 dk. |

| 2 | 2026-07-30 | arabam-sende HEAD~5..HEAD (deploy.sh) | **BLOCK** | 2 | 0/3 | İlk gerçek isabet. Kanıtçı fiilen koştu: deploy doğrulaması **tautolojik** (C1/C2 ampirik kanıtlı). C3 `unproven` — safety classifier prod deploy script'ini koşmayı bloklayınca `killed` DEĞİL `unproven` oldu (düzeltme sahada doğrulandı). 3 iddia maxClaims'e takıldı. 840k token / 10.4 dk. |

| 3 | 2026-07-30 | BreakLoop HEAD~4..HEAD (XP parity) | **BLOCK** | 2 (+1 bastırıldı) | 0/3 | Kanıtçı `xcodebuild test` KOŞTU, drift'i iki yönde de kanıtladı. Konsey benim "XP geri alınamaz" çerçevemi düzeltti (server recompute overwrite ediyor). **Karar kuralı hatası: XP-5 self-mint bulgusu advisory'ye düşürüldü** — düzeltildi. 907k token / 12.4 dk. |

| 4 | 2026-08-06 | **design modu** — council'ın kendisi (10 dosya) | PASS_WITH_NOTES | 0 | n/a | design modu takılmadan çalıştı (önceki denemede 0 iddia / 527k boşa). 32 iddia, 6 yargılandı, **26'sı (%81) kapıda kaldı** ve Reis "en ağır eleştiriler kapıda kaldı" diye kayda geçti. 4 gerçek tutarsızlık bulundu, hepsi düzeltildi. 846k token / 8 dk. |

### Koşum #4'ten çıkan gözlemler (öz-inceleme)

design modu çalıştı ve **kendi sistemimizde 4 gerçek tutarsızlık** buldu — hepsi
doğrulandı ve düzeltildi:

1. `maxClaims` üç yerde üç değer: kod 5/6, dokümanlar hâlâ 3. Kendi "sınırı yükselttik"
   dersimizi çürüten doküman sürüklenmesi. → hizalandı.
2. `council-refuter.md` design lane için **var olmayan enum değerleri** öğretiyordu
   (`code_grounded`/`already_guarded`), design şeması yalnız
   `citation_unsupported|already_documented|no_consequence|wrong_layer|none` kabul ediyor.
   Latent şema hatası. → düzeltildi.
3. `council-chair.md` telemetriyi **koşulsuz zorunlu** kılıyordu, design modu ise
   "yazma" diyor — aynı agent iki modda çelişen talimat alıyordu. → koşullu hale getirildi.
   (Ledger kontrol edildi: 15 satırın tamamı `lane: defect`, Reis fiilen kirletmemiş.)
4. `session` alanı üç koşumda **üç farklı biçimde** yazılmış → flip oranı koşum bazında
   hesaplanamıyordu. → biçim sabitlendi, jq filtresi lane+session gruplu hale getirildi.

Koşumun kendi çıktısından çıkan, rapora girmeyen **5. bulgu (benim)**: `unjudged`
listesinde id çakışması vardı (iki mercek de `C1..C9` üretmiş). Gate `claim_id` ile
eşleştirdiği için çakışan id yanlış iddiaya yanlış karar bağlayabilirdi.
→ id'ler mercek prefiksiyle yeniden yazılıyor (`TUT-1`, `KAR-2`, `KAB-3`).

**En önemli ders — kapı yine en pahalı hatayı yaptı.** 32 iddianın 26'sı yargılanmadı
ve Reis'in tespitiyle "konsey kendi hakkındaki en ağır eleştirileri kapıda bıraktı":
tetikleyicilerin uygulanmamış olması, roster açıklığı, metrik kontaminasyonu ve
çıkış kriteri eksikliği — dördü de `unjudged` yığınındaydı. Sebep: düz birleştirmede
ilk merceğin tamamı sınırı dolduruyor, diğer mercekler hiç temsil edilmiyordu.
→ mercekler arası **round-robin** seçim eklendi; artık sınır her merceğe eşit dağılıyor.

Not: bu dört maddeyi (tetikleyici/roster/metrik/çıkış kriteri) konsey yargılamadan
raporladığı için elle ele alındı — üçü düzeltildi, tetikleyici bilinçli olarak
gölge modda bırakıldı ve SKILL.md'ye açık uyarı yazıldı.

### Koşum #3'ten çıkan gözlemler

- **Kanıtşı Swift'te de koştu** — `xcodebuild test` ile geçici bir repro test'i yazıp
  koştu, iki drift yönünü de FAIL olarak gösterdi, sonra dosyayı ve proje değişikliğini
  temizledi (`git status` doğrulandı, `project.pbxproj` bozulmadı). "Ağır test koşamaz"
  varsayımım yanlıştı.
- **Konsey benim çerçevemi düzeltti.** Prompt'ta "XP kalıcı veri, yanlış hesap geri
  alınamaz bozulma" demiştim; Kanıtçı BEFORE trigger'ın `xp_awarded`'ı yeniden hesaplayıp
  üzerine yazdığını gösterip yıkım yarıçapını düşürdü. Bulgular ayakta kaldı ama
  çerçeve reddedildi — parent'ın hipotezine demirlemedi.
- **KARAR KURALI HATASI (4.):** per-claim structural `blocking`, **global**
  `reversibility === 'irreversible'` koşuluna bağlıydı. Global `costly` gelince Kapı'nın
  `blocking` verdiği ve mekanizmasını adlandırdığı XP-5 (sunucu XP self-mint) advisory'ye
  düşürüldü — üstelik downgrade gerekçesi "mekanizma adlandırılmadı" diye YANLIŞ yazıldı.
  Düzeltme: `structural_verdicts[].irreversible_mechanism` alanı eklendi, karar kuralı
  iddia-seviyesi VEYA global mekanizmayı kabul ediyor. Ders: **gate'i global bir alana
  bağlamak, tek-yönlü tek bir iddiayı görünmez yapar.**

### Koşum #2'den çıkan gözlemler

- **Ampirik kapı asıl işini burada yaptı.** Çürütücü C1'i kör turda `confidence: high` ile
  ayakta tuttu ama gerekçesi framework kaynak kodu okumasıydı; kararı kapatan şey
  Kanıtçı'nın uygulamayı gerçekten çalıştırıp `APP_URL` bozukken de PASS aldığını
  göstermesi oldu. Kanıt olmadan bu bulgu "plausible" seviyesinde kalırdı.
- **`blocked_by` → `unproven` yolu gerçek dünyada test edildi.** Safety classifier,
  Kanıtçı'nın prod deploy script'ini (migrate --force + supervisorctl restart all)
  koşmasını engelledi. Karar `killed` olmadı, `unproven` oldu — yani konsey
  "koşamadım"ı "hata yok" saymadı. Bu, konuşma ortasında düzeltilen sıra hatasının
  sahadaki karşılığı.
- **Kanıtçı iddiadan öteye gitti** ve iddianın çerçevesini düzeltti: "APP_URL prob
  ediliyor, diğerleri kaçıyor" değil — hiçbiri prob edilmiyor.
- **Kapı disiplinli davrandı:** SEC-06/07/08'i "bu diff'in ürünü değil" diye kayda geçirdi
  (routes/health.php değişmemiş, backup script'i repoda yok, `docker cp .env` HEAD~5'te de
  var). Bulgular ayakta ama bu değişikliğe fatura edilmedi.
- **`flip` üçüncü kez 0** — bu kez sebep farklı: kanıt oyu değiştirmedi, **doğruladı**
  (`survives` → `survives`). Metrik "kanıt geldi mi / oyu değiştirdi mi / doğruladı mı"
  olarak üçe ayrılmadıkça bu üç durumu ayırt edemiyor. Üç koşum, üç farklı sebep.

### Koşum #1'den çıkan gözlemler

- **Defect hattı bu turda sıfır isabet, ama filtre olarak çalıştı.** Finder'ların ürettiği
  3 defect iddiası da kör turda düştü ve gerekçeler ciddiydi: spec satırı
  (`docs/02-game-design.md:241`), davranışı kilitleyen testler
  (`phaseMachine.test.ts:62-70`), ön koşul analizi (her level tam 10 variant → id kaymaz).
  Literatürdeki ~%79 kill oranıyla uyumlu. Yani "sıfır bloklayıcı" tembellik değil.
- **Değerin tamamı structural hatta oluştu** — ve orada telemetri YOK. Bu, testbed
  koşumlarında Reis'in işaret ettiği boşluğun gerçek veriyle doğrulanması.
- **`flip 0/3` yine bilgi taşımıyor**: üç iddia da kör turda ölünce Kanıtçı hiç koşmadı,
  dolayısıyla oy değiştirecek kanıt hiç üretilmedi. Metrik yalnız "kanıt geldi" durumunda
  anlamlı — bu ayrım metriğe girmeli.
- **`args` yine string olarak geldi** (harness serialize ediyor); parse guard ilk gerçek
  koşumda işe yaradı. Savunma kodu değil, zorunluluk.
- **Maliyet gerçek:** 625k token / 8.4 dk / 75 tool call. "Yalnız yıkım yarıçapı yüksek
  diff" kuralı isteğe bağlı değil.

#### Koşum #1 — bağımsız doğrulama sonucu (proje oturumu + sleuth)

Konseyin structural bulguları ayrı bir oturumda tek tek doğrulandı. Sonuç:
**5/5 okuma CONFIRMED — sıfır yanlış okuma.** Ama şiddet kalibrasyonu iki yerde şaştı:

| Bulgu | Doğrulama | Ders |
|---|---|---|
| S3 LazyMotion | CONFIRMED, ama **bugün** ikisi de provider altında; gelecek kırılganlığı | advisory doğru seviyeydi |
| S5 ExploitConsole | CONFIRMED okuma, ama **"tek satır fix" YANLIŞ** — `useEngine` session'ı expose etmiyor, düzgün fix API değişikliği ister | **Kapı fix maliyetini tahmin etmemeli** |
| S2 lastEval | CONFIRMED **benign** — kasıtlı dead-field temizliği, 0 referans | advisory bile fazlaydı |
| SEC-02 localStorage | CONFIRMED gelecek kırılganlığı, Zod mevcut | düzeltildi |
| **D4 HintTray (YARGILANMADI)** | **CONFIRMED GERÇEK BUG** — confirm yolunda focus unmount'lanan butona dönüp body'ye düşüyor (WCAG 2.4.3) | **maxClaims gerçek bir bug'ı bastırdı** |

İki somut çıkarım:

1. **`maxClaims` kapısı en pahalı hatayı yaptı.** Yargılanmayan tek defect iddiası
   (`D4`) gerçek bir erişilebilirlik bug'ı çıktı. Onu kurtaran şey sessiz kırpmama
   kuralı oldu — `log()` + `unjudged` alanı sayesinde rapora girdi ve proje oturumu
   bakıp buldu. **Kapıyı sessiz yapmak bu bug'ı yok ederdi.** Varsayılan `maxClaims`
   3'ten 5'e çıkarılmalı, ya da kapı defect başına değil toplam bütçeye bağlanmalı.
2. **Kapı (Yıkım Yarıçapı) fix maliyeti tahmin etmeyi bırakmalı.** "Revertable: tek
   satır" ifadesi S5'te yanlıştı ve o yanlış prompt'a taşındı. Geri alınabilirlik
   ölçmek onun işi; *düzeltmenin kaç satır olduğu* değil. Agent dokümanına
   "fix maliyeti tahmin etme" yasağı eklenmeli.

## Konseyin kendisi çalışıyor mu — tek ölçüt

Pratikçilere önerilen test: **son oy ilk oyla korele mi?** Öyleyse panel müzakerenin
görüntüsünü üretiyor, özünü değil.

Bu yüzden Reis her defect iddiası için `council-votes.jsonl`'e `first_vote` / `final_vote` /
`flipped` yazar. Zamanla `flipped` oranı ~0'a yakınsa konsey dekoratiftir; ya kaldırılmalı
ya Kanıtçı'nın ürettiği kanıt yetersizdir. **Konseyi de ölç.**

```bash
# flip oranı — SADECE defect hattı, koşum bazında gruplu
jq -s '[.[]|select(.lane=="defect")] | group_by(.session)
       | map({session: .[0].session, n: length, flipped: (map(select(.flipped))|length)})' \
  ~/.claude/canavar/council-votes.jsonl
```

Filtresiz `jq -s length` kullanma: dosya birden çok koşumun satırlarını taşır ve
`session` alanı ilk üç koşumda üç farklı biçimde yazıldığı için gruplama olmadan
oran anlamsızdır. Design modu bu dosyaya **yazmaz**.

## Gölge moddan çıkış — kabul kriteri

Önceki hali test edilemezdi ("8-10 koşum, sonra karar veririz"). Ölçülebilir hali:

Çıkış için **üçünün birden** sağlanması gerekir:

1. **En az 8 koşum**, en az 3 farklı projede, en az 2 farklı dilde/yığında.
2. **Bloklayıcı isabet oranı ≥ %70**: `blocking` işaretlenen bulguların en az %70'i
   bağımsız doğrulamada (proje oturumu / sleuth / senin kararın) "gerçek ve düzeltmeye
   değer" çıkmalı. Ölçüm: koşum kaydı tablosundaki doğrulama satırları.
3. **Sıfır bastırılmış gerçek bulgu son 3 koşumda**: `unjudged` veya `killed` çıkıp
   sonradan gerçek bug olduğu anlaşılan madde olmamalı. (Bu kriter koşum #1'de
   `D4`/HintTray ile ihlal edildi — sayaç oradan başlar.)

Sahibi: kullanıcı. Karar noktası: 8. koşum tamamlandığında bu üç madde tek tek
işaretlenir; biri bile tutmuyorsa gölge mod devam eder ve eksik madde adlandırılır.

Çıkış kararı verilirse sıradaki iş **tetikleyici hook'u** yazmaktır (bkz. aşağıdaki
"yazılı ama uygulanmamış" uyarısı).

> **UYARI — yazılı ama uygulanmamış:** Aşağıdaki "Ne zaman toplanır" tetikleyicileri
> şu an **hiçbir hook tarafından ateşlenmiyor**. Konsey yalnız elle (`/council`)
> çağrılır. Bu bilinçli bir gölge-mod kararıdır, eksiklik değil — ama SKILL.md veya
> bu bölümü okuyup "otomatik çalışıyor" sanma. `psyche` ve adversarial-verify'ın
> hiç ateşlenmemesiyle aynı sınıfa düşmemek için burada açıkça yazılıdır.

## İki mod: diff vs design

`council.js` **sınırlı bir değişikliği** yargılar. `council-design.js` **yapıyı** yargılar
(mimari, kararlar, görev kabulleri, doküman-kod tutarlılığı).

Karıştırmanın maliyeti ölçüldü: açık uçlu bir hedef ("projeyi/tasarımı incele") diff
moduna verildi → iki finder da 180sn ilerlemesiz takıldı, 6 deneme, **0 iddia,
~527k token boşa**.

Kök neden tek başına "hedef geniş verildi" değil, üç katmanlıydı:

1. **Şema görevle kavga etti.** Diff modunun `claims` şeması her iddiadan `file` +
   `defect|structural` istiyor. "Karar gerekçesi kayıtlı değil" / "kabul kriteri yok"
   bulgusu tek dosyaya çakılmıyor ve `defect` değil → finder dönecek şey bulamadı.
2. **Ampirik kapı boşa çalıştı.** Council'ın omurgası "koş ve kanıtla". Tasarımda
   koşacak bir şey yok; Kanıtçı ölü ağırlık, gate'i kapatacak kanıt hiç gelmiyor.
3. **Sınırsız yüzey.** Finder'lar ağaç gezmeye başlayıp yakınsamadı.

design modunun üç yapısal farkı bu üçünü kapatıyor: **envanter kapısı** (yüzey önce
sonlu listeye iner, ~40 dosya bütçesi), **zorunlu `citation`** (alıntısız mimari
eleştiri otomatik çürütülür), **`one_way_door`** (ampirik veto yerine geri
alınabilirlik kapısı).

## Bilinen tuzaklar — gerçek koşumlarda yaşandı

Hepsi aynı sınıftan: **"koşamadım / bulamadım" sessizce "hata yok"a dönüşüyor.**
Konseyin en tehlikeli arıza modu bu, çünkü çıktı temiz görünüyor.

1. **`args` JSON string olarak geçildi** → `claims` görünmedi, konsey verilen iddiaları
   yargılamak yerine kendi finder'ını koştu. Script artık parse edip `log()` ile uyarıyor.
2. **`workspace` üyeye geçilmedi** → Çürütücü göreli `src/cart.js`'i home dizininde aradı,
   bulamadı ve bunu `precondition` çürütmesi sayıp gerçek bir bug'ı düşürdü.
   Düzeltme: `blindClaim()` **ve** Kanıtçı prompt'u `workspace: target` taşır.
   (İlk düzeltmede yalnız Çürütücü'ye eklendi, Kanıtçı aynı hataya tekrar düştü —
   yeni bir üye eklerken workspace'i geçtiğini **kontrol et**.)
3. **Karar kuralında sıra hatası** → `emp.blocked_by`, `emp.attempted`'dan sonra
   kontrol ediliyordu; koşulamamış repro `killed` oldu. Doğru sıra:
   `wrong_lane → reproduced → blocked_by → attempted`.

Ortak ders: bir üye "erişemedim" diyorsa sonuç **`unproven`** olmalı — asla `killed`.
Yeni bir kapı/üye eklerken bu ayrımı koruduğunu doğrula.

## Bilinen sınır: korele hata

Tek model ailesindeyiz. Rol + bağlam asimetrisi bunu azaltır, çözmez. Literatürdeki tek
gerçek de-korelasyon mekanizması **farklı model ailesinden kritik**: Cross-Model Critic,
aynı-aile review'ın onayladığı düzeltmelerde %16 (3/19) hata yakalıyor.

Uygulanabilir yol: `codex-orchestration` skill'i üzerinden Codex CLI'ı **minimal bağlamla**
(iddia özeti + entry point) 6. üye olarak çağırmak. Script'e dahil edilmedi — Codex
kurulumunun varlığı doğrulanmadı. Eklenecekse `structural_verdicts` yanına ayrı bir
`cross_model` alanı olarak girmeli, oyu Çürütücü ile eşit ağırlıkta sayılmamalı.
