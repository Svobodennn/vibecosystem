---
name: changelog-automation
description: Git history'den otomatik changelog, semantic versioning, release notes, conventional commits
---

# Changelog Automation

## Conventional Commits

Commit mesajlari bu formatta olmali:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Type'lar

| Type | Aciklama | SemVer Etkisi |
|------|---------|---------------|
| feat | Yeni ozellik | MINOR |
| fix | Bug fix | PATCH |
| docs | Dokumantasyon | - |
| style | Formatting (kod degisikligi yok) | - |
| refactor | Kod degisikligi (feature/fix degil) | - |
| perf | Performans iyilestirme | PATCH |
| test | Test ekleme/duzeltme | - |
| chore | Build, CI, tooling | - |
| ci | CI/CD degisikligi | - |
| build | Build sistemi degisikligi | - |
| revert | Geri alma | PATCH |

### Breaking Change

```
feat(api)!: remove deprecated endpoints

BREAKING CHANGE: /v1/users endpoint kaldirildi, /v2/users kullanin
```

`!` isareti veya `BREAKING CHANGE:` footer'i = MAJOR versiyon artisi.

## Semantic Versioning (SemVer)

```
MAJOR.MINOR.PATCH

MAJOR: Breaking change (geriye uyumsuz)
MINOR: Yeni ozellik (geriye uyumlu)
PATCH: Bug fix (geriye uyumlu)
```

### Versiyon Artirma Kurallari

```
Commit'lerde BREAKING CHANGE varsa → MAJOR++
Commit'lerde feat varsa → MINOR++
Sadece fix/perf/refactor varsa → PATCH++
Sadece docs/style/test/chore varsa → versiyon artmaz
```

## CHANGELOG.md Formati (Keep a Changelog)

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.2.0] - 2026-03-25

### Added
- Yeni ozellik aciklamasi (#123)

### Changed
- Degisiklik aciklamasi (#124)

### Deprecated
- Kaldirilacak ozellik uyarisi

### Removed
- Kaldirilan ozellik

### Fixed
- Bug fix aciklamasi (#125)

### Security
- Guvenlik duzeltmesi

## [1.1.0] - 2026-03-20

### Added
- ...

[Unreleased]: https://github.com/user/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/user/repo/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/user/repo/releases/tag/v1.1.0
```

### Type -> Section Mapping

| Commit Type | Changelog Section |
|-------------|------------------|
| feat | Added |
| fix | Fixed |
| perf | Changed |
| refactor | Changed |
| docs | - (changelog'a eklenmez) |
| style | - |
| test | - |
| chore | - |
| BREAKING CHANGE | Removed / Changed (breaking note ile) |
| security fix | Security |
| deprecation | Deprecated |

## Changelog Olusturma

### Git Log'dan Changelog

```bash
# Son tag'den bu yana commit'ler
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%s" --no-merges

# Tum tag'ler arasi
git log v1.0.0..v1.1.0 --pretty=format:"- %s (%h)" --no-merges

# Conventional commit parse
git log --pretty=format:"%s" | grep -E "^(feat|fix|refactor|perf|docs|test|chore|ci|build)"
```

### Otomatik Changelog Script

```bash
# Son release'den bu yana degisiklikleri kategorize et
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$LAST_TAG" ]; then
  RANGE="HEAD"
else
  RANGE="${LAST_TAG}..HEAD"
fi

echo "## [Unreleased]"
echo ""

echo "### Added"
git log $RANGE --pretty=format:"- %s" --no-merges | grep "^- feat" | sed 's/^- feat[^:]*: /- /'

echo ""
echo "### Fixed"
git log $RANGE --pretty=format:"- %s" --no-merges | grep "^- fix" | sed 's/^- fix[^:]*: /- /'

echo ""
echo "### Changed"
git log $RANGE --pretty=format:"- %s" --no-merges | grep -E "^- (refactor|perf)" | sed 's/^- [^:]*: /- /'
```

## Release Notes

### GitHub Release Olusturma

```bash
# Changelog'dan release notes
VERSION="v1.2.0"
NOTES=$(cat <<'EOF'
## What's New

### Features
- Feature 1 description
- Feature 2 description

### Bug Fixes
- Fix 1 description

### Breaking Changes
- Breaking change description

**Full Changelog**: https://github.com/user/repo/compare/v1.1.0...v1.2.0
EOF
)

gh release create "$VERSION" --title "$VERSION" --notes "$NOTES"
```

### Pre-release

```bash
gh release create "v2.0.0-beta.1" --prerelease --title "v2.0.0 Beta 1" --notes "..."
```

## CI/CD Entegrasyonu

### GitHub Actions Changelog

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        run: |
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          if [ -n "$PREV_TAG" ]; then
            git log ${PREV_TAG}..HEAD --pretty=format:"- %s" --no-merges > RELEASE_NOTES.md
          fi

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: RELEASE_NOTES.md
```

## Breaking Change Tespiti

```bash
# Breaking change iceren commit'leri bul
git log --pretty=format:"%H %s" | grep -i "breaking\|BREAKING CHANGE\|!"

# feat! veya fix! formatinda
git log --pretty=format:"%s" | grep -E "^(feat|fix|refactor)!"
```

## Changelog Validation

Changelog formatini dogrulama kurallari:
- Her version header'i tarih icermeli: `## [X.Y.Z] - YYYY-MM-DD`
- Section'lar dogru sirayla: Added, Changed, Deprecated, Removed, Fixed, Security
- Bos section olmamali
- Link referanslari dosya sonunda olmali
- Unreleased section en ustte olmali

## Session Changelog Hook

`changelog-on-release.ts` Stop hook'u session sonunda:
- Session'da yapilan commit'leri otomatik toplar
- Conventional commit formatinda parse eder
- Ozet changelog gosterir
