/**
 * review-gate-stop davranis kilidi.
 *
 * Bu bir BLOCKING gate: alti elle ayarlanmis regex, uc ayirici sarti ve bir
 * degisken cozucu tasiyor ve dort tur boyunca her turda yeni bir yanlis pozitif
 * sinifi cikti. Buradaki vakalar o turlarda ampirik olarak bulunmus gercek
 * korpus sekilleridir -- bir daha sessizce gerilemesinler diye sabitlendi.
 */
import { describe, it, expect } from 'vitest';
import { bashTargets, resolveDollarPath } from './review-gate-stop.js';

describe('bashTargets — gercek yazma tespiti', () => {
    it('duz redirect hedefini bulur', () => {
        expect(bashTargets('cat > src/app.ts')).toEqual(['src/app.ts']);
    });
    it('ayni komuttaki iki redirect\'i de bulur', () => {
        expect(bashTargets('cat > a.ts; cat > b.ts')).toEqual(['a.ts', 'b.ts']);
    });
    it('iki haneli fd yonlendirmesini kapsar', () => {
        expect(bashTargets('cmd 10>f.py')).toEqual(['f.py']);
    });
    it('TIER 2: python open(...,"w") hedefini bulur', () => {
        expect(bashTargets('p="/x/y.ts"; open(p,"w")')).toEqual(['/x/y.ts']);
    });
    it('sed -i hedefini bulur', () => {
        expect(bashTargets('echo "done > $OUT"; sed -i "" s/a/b/ real.ts')).toEqual(['real.ts']);
    });
});

describe('bashTargets — yanlis pozitif siniflari (hepsi sahada goruldu)', () => {
    it('HTML etiketi redirect sanilmaz', () => {
        expect(bashTargets('<code>x.mjs')).toEqual([]);
        expect(bashTargets('<h2>report.ts')).toEqual([]);
        expect(bashTargets('<h10>report.ts')).toEqual([]);
    });
    it('arrow fonksiyonu redirect sanilmaz', () => {
        expect(bashTargets('cols.map(r=>r.c)')).toEqual([]);
    });
    it('prose oku TIER 2 yazma sinyali sayilmaz', () => {
        expect(bashTargets('echo "<span>$x</span>" ; cat src/app.ts')).toEqual([]);
        expect(bashTargets('printf "a=>$b" ; grep q lib/util.ts')).toEqual([]);
    });
});

describe('bashTargets — dislamalar $ uzerinden atlatilamaz', () => {
    it('duz scratchpad yolu dislanir', () => {
        expect(bashTargets('cat > /private/tmp/foo/scratchpad/probe.py')).toEqual([]);
    });
    it('$VAR ile gizlenmis scratchpad de dislanir', () => {
        expect(bashTargets('SP=/private/tmp/x/scratchpad; cat > $SP/probe.py')).toEqual([]);
    });
    it('$VAR ile gizlenmis node_modules dislanir', () => {
        expect(bashTargets('D=~/proj/node_modules; cat > $D/hack.js')).toEqual([]);
    });
    it('job temp dizini dislanir', () => {
        expect(bashTargets('J=~/.claude/jobs/abc/tmp; cat > $J/t.cjs')).toEqual([]);
    });
});

describe('resolveDollarPath — kullanim konumundan onceki SON atama kazanir', () => {
    it('gercek kaynak yolunu tam olarak cozer', () => {
        expect(bashTargets('B=/work/myapp; cat > $B/api/x.js'))
            .toEqual(['/work/myapp/api/x.js']);
    });
    it('yeniden atanan degiskende her yazma kendi degerine cozulur', () => {
        // Ilk atamayi almak ikinci yazmayi /tmp'e cozup DISLIYORDU (enforcement kaybi)
        expect(bashTargets('D=/private/tmp/a; cat > $D/x.py; D=/Users/me/src; cat > $D/y.py'))
            .toEqual(['/Users/me/src/y.py']);
    });
    it('yazmadan SONRA gelen atama kullanilmaz', () => {
        expect(bashTargets('cat > $D/y.py; D=/Users/me/src')).toEqual([]);
    });
    it('atamasi olmayan env var duser', () => {
        expect(bashTargets('cat > "$CLAUDE_JOB_DIR/tmp/q.cjs"')).toEqual([]);
    });
    it('ic ice degisken degeri duser', () => {
        expect(bashTargets('NVM_DIR="$HOME/.nvm"; cat > $NVM_DIR/nvm.sh')).toEqual([]);
    });
    it('kalanda ikinci degisken varsa duser (kismi cozum guvenilmez)', () => {
        expect(bashTargets('D=/Users/me/proj; cat > $D/$SUB/a.py')).toEqual([]);
        expect(bashTargets('D=/Users/me/proj; cat > $D/x$E.py')).toEqual([]);
    });
    it('~ genisletir ve sondaki slash\'i temizler', () => {
        const r = bashTargets('D=~/proj/src/; cat > $D/app.ts');
        expect(r).toHaveLength(1);
        expect(r[0]).toMatch(/^\/.*\/proj\/src\/app\.ts$/);
    });
    it('$ tasimayan yolu oldugu gibi dondurur', () => {
        expect(resolveDollarPath('src/app.ts', 'cat > src/app.ts', 6)).toBe('src/app.ts');
    });
});

describe('bilinen bosluk — kapatilmadi, bilincli', () => {
    it('${VAR} / "$VAR" / $(cmd) formlari hala uydurma yol uretiyor', () => {
        // Devrediliyor: $ sonrasi karakter sinifta olmadigi icin eslesme onekten
        // SONRA basliyor, $ tasimiyor ve cozume hic girmiyor.
        expect(bashTargets('D=/private/tmp/x/scratchpad; cat > ${D}/probe.py')).toEqual(['/probe.py']);
    });
});

