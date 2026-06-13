# Sweep #10 — Dependency / Supply-Chain Audit (issue #107, ROUND 2)

Read-only re-audit of `orbit-ui-mobile` (npm workspaces) + `orbit-api` (NuGet) after round-1 fixes. Commands run: `npm audit --json` (root/prod + `--omit=dev`), `dotnet list package --vulnerable --include-transitive`, `--outdated`, `--deprecated`, plus a full evidence-gated usage scan (source + ALL configs + scripts + CI) for every declared dependency, and git-history forensics on new candidates. Triage register (`triage-round-1.md`) + round-1 report (`round-1/10-deps.md`) read first; DEF-3/4/5/6/7 deferrals are NOT reported.

## Findings (still-open, non-deferred)

`LOW · @next/env (apps/web, prod dependencies) · zero source/config/CI usage; redundant — next@16.2.7 already pulls @next/env@16.2.7 transitively; NOT in any overrides block (so not a DEF-3 resolver pin); added as collateral in commit 3baf1cb's web-proxy migration and never wired up (the only historical hit was a .next build-cache .tsbuildinfo artifact, not real code) · remove the @next/env line from apps/web/package.json`

Evidence detail for the one finding:
- Declared at `apps/web/package.json:19` as `"@next/env": "^16.2.2"` in plain `dependencies` (not `overrides`/resolutions).
- `git grep "next/env"` over `apps/web/**/*.ts(x)` (excluding `.next/`) at HEAD: zero hits. Not referenced in `next.config.ts`, `proxy.ts`, `vitest.config.ts`, or any middleware/instrumentation.
- Lockfile: `next` → `dependencies["@next/env"] = 16.2.7`. The direct declaration is fully redundant; deleting it does not change the resolved tree.
- `git log -S'@next/env' -- apps/web/package.json` → added in `3baf1cb` ("chore: upgrade dependencies and migrate web proxy"). It was NOT a direct dep in the initial scaffold (`1100e15`) and was never imported in source. Distinct from the DEF-3 RN hoisting-pin family (those are root-`devDependencies`/override-position pins for React Native transitives npm drops; `@next/env` is a Next.js web runtime dep in normal `dependencies` position).

## Round-1 fixes verified (confirmed-fixed — do NOT re-report)

npm:
- **`underscore` HIGH — RESOLVED.** Root + mobile `overrides: { "underscore": "^1.13.8" }` present; `npm audit` (prod and `--omit=dev`) now reports `high: 0`, and `underscore` no longer appears in the audit tree at all.
- **~22 dead web/mobile deps — REMOVED** (landed in `a2ef611`). Zero source/config/CI hits for any of: the 10 `@radix-ui/*`, `vaul`, `react-day-picker`, `class-variance-authority`/`clsx`/`tailwind-merge`, `idb`/`@tanstack/query-sync-storage-persister`/`@tanstack/react-query-persist-client`, `intl-messageformat`/`@formatjs/fast-memoize`, mobile `fs-extra`, `@types/dompurify`, `@eslint/eslintrc`. Current `apps/web` dependency list is clean.
- **`react-test-renderer` → dev — DONE.** Now in `apps/web` `devDependencies` (line 53); no longer in prod `dependencies`.

dotnet (orbit-api):
- **FileSignatures 6.1.1 → 7.2.1 — DONE; OpenMcdf vuln cleared.** `dotnet list package --vulnerable --include-transitive` reports ZERO vulnerable packages across all 8 projects (OpenMcdf now ≥3.1.4 via FileSignatures 7.2.1; NU1902 gone).
- **JWT patch bumps — DONE.** `Microsoft.IdentityModel.JsonWebTokens` 8.19.1, `Microsoft.AspNetCore.Authentication.JwtBearer` 10.0.9. No longer flagged.
- **coverlet / Test.Sdk majors — DONE.** `coverlet.collector` 10.0.1, `Microsoft.NET.Test.Sdk` 18.6.0 across all 3 test projects.

## Re-confirmed clean (no new issues)

- **npm advisories:** 0 critical / 0 high / 12 moderate (prod and `--omit=dev` identical). All 12 moderates map to justified deferrals: 10 = expo cluster (`@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/local-build-cache-provider`, `@expo/metro-config`, `@expo/prebuild-config`, `expo`, `expo-constants`, `uuid`, `xcode`) = **DEF-4**; 2 = `next`/`postcss` = **DEF-5**. No new, non-deferred advisory.
- **dotnet vulnerable:** ZERO across all projects.
- **dotnet deprecated:** only `xunit 2.9.3` (Legacy) in the 3 test projects = **DEF-7**. Nothing else.
- **dotnet outdated:** `Stripe.net 50.4.1 → 52.0.0` = **DEF-6**. Remaining are no-advisory patch-train minors (the 10.0.x lag on OpenApi/EFCore/EFCore.Design/Caching/Http/Npgsql; OpenAI 2.8→2.11; MediatR 14.0→14.1; BCrypt 4.1→4.2; ModelContextProtocol 1.2→1.4; Scalar; Google.Apis.Calendar; FluentAssertions; xunit.runner.visualstudio) — round-1 policy explicitly omits patch-train minors; not security-relevant. `Microsoft.CodeAnalysis.CSharp.Workspaces 4.8.0 → 5.3.0` remains open (no advisory, dev-only netstandard2.0 analyzer, major may be host-constrained) — same disposition round-1 gave it; not escalated.
- **New unused deps (evidence-gated, both repos):** full per-dependency usage sweep across all four manifests. Only `@next/env` came back unused (reported above). Every other non-exempt dep confirmed used in source/config/CI. DEF-3 pins (`react-native-worklets`, `hermes-compiler`, `memoize-one`, `promise`, `regenerator-runtime`, expo overrides matrix) and the root resolver-hoisting family (`@swc/helpers`, `fdir`, `html-parse-stringify`, `indent-string`, `min-indent`) re-confirmed still present and exempt. `@parcel/watcher`, `@testing-library/dom`, `@vitest/coverage-v8`, `@rolldown/binding-*` channels unchanged. Zero unused NuGet PackageReferences.
- **Duplicate-purpose deps:** none new. The round-1 vestigial clusters are gone; remaining single-library-per-job holds.

## Verdict

**1 finding: 0 HIGH · 0 MED · 1 LOW.**
(npm advisories: 0 new non-deferred — underscore HIGH resolved, all 12 moderates = DEF-4/DEF-5. dotnet: 0 vulnerable, 0 new outdated/deprecated beyond DEF-6/DEF-7. Unused deps: 1 LOW new — `@next/env`. 0 unused NuGet. 0 duplicate-purpose. All round-1 fixes verified landed.)
