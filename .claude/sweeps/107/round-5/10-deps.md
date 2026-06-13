# Sweep #10 — Dependency / Supply-Chain Audit, issue #107 ROUND 5 (final verification)

Read-only. Commands run: `npm audit --omit=dev --json`, `npm ls underscore`, `dotnet list package --vulnerable --include-transitive`. Baselines: ui-mobile `3520d10`, orbit-api `fcfdc95`. Round-3 report + DEF registers read first; DEF-1 (version-pin matrix), DEF-4/5/6/7 NOT reported.

## No dependency manifest changed in round-4 — round-3 ZERO carries forward

- `git diff --name-only 6399d00 3520d10 -- '**/package.json' package.json package-lock.json` is EMPTY — round-4 (`3520d10`) was a pure source refactor, no npm dep added/removed/bumped.
- `git diff --name-only dec5bcc fcfdc95 -- '**/*.csproj' Directory.Packages.props` is EMPTY — the round-4 API commit changed no NuGet references.

So the round-3 deps verdict (ZERO FINDINGS) is structurally unchanged. Re-verified the round-3 resolutions still hold:

- **`underscore` HIGH — RESOLVED (re-confirmed, with a correction to the round-3 wording).** The round-3 report said "underscore absent from the tree" — that is imprecise. `npm ls underscore` shows underscore IS in the tree: `sp-react-native-in-app-updates@1.5.0` (a live mobile dep, `apps/mobile/package.json:80`) transitively requires the **vulnerable** `underscore@1.12.1`, and the deliberate direct pin `apps/mobile/package.json:81 "underscore": "^1.13.8"` + the `overrides` entries (root `package.json:68`, mobile `package.json:111`) force npm to dedupe to the SAFE `underscore@1.13.8` (npm annotates the requested 1.12.1 as `invalid` / overridden). `npm audit --omit=dev` reports `high: 0` and surfaces no underscore advisory. This is exactly D14's prescribed fix working correctly — the direct entry is the override-anchor, NOT a dead dependency. **Not a finding.**
- **`@next/env` — REMOVED (re-confirmed).** Absent from `apps/web/package.json` dependencies; still pulled transitively by `next`. RESOLVED.
- **~22 dead web/mobile deps — still REMOVED.** The round-1 vestigial radix/vaul/cva/idb/intl-messageformat cluster remains absent.
- **`react-test-renderer` dev-only — re-confirmed** (`apps/web/package.json:52` devDependencies; `apps/mobile/package.json:93` devDependencies).

(Note: round-4 source-level dead-export removals — `useInvalidateSummary`, `claimAdReward`, `getCachedConnectivity`, `buildEmailLogContext`, web-local `highlightText` — are rule-2 cleanups owned by the architecture/tests sweeps, not dependency removals; no package was orphaned by them.)

## Fresh audit results

- **npm advisories (`--omit=dev`):** 0 critical / 0 high / 12 moderate. All 12 map to justified deferrals: 10 = expo build-tooling cluster = **DEF-4**; 2 = `next`/`postcss` = **DEF-5**. No new non-deferred advisory.
- **dotnet vulnerable:** ZERO across all 8 projects (`Orbit.Analyzers`, `Orbit.Api`, `Orbit.Application`, `Orbit.Domain`, `Orbit.Infrastructure`, 3 test projects).
- **dotnet deprecated / outdated (awareness):** only `xunit 2.9.3` (Legacy) = **DEF-7**; `Stripe.net` major = **DEF-6**. Nothing new.

## Verdict

**ZERO FINDINGS.**

No dependency manifest (npm or NuGet) changed in either round-4 commit, so the round-3 deps posture holds unchanged: `underscore` HIGH stays resolved (safe `1.13.8` forced over `sp-react-native-in-app-updates`'s vulnerable `1.12.1` transitive — the direct pin is the working override-anchor, not dead), `@next/env` stays removed, dead deps stay removed; 12 npm moderates = DEF-4/DEF-5; dotnet 0 vulnerable / 0 deprecated-beyond-DEF-7 / 0 outdated-beyond-DEF-6. One wording correction logged: round-3's "underscore absent from the tree" should read "underscore present but force-deduped to the safe version with zero advisory."
