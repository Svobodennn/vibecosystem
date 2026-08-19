# Worktree Handoff — Codex

Codex custom subagent roster'i otomatik olarak ayri git worktree'sinde calismaz. Bu nedenle canonical Claude worktree protokolunu mirror agent'lara uygulama ve var olmayan izole branch/commit iddiasi uretme.

## Runtime kontrolu

1. `git worktree list` ile gercek worktree'leri oku.
2. Parent veya kullanici acikca worktree olusturmadiysa tum roller ayni calisma agacini paylasiyor kabul edilir.
3. Agent finalinde worktree handoff bekleme; gercek diff'i ana calisma agacinda `git status` ve `git diff` ile dogrula.
4. Agent kendi kendine commit/merge/worktree prune yapmaz. Bu git mutation'lari icin kullanicidan ayri onay gerekir.
5. Acikca olusturulmus worktree varsa branch, path, commit ve uncommitted diff gercek komutlarla dogrulanir; veri ana dala alinmadan prune/remove yapilmaz.

Leaf-agent sozlesmesi geregi mirror agent baska agent veya worktree olusturmaz; ihtiyaci parent'a bildirir.
