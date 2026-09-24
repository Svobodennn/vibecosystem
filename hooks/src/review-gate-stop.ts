#!/usr/bin/env node
/**
 * Review Gate - Stop hook (D2)
 *
 * Oturumda kod yazildi ama hic review/verify agent'i sevk edilmediyse durmayi
 * BLOKLAR ve ne yapilacagini soyler. 1. dalga yalnizca hatirlatma acmisti;
 * kanitli kaldirac `subagent-stop-learner`'daki decision:block deseni.
 *
 * Tasarim kisitlari:
 *  - FAIL-OPEN: parse/okuma/tarama hatasi, veri yoksa, suphe varsa -> {} don.
 *    Yanlis blok, kacirilan review'dan pahalidir.
 *  - TEK BLOK: stop_hook_active=true ikinci gecistir, orada ASLA bloklamaz;
 *    bunun yerine ledger'a iz birakir (enforcement_evaded deseni).
 *  - Kod edit'i tespiti Edit/Write ile YETINMEZ: auto mode dosya degisikligini
 *    Bash (sed -i / heredoc / python open(...,'w')) uzerinden yapiyor ve olculdu
 *    ki bazi oturumlarda Edit/Write sayisi 0, Bash 81. Yalniz Edit/Write'a
 *    bakan bir kapi o oturumlari tamamen kacirir.
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname, isAbsolute, resolve } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

interface StopInput {
    session_id?: string;
    transcript_path?: string;
    hook_event_name?: string;
    stop_hook_active?: boolean;
}

/** Kaynak kod uzantilari. Bilincli olarak .md/.json/.yaml YOK -- yalniz-dokuman ve
 *  yalniz-config oturumlari (settings.json duzenlemelerimiz dahil) bloklanmamali. */
const CODE_EXT = 'ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|swift|rb|php|c|h|hpp|cpp|cs|sh|zsh|bash|sql|vue|svelte|scss|sass|css|gd|lua';

/** Uretilmis / gecici / arsiv yollari: bunlara yazmak kaynak edit'i degildir. */
const EXCLUDE_SEG = /\/(?:node_modules|dist|build|out|\.git|scratchpad|backups|\.archive|coverage|__pycache__|vendor|\.next|\.venv|tmp)\//;
const EXCLUDE_ROOT = /^(?:\/private)?\/tmp\/|^\/var\/folders\//;

/** Prose'da path gibi gorunen kutuphane adlari ("React/Next.js" olculdu, path sanildi). */
const LIB_DENY = new Set([
    'next.js', 'node.js', 'nuxt.js', 'vue.js', 'three.js', 'd3.js', 'express.js',
    'react.js', 'chart.js', 'alpine.js', 'ember.js', 'backbone.js', 'jquery.js',
    'socket.js', 'nest.js', 'remix.js', 'astro.js', 'svelte.js', 'solid.js',
    'qwik.js', 'discord.js', 'video.js', 'pixi.js', 'p5.js', 'anime.js',
]);

/** Kod dosyasi yolu. Sondaki (?![\w.]) sart ve \b'den daha guclu olmali:
 *  - \b olmadan "settings.json" -> "settings.js", "sayfa.html" -> "sayfa.h" kesiliyor
 *  - \b ile bile hostname'ler kaciyor: "...-0.h.db.ondigitalocean.com" -> ".h" (olculdu),
 *    cunku uzantidan sonraki nokta word-char olmadigi icin \b eslesiyor.
 *  Noktayi da yasaklamak bu sinifi kapatir; "dosya.ts.bak" da dogru sekilde dusuyor.
 *
 *  $ sinifin en davranis-kritik uyesi: iceren bir eslesme resolveDollarPath'e
 *  BAGIMLI hale gelir (cozulur ya da duser). $ olmadan eslesme degiskenin
 *  ortasindan basliyor ve dislamalari atlatan uydurma yol uretiyordu.
 *  KAPALI kalan formlar: ${VAR}/x.ts, "$VAR"/x.ts, $(cmd)/x.ts -- bunlarda $
 *  sonrasi karakter sinifta olmadigi icin eslesme onekten SONRA basliyor,
 *  $ tasimiyor ve cozume hic girmiyor. Bilinen bosluk. */
const PATH_SRC = `[\\w./~@+$-]*[\\w+-]+\\.(?:${CODE_EXT})(?![\\w.])`;
const PATH_RE = new RegExp(PATH_SRC, 'g');

