# Architecture & Planning Principles (GLOBAL)

Her projede — o projenin KENDİ best-practice'lerine göre — **katmanlı mimari**, **SRP**
ve **SOLID** prensiplerine uygun **PLANLA ve YAZ**. Yapı baştan kararlaştırılır; sonradan
yeniden düzenleme (structural churn) istenmez.

## Her kod için zorunlu

| Prensip | Ne demek |
|---------|----------|
| **Katmanlı mimari** | Tek yönlü bağımlılık — üst katman alta bağlıdır, alt üste ASLA. Cross-cutting concern'ler (i18n, shared UI, utils) alt/ortak katmanda yaşar. Yukarı-doğru bağımlılık = ihlal, düzelt. |
| **SRP** | Her dosya/modül/fonksiyon tek sorumluluk. UI ≠ logic: component render-only, saf/iş logic'i lib/service katmanına. Çok küçük, odaklı dosyalar. |
| **SOLID** | Single-responsibility; açık/kapalı (additive genişlet, kırma); Liskov; interface segregation; dependency inversion (soyutlamaya bağımlı ol, somuta değil). |
| **Proje best-practice'i** | Framework/dil konvansiyonuna uy (ör. Next.js: Server Components varsayılan, per-component colocation, `@/` alias; Django/Spring/Go kendi idiomları). "Genel doğru" değil, O PROJE için doğru. |
| **Önce planla** | Büyük iş → audit (kanıt) + fazlı plan, big-bang yok. Yapı/konvansiyonları önden proje CLAUDE.md'ye kilitle ki tekrar refactor gerekmesin. |

## Doğrulama disiplini (yapısal değişikliklerde)

- Her fazı YEŞİL kapıyla bitir: typecheck + test + build + e2e. Sonraki faza öyle geç.
- Dosya/CSS-module/`import.meta.url` path taşımalarından sonra **her zaman build koş** — tsc bunların kırılmasını görmez, yalnız build/test yakalar.
- Faz başına tek, scoped commit; commit/push öncesi onay al.

## Neden

Kullanıcı yapısal churn'den hoşlanmıyor: konvansiyon baştan netleşmediği için sonradan
yeniden düzenleme. Baştan doğru kur, kaydet, tekrar tartışma.
