# Pre-Implementation Contract

Kod yazmadan önce teslim edilecek sözleşme. Maliyet asimetrisi:
**yanlış varsayımın bedeli senin, gereksiz sorunun bedeli kullanicinin.**

Kapsam: kod yazan parent context ve `~/.codex/agents/*.toml` roster'indaki implementer roller. Salt-okunur inceleme rolleri icin gecerli degil; roster bos veya uygun rol yoksa parent context'te uygula.

## 1. Kademe seçimi (kod yazmadan ÖNCE)

İki ex-ante eksen. Boyut ekseni YOK — diff daha yazılmadı, tahmini güvenilmez (bkz. §4).

**Geri alınması pahalı alan:** `**/auth/**`, `**/payment/**`, `**/billing/**`,
`**/migrations/**`, `**/*.sql`, public API surface, `~/.codex/hooks.json`,
`.github/workflows/**`, veri silme.

**Birden fazla savunulabilir form:** *bu işi iki yetkin geliştirici farklı şekilde
yapar mıydı?* Şema tasarımı → evet. Error envelope kararı → evet. Mevcut pattern'in
bir kez daha uygulanması → hayır. Rename → hayır.

| | Tek form | Birden fazla form |
|---|---|---|
| **Normal alan** | **Skip** — direkt yap | **Light** — Goal + Plan |
| **Pahalı alan** | **Light+** — Goal + Plan + Varsayımlar | **Full** — dört bölümün tamamı |

**Emin değilsen bir üst kademe.** Yanlış Full'ün bedeli birkaç paragraf; yanlış
Skip'in bedeli atılan iş.

## 2. Önce araştır, sonra sor

İlgili kod, test, config ve dependency manifest'i OKU. Bir kaç aramayla bulunabilen
şey soru değil, sana ait araştırma borcudur. `research-confidence.md` %90 eşiği geçerli.

**Asla sorma:** test framework, dil/runtime versiyonu, lint kuralları, error handling
konvansiyonu, dizin yapısı, repoda zaten var olan abstraction'lar.
**Sor:** codebase kendi kendisiyle çelişiyorsa.

## 3. Çıktı — sonra DUR

**Goal.** Tek paragraf, kendi kelimelerinle, kendini bağlayacağın kabul kriterleriyle.
Restatement yanlışsa, yanlışlığı öğrenmenin en ucuz yeri burasıdır.

**Blocking questions (0–1).** Sadece yanlış cevap işi *atmayı* gerektiriyorsa sor —
*ayarlamayı* gerektiriyorsa sorma. Her soruya önerdiğin default'u koy ki "evet" yeterli
olsun. Açık uçlu soru sorma. Bloklayan bir şey yoksa "yok" de.
(`collaborative-decisions.md` one-question-rule; gerekirse `request_user_input` kullan.)

**Assumptions.** Numaralı, spesifik, yanlışlanabilir. **En fazla 5** — task'ın gerçekten
dokunduğu 2-3 eksende kal, listeyi doldurmaya çalışma.
> "Input 10k satır altı, belleğe sığar" = varsayım.
> "Kod bakımı kolay olmalı" = varsayım değil.

Eksenler (hepsi değil, ilgili olanlar): **Data** (şekil, hacim, güven, bozuk input neye
benzer) · **Failure** (timeout / kısmi yazma / downstream 500 → retry mi, gürültülü fail
mi, degrade mi) · **Boundaries** (kim çağırıyor, public mi internal mi, geri uyumluluk) ·
**State** (concurrency, idempotency, transaction, sıra garantisi) · **Environment**
(runtime, nereye deploy, neye erişebilir) · **Scope** (bilerek YAPMADIkların, TODO
bıraktıkların) · **Testing** (neyi test edeceksin, neyi kapsamayacaksın).

**Plan.** Oluşturulacak/değişecek dosyalar, kilit fonksiyon ve tip imzaları, çalışma
sırası. **Gerçek bir alternatif arasında seçim yaptıysan, alternatifi adlandır ve tek
cümlelik gerekçeyle reddet.** Bu satır her kademede zorunludur — Light'ta varsayım
bölümü olmasa bile tasarım kararını görünür tutan şey budur.

Sonra bekle. Implementasyona BAŞLAMA.

**Light kademesinde escape hatch:** plan yazarken *tek* bir gerçek seçim noktası fark
edersen, onu tek cümlelik varsayım olarak yaz ve devam et. İki veya daha fazlaysa DUR —
bu Full'dü, kademeyi yanlış seçtin.

## 4. Onaydan sonra

Planı onaylandığı gibi uygula. Mid-implementation'da bir varsayımın yanlış olduğunu veya
planın kodla temas edince tutmadığını fark edersen: **DUR ve söyle.** Sessizce başka bir
tasarıma kayma; artık yanlış olduğuna inandığın yaklaşımla da devam etme.

**Boyut kontrolü burada:** dosya sayısı veya değişiklik hacmi plandaki beklentiyi belirgin
aşıyorsa (kabaca 2 katı), bu plan-kod temas hatasıdır — dur ve bildir. Kapıda tahmin
edilemeyen şey burada ölçülebilir.

**Kısmi onay:** kullanıcı planın bir kısmını onaylarsa, onaylanmayan adımları yapma,
tekrar da sorma. Onaylananları bitir, sonunda "şu adımlar onay bekliyor" diye listele.

## 5. Halkanın kapanışı

Is bitince kurulu roster'da uygun bir dogrulama rolu varsa `spawn_agent` ile cagir ve Goal kabul kriterlerini mesaja ekle; yoksa ayni gate'i parent context'te calistir. Dogrulama yalniz build/test/lint'e degil, kabul kriterlerine de PASS/FAIL vermeli.
Kanıtlayamadığın kriteri `UNVERIFIED` işaretle — "muhtemelen çalışıyor" deme
(`agent-error-reporting.md` claim-vs-evidence).

Bir varsayim implementasyon sirasinda curuduyse bunu proje icin onayli not/memory yuzeyine kaydet. Codex-native memory kullaniliyorsa resmi memory yuzeyini kullan; `~/.codex/memories_1.sqlite` dosyasina dogrudan yazma.
