# Round-6 verify — Sweep #2 Web ↔ Mobile parity — issue #107

READ-ONLY. Baseline: ui-mobile **1dd5c3d** (committed green). Verifies every r6 a11y/cleanup change landed on BOTH platforms (no new one-sided surface), by diffing each web-side edit against its mobile twin.

## r6 amber → `-text` migration — parity-paired (every web edit has its mobile twin)

Each web `--status-overdue` → `--status-overdue-text` **text** consumer has the identical mobile `tokens.statusOverdue` → `tokens.statusOverdueText` swap in the corresponding file:

| Surface | Web | Mobile twin |
|---|---|---|
| goal-card `%` + deadline | `components/goals/goal-card.tsx` (`textColor`/deadline) | `components/goal-card.tsx` (`progressTextColor`/deadline) |
| advanced maxKeysReached | `app/(app)/advanced/page.tsx` | `app/advanced.tsx` |
| referral-drawer error | `components/referral/referral-drawer.tsx` | `components/referral/referral-drawer.tsx` |
| create-api-key warning | `components/ui/create-api-key-modal.tsx` | `components/ui/create-api-key-modal.tsx` |
| push-prompt retryHint | `components/ui/push-prompt.tsx` | `components/ui/push-prompt.tsx` |
| login error | `app/(auth)/login/login-sections.tsx` | `app/login.tsx` |
| goal-detail loadError | `components/goals/goal-detail-drawer.tsx` | `components/goals/goal-detail-drawer/styles.ts` |

Both goal-cards correctly split the `%`-text `-text` token from the base ring-fill `color`. Web-only `-text` swaps (delete-account-modal ×2, fresh-start-modal) are in **web-only modal surfaces** that have no mobile twin (the mobile delete/fresh-start flows are different components) — allowed asymmetry, not a one-sided regression of a shared surface.

## r6 focus-ring + reduced-motion — parity-paired (via platform adapters)

- **Search focus ring:** web `today-shell.tsx` search container `focus-within:shadow-[inset_0_0_0_2px_var(--primary)]` (was `hairline-strong`); mobile twin `(tabs)/index.tsx` TodaySearchBar `borderColor: focused ? tokens.primary : tokens.hairline` (was `hairlineStrong`). Same intent (primary-colored focus indicator), platform-appropriate (CSS `:focus-within` shadow vs RN `borderColor`). Paired.
- **Reduced-motion gating:** mobile skeleton + habit-row CheckCircle gate on `usePrefersReducedMotion` (`@/lib/motion`, reads `AccessibilityInfo.isReduceMotionEnabled()`). Web has **no** `lib/motion.ts` — it handles reduced-motion declaratively via CSS `@media (prefers-reduced-motion: reduce)` (`globals.css:899,1047`; `streak.css:25`), and the web skeleton's `skeleton-pulse` class is suppressed by that media query. Web skeleton/habit-row were correctly NOT touched in r6 (already covered by CSS). This is the sanctioned **platform-adapter** difference (CSS media query vs `AccessibilityInfo` hook) — identical behavior, not a parity gap.

## r6 config + tests — no behavioral surface

The next.config.ts/eslint.config.js comment edits and the new test files add no app behavior on either platform. The theme-provider `onRequestClose` is a mobile-only fix (Android back / `<Modal>`); web has no equivalent transient theme-cross-fade Modal (web theme switching is CSS-class-based) — allowed adapter asymmetry, the keyboard sweep's domain.

## Verdict

**ZERO FINDINGS.** Every r6 shared-surface change is parity-paired: the amber→`-text` text migrations have matching web+mobile twins (both goal-cards split `%`-text from ring-fill); the search focus ring lands on both via platform-appropriate primitives. Reduced-motion gating is the sanctioned CSS-media-query (web) vs `AccessibilityInfo`-hook (mobile) adapter — web skeleton correctly untouched, not a gap. Web-only modal `-text` swaps (delete/fresh-start) are in surfaces with no mobile twin (allowed asymmetry). No new one-sided surface. Net: round-5 ZERO → round-6 ZERO.
