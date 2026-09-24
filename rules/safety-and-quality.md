# Safety & Quality

## Git Kurallari

### Commit Format
```
<type>: <description>
```
Types: feat, fix, refactor, docs, test, chore, perf, ci

### Onay Gerektiren Komutlar (MUTLAKA SOR)
git checkout, git reset, git clean, git stash, git rebase, git merge, git push, git commit

### Guvenli Komutlar (sormadan calistir)
git status, git log, git diff, git branch (list), git show, git blame

### PR Workflow
1. Tum commit history'yi analiz et
2. `git diff [base-branch]...HEAD` ile degisiklikleri gor
3. PR govdesi = SADECE "What & why" (kisa, human). Test-plan/boilerplate YOK, "Generated with Claude" YOK.
   Baslik/commit/branch/issue detaylari: `commit-pr-linear-conventions.md` (authoritative).

## Silme Kurallari (MUTLAKA SOR)

rm, rm -rf, rmdir, unlink → kullaniciya sor, onay bekle.
"Archive" denirse silme, tasI (mv X archive/).

## Security

### Commit Oncesi Kontrol
- [ ] Hardcoded secret yok (API key, password, token)
- [ ] User input valide edilmis
- [ ] SQL injection onlenmis (parameterized query)
- [ ] XSS onlenmis
- [ ] Hata mesajlari hassas veri sizdirmiyor

### Secret Yonetimi
```typescript
// YANLIS
const apiKey = "sk-proj-xxxxx"

// DOGRU
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
```

Security sorunu bulunursa: DURDUR → security-reviewer cagir → CRITICAL duzelt → rotate secrets

## Testing

Test kurali: `testing-policy.md` (ne zaman test yazilir, suite ne zaman kosulur, kirilan test ne olur).
