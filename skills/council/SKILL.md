---
name: council
description: Adversarial konseyi topla - iddialari curut, ampirik kanitla, yapisal kokulari ayri hatta yargila. Oy saymaz. Kullanim: /council [hedef]
---

# /council — Adversarial Konsey

Tek-yargicli QA'nin yetmedigi yerde toplanir. Coğunluk oyu YOK; **curutme + ampirik kanit** var.

Kurallar: `~/.claude/rules/council.md`
Script: `~/.claude/workflows/council.js` (diff) · `~/.claude/workflows/council-design.js` (design)

Uyeler:
- **diff modu:** `council-refuter`, `council-empiricist`, `council-blast-radius`,
  `council-simplifier`, `council-chair` + bulgu uretimi icin `code-reviewer` ve
  `security-reviewer` (harici agent'lar, `claims` verilmediginde)
- **design modu:** `council-inventory`, bulgu uretimi icin `scout` (uc mercek),
  `council-refuter`, `council-blast-radius`, `council-chair`
  (Kanitci ve Sadelestirici bu modda YOK — calistirilacak kod yok.)

> **GOLGE MODDA.** Konsey su an gozlem modunda: `BLOCK` verdiginde isi DURDURMAZ,
> karar kayda gecer ve ilerlenir. Tetikleyiciler `rules/council.md`'de yazili ama
> **hicbir hook tarafindan ateslenmiyor** — konsey yalnizca elle cagrilir.
> Cikis kriteri `rules/council.md` §"Golge moddan cikis"ta tanimli.

## Iki mod — DOGRU OLANI SEC

| Mod | Ne icin | Script |
|---|---|---|
| **diff** (varsayilan) | Sinirli bir DEGISIKLIK kumesini adversarial yargilamak | `council.js` |
| **design** | Proje yapisi, mimari, kararlar, gorev kabulleri, tasarim tutarliligi | `council-design.js` |

**Yanlis modu secmek pahaliya patliyor:** acik uclu bir hedef ("projeyi/tasarimi incele")
diff moduna verildiginde finder'lar baglanacak yuzey bulamayip takildi — 6 denemede
180sn ilerlemesiz, 0 iddia, ~527k token bosa. Sebep: diff modunun semasi her iddiadan
`file` + `defect/structural` lane istiyor; "karar kaydedilmemis" veya "kabul kriteri yok"
bulgusu bu semaya sigmiyor. Ayrica design isinde calistirilacak bir sey olmadigi icin
ampirik kapi (Kanitci) bos calisiyor.

Kural: **degisiklik mi inceliyorsun, yapi mi?** Degisiklik → diff. Yapi → design.

## Kullanim

```
/council                          # HEAD degisikliklerini yargila (diff modu)
/council git diff main...HEAD     # belirli bir diff
/council src/auth/                # belirli bir yuzey (yine diff mantigi)
/council --max 8                  # daha fazla iddia yargila (varsayilan 5)

/council design                   # proje yapisi/mimari/karar/kabul incelemesi
/council design ~/development/x   # belirli bir proje
/council design --focus "gorev kabulleri ve kararlar"
```

### design modu nasil calisir

1. **Envanter** (`council-inventory`) once yuzeyi SONLU bir listeye indirir: dokumanlar
   (ne iddia ediyorlar), moduller (sorumluluk), kararlar (dondurulmus mu), gorev
   artefaktlari (kabul kriteri var mi), beyan-gerceklik ciftleri. ~40 dosya butcesi,
   asarsa `sampling` alaninda ne atladigini yazar. **Takilmayi burasi engelliyor.**
2. **Uc mercek** paralel bulgu uretir, hepsi envantere BAGLI (agac gezmek yasak):
   dokuman-kod tutarsizligi / karar kaydi / gorev-kabul + kapsam kaymasi.
3. **Alinti dogrulama**: her iddia icin `citation` ZORUNLU. Curutucu alintiyi okur;
   iddia edileni soylemiyorsa iddia duser (`citation_unsupported`). Alintisiz mimari
   elestiri otomatik curutulur — en pahali gurultu turu odur.
4. **Tek yonlu kapi**: Yikim Yaricapi bloklayici verebilmek icin `one_way_door` alanini
   adlandirmak zorunda (veri kaybi, yayinlanmis sozlesme, geri alinamaz sema/karar).
   Adlandirmazsa script advisory'ye dusurur.
5. Ampirik kanit olmadigi icin **flip telemetrisi bu modda uygulanmaz** —
   `council-votes.jsonl`'e yazilmaz.

```
Workflow({ scriptPath: '~/.claude/workflows/council-design.js',
           args: { target: '<proje yolu>', focus: '<opsiyonel odak>', maxClaims: 6 } })
```

## Ne yapacaksin

1. **Hedefi belirle.** Argüman verildiyse onu kullan; verilmediyse `git diff HEAD` (veya
   `git status` ile degisen dosyalar). Repo git degilse dizin yolunu hedef olarak gec.

2. **Iddia kaynagini sec.**
   - Elinde bir QA/reviewer FAIL raporu VARSA (qa-loop retry, code-reviewer/security-reviewer
     bulgulari, ledger'daki `unverified_claim`): bunlari `args.claims` olarak gec —
     toplama asamasi atlanir, ucuz ve isabetli olur.
   - Yoksa `claims` gecme; workflow kendi finder asamasini kosar.
   - Her iddiada `lane` ZORUNLU: `defect` (reprodüce edilebilir) veya `structural`
     (reprodüce edilemez yapisal risk). Emin degilsen `defect` yaz — Kanitci `wrong_lane`
     ile duzeltir.

3. **Konseyi topla.**

```
Workflow({
  scriptPath: '~/.claude/workflows/council.js',
  args: { target: '<hedef>', maxClaims: 5, claims: [ /* varsa */ ] }
})
```

> **TUZAK:** `args` GERCEK JSON objesi olarak gecilmeli, JSON **string** olarak DEGIL.
> String gecerseniz `claims` gorunmez ve konsey sessizce kendi finder asamasini kosar
> (yani verdiginiz iddialar yargilanmaz). Script bunu artik parse edip `log()` ile
> uyariyor, ama dogrusu bastan obje gecmektir.

4. **Sonucu aktar.** Reis'in raporunu ozetle. Su uc bolumu ASLA dusurme:
   - **Bloklayici** maddeler (kanitla birlikte)
   - **unproven** maddeler — "reprodüce edemedim" ≠ "hata yok"
   - **Azinlik gorusu** — konseyin en degerli cikti kalemi

   `unjudged` dolu geldiyse (maxClaims siniri) bunu kullaniciya AÇIKÇA soyle.

5. **Gate'e uy.** `BLOCK` geldiyse is bitmemistir — bloklayici maddeler duzeltilmeden
   commit/merge onerme. `PASS_WITH_NOTES` ise advisory notlari aktar, ilerle.

## Karar kurali (script uygular, sen yorumlamazsin)

| Lane | Kapi | Bloklayabilir mi |
|---|---|---|
| `defect` | Kanitci reprodüksiyonu — **mutlak veto** | evet (kor tur + kanit + reconsider ucu de gecerse) |
| `structural` | Yikim Yaricapi — guzergah + geri alinabilirlik | yalnizca **adlandirilmis** `irreversible` mekanizmayla |

Sadelestirici her zaman `advisory`, gate'i etkilemez.

## Ne zaman KENDILIGINDEN toplarsin

`rules/council.md` tetikleyicileri — kullanici `/council` yazmasa da:

- Diff `**/auth/**`, `**/payment/**`, `**/migrations/**`, `**/*.sql`, public API,
  `.claude/hooks/**`, `.github/workflows/**` yollarina dokunuyorsa
- Diff > ~200 satir veya > 5 dosya
- **qa-loop retry sayaci 2'ye ulastiysa → 3. retry yerine konsey**
- code-reviewer ile security-reviewer celisti
- Ledger'da bu session icin `unverified_claim` / `enforcement_evaded` / `empty_test_run` var

**Asla:** typo, tek satirlik fix, sadece-dokuman degisikligi, formatlama. Konsey pahali.

## Konseyi de olc

Her defect iddiasi icin ilk/son oy `~/.claude/canavar/council-votes.jsonl`'e yazilir.

```bash
jq -s '{n:length, flipped:(map(select(.flipped))|length)}' ~/.claude/canavar/council-votes.jsonl
```

`flipped` orani ~0'a yakinsa konsey dekoratiftir — ya Kanitci'nin kaniti zayiftir
ya konsey kaldirilmalidir. Bu, panelin gercekten muzakere edip etmedigini olcen
tek testtir.
