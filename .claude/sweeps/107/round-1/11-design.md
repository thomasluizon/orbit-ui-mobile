# Sweep #11 — Design-system compliance (issue #107, round 1)

Canon: DESIGN.md (navy-violet orbital) + `apps/web/app/globals.css` + `apps/mobile/lib/theme.ts` + vendored handoff (`design/handoff/orbit/project/`). Static working-tree audit of `apps/web/{app,components,lib}` + `apps/mobile/{app,components,lib}`; i18n in `packages/shared/src/i18n`. Where DESIGN.md's distilled spec and the vendored artboards conflicted, the artboards were consulted before flagging (DESIGN.md line 3 names them the source of the compositions); items the artboards themselves use were dropped as not-findings.

## Findings

### Check 3 — motion: layout-property animations (DESIGN.md line 151 "transform + opacity only" / Bans line 159)

- MED · `apps/web/components/onboarding/onboarding-flow.tsx:325` + `apps/mobile/components/onboarding/onboarding-flow.tsx:50-65` · DESIGN.md Motion (line 151) + Bans (line 159): animate transform and opacity only · Onboarding progress dots animate `width` (web `transition-[width,background-color]`; mobile `Animated.timing` on `width` 7↔24 with `useNativeDriver: false`, forcing JS-thread layout each frame). Fix: fixed-width pill + `scaleX` with `transform-origin`/anchored transform, or crossfade two static shapes (mobile respects reduced motion already; keep that).
- MED · `apps/web/components/tour/tour-tooltip.tsx:328` · same rule · Tour progress dots animate `width` 8↔16 via `transition-[width,background-color]`. Mobile tour dots are static (no animation), so this is web-only. Same fix as above.
- MED · `apps/web/app/globals.css:1007-1011` (`.collapsible`, consumer `apps/web/components/habits/habit-form-fields.tsx:1339`) + `apps/mobile/components/habits/habit-form-fields.tsx:117` · same rule · Advanced-section expand animates layout on both platforms: web transitions `grid-template-rows 0fr→1fr` (reflow per frame; explicitly the max-height-family pattern the rule names), mobile calls `LayoutAnimation.configureNext(easeInEaseOut)`. Fix: opacity+translate reveal inside a pre-measured container, or document this one expand/collapse seam as a sanctioned deviation in DESIGN.md — currently it contradicts the ban as written.
- MED · `apps/web/app/(app)/page.tsx:577-579` · same rule · Refetch indicator container animates `height: 0→8` via framer-motion (`initial/animate/exit`). The inner bar already does it right (`scaleX`/opacity, lines 585-588). Fix: reserve the 8px slot statically (or `scaleY` the wrapper) and animate opacity only.

### Check 10 — gradient-header outside sanctioned surfaces (DESIGN.md line 141: profile, paywall, auth, onboarding, celebrations, Início; AI-slop test line 175)

- MED · `apps/web/app/(app)/calendar/page.tsx:146` + `apps/mobile/app/(tabs)/calendar.tsx:299` · Surface rules (line 141) · `GradientTop height={180}` on the Calendar tab — calendar is not in the sanctioned gradient-header list. Fix: remove, or amend DESIGN.md's list if the extension is deliberate (it is cross-platform-consistent, so likely intent; the canon text must catch up either way).
- MED · `apps/web/app/(chat)/chat/page.tsx:141` + `apps/mobile/app/chat.tsx:187` · Surface rules (line 141) · `GradientTop height={420}` behind Astra chat suggestions — chat is not in the sanctioned list. Same fix: delete or amend the canon list.
- LOW · `apps/web/app/not-found.tsx:15` · Surface rules (line 141) · `GradientTop height={320}` on the 404 page (web-only surface). Same disposition as above; lowest stakes.

### Check 1 — raw slate outside token-definition files (DESIGN.md Bans line 155, raw-slate mapping rule line 81)

- LOW · `apps/web/app/layout.tsx:45` · Bans (line 155): no raw slate refs in app code · `themeColor: '#020618'` hardcodes the purple-dark canvas for every scheme and for light mode (browser chrome renders navy on a light canvas). Fix: source from `@orbit/shared/theme` constants and provide a `media`-keyed light/dark pair in the viewport export (per-scheme would need a runtime meta update in the theme provider).
- LOW · `apps/mobile/tailwind.config.js:15-33` · Bans (line 155) + token rules (line 15: `createTokensV2` is the mobile token home) · A second, hand-rolled token surface duplicating purple-dark literals only (`#020618`, fg ramp, `#7f46f7`, status hexes) in NativeWind scaffolding that `apps/mobile/CLAUDE.md` itself declares unused. Already drifted (no light mode, no other schemes). Fix: delete the color block (or the config) so `lib/theme.ts` stays the single mobile token definition.

### Check 2 — hardcoded accent values (DESIGN.md Bans line 156, derivation rule 7 line 80)

