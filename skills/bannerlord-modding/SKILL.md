---
name: bannerlord-modding
description: Mount & Blade II Bannerlord mod development and maintenance knowledge — BUTR toolchain, SubModule.xml, Harmony patching, reference assemblies, multi-version support, build/deploy/BLSE, and version-porting. Activate for any Bannerlord (.NET/C#) mod work.
---

# Bannerlord Modding

Knowledge pack for Mount & Blade II: Bannerlord mod development and maintenance. Pairs with the `bannerlord-expert` agent.

## When to Activate

- Building, porting, or debugging a Bannerlord mod (C#/.NET)
- Adding support for a new game version
- Writing Harmony patches, campaign behaviors/models, Gauntlet UI, or MCM settings
- Diagnosing "builds but crashes / won't load" issues
- Contributing to a Bannerlord mod repo (fork/PR)

## Core principle: method over API

Bannerlord's TaleWorlds API changes **every game version**. Never bake specific API signatures into memory — they rot. The ground truth is **that version's reference assemblies**. Teach/act on *how to find the truth* (compile against reference assemblies, use the analyzer, inspect the DLLs), not a snapshot of the API.

## Primary sources (feed the knowledge here)

**Authoritative — the toolchain (BUTR = Bannerlord Unofficial Tools & Resources):**
- `github.com/BUTR` — the whole ecosystem org. Key repos/packages:
  - **Bannerlord.BUTRModule.Sdk** — modern MSBuild SDK (handles ReferenceAssemblies, SubModule.xml gen, ModuleLoader, deploy).
  - **Bannerlord.BuildResources** — classic build helpers (props/targets, SubModule substitution, deploy to `Modules/`).
  - **Bannerlord.ReferenceAssemblies** — per-version TaleWorlds assemblies on NuGet (`Bannerlord.ReferenceAssemblies.Core/.Native/.Sandbox/.StoryMode`, versioned like `1.4.5.*`). This is the API ground truth per version.
  - **BUTR.Harmony.Analyzer** — Roslyn analyzer that validates Harmony patch targets at compile time (`BHA0001`).
  - **Bannerlord.ButterLib**, **Bannerlord.UIExtenderEx**, **Bannerlord.MCM** (aka MBOptionScreen), **Bannerlord.ModuleLoader**, **BLSE** (Bannerlord Software Extender / launcher).
  - **Bannerlord.XmlSchemas** — `SubModule.xsd` (schema for SubModule.xml): `raw.githubusercontent.com/BUTR/Bannerlord.XmlSchemas/master/SubModule.xsd`.
- **Harmony** — `harmony.pardeike.net` (patching library docs: prefix/postfix/transpiler, AccessTools).
- **TaleWorlds official modding docs** + the community modding wiki/Discord — WebSearch for the current URL each time (they move); don't hardcode.
- **Reference implementations** (well-maintained example repos): a manual-BUTR-props mod (e.g. Diplomacy) and a BUTR-SDK mod (e.g. XPTweaks/CharacterCreation). Read these to learn conventions.

> To bulk-ingest BUTR docs / the modding wiki into this skill, run the `harvest` agent (deep doc crawl) and append distilled notes here.

## Build system variants

| Variant | Tell | References resolve via | Builds without game? |
|---|---|---|---|
| BUTR SDK | `<Project Sdk="Bannerlord.BUTRModule.Sdk/x">` | NuGet ReferenceAssemblies | Yes |
| Classic props | `Bannerlord.BuildResources` + `common.props/.targets` | NuGet RA or `$(GameFolder)` | Usually yes |
| Raw HintPath | `<Reference ...$(GameFolder)\bin\...\TaleWorlds.*.dll>` | Actual game install | **No — game required** |

- NuGet ReferenceAssemblies → builds anywhere; this IS the version-compat test.
- HintPath → `$(GameFolder)` → needs the game; missing game = `CS0246 'TaleWorlds' not found` (environment issue, not an API break — diagnose correctly).
- `BUTR.Harmony.Analyzer` present → patch targets checked at compile. Clean build ⇒ patches valid for that version. Absent → breaks only surface at runtime.

## Multi-version support

- `supported-game-versions.txt` — one game version per line; the build produces **one DLL per line** (`ModuleName.<ver>.dll`), each compiled against its own reference assemblies.
- `Bannerlord.ModuleLoader` picks, at runtime, the highest DLL ≤ the running game version.
- Classic `common.props` reads it: line 1 = Beta, line 2 = Stable, last line = Minimal. Order matters.
- Adding a version = adding a line. This only triggers a build attempt — you must still prove it compiles AND runs.
- **Claim only what you tested.** Declaring 8 versions but testing 1 → be explicit in the PR.

## Dependencies + load order

`BLSE → Harmony → ButterLib → UIExtenderEx → MCM (MBOptionScreen) → (Native / SandBoxCore / SandBox / StoryMode / CustomBattle) → your mod`

- Package (compile) version ≠ in-game module (runtime) version. `SubModule.xml`'s `DependedModule DependentVersion` is the runtime requirement.
- Install deps via Vortex/Nexus; enable in the launcher with correct order (BLSE "Auto Sort" handles it).

## Build / deploy gotchas (hard-won)

```
- Default VS config builds the "Minimal"/wrong game version → pass -p:OverrideGameVersion=vX.Y.Z.
- `-c Release` alone assumes "Any CPU"; projects are x64 → add -p:Platform=x64,
  else "project skipped" (MSB4121), NOTHING builds, and it lies "succeeded" in ~0.2s (false green).
- GameFolder path must be EXACT (Steam: ...\steamapps\common\Mount & Blade II Bannerlord — don't drop "common").
  Quote the whole arg for spaces + &:  "-p:GameFolder=D:\...\Mount & Blade II Bannerlord".
- Build deploys to $(GameFolder)\Modules\<ModuleId>\ ONLY if GameFolder resolves to a real path; else it just fills project bin\.
- ALWAYS verify deploy: Modules\<ModuleId>\SubModule.xml + bin\Win64_Shipping_Client\<Mod>.<ver>.dll must exist.
- Test via the BLSE launcher, NOT Visual Studio F5. F5 launches Bannerlord.exe under the debugger without BLSE
  → native crash (0xC0000005 in TaleWorlds.Native.dll). It's the launch method, not your code.
- net472 = Win64_Shipping_Client (Steam/GOG/Epic); net6 = Gaming.Desktop.x64_Shipping_Client (Xbox/Game Pass).
```

## "Compiles" ≠ "works"

Compiling against reference assemblies proves only the **API surface** exists. It does NOT prove: runtime patch binding (esp. string/reflection targets), unchanged method *behavior*, **Gauntlet UI / prefab layout** compatibility (UI mods break here and compile never sees it), save/crash safety. After any green build, require in-game verification.

## Contribution workflow

- Using a mod locally needs no fork — build → copy/deploy to `Modules/`.
- Contributing: `gh repo fork`, push a `support-x.y.z` branch, open a PR. Base = the repo's default (often `dev` or `master` — check).
- Honest testing claims only (tested version + feature). Don't overclaim a range.
- Keep personal artifacts OUT of upstream: `build_all.sh` (hardcoded paths), `dist/`, `build-temp/` → local `.git/info/exclude`, not the project `.gitignore`.
- Clean commits, English, no AI/co-author trailer unless asked. One topic = one commit (squash + `--force-with-lease` if needed).

## Keeping this current

When a new game version ships or the toolchain updates: re-derive API facts from the new reference assemblies (don't trust old notes), bump the version in `supported-game-versions.txt` / `SubModule.xml`, rebuild, verify in-game, then update dependency versions (Harmony/ButterLib/UIExtenderEx/MCM) to their 1.x-compatible releases.

---

## Harvested reference (crawled 2026-07-21)

### Toolchain — build-time NuGet packages

| Package | What it does |
|---|---|
| `Bannerlord.ReferenceAssemblies` (+ `.Core`, `.StoryMode`, `.Sandbox`, …) | Metadata-only per-version copies of TaleWorlds DLLs. Compile against a game version without shipping game binaries. Pick the version matching your target build. |
| `Bannerlord.BuildResources` / `Bannerlord.BUTRModule.Sdk` / `Bannerlord.DataModule.Sdk` | MSBuild props/targets/SDK: inject SubModule.xml metadata, add IsStable/IsBeta/IsDebug config flags, auto-copy the module to the game `/Modules`. SDK = modern `<Project Sdk="…">`; BuildResources = classic props-import. **All publish from the same `Bannerlord.BuildResources` repo** (no separate BUTRModule.Sdk repo). |
| `BUTR.Harmony.Analyzer` | Roslyn analyzer: statically checks `AccessTools.*` string lookups against real metadata → catches renamed/moved members at compile time. |
| `Bannerlord.Module.Template` (`dotnet new blmodfx`/`blmodsdk`) | Scaffolds a new mod (auto-copy, SubModule templating, ModuleLoader/BLSE wiring). |
| `Bannerlord.XmlSchemas` | XSDs for SubModule.xml, language files, MCMv5 settings — IDE validation. |
| `Bannerlord.ModuleLoader` + `.Injector` | Source-generator loader: one module ships multiple per-version DLLs, picks the right one at runtime via `LoaderFilter`. |

### Toolchain — runtime modules (load order)

`Bannerlord.Harmony` (first — shared 0Harmony.dll) → `Bannerlord.ButterLib` (utilities, save helpers, DI, logging) → `Bannerlord.UIExtenderEx` (conflict-free Gauntlet UI patching) → `Bannerlord.MCM` (config menu; source at **Aragas/Bannerlord.MBOptionScreen**, NOT under BUTR org) → your mod. `BLSE` is the launcher (not a dependency-graph module): assembly-resolution fixes, crash reports, metadata-aware load-order sorting.

### Current versions (verified NuGet/GitHub, 2026-07-21)

| Package | Latest | Note |
|---|---|---|
| Lib.Harmony (dev NuGet) | 2.4.2 | |
| Bannerlord.Harmony (module) | 2.4.2.225 | bundles Harmony 2.4.2.0 |
| Bannerlord.ButterLib | 2.11.0 | |
| Bannerlord.UIExtenderEx | 2.13.2 | |
| Bannerlord.MCM | 5.12.1 | |
| Bannerlord.BLSE | 1.6.7 | |
| Bannerlord.BuildResources / BUTRModule.Sdk | 1.1.0.129 | |
| Bannerlord.ModuleLoader.Injector | 1.0.1.50 | stale-ish (2025-02) |
| BUTR.Harmony.Analyzer | 1.0.1.50 | **stale (2023-06) — verify before relying** |
| Bannerlord.ReferenceAssemblies(.Core) | 1.4.7.117484 | tracks game **v1.4.7** (current line) |

> Game is currently on **v1.4.7** (apidoc.bannerlord.com + reference-assemblies corroborate). READMEs' inline version snippets LAG reality — always check NuGet.org, not the README.

### Project setup

- **SubModule.xml required:** `Name`, `Id`, `Version`, SP/MP flags, `DependedModules` (hard deps — block load), `SubModuleClassType` (FQN of `MBSubModuleBase` subclass), `DLLName`.
- **`DependedModuleMetadatas`** (BLSE soft/ordering deps): `order` = `LoadBeforeThis`/`LoadAfterThis`; optional `version` (`e1.4.3.*`), `optional`, `incompatible`.
- **ModuleLoader multi-version SubModule block** uses `<Tag key="LoaderFilter" value="$moduleid$.*.dll" />` + the `.Injector` package (C#9 source gen) to ship per-version DLLs in one module.
- **Folder layout:** `Modules/<Mod>/` → `SubModule.xml` (only mandatory) + `bin/Win64_Shipping_Client/` (Steam/GOG/Epic) or `bin/Gaming.Desktop.x64_Shipping_Client/` (Xbox GP) + optional `ModuleData/`, `GUI/Prefabs|Brushes/`, `AssetPackages/` (.tpac), `SceneObj/`.

### Common patterns

- **Campaign behavior:** `campaignStarter.AddBehavior(new X())`; subclass `CampaignBehaviorBase`, `RegisterEvents()` + `SyncData(IDataStore)`. Custom save types → `SaveableTypeDefiner` (reflection-discovered) OR ButterLib `SyncDataAsJson<T>` (less boilerplate, safer on mod removal).
- **GameModel override:** DECORATOR pattern — find existing model in `gameStarter.Models`, wrap it, `AddModel(new Custom(existing))`. Direct `AddModel` = last-mod-wins, silently clobbers others.
- **UIExtenderEx:** `UIExtender.Create("Mod")` → `.Register(assembly)` → `.Enable()` in `OnSubModuleLoad`; `[PrefabExtension(movie, xpath)]` + `[ViewModelMixin]`/`BaseViewModelMixin<VM>`. (Globally disables precompiled "AutoGens" prefabs by design.)
- **Harmony:** static patch methods; `Prefix`/`Postfix`/`Transpiler`/`Finalizer`; params `__instance`/`__result`/`__state`; `TargetMethod(s)`/`Prepare`/`Cleanup`; order undefined → `[HarmonyPriority]`; use `AccessTools.*` for reflection. Prefer Postfix/Transpiler over full replacement (composes across mods).
- **Finding current API (method not memory):** decompile the matching ReferenceAssemblies/game DLL (dnSpy/ILSpy) → cross-check `apidoc.bannerlord.com` (versioned) → let BUTR.Harmony.Analyzer flag stale `AccessTools` strings at compile.

### Gotchas
- README version snippets lag latest — verify on NuGet.
- Steam=`Win64_Shipping_Client`, Xbox GP=`Gaming.Desktop.x64_Shipping_Client`; ship both or it won't be found.
- UIExtenderEx disables AutoGens globally (explains odd UI behavior; by design).
- UI-override mods must load BEFORE the official module they patch (official docs discourage `DependedModules` for UI-only overrides).
- Save data via `SaveableTypeDefiner`/`SyncData<T>` is permanent → removing the mod can corrupt saves (ButterLib `SyncDataAsJson` mitigates).
- `github.com/BUTR/Bannerlord.MCM` is 404 → source is `Aragas/Bannerlord.MBOptionScreen`.
- Nexus returns 403 to automated fetches — use GitHub/NuGet as machine-readable sources.

### Key sources
- BUTR org: github.com/BUTR (Harmony, ButterLib, UIExtenderEx, BLSE, BuildResources, ReferenceAssemblies, ModuleLoader, XmlSchemas, Module.Template) · MCM: github.com/Aragas/Bannerlord.MBOptionScreen
- Harmony: harmony.pardeike.net/articles/ (patching, annotations, priorities)
- Docs: docs.bannerlordmodding.com (community) · moddocs.bannerlord.com (official) · apidoc.bannerlord.com (versioned API ref) · docs.bannerlordmodding.lt (model/UIExtenderEx walkthroughs)
- ButterLib SaveSystem: github.com/BUTR/Bannerlord.ButterLib/blob/dev/docs/articles/SaveSystem/Overview.md
- Gaps: Nexus (403, uncrawlable); UIExtenderEx v1 quickstart not directly fetched (v2 shape corroborated by 2 sources).