/** TIER 1 -- yazma yapisindan hedefi DOGRUDAN cikarir. Prose eslesmesi imkansiz. */
const TARGET_EXTRACTORS: RegExp[] = [
    new RegExp(`\\bsed\\s+(?:-[a-zA-Z]+\\s+)*-i(?:\\s+\\S+)?\\s+["']?(${PATH_SRC})`, 'g'),
    // Solda ayirici sart: onsuz HTML etiketleri, arrow fonksiyonlari ve ASCII
    // oklari shell yonlendirmesi sanildi -- "<code>x.mjs", "cols.map(r => r.c)",
    // "-> http.ts" hepsi hedef olarak sayiliyordu. Sayi yazmiyorum: olcum korpusu
    // (transcript'ler) bu regex'i tartisan oturumlari da iceriyor, o yuzden her
    // olcum kendi kendini besleyip yukari suruklenir.
    // \d{0,2} ayiricidan SONRA geldigi icin "2>f.py" / "10>f.py" fd
    // yonlendirmesini kapsar ama "<h2>report.ts" FP'sini acmaz.
    // Karakter sinifina " EKLEMEYIN: 'class="m">dosya.py' bicimindeki HTML
    // attribute kapanislarini geri getirir. (' pratikte hicbir sey getirmiyor;
    // is yapan karakter " -- FP'nin sekli shell tirnagi degil HTML attribute'u.)
    new RegExp(`(?:^|[\\s;|&()])\\d{0,2}?>>?\\s*["']?(${PATH_SRC})`, 'g'),
    new RegExp(`\\btee\\s+(?:-a\\s+)?["']?(${PATH_SRC})`, 'g'),
    new RegExp(`\\b(?:cp|mv|install)\\s+(?:-\\S+\\s+)*\\S+\\s+["']?(${PATH_SRC})`, 'g'),
    new RegExp(`\\bopen\\(\\s*["'](${PATH_SRC})["']\\s*,\\s*["'][wax]`, 'g'),
    new RegExp(`\\b(?:writeFileSync|appendFileSync)\\(\\s*["'](${PATH_SRC})["']`, 'g'),
];

/**
 * Yazma sinyalleri. TIER 1 bir hedef bulamadiginda TIER 2 fallback'i yalniz
 * bunlardan biri atesleniyorsa kosar.
 *
 * `opaque` = hedefi literal DEGIL, dolayisiyla hicbir TARGET_EXTRACTOR onu
 * goremez. Iki yerde kullaniliyor ve tek listede durmalari sart: OPAQUE her
 * zaman WRITE_SIGNALS'in ALT KUMESI olmali. Ayri iki liste tutuldugunda
 * `sed -i` OPAQUE'ten dusmus ve gercek bir kayip acmisti (asagi bak).
 */
interface WriteSignal {
    re: RegExp;
    /** TIER 1 bu formun hedefini yapisal olarak goremez mi? */
    opaque: boolean;
}

