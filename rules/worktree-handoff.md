# Worktree Handoff Protocol

`isolation: worktree` olan agent'lar izole bir git worktree'sinde calisir.
Yaptiklari degisiklikler ANA calisma dizininde GORUNMEZ. Bu yuzden iki tarafli
bir teslim protokolu ZORUNLU. Aksi halde degisiklik worktree'de strand kalir,
`git worktree prune/remove --force` ile KAYBOLABILIR.

> Gercek olay (2026-06-09): bir worktree agent dosya editledi ama commit etmeden
> dondu. Ana Claude kendi dizininde "hicbir sey degismemis" gordu; worktree'yi
> elle bulup degisiklikleri cekmek zorunda kaldi. Bu protokol o sorunu kapatir.

## Neden Olur

```
Agent → ../wt-xyz (ayri dizin + ayri branch) icinde editledi
      → commit ETMEDEN dondu
Parent → kendi working dir'ine bakti → "degisiklik yok" gordu
       → git worktree list ile worktree'yi bulup elle cekmek zorunda kaldi
```

Harness worktree'yi "degismemisse otomatik siler" — degisiklik VARSA silmez
(veri kaybi olmaz) ama OTOMATIK GERI MERGE DE ETMEZ. Reentegrasyonu agent +
parent yapmali.

## Agent Tarafi (worktree agent'lari)

Her worktree agent, **dosya degistirdiyse** "tamamlandi" demeden ONCE:

```bash
git add -A
git commit -m "<agent>: <kisa ozet>" && echo COMMITTED || echo NO_CHANGES
echo "WORKTREE_BRANCH=$(git branch --show-current)"
echo "WORKTREE_COMMIT=$(git rev-parse HEAD)"
```

Ve cikti ozetinin SONUNA ekler:

```
## WORKTREE HANDOFF
- Branch: <branch adi>
- Commit: <hash>   (veya "degisiklik yoktu")
```

Commit atmadan `TASK STATUS: COMPLETE` demek YASAK.

## Parent Tarafi (Hizir)

Bir worktree agent bitince:

1. Ciktisinda `## WORKTREE HANDOFF` blogunu ara.
2. Commit hash varsa ana working branch'e al — **worktree dizinine girmeden**
   (worktree'ler ayni repo'nun git object store'unu paylasir, hash erisilebilir):
   ```bash
   git merge --no-edit <hash>        # veya: git cherry-pick <hash>
   ```
3. Handoff blogu YOK ama agent "dosya degistirdim" diyorsa → degisiklik strand
   olmus demektir:
   ```bash
   git worktree list                 # worktree dizinini bul
   git -C <worktree-dir> status      # commit'lenmemis degisiklik var mi?
   git -C <worktree-dir> add -A && git -C <worktree-dir> commit -m "recovered: <agent>"
   git merge --no-edit <commit-hash>
   ```
4. Merge edilmemis worktree varken `git worktree prune` / `git worktree remove
   --force` CALISTIRMA — once degisikligin ana dala alindigini dogrula.

## Dogrulama

Worktree agent "tamamlandi" dediginde ama `git log --oneline -1` ana branch'te
beklenen commit'i GOSTERMIYORSA → handoff atlanmis. Yukaridaki parent adim 3'u
uygula. Agent-output-dogrulama-disiplini: "her sey yesil" beyanini ana agacta
`git log` ile teyit et.

## Kapsam

`~/.claude/agents/` icindeki `isolation: worktree` olan tum agent'lar bu
protokole tabidir. website-cloner kendi GIT WORKTREE PROTOKOLU'nu kullanir
(coklu-section merge). Diger worktree agent'larin sonunda "Worktree Handoff
(ZORUNLU)" bolumu vardir.
