# Round-6 verify — Sweep #13 Keyboard interaction & focus (ESC == Android back) — issue #107

READ-ONLY. Baseline: ui-mobile **1dd5c3d** (committed green). Verifies the single round-5 LOW survivor (F13 theme-provider Modal missing `onRequestClose`) landed in round 6, plus that the r6 focus-ring additions did not regress the overlay-stack LIFO.

## Round-5 LOW survivor — RESOLVED in round 6

- **`apps/mobile/lib/theme-provider.tsx` cross-fade Modal — now has `onRequestClose`.** r6 diff adds a `finishThemeTransition` `useCallback` (`:125-133`) that `cancelAnimationFrame(transitionFrameRef.current)` + nulls the ref + `transitionOpacity.stopAnimation()` + `setTransitionSnapshot(null)`, and wires it onto the transient Modal: `<Modal ... onRequestClose={finishThemeTransition}>` (`:264`). A hardware back press during the sub-second cross-fade now intentfully clears the snapshot and fast-forwards the transition instead of being swallowed. This is the exact round-5-prescribed fix ("add an intentful `onRequestClose` that fast-forwards/clears `transitionSnapshot`"). RESOLVED.

  Re-confirmed this was the ONLY remaining offender: the prior exhaustive scan named `theme-provider.tsx` as the last mobile `<Modal>` lacking `onRequestClose` (onboarding-flow's is intentionally non-dismissable; fresh-start-animation got `onRequestClose={onComplete}` in r4). With theme-provider now covered, every transient mobile Modal handles Android back.

## Overlay-stack LIFO — intact through r6

- r6 touched no overlay-stack file (`lib/overlay-stack.ts` / `hooks/use-overlay-escape.ts` / `hooks/use-overlay-back.ts` absent from the r6 diff).
- The r6 web focus-ring additions are presentational only: `today-shell.tsx` search container `focus-within:shadow-[inset_0_0_0_2px_var(--primary)]` (was `hairline-strong`) — a `:focus-within` ring, no new keyboard handler, no new dismissable layer. Mobile twin `(tabs)/index.tsx` TodaySearchBar `borderColor` focus = `tokens.primary`. Neither introduces an ESC/back consumer.
- The reduced-motion gating (skeleton/habit-row CheckCircle) changes animation start conditions only — no focus or key handling touched.

No new bespoke overlay layer was introduced by r6; the chat ESC route-back guard and the 6 `useOverlayEscape` web layers are undisturbed (their files are not in the r6 diff).

## Verdict

| Severity | Count |
|---|---|
| HIGH | 0 |
| MED | 0 |
| LOW | 0 |
| **Total** | **0** |

**ZERO FINDINGS.** The round-5 F13 survivor is resolved: the theme-provider cross-fade Modal now wires `onRequestClose={finishThemeTransition}` (cancels the frame, stops the animation, clears the snapshot). Overlay-stack LIFO is intact — r6 added only a `:focus-within` ring to the search container and reduced-motion gating, neither of which touches keyboard/back handling. Net: round-5's 1 LOW → 0.
