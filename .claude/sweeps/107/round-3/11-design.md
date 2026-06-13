# Sweep #11 — Design-system compliance (issue #107, ROUND 3 verification)

Baseline: committed-green HEAD `6399d00` (wave-3 + i18n central merge), 2026-06-13. Static re-audit verifying the round-2 STILL-OPEN set against current code. Every verdict below confirmed by a direct read at HEAD.

NOTE: round-2 was written against `ae5c150` (a recovery-to-green commit that had reverted the wave-2 motion fixes). HEAD `6399d00` re-landed them. Verified against current code, not the round-2 baseline.

Canon: DESIGN.md (navy-violet orbital) + `apps/web/app/globals.css` + `apps/mobile/lib/theme.ts`. D7 amendment (Calendar+Chat gradients sanctioned) and D8 amendment (SVG stroke sweeps sanctioned) honored. Deferral register (DEF-1..8, wave3-deferrals) honored.

## Findings (STILL-OPEN)

**ZERO FINDINGS.** All 7 round-2 open items (4 MED + 3 LOW) are RESOLVED at HEAD.

## Resolved since round 2 (do not re-report)

### Check 3 — D9 motion now transform/opacity only (all five rewrites landed, both platforms)

- **Onboarding progress dots (both platforms) — FIXED.** Web `apps/web/components/onboarding/onboarding-flow.tsx:325-336`: fixed 24px-wide track, `transform: scaleX(1)` ↔ `scaleX(0.2917)`, `transformOrigin: left center`, `transition-[transform,background-color]` (no `width`). Mobile `apps/mobile/components/onboarding/onboarding-flow.tsx:51-78`: `Animated.Value` driving `transform: [{ scaleX }]` with `useNativeDriver: true`, gated on `reducedMotion` (49-67). No layout animation remains.
- **Tour progress dots (web) — FIXED.** `apps/web/components/tour/tour-tooltip.tsx:316-332`: `transform: scaleX(1|0.5)` on fixed `w-4` track, `transition-[transform,background-color]`. No `width` animation. (Mobile tour dots remain static — no parity gap.)
- **Collapsible advanced section (both platforms) — FIXED.** Web `apps/web/app/globals.css:1013-1026`: `.collapsible` snaps `grid-template-rows: 0fr → 1fr` with NO `transition` on the grid rows (grep confirms zero `transition: grid-template-rows` repo-wide); content animates via `@keyframes collapsible-content-in` (opacity + `translateY(-6px → 0)`). Mobile `apps/mobile/components/habits/habit-form-fields.tsx:115-117,214` + extracted `advanced-section.tsx`: `LayoutAnimation.configureNext` is GONE; the section mounts/unmounts plainly. The layout-property animation (the D9 violation) is eliminated on both platforms. (Mobile carries no content-entrance animation now — a parity nicety, not a check-3 violation.)
- **Today refetch-indicator wrapper (web) — FIXED.** `apps/web/app/(app)/page.tsx:522-533`: now a static reserved slot `style={{ height: 8 }}` with `initial/animate/exit` on `opacity` + `scaleY` only (no `height` animation). This is the round-2 prescribed fix exactly.

### Check 10 — gradient-header

- **404 page gradient — FIXED.** `apps/web/app/not-found.tsx`: `GradientTop` REMOVED; now bare `bg-[var(--bg)]` + `SatelliteGlyph` + slide-up-fade copy + `PillButton`. The off-spec gradient surface is gone. (Round-1/2 ck10 LOW closed.)

### Check 7 — radii on the 8/12/16/20/999 scale

- **Achievements loading skeletons — FIXED.** `apps/web/app/(app)/achievements/page.tsx:58-60`: three skeletons now `rounded-lg` (8) via `skeleton-pulse`, replacing the `rounded-md` (6) remnant. (Round-1/2 ck7 LOW closed.)
- **Profile loading skeletons — FIXED.** Refactored into `apps/web/app/(app)/profile/_components/profile-identity-header.tsx:40,44`: now `rounded-lg` (8), replacing the `rounded-sm` (4) remnant. (The `rounded-full` avatar bone at :36 is correct.) (Round-1/2 ck7 LOW closed.)

### Check 9 — inset rings vs borders

- **Overlay expand-description button — FIXED.** `apps/web/components/ui/app-overlay.tsx:316`: now `rounded-full icon-btn-ring bg-[var(--bg-sunk)]` with `transition-[background-color,color]` — the `border` and its `border-color` transition channel are both gone, replaced by the `.icon-btn-ring` inset-ring utility. This is the round-2 prescribed fix. (Round-1/2 ck9 LOW closed.)

### Check 2 — accent literals (carry-over)

- **Mobile notification-channel `lightColor` — FIXED.** `apps/mobile/hooks/use-push-notifications.ts:183`: now `lightColor: schemes.purple.accent.dark.primary` (the `@orbit/shared/theme` token), replacing the `'#7f46f7'` literal. The round-2 ck2 carry-over is closed.

## Clean checks (re-verified at HEAD — zero NEW findings)

- **Check 1 (raw slate):** zero `--slate-*` / Tailwind `slate-###` / slate hexes in `apps/web/app/**/*.tsx` and `apps/mobile/{app,components,lib}` production code. The only slate-family values live in `globals.css` derivations, native config (`app.json`/`colors.xml`/Kotlin widget), and `__tests__` (byte-exactness fixtures per derivation rule 4 + calibration register).
- **Check 2 (accent rgba/hex):** zero in any production component on either platform. The only `#7f46f7`/`127, 70, 247` literals are the canonical purple-scheme token (`color-schemes.ts:15,82`, `globals.css` scheme classes), the user-pickable tag-color palette (`tag-selection-core.ts:12-15` — a data literal, not a token reference), the native widget/app.json/colors.xml configs, and `__tests__`. No production app-code accent literal remains (mobile `lightColor` closed above).
- **Check 3 (`transition-all`):** zero repo-wide. Every web `transition-[…]` names paint/transform props only. The five former layout animations are all converted.
- **Checks 4, 5, 6, 8, 11, 12:** unchanged-clean. Check 4 (`h-screen`) zero (`not-found.tsx:13` uses `min-h-dvh`). Check 5 (per-component scheme branches) zero styling branches. Check 6 (fonts) only `var(--font-*)` (web) / `Rubik_*`/`Inter_*`/`Roboto_*` (mobile). Check 8 (legacy aliases) zero. **Check 11 (em dashes in copy): ZERO `—` across `packages/shared/src/i18n`** (the wave-3 central merge introduced none). Check 12 (status-color literals) confined to `globals.css` token defs + native widget.

## Verdict

**ZERO FINDINGS.** All 7 round-2 STILL-OPEN items resolved at HEAD `6399d00`: the full D9 motion-rewrite batch landed on both platforms (onboarding dots `scaleX`, tour dots `scaleX`, collapsible instant-container + opacity/translateY content, refetch `scaleY` on a static slot), the 404 gradient was removed, the overlay control adopted the inset-ring utility, both skeleton-radii remnants moved onto the 8px scale, and the mobile `lightColor` accent literal now resolves through the shared theme token. Checks 1–12 are all clean in production app code; the wave-3 function-split refactors introduced no new design-system violations.