- LOW · `apps/mobile/hooks/use-push-notifications.ts:181` · Bans (line 156): tints/accents come from tokens · Notification channel `lightColor: '#7f46f7'` is a literal accent in TS app code. Native-channel constraint is real (channels persist), but the literal should come from `schemes.purple.accent.dark.primary` in `@orbit/shared/theme` so a future accent change can't strand it. Components on both platforms are otherwise clean — every tint goes through `rgba(var(--primary-rgb),α)` / `tintFromPrimary`.

### Check 7 — radii (DESIGN.md line 64 scale + named exceptions; Bans line 161)

- LOW · `apps/mobile/lib/theme.ts:81` vs `apps/web/app/globals.css:79` · Tokens (line 64) · `radius['2xl'] = 24` (mobile) vs `--radius-2xl: 20px` (web): cross-platform token mismatch in the definition files. Note: 24 matches the handoff dialog artboard (`orbit-fig-more.jsx:442`), 20 doesn't; neither token is actually consumed (dialogs hardcode 24, no `radius['2xl']` usages found). Fix: align both (and have ConfirmDialog consume the token) or delete the dead alias.
- LOW · `apps/web/app/(app)/achievements/page.tsx:97-99` + `apps/web/app/(app)/profile/page.tsx:214,218` · Tokens (line 64) + Bans (line 161): no radii outside the spec · Skeleton placeholders use Tailwind defaults `rounded-md` (6px) / `rounded-sm` (4px) — shadcn-default remnants off the 8/12/16/20 scale and inconsistent with the skeleton primitives elsewhere (`ui/skeleton.tsx` uses 16; list bones use pill geometry). Fix: `rounded-lg` (8) or match the surrounding skeleton primitive.

### Check 9 — borders where the kit uses inset rings (DESIGN.md Bans line 158, Surface rules line 139)

- LOW · `apps/web/components/ui/app-overlay.tsx:316` · Bans (line 158) · The expand-description circle button in the overlay header uses `border border-[var(--hairline)]` — the kit's circled icon buttons are inset rings (NavHeader help: inset 1.5px hairline-strong, line 115; `.icon-btn-ring` exists in globals.css:692). Fix: `shadow-[inset_0_0_0_1.5px_var(--hairline-strong)]` (or the `.icon-btn icon-btn-ring` classes) and drop the border.

## Clean checks (zero findings)

- Check 1 (app code proper): no `--slate-*`, no Tailwind `slate-###`, no slate hexes/rgb outside token files, tests, and native config (app.json / colors.xml / widget Kotlin fallbacks are platform config; theme.test.ts byte-exactness is mandated by derivation rule 4).
- Check 2 (components): zero hardcoded violet/accent rgba in any component; all tints derive from `--primary-rgb` / `tintFromPrimary`. Tag-color palettes (`use-tag-selection.ts`) are user-content data, not theme tints — not flagged.
- Check 3 (otherwise): zero `transition-all` repo-wide; every other web transition names paint props explicitly (`background-color`, `box-shadow`, `color`, `transform`, `opacity`); SVG geometry animations (status-dot stroke-dashoffset, tour-spotlight rect) mirror the canon's own `status-sweep` keyframe and don't reflow layout.
- Check 4: zero `h-screen`.
- Check 5: zero per-component scheme branches. The `scheme !== 'purple'` checks in preferences (web `preferences/page.tsx:134`, mobile `preferences.tsx:142`) are Pro-gating business logic, not styling; styling resolves through tokens everywhere.
- Check 6: fonts fully clean — mobile uses only `Rubik_*`/`Inter_*`/`Roboto_*` literals (all loaded weights), web uses only `var(--font-sans|display|mono)`; no Vercel/Geist/system-stack remnants.
- Check 8: zero legacy aliases (`--color-background`, `bg-surface-`, `text-text-`, `primary_10/15/20/30`, `primaryTint*`, `colors.surface/border/textPrimary`). The Kotlin widget's `colors.surface/textPrimary` are its own native struct, unrelated to the deleted TS theme keys.
- Check 11: zero em dashes in `en.json` / `pt-BR.json` and zero in rendered string literals (all `—` hits are code comments/JSDoc, which are not copy).
- Check 12: zero status-color literals outside token definitions; the toast success greens in `globals.css:1262,1266` live in the token file with the documented handoff-green rationale. Mobile components carry no status hexes at all.

Dropped as artboard-canonical after source verification: dialog `borderRadius: 24` (web+mobile confirm-dialog, trial-expired, move-parent — exact match to `orbit-fig-more.jsx:442,484` incl. maxWidth 340 and shadow), one-off radii 10/6 (present in `orbit-screens-overlays.jsx:516,542,612,618`), backdrop alpha spread 0.5-0.65 (artboards themselves use 0.5/0.55/0.6), 44px-circle `borderRadius: 22` and similar size/2 circle math, half-height pill bones (radius 6 on 12px bars).

Deferrals honored: DEF-1 (runtime/visual verification is user-owned; this audit is static only).

## Verdict

**13 findings: 0 HIGH · 6 MED · 7 LOW.**
By check: ck1 ×2 LOW · ck2 ×1 LOW · ck3 ×4 MED · ck7 ×2 LOW · ck9 ×1 LOW · ck10 ×2 MED + 1 LOW. Checks 4, 5, 6, 8, 11, 12 are fully clean.
