# Prod-readiness deferred findings

Accepted-deferred findings from the pre-launch prod-readiness audit (`#243`). Each
entry below is a **Medium performance micro-optimization on the Expo/React-Native
boot surface** — not a correctness, security, or data-integrity issue. They are
deferred (not ignored) because the boot sequence has a documented history of
grey-screen crashes from module-eval / boot-ordering changes (supabase lazy
client, Metro singleton-resolver, worklets ABI), CI cannot device-test, and no
verification path exists in CI for the fix. Each is safe to leave shipping and
should be revisited in a **device-testable session** where the change can be
measured on-device before merge.

Verified against `main` on 2026-07-14.

| ID | Location | Perf issue | Why deferred |
|----|----------|------------|--------------|
| 2.134 | `apps/mobile/lib/providers.tsx:96-158` | `useFonts` (10 families) is one of three conjuncts of `appReady` (`appReady = ready && fontsLoaded && onboardingDraftHydrated`, L147), which gates the splash/loading screen (L153). First paint waits ~100-300 ms on font load. | Moving fonts off the splash gate (async font load + system-font fallback, or `expo-font` embedding) changes what the very first frame renders. A wrong fallback flashes unstyled text or a blank frame; there is no on-device visual check in CI. Micro-opt, not correctness. |
| 2.136 | `apps/mobile/stores/auth-store.ts:396,356,367` | On cold boot `initialize()` (L396) awaits `checkAuth()` (L356), which awaits `refreshSession()` (L367). With an expired token this is a network round-trip that `providers.tsx` `boot()` awaits before `setReady(true)`, so it gates the splash. Profile hydration is *already* backgrounded (L45-48) so this is the remaining blocker. | Making token refresh non-blocking (render authed-optimistic, refresh in background) risks a flash of authed UI that then bounces to login, or a race between the refresh and the first authed data fetch. Auth/boot ordering is exactly the class that has caused grey screens; no CI device test. Correctness-adjacent, so extra caution. |
| 2.138 | `apps/mobile/metro.config.js` (whole file) | No explicit code-splitting / bundle config for the ~66 dynamic `import()` sites. Config only sets `watchFolders`, `unstable_serverRoot`, and `nodeModulesPaths` for monorepo resolution. | Verify-intent → document-only. React Native + Hermes ships a **single** bundle; `import()` resolves from the already-loaded bundle (no web-style network chunk fetch), so "code-splitting" does not apply the way it does on web. The RN-equivalent lever (`inlineRequires` / RAM bundles) is already enabled by Expo's default Metro config. Editing the Metro transformer is a high-blast-radius boot change with no CI device test. No action needed. |

## 2.135 — partially resolved (mount-timing optimization)

The safe, provable slice was implemented in the same PR; the rest is accepted as
intentionally eager.

**Implemented (behavior-neutral, unit-tested):** the overlay tree was extracted from
`apps/mobile/app/_layout.tsx` into a pure, testable `OverlayLayer`
(`apps/mobile/components/global-overlays.tsx`), and the two post-onboarding prompts
(`CalendarImportPrompt`, `AstraImportPrompt`) are now gated to mount only once
`hasCompletedOnboarding` is true. Both prompts' internal `shouldShow` already
requires `hasCompletedOnboarding` as its first conjunct and neither runs a
boot-time effect, so not mounting them pre-onboarding is observationally identical
to the previous always-mounted-but-`null` behavior. Render order (z-order) is
preserved exactly. Covered by `apps/mobile/__tests__/components/global-overlays.test.tsx`.

**Kept eager (accepted):** `ExpiryWarning`, `TrialExpiredModal`, `VersionUpdateDrawer`,
`StreakFreezeCelebration`, and the tour (`TourProvider`/`TourOverlay`). Their trigger
conditions (session-token expiry, trial state, a force-update version gate that must
fire even mid-onboarding on old clients, streak-freeze activation) are independent of
onboarding and live in each component's internal store subscription. Gating their
mount externally would require replicating those triggers in the parent and risks the
overlay failing to appear when needed — exactly the failure mode this surface cannot
verify in CI. Left eager.

Refs thomasluizon/orbit-ui-mobile#243 (prod-readiness).
