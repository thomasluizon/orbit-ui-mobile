# Sweep #10 — Dependency / Supply-Chain Audit (issue #107, round 1)

Read-only audit of `orbit-ui-mobile` (npm workspaces) + `orbit-api` (NuGet). Commands run: `npm audit` (full + `--omit=dev`), `npm ls`, `dotnet list package --vulnerable [--include-transitive] / --outdated / --deprecated`, `dotnet nuget why`, plus a full-repo usage scan (1080 source/config files) for every declared dependency in all four package.jsons and every PackageReference in all eight csprojs.

## 1. npm advisories (root audit = prod audit: 0 critical, 2 high, 12 moderate, 0 low)

- **HIGH · underscore@1.12.1 (apps/mobile, transitive via sp-react-native-in-app-updates@1.5.0 — direct dep)** · GHSA-qpx9-hpmf-5gmw, unlimited recursion in `_.flatten`/`_.isEqual` (DoS, CVSS 5.9). Patched in underscore **1.13.8**, but sp-react-native-in-app-updates pins `"underscore": "1.12.1"` **exactly**, so `npm audit fix` can't resolve it — npm's only computed "fix" is a major downgrade to sp@1.0.0 (don't). · **Fix (non-breaking): add root `overrides: { "underscore": "^1.13.8" }`** (usage in the lib is basic API, 1.12→1.13 is compatible); optionally PR the bump upstream. The second "high" line in npm's count is sp-react-native-in-app-updates itself (same root cause, not a separate issue).
- **MED · expo cluster — 10 of the 12 moderates (apps/mobile)**: expo@55.0.12, @expo/cli, @expo/config, @expo/config-plugins, @expo/local-build-cache-provider, @expo/metro-config, @expo/prebuild-config, expo-constants, xcode, uuid@7.0.3 (GHSA-w5hq-g745-h8pq, buffer bounds, fixed 11.1.1) + nested postcss@8.4.49 in @expo/metro-config. All build-/prebuild-time tooling, not app runtime (xcode/uuid path is iOS prebuild tooling — app is Android-only). · **Fix: npm reports `expo@55.0.26` as a non-major fix for the whole cluster** — bump the deliberate expo pin matrix (root `overrides` + apps/mobile) from the 55.0.12 line to the 55.0.26 line, same SDK 55 / RN 0.83 ABI. DEF-3 pin choices are not the finding; the advisories are. Re-run the release guard after bumping.
- **MED · postcss@8.4.31 nested in next@16.2.7 (apps/web, transitive)** · GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in stringified CSS output (<8.5.10, CVSS 6.1). No fixed stable `next` release yet (vulnerable range extends through 16.3.0-canary.5; npm's only computed fix is a nonsense major downgrade to 9.3.3). Practical exposure is low: postcss runs at build over the app's own stylesheets, not user content. · **Fix: none non-breaking today — pick up the next `next` patch that bumps its vendored postcss ≥ 8.5.10.**

MODERATE/LOW counts: 12 moderate (10 fixable via the expo 55.0.26 bump — trivial; 2 = next/postcss pair, blocked on upstream), 0 low, 0 critical. `--omit=dev` audit is identical — all advisories sit in prod dependency trees.

## 2. dotnet (orbit-api)

### Vulnerable
- **MED · OpenMcdf 2.3.1 (transitive; Orbit.Infrastructure → FileSignatures 6.1.1 → OpenMcdf — confirmed via `dotnet nuget why`; surfaces in Orbit.Api + both downstream test projects, emits NU1902 on every build)** · two moderate advisories, both infinite-loop DoS on crafted CFB (compound file) input: GHSA-jxpf-xq2m-q525 (fixed 3.1.3) and GHSA-5qwm-7pvp-w988 / CVE-2026-45785 (fixed 3.1.4). Reachable surface: `Orbit.Infrastructure/Services/ImageValidationService.cs` runs FileSignatures' inspector over **user-uploaded files**, so a crafted upload is the attack vector. · **Fix: upgrade FileSignatures 6.1.1 → 7.2.1 (major; released 2026)** — verified on nuget.org that 7.2.1 depends on **OpenMcdf >= 3.1.4** (both advisories patched). Clears the NU1902 build warnings too.

### Outdated (majors / security-relevant only — patch-train minors omitted)
- LOW · Stripe.net 50.4.1 → 52.0.0 (Orbit.Application + Orbit.Infrastructure) — two majors behind on the payment surface; no advisory, upgrade deliberately (Stripe majors track API versions).
- LOW · auth-stack patch lag: Microsoft.IdentityModel.JsonWebTokens 8.15.0 → 8.19.1 and Microsoft.AspNetCore.Authentication.JwtBearer 10.0.2 → 10.0.9 (EFCore/OpenApi/EFCore.Design sit on the same 10.0.x train at 10.0.2). No active advisories on installed versions; flagged only because it's the token-validation surface.
- LOW · dev/test-only majors: coverlet.collector 6.0.4 → 10.0.1, Microsoft.NET.Test.Sdk 17.14.1 → 18.6.0 (all 3 test projects); Microsoft.CodeAnalysis.CSharp.Workspaces 4.8.0 → 5.3.0 (Orbit.Analyzers, netstandard2.0 analyzer — major bump may be constrained by analyzer host). FileSignatures 6.1.1 → 7.2.1 covered above.

### Deprecated
- LOW · xunit 2.9.3 — "Legacy", alternative xunit.v3 (Orbit.Application.Tests, Orbit.Domain.Tests, Orbit.Infrastructure.Tests). Informational; migration is a deliberate test-stack change.

### Unused csproj packages
None. Every PackageReference verified in source: FileSignatures (ImageValidationService), FirebaseAdmin/FirebaseMessaging + Lib.Net.Http.WebPush/PushServiceClient (PushNotificationService), Google.Apis.AndroidPublisher.v3 (GooglePlayBillingService), Google.Apis.Calendar.v3 (GoogleCalendarEventFetcher), OpenAI, Stripe.net (StripeBillingService/StripeCouponRewardService + Application), JwtBearer/JsonWebTokens/Npgsql (ServiceCollectionExtensions), BCrypt.Net-Next (ApiKey.cs, ApiKeyAuthenticationHandler), MediatR/FluentValidation (throughout), Caching.Abstractions (IMemoryCache in UserDateService/AppConfigService/auth commands), Extensions.Http (IHttpClientFactory in GoogleAuthCommand/GoogleTokenService/ResendEmailService), ModelContextProtocol(+AspNetCore) (Mcp/Tools/*), Scalar.AspNetCore (MapScalarApiReference), MS.AspNetCore.OpenApi (AddOpenApi), EFCore.Design (design-time `dotnet ef` channel, PrivateAssets).

## 3. Unused npm dependencies (evidence-gated: zero hits across all source, configs, scripts, CI in the whole repo; only their own package.json line matches)

The web redesign (#163/PR #164) removed the shadcn/radix layer but its dependency tree was left behind:

- **MED · @radix-ui/react-alert-dialog@^1.1.15, react-checkbox@^1.3.3, react-dialog@^1.1.15, react-popover@^1.1.15, react-scroll-area@^1.2.10, react-select@^2.2.6, react-separator@^1.1.8, react-slot@^1.2.4, react-switch@^1.2.6, react-tooltip@^1.2.8 (apps/web, prod)** · zero imports repo-wide (case-insensitive `radix` matches only package.json) · **remove all 10**.
- LOW · vaul@^1.1.2 (apps/web, prod) · radix-based drawer, zero usage · remove.
- LOW · react-day-picker@^9.14.0 (apps/web, prod) · zero usage · remove.
- LOW · class-variance-authority@^0.7.1 + clsx@^2.1.1 + tailwind-merge@^3.5.0 (apps/web, prod) · the old `cn()`/shadcn styling stack, zero usage of any of the three (no `clsx`, `cva`, `twMerge` tokens anywhere) · remove all 3.
- LOW · idb@^8.0.3 + @tanstack/query-sync-storage-persister@^5.96.2 + @tanstack/react-query-persist-client@^5.96.2 (apps/web, prod) · the old query-cache persistence stack, zero usage (no persister/persist-client references) · remove all 3.
- LOW · intl-messageformat@^11.2.0 + @formatjs/fast-memoize@^3.1.1 (apps/web, prod) · zero direct imports; both still installed transitively via next-intl→use-intl and dedupe to the same versions (verified `npm ls`) · remove the redundant direct declarations.
- LOW · @eslint/eslintrc@^3.3.1 (apps/web, dev) · eslint.config.mjs imports `eslint-config-next` flat configs directly — no FlatCompat anywhere · remove.
- LOW · @types/dompurify@^3.2.0 (apps/web, dev) · deprecated stub — its own README states "dompurify provides its own type definitions, so you don't need @types/dompurify installed!" (dompurify v3 in use) · remove.
- LOW · fs-extra@^11.3.4 (apps/mobile, prod) · Node-only lib declared as a runtime dep of a React Native app; zero `require`/`import` anywhere including all eight `apps/mobile/scripts/*.js` (they use plain `fs`) and CI workflows · remove.
- LOW · react-test-renderer@^19.2.0 (apps/web) · declared in **prod** `dependencies` but used only in `apps/web/__tests__/hooks/use-timezone-auto-sync.test.tsx` · move to devDependencies (note: deprecated upstream for React 19).

### Explicitly cleared (channels verified — NOT findings)
- Root pin family `@swc/helpers, fdir, html-parse-stringify, indent-string, min-indent` (+ mobile `html-parse-stringify`): zero textual usage but they are resolver/hoisting pins added in dep-upgrade commit 3baf1cb — same family as the documented "npm drops RN transitive deps" workaround. DEF-3.
- DEF-3 pins: hermes-compiler, memoize-one, promise, regenerator-runtime, react-native-worklets, expo overrides matrix — exempt by instruction.
- `@rolldown/binding-linux-x64-gnu` / `-win32-x64-msvc` (root, optional): platform-conditional native binaries for the vitest/rolldown toolchain — consumed by native binding resolution.
- `@parcel/watcher` (web, prod): zero textual usage, but it is a documented optional dynamic-`require` of the Tailwind v4 node toolchain (watch mode); uncertain → not flagged.
- `@testing-library/dom` (web, dev): required explicit peer of @testing-library/react v16.
- `@vitest/coverage-v8` (web/mobile/shared, dev): consumed via CLI channel — `.github/workflows/sonarcloud.yml` runs `turbo run test -- --coverage` (provider v8 auto-resolves the package).
- `@types/node`, `@types/react`, `@types/react-dom` (all workspaces): types-only tsc channel.
- All expo-*/react-native-* with zero JS imports (`expo-font`, `expo-updates`): autolinking/native channel (`expo-font` is also the runtime dep of the `@expo-google-fonts/*` loaders used in providers.tsx); exempt by instruction.
- Everything else in all four package.jsons had direct usage hits (source, app.json plugins, babel/metro/eslint/vitest configs, or CI).

## 4. Duplicate-purpose dependencies

None beyond the vestigial clusters already reported in §3 (cn-stack, persistence stack, intl pair — each has zero remaining usages so they are type-3 findings). No two-icon-set / two-date-lib / two-animation-lib situations: lucide-react / lucide-react-native, date-fns, motion, marked(+dompurify) / react-native-marked are each the single library for their job on their platform.

## Verdict

**18 findings: 1 HIGH · 3 MED · 14 LOW** (npm advisories: 1 HIGH + 2 MED rows covering all 14 audit entries; dotnet: 1 MED vulnerable + 3 LOW outdated + 1 LOW deprecated; unused npm deps: 1 MED cluster + 9 LOW rows covering 24 removable/relocatable package declarations; 0 unused NuGet packages; 0 standalone duplicate-purpose findings).