describe('"dislandi" ile "hedef bulunamadi" ayrimi', () => {
    it('dislanmis hedef bulunduysa TIER 2 alakasiz yol basmaz', () => {
        // Eskiden ["src/real.ts"] donuyordu: TIER 1 $SP/a.py'yi gorup disladi,
        // sonra TIER 2 komuttaki ilk kod yolunu hedef sandi.
        expect(bashTargets('SP=/private/tmp/x/scratchpad\nopen("$SP/a.py","w"); ref = "src/real.ts"'))
            .toEqual([]);
    });
    it('heredoc YORUMU icindeki yol hedef sayilmaz', () => {
        expect(bashTargets('S=/tmp/s; cat > $S/harness.js <<EOF\n// index.js is deliberately unused\nEOF'))
            .toEqual([]);
    });
    it('ayni komutta dislanmis VE gercek yazma varsa gercek olan KORUNUR', () => {
        // OPAQUE_WRITE_SIGNALS olmadan bu enforcement kaybiydi: TIER 1 scratchpad'e
        // yazan redirect'i gorup duruyor, write_text ile yazilan gercek kaynak kor kaliyordu.
        const r = bashTargets(
            'SP=/tmp/s; cat > $SP/q.sql <<EOF\nselect 1\nEOF\n' +
            'python3 -c "import pathlib; pathlib.Path(\'utils/real.js\').write_text(x)"'
        );
        expect(r).toContain('utils/real.js');
    });
});

describe('bilinen bosluk 2 — sed -i hedefi (BOZUK, devrediliyor)', () => {
    it("macOS formu (sed -i '' EXPR FILE) TIER 1 tarafindan dogru yakalanmiyor", () => {
        // Korpusta 87 'sed -i' komutunun 85'inde TIER 1 hic eslesmiyor; asagidaki
        // dogru sonuc TIER 2 tahmininden geliyor, sed extractor'undan DEGIL.
        expect(bashTargets("sed -i '' 's/a/b/' src/app.ts")).toEqual(['src/app.ts']);
    });
    it('sed IFADESI dosya yolu sanilabiliyor', () => {
        // Ifade bir kod uzantisi tasiyorsa extractor onu hedef sanip gercek
        // dosyayi (real.js) tamamen kaciriyor. Bu testin bekledigi deger YANLIS
        // davranisin kaydidir; duzeltilince ['real.js'] olmali.
        expect(bashTargets("sed -i '' 's/old.ts/new.ts/g' real.js")).toEqual(['s/old.ts/new.ts']);
    });
});

describe('OPAQUE_WRITE_SIGNALS — her biri ayri ayri kapsanmali', () => {
    // Reviewer mutation testi: bu uc regex silinse suite YESIL kaliyordu.
    // Her vaka "TIER 1 dislanmis bir hedef gordu" + "komutta o forma ait opaque
    // yazma var" kurgusundadir; opaque kaydi silinirse sonuc [] olur.
    it('write_text', () => {
        expect(bashTargets('S=/tmp/s; cat > $S/q.sql <<EOF\nx\nEOF\npathlib.Path("utils/a.js").write_text(v)'))
            .toContain('utils/a.js');
    });
    it('open(degisken, "w")', () => {
        expect(bashTargets('S=/tmp/s; cat > $S/q.sql <<EOF\nx\nEOF\np="lib/b.ts"; open(p,"w")'))
            .toContain('lib/b.ts');
    });
    it('writeFileSync(degisken)', () => {
        expect(bashTargets('S=/tmp/s; cat > $S/q.sql <<EOF\nx\nEOF\nwriteFileSync(dest, s); // src/c.mjs'))
            .toContain('src/c.mjs');
    });
    it('git apply', () => {
        expect(bashTargets('S=/tmp/s; cat > $S/q.sql <<EOF\nx\nEOF\ngit apply p.patch # touches src/d.ts'))
            .toContain('src/d.ts');
    });
    it('sed -i (yerinde degistirir, hedefi TIER 1 goremiyor)', () => {
        // Bu kayit olmadan gercek sed edit'i sessizce dusuyordu.
        expect(bashTargets('sed -i "" s/x/y/ src/real.ts  # log > /tmp/out.ts'))
            .toContain('src/real.ts');
    });
});

describe('dislandi ile cozulemedi ayrimi', () => {
    it('cozulemeyen hedefin YANINDAKI gercek yazma bastirilmaz', () => {
        // Dongu degiskeni $c cozulemez. Onu "dislandi" gibi ele almak ayni
        // komuttaki gercek yazmayi da gorunmez yapiyordu.
        expect(bashTargets(
            'for f in *.tsx; do c="${f%.tsx}"; printf "x" > "$c/index.ts"; done\n' +
            'cat > src/barrel.ts <<EOF\nz\nEOF'
        )).toEqual(['src/barrel.ts']);
    });
    it('cozulemez hedef TEK basinaysa sonuc bos kalir (bilinen sinir)', () => {
        // Komut 26 gercek dosya uretiyor ama tek yol adi cozulemez oldugu icin
        // raporlanacak dogrulanabilir bir sey yok. Dogru cozum sayiyi yoldan
        // ayirmak (liste yerine "N dosya, biri degisken yollu") -- devrediliyor.
        expect(bashTargets(
            'cd /Users/x/proj\nfor f in *.tsx; do c="${f%.tsx}"; printf "x" > "$c/index.ts"; done'
        )).toEqual([]);
    });
    it('yalniz dislanmis hedef varsa TIER 2 kosmaz', () => {
        expect(bashTargets('SP=/private/tmp/x/scratchpad\nopen("$SP/a.py","w"); ref = "src/real.ts"'))
            .toEqual([]);
    });
});
