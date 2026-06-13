# Sweep 10 — Dependency / Supply-Chain Audit (ROUND 3, verification)

Read-only verification pass. Commands run: `npm audit --json` (root) + `npm audit --omit=dev --json` (prod), `dotnet list package --vulnerable --include-transitive`, `--deprecated`, plus targeted manifest checks. Baselines: ui-mobile 6399d00, api dec5bcc. Round-2 report + round-3 deferral registers read first; DEF-3/4/5/6/7 NOT reported.

## Round-2 fixes verified RESOLVED (do not re-report)

npm:
- **`@next/env` (the sole round-2 LOW) — REMOVED.** `apps/web/package.json` `dependencies` (lines 14–38) no longer lists `@next/env`; `next@^16.2.2` still pulls it transitively. RESOLVED.
- **`underscore` HIGH — RESOLVED (re-confirmed).** `npm audit` reports `high: 0` (root and `--omit=dev`); `underscore` absent from the tree.
- **~22 dead web/mobile deps — REMOVED (re-confirmed).** Current `apps/web` dependency list is clean (dnd-kit, hookform/resolvers, supabase, tanstack, vercel analytics/speed-insights, date-fns, dompurify, lucide-react, marked, motion, next, next-intl, react/-dom, react-hook-form, sonner, zod, zustand, @parcel/watcher). None of the round-1 vestigial radix/vaul/cva/idb/intl-messageformat cluster present.
- **`react-test-renderer` → dev — DONE (re-confirmed).** Now in `apps/web` `devDependencies` (line 52).

dotnet (orbit-api):
- **FileSignatures 7.2.1 / OpenMcdf cleared, JWT bumps, coverlet/Test.Sdk majors — DONE.** `dotnet list package --vulnerable --include-transitive` reports ZERO vulnerable packages across all 8 projects.

## Fresh audit results

- **npm advisories:** 0 critical / 0 HIGH / 12 moderate (prod and `--omit=dev` identical). All 12 moderates map to justified deferrals: 10 = expo cluster = **DEF-4**; 2 = `next`/`postcss` = **DEF-5**. No new non-deferred advisory.
- **dotnet vulnerable:** ZERO across all 8 projects (`Orbit.Analyzers`, `Orbit.Api`, `Orbit.Application`, `Orbit.Domain`, `Orbit.Infrastructure`, and the 3 test projects), as expected.
- **dotnet deprecated:** only `xunit 2.9.3` (Legacy) in the 3 test projects = **DEF-7**. Nothing else.
- **dotnet outdated (awareness only):** `Stripe.net 50.4.1` (→52 = **DEF-6**, not flagged). No new non-deferred outdated.

## Verdict

ZERO FINDINGS

(npm: underscore HIGH stays resolved, the round-2 `@next/env` LOW is now removed, all 12 moderates = DEF-4/DEF-5. dotnet: 0 vulnerable across all projects, 0 deprecated beyond DEF-7, 0 outdated beyond DEF-6. No new unused or duplicate-purpose deps. Every round-2 fix verified landed.)