const WRITE_SIGNAL_DEFS: WriteSignal[] = [
    // open(<literal>,'w') TIER 1'de var; open(<degisken>,'w') gorunmez.
    { re: /\bopen\([^)]*["'][wax]/, opaque: false },
    { re: /\bopen\(\s*[^"'\s)][^)]*["'][wax]/, opaque: true },
    { re: /\b(?:writeFileSync|appendFileSync)\(/, opaque: false },
    { re: /\b(?:writeFileSync|appendFileSync)\(\s*[^"'\s)]/, opaque: true },
    // write_text'in literal karsiligi hic yok -- her zaman opaque.
    { re: /\.write_text\(/, opaque: true },
    // sed -i dosyayi YERINDE degistirir, yani tanimi geregi gercek bir kaynak
    // mutasyonu. Hedefi olculdu: 92 komutun 6'sinda TIER 1 bir sey yakaliyor,
    // o 6'nin 5'inde yakaladigi sey dosya degil sed IFADESI. Yani pratikte
    // gorunmez => opaque. Bunu kacirmak "sed -i ... src/real.ts  # log > /tmp/o.ts"
    // gibi bir komutta gercek edit'i sessizce dusuruyordu.
    { re: /\bsed\s+(?:-[a-zA-Z]+\s+)*-i\b/, opaque: true },
    { re: /\bgit\s+apply\b|\bpatch\s+-p\d/, opaque: true },
    // TIER 1'deki ayni ayirici sarti burada da olmali: onsuz 'echo "a=>$b"' veya
    // '-> $TMPD' gibi bir prose oku yazma sinyali sayiliyor ve TIER 2 komuttaki
    // ilk kod yolunu hedef olarak dondururuyor -- hicbir sey yazilmadigi halde.
    // OPAQUE degil: hedef "$VAR/..." formunda TIER 1 tarafindan GORULUR; cozulup
    // dislanmasi ile cozulememesi ayri seyler ve bu ayrimi cagri yeri yapar.
    { re: /(?:^|[\s;|&()])\d{0,2}?>>?\s*["']?\$/, opaque: false },
];

const WRITE_SIGNALS: RegExp[] = WRITE_SIGNAL_DEFS.map(d => d.re);
const OPAQUE_WRITE_SIGNALS: RegExp[] = WRITE_SIGNAL_DEFS.filter(d => d.opaque).map(d => d.re);


/** Yazilan kodu fiilen inceleyen agent'lar. plan-reviewer YOK -- o plani inceler. */
const REVIEW_AGENTS = new Set([
    'code-reviewer', 'verifier', 'security-reviewer', 'python-reviewer',
    'go-reviewer', 'database-reviewer', 'review-agent',
]);

/**
 * "$D/probe.py" gibi degisken yollu bir hedefi ayni komuttaki atamadan cozer.
 *
 * Neden gerekli: $ path sinifinda olmadigi surece eslesme degiskenin ORTASINDAN
 * basliyor ve "D/probe.py" gibi UYDURMA bir yol uretiyordu. O dizge
 * EXCLUDE_ROOT/EXCLUDE_SEG'in eslestigi oneki kaybettigi icin dislama filtreleri
 * sessizce devre disi kaliyordu.
 *
 * usePos = yolun komut icindeki konumu. Atamalardan yalnizca BU KONUMDAN ONCE
 * gelenler gecerli; bunlarin da SONUNCUSU kazanir. Ilk eslesmeyi almak iki
 * yonde de hata veriyordu:
 *   D=/tmp/a; cat > $D/x.py; D=/Users/me/src; cat > $D/y.py
 *     -> ilk atama alinirsa y.py de /tmp'e cozulup DISLANIR (enforcement kaybi)
 *   cat > $D/y.py; D=/Users/me/src
 *     -> yazma aninda $D bos; sonraki atamayi kullanmak UYDURMA yol uretir
 * Heredoc govdesindeki "VAR=deger" metni de boylece gercek atamayi ezemez.
 *
 * Cozulemezse null doner ve hedef DUSER -- dogrulayamadigimiz bir yolu blok
 * mesajinda iddia etmek, hic soylememekten kotudur. DIKKAT: cozum bir yandan
 * yanlis pozitifleri de INANDIRICI yapiyor (uydurma "B/x.mjs" yerine diskte
 * gercekten duran tam yol yazilir), o yuzden TIER 2'nin "komuttaki ilk yol"
 * sezgisi buradan sonra daha pahali bir hata haline geliyor.
 */
export function resolveDollarPath(path: string, command: string, usePos: number): string | null {
    if (!path.includes('$')) {
        return path;
    }
    const m = /^\$(\w+)(.*)$/.exec(path);
    if (!m) {
        return null;
    }
    const [, varName, rest] = m;
    const assign = new RegExp(
        `(?:^|[\\s;&|(])${varName}=(?:"([^"]*)"|'([^']*)'|([^\\s;&|)"']+))`,
        'g'
    );
    let chosen: string | null = null;
    for (const hit of command.matchAll(assign)) {
        if (hit.index !== undefined && hit.index >= usePos) {
            break;
        }
        chosen = hit[1] ?? hit[2] ?? hit[3] ?? '';
    }
    if (!chosen || chosen.includes('$')) {
        // Atama yok, ya da deger kendisi degisken ("$HOME/.nvm") -- cozmuyoruz
        return null;
    }
    let value = chosen;
    if (value.startsWith('~')) {
        value = homedir() + value.slice(1);
    }
    const resolved = value.replace(/\/+$/, '') + rest;
    if (resolved.includes('$')) {
        // Kalanda ikinci bir degisken var ("$D/$SUB/a.py"). Kismen cozulmus bir
        // yol, cozulmemis kadar guvenilmez: dislama kontrolu $SUB'u goremez.
        return null;
    }
    return resolved;
}

const CODE_FILE_RE = new RegExp(`\\.(?:${CODE_EXT})$`);
// Olculen en buyuk transcript 92MB. Tavan onun ustunde ama Node string
// sinirinin altinda: asilirsa taramayi atla (fail-open), OOM riski almayalim.
const MAX_TRANSCRIPT_BYTES = 120 * 1024 * 1024;
const MAX_FILES_IN_MESSAGE = 6;

function isRealCodePath(p: string): boolean {
    if (!p || EXCLUDE_SEG.test(p) || EXCLUDE_ROOT.test(p)) {
        return false;
    }
    const base = (p.split('/').pop() || '').toLowerCase();
    return !LIB_DENY.has(base);
}

export function bashTargets(command: string): string[] {
    // Sira onemli: cozum ONCE, dislama SONRA. Tersi olursa "$D/probe.py"
    // dislanmis bir dizine yaziyor olsa bile filtreden gecer.
    // Reddedilen bir hedefin SEBEBI onemli, ikisi ayni sey degil:
    //   dislandi   = nereye yazdigini BILIYORUZ, onemsiz bir yer  -> raporlanacak sey yok
    //   cozulemedi = nereye yazdigini BILMIYORUZ                  -> onemsiz oldugunu soyleyemeyiz
    // Ikisini birlikte "yok" saymak korpusta gercek bir kayip acmisti: bir dongude
    // `printf ... > "$c/index.ts"` ile 26 gercek kaynak dosyasi uretiliyor, $c dongu
    // degiskeni oldugu icin cozulemiyor; bunu "dislandi" gibi ele almak komutu
    // tamamen gorunmez yapiyordu.
    let sawExcluded = false;
    let sawUnresolvable = false;
    const accept = (raw: string, usePos: number, out: string[]): void => {
        const resolved = resolveDollarPath(raw, command, usePos);
        if (resolved === null) {
            sawUnresolvable = true;
            return;
        }
        if (!isRealCodePath(resolved)) {
            sawExcluded = true;
            return;
        }
        out.push(resolved);
    };

    const found: string[] = [];
    for (const re of TARGET_EXTRACTORS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(command)) !== null) {
            if (m[1]) {
                // Grup 1 desenin son parcasi; lastIndexOf ile komut icindeki konumu bulunur
                accept(m[1], m.index + m[0].lastIndexOf(m[1]), found);
            }
        }
    }
    if (found.length > 0) {
        return found;
    }
    if (sawExcluded && !sawUnresolvable && !OPAQUE_WRITE_SIGNALS.some(sig => sig.test(command))) {
        // TIER 1 bir yazma yapisi gordu, hedefinin NEREYE gittigini biliyoruz ve
        // orasi onemsiz; cozulemeyen hedef yok; komutta TIER 1'in goremeyecegi
        // baska bir yazma da yok. Bu 'raporlanacak sey yok' demektir,
        // 'arayacak yer kaldi' demek DEGIL -- ikisi ayni koddan gecerken TIER 2
        // komuttaki alakasiz ilk kod yolunu basiyordu: heredoc YORUMU icindeki
        // index.js, echo icindeki prose (icons.tsx), scratchpad'de kosturulan
        // `node NN.js` argumanlari. (d.h ve cp'nin KAYNAK dosyasi bu return
        // tarafindan OLDURULMUYOR -- onlar komutlarinda OPAQUE sinyal oldugu
        // icin hala TIER 2'ye dusuyor; yanlis atif duzeltildi.)
        // OPAQUE kontrolu sart: onsuz ayni komutta hem scratchpad'e hem gercek
        // kaynaga yazan bir komutta gercek yazma kor kaliyor (olculdu).
        return [];
    }
    if (!WRITE_SIGNALS.some(s => s.test(command))) {
        return [];
    }
    const fallback: string[] = [];
    PATH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PATH_RE.exec(command)) !== null) {
        accept(m[0], m.index, fallback);
        if (fallback.length > 0) {
            break;
        }
    }
    PATH_RE.lastIndex = 0;
    return fallback;
}

interface ScanResult {
    files: string[];
    reviewers: string[];
}

function scanTranscript(path: string): ScanResult {
    const files = new Set<string>();
    const reviewers = new Set<string>();
    const raw = readFileSync(path, 'utf-8');
    for (const line of raw.split('\n')) {
        // On-filtre: satirlarin buyuk cogunlugu tool_use tasimaz
        if (!line.includes('"tool_use"')) {
            continue;
        }
        let entry: unknown;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        const message = (entry as { message?: { content?: unknown } }).message;
        const content = message?.content;
        if (!Array.isArray(content)) {
            continue;
        }
        for (const block of content) {
            if (!block || typeof block !== 'object') {
                continue;
            }
            const b = block as { type?: string; name?: string; input?: Record<string, unknown> };
            if (b.type !== 'tool_use') {
                continue;
            }
            const input = b.input || {};
            if (b.name === 'Edit' || b.name === 'Write' || b.name === 'NotebookEdit') {
                const fp = String(input.file_path || input.notebook_path || '');
                if (CODE_FILE_RE.test(fp) && isRealCodePath(fp)) {
                    files.add(fp);
                }
            } else if (b.name === 'Bash') {
                for (const t of bashTargets(String(input.command || ''))) {
                    files.add(t);
                }
            } else if (b.name === 'Agent' || b.name === 'Task') {
                const st = String(input.subagent_type || '');
                if (REVIEW_AGENTS.has(st)) {
                    reviewers.add(st);
                }
            }
        }
    }
    return { files: [...files], reviewers: [...reviewers] };
}

function recordEvasion(sessionId: string, fileCount: number): void {
    try {
        const dir = join(homedir(), '.claude', 'canavar');
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        appendFileSync(join(dir, 'error-ledger.jsonl'), JSON.stringify({
            ts: new Date().toISOString(),
            session: sessionId.slice(0, 8),
            agent_id: 'main',
            agent_type: 'main',
            error_type: 'review_gate_evaded',
            error_pattern: 'code edited, no reviewer spawned, gate passed on second stop',
            detail: `${fileCount} kod dosyasi degisti, review/verify agent'i sevk edilmedi`,
            file: '',
            lesson: 'Kod yazildiginda code-reviewer sevki zorunlu (auto-skill-activation.md)',
            source: 'review-gate-stop',
        }) + '\n');
    } catch { /* fail-silent: iz birakamamak akisi durdurmaz */ }
}

/** Oturum basina tek durtme icin kalici isaret. canavar/scan-cursors ile ayni desen. */
const NUDGE_DIR = join(homedir(), '.claude', 'canavar', 'review-gate-nudged');

function nudgeMarker(sessionId: string): string {
    return join(NUDGE_DIR, `${sessionId.replace(/[^\w-]/g, '_').slice(0, 64)}.marker`);
}

function alreadyNudged(sessionId: string): boolean {
    try {
        return existsSync(nudgeMarker(sessionId));
    } catch {
        return false;
    }
}

function markNudged(sessionId: string): void {
    try {
        if (!existsSync(NUDGE_DIR)) {
            mkdirSync(NUDGE_DIR, { recursive: true });
        }
        appendFileSync(nudgeMarker(sessionId), new Date().toISOString() + '\n');
    } catch { /* fail-silent: isaret birakamamak akisi durdurmaz */ }
}

/**
 * Adaylardan yalnizca git'in KESIN olarak "degismemis" dedigini duser.
 *
 * Neden gerekli: tespit katmani transcript'ten calisir ve yazma HEDEFINI metinden
 * TAHMIN eder. Olculdu: bir .md dosyasi heredoc ile yazilirken govdedeki
 * dokumantasyon prose'u (`backend/utils/trackAnalytics.js`) hedef
 * sanildi -- dosyaya hic dokunulmadigi halde kapi blokladi. TIER 2 fallback'i
 * "yazma sinyali atesledi -> komuttaki ILK kod yolu hedeftir" varsayar ve
 * heredoc GOVDESI ile komutun kendisi arasinda fark gormez.
 *
 * Regex kulesi yogun olculmus/ayarli oldugu icin ona dokunulmuyor; yerine ondan
 * BAGIMSIZ bir gerceklik kontrolu ekleniyor: diskte degismemis bir dosya, hangi
 * regex onu isaret ederse etsin, review edilecek bir diff URETMEZ.
 *
 * FAIL-OPEN yonu bilincli: git konusamazsa (repo degil, git yok, timeout) aday
 * KORUNUR -- kapi bugunku gibi davranir. Yalnizca kanitlanmis-temiz dosya duser,
 * boylece gate hicbir yerde zayiflamaz, sadece yanlis oldugu yerde susar.
 */
function keepActuallyChanged(files: string[]): string[] {
    const kept: string[] = [];
    for (const f of files) {
        let provenClean = false;
        try {
            const abs = isAbsolute(f) ? f : resolve(process.cwd(), f);
            // Repo kokunu dosyanin VAR OLAN en yakin atasindan cozeriz ki
            // silinmis dosya da (git status " D ") dogru repo'ya dussun.
            let dir = dirname(abs);
            while (dir !== dirname(dir) && !existsSync(dir)) {
                dir = dirname(dir);
            }
            const out = execFileSync('git', ['status', '--porcelain', '--', abs], {
                cwd: dir,
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 3000,
            });
            // Bos cikti + exit 0 = git bu yolu tanidi ve temiz buldu.
            provenClean = out.trim() === '';
        } catch {
            provenClean = false; // hukum veremedik -> adayi koru
        }
        if (!provenClean) {
            kept.push(f);
        }
    }
    return kept;
}

function main(): void {
    let raw = '';
    try {
        raw = readFileSync(0, 'utf-8');
    } catch {
        return;
    }
    if (!raw) {
        console.log('{}');
        return;
    }

    let input: StopInput;
    try {
        input = JSON.parse(raw) as StopInput;
    } catch {
        console.log('{}');
        return;
    }

    if (input.hook_event_name !== 'Stop' || !input.transcript_path) {
        console.log('{}');
        return;
    }

    let scan: ScanResult;
    try {
        if (!existsSync(input.transcript_path)) {
            console.log('{}');
            return;
        }
        if (statSync(input.transcript_path).size > MAX_TRANSCRIPT_BYTES) {
            console.log('{}');
            return;
        }
        scan = scanTranscript(input.transcript_path);
    } catch {
        // Tarama patladi -> asla bloklama
        console.log('{}');
        return;
    }

    if (scan.files.length === 0 || scan.reviewers.length > 0) {
        console.log('{}');
        return;
    }

    // Gerceklik kapisi: transcript "yazildi" dese bile diskte degismemis bir
    // dosya review edilecek diff uretmez.
    const changed = keepActuallyChanged(scan.files);
    if (changed.length === 0) {
        console.log('{}');
        return;
    }

    // Kacis yolu 1: ayni continuation icinde ikinci gecis.
    if (input.stop_hook_active === true) {
        recordEvasion(input.session_id || 'unknown', changed.length);
        console.log('{}');
        return;
    }

    // Kacis yolu 2: stop_hook_active YALNIZ tek bir continuation boyunca true
    // kalir -- kullanici yeni mesaj yazinca sifirlanir. Bu yuzden "bu kapi bir
    // kez durtur, ikinci kez bloklamaz" sozu tutulmuyordu: ayni oturumda ust
    // uste blokladi (olculdu). Oturum basina kalici isaret bunu kapatir.
    const sid = input.session_id || 'unknown';
    if (alreadyNudged(sid)) {
        recordEvasion(sid, changed.length);
        console.log('{}');
        return;
    }
    markNudged(sid);

    const shown = changed.slice(0, MAX_FILES_IN_MESSAGE);
    const rest = changed.length - shown.length;
    const fileList = shown.map(f => `  - ${f}`).join('\n')
        + (rest > 0 ? `\n  - ... (+${rest} dosya daha)` : '');

    console.log(JSON.stringify({
        decision: 'block',
        reason: [
            `Bu oturumda ${changed.length} kod dosyasi degisti ama hicbir review/verify agent'i sevk edilmedi.`,
            '',
            'Degisen dosyalar:',
            fileList,
            '',
            'Yapilacak: `code-reviewer` sevk et (auto-skill-activation.md -- kod yazildi -> review OTOMATIK).',
            'Is tamamlandiysa `verifier` de calistir (build + test + lint + type check).',
            'Auth/user-input/API/hassas veri dokunulduysa `security-reviewer` ekle.',
            '',
            'Agent sevki kalici onaylidir (CLAUDE.md STANDING AUTHORIZATION) -- izin isteme, sevk et.',
            'Review gercekten gerekmiyorsa tekrar durabilirsin; bu kapi bir kez durtur, ikinci kez bloklamaz.',
        ].join('\n'),
    }));
}

main();
