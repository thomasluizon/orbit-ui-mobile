# Sweep #11 — Design-system compliance (issue #107, ROUND 2)

Baseline: ui-mobile `ae5c150` (recovery: repair partial wave-2 state to green). Static working-tree re-audit of `apps/web/{app,components,lib}` + `apps/mobile/{app,components,lib}`; i18n in `packages/shared/src/i18n`. Every finding below was confirmed by a direct read of the current file (not the round-1 baseline).

Canon: DESIGN.md (navy-violet orbital, amended round-1) + `apps/web/app/globals.css` + `apps/mobile/lib/theme.ts` + vendored handoff. **D7 amendment applied:** the gradient-surface list now includes Calendar + Chat (DESIGN.md line 144) — Calendar/Chat `GradientTop` are NO LONGER findings. **D8 amendment applied:** SVG `stroke-dashoffset` ring/progress sweeps are sanctioned (DESIGN.md line 157) — NOT findings. Deferral register (DEF-1..8) honored.

Round-1 had 13 findings (0H/6M/7L). This re-audit checks each for fixed-vs-open and re-sweeps every domain for regressions/new violations introduced by the wave-1/2 fixes + recovery.

## Findings (STILL-OPEN only)

### Check 3 — motion: layout-property animations (D9; DESIGN.md Motion line 155 "transform + opacity only" / Bans line 165)

D9 mandated each of these rewrite to transform/opacity on BOTH platforms. **None of the five D9 motion rewrites landed.** The recovery commit reverted to a green baseline without the W2 motion fixes; all five are byte-for-byte the round-1 state.

- **MED · `apps/web/components/onboarding/onboarding-flow.tsx:325` + `apps/mobile/components/onboarding/onboarding-flow.tsx:50-65` · D9 / DESIGN.md Motion line 155 + Bans line 165 · Onboarding progress dots still animate `width` (layout).** Web: `className="transition-[width,background-color] …"` with `style={{ width: i === active ? 24 : 7 }}` (line 327). Mobile: `Animated.timing(width, { toValue: active ? 24 : 7, …, useNativeDriver: false })` (lines 57-62) driving `Animated.View style={{ width }}` (line 70). D9 fix: fixed-width track + `scaleX` (mobile already gates on `reducedMotion` — keep that). BOTH platforms open.
- **MED · `apps/web/components/tour/tour-tooltip.tsx:328` · D9 / same rule · Tour progress dots still animate `width` 8↔16 (layout).** `className="h-2 rounded-full transition-[width,background-color] …"` with `dotStyle.width = 16 | 8` (lines 319-323). Web-only (mobile tour dots remain static — no parity gap). Same `scaleX` fix.
- **MED · `apps/web/app/globals.css:1014-1021` (`.collapsible`, consumer `apps/web/components/habits/habit-form-fields.tsx:1339`) + `apps/mobile/components/habits/habit-form-fields.tsx:117` · D9 / same rule · Advanced-section expand still animates layout on both platforms.** Web `.collapsible` transitions `grid-template-rows: 0fr → 1fr` (`transition: grid-template-rows var(--dur-base) var(--ease-out)`); consumer toggles `is-open` at line 1339. Mobile `toggleAdvanced()` calls `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)`. D9 fix: instant container + opacity+translateY content entrance. BOTH platforms open.
- **MED · `apps/web/app/(app)/page.tsx:574-580` · D9 / same rule · Today refetch-indicator wrapper still animates `height: 0 → 8` (layout).** framer-motion `motion.div` with `initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 8 }} exit={{ opacity: 0, height: 0 }}`. The inner bar is already correct (`scaleX`/opacity, lines 585-588). D9 fix: reserve the 8px slot statically (or `scaleY` the wrapper) and animate opacity only. Web-only surface (mobile `(tabs)/index.tsx` refetch path carries no height animation — verified, no parity gap).

### Check 10 — gradient-header outside sanctioned surfaces (DESIGN.md Surface rules line 144; AI-slop test line 181)

- **LOW · `apps/web/app/not-found.tsx:15` · Surface rules line 144 · `GradientTop height={320}` on the 404 page.** The D7 amendment extended the sanctioned list to profile, paywall, auth, onboarding, celebrations, Início, calendar, chat — it deliberately did NOT add 404/not-found. Web-only surface (no mobile 404). Per the canon as written this remains an off-spec gradient surface; fix = remove `GradientTop` (the SatelliteGlyph + pill already carry the screen) or amend the list if intentional. Lowest stakes. (Full gradient inventory swept: all other 30+ `GradientTop` usages map cleanly to a sanctioned surface — profile, upgrade, login/auth-callback/(auth)layout, onboarding, the five celebration overlays, Today/Início, calendar, chat — on both platforms.)

### Check 7 — radii off the 8/12/16/20/999 scale (DESIGN.md Tokens line 66; Bans line 167)

- **LOW · `apps/web/app/(app)/achievements/page.tsx:97-99` · Tokens line 66 + Bans line 167 · Three loading skeletons use `rounded-md` (6px)** — shadcn-default remnant off the 8/12/16/20 scale, inconsistent with `ui/skeleton.tsx` (radius 16) and the pill-geometry list bones. Fix: `rounded-lg` (8) or match the surrounding skeleton primitive. (Round-1 finding, unchanged.)
- **LOW · `apps/web/app/(app)/profile/page.tsx:214,218` · same rule · Two loading skeletons use `rounded-sm` (4px)** — same shadcn-default remnant. (Line 210-211's `rounded-full` badge bone is fine.) Fix: same as above. (Round-1 finding, unchanged.)

### Check 9 — borders where the kit uses inset rings (DESIGN.md Bans line 164; Surface rules line 142)

- **LOW · `apps/web/components/ui/app-overlay.tsx:316` · Bans line 164 · The expand-description circle button still uses `border border-[var(--hairline)]`** (plus `transition-[background-color,border-color,color]`, whose `border-color` channel only exists because of the border). The kit's circled icon buttons are inset rings (NavHeader help: inset 1.5px hairline-strong, DESIGN.md line 118; the `.icon-btn-ring` utility — `box-shadow: inset 0 0 0 1.5px var(--hairline-strong)` — already exists at `globals.css:699`). Fix: apply `.icon-btn icon-btn-ring` (or `shadow-[inset_0_0_0_1.5px_var(--hairline-strong)]`) and drop the border + its border-color transition channel. Web-only (mobile has no border-circle equivalent for this overlay control — verified). (Round-1 finding, unchanged.)

## Confirmed FIXED since round 1 (do not re-report)

- **D10 web `themeColor` literal — FIXED.** `apps/web/app/layout.tsx:45-48` now resolves per mode via a Next viewport `themeColor` media array sourced from `resolveLightNeutrals('purple').bg` / `resolveDarkNeutrals('purple').bg`; the bootstrap script (lines 90-93) updates `meta[name=theme-color]` per active scheme×mode. No raw slate literal remains. (Round-1 ck1 LOW closed.)
- **`apps/mobile/lib/theme.ts` radius `2xl` — FIXED.** Now `'2xl': 20` (line 81), matching web `--radius-2xl: 20px`. Cross-platform token mismatch resolved. (Round-1 ck7 LOW closed.)
- **`apps/mobile/tailwind.config.js` drifted token literals — FIXED.** The hand-rolled `theme.extend.colors` block (purple-dark `#020618`, fg ramp, `#7f46f7`, status hexes) is gone; the file is now just `content` globs + `nativewind/preset`. Per D21, nativewind IS in deps (`"nativewind": "^4.2.3"`), so the file correctly stays. `lib/theme.ts` is again the single mobile token surface. (Round-1 ck1 LOW closed.)

## STILL-OPEN deltas vs round-1 (carry-overs)

- **`apps/mobile/hooks/use-push-notifications.ts:181` notification channel `lightColor: '#7f46f7'` — STILL OPEN.** Round-1 ck2 LOW; not fixed. A literal purple accent in TS app code (DESIGN.md Bans line 162). The native-channel persistence constraint is real, but the value should come from `schemes.purple.accent.dark.primary` in `@orbit/shared/theme` so a future accent change can't strand it. (Reported here for completeness; it was a round-1 finding, still applicable.)

## Clean checks (zero NEW findings — re-verified at round 2)

- **Check 1 (raw slate in app code):** zero `--slate-*`, Tailwind `slate-###`, or slate hexes/rgb in `apps/{web,mobile}/{app,components,lib}` outside token files. All hits confined to `globals.css` (the `--gradient-header-from` scheme-accent hexes are sanctioned derivations), `app.json` / `colors.xml` / Kotlin widget (native platform config — round-1 exclusion holds), and `__tests__` (byte-exactness fixtures mandated by derivation rule 4).
- **Check 2 (hardcoded violet/accent rgba):** zero in any component on either platform; every tint resolves through `rgba(var(--primary-rgb),α)` (web) / `tintFromPrimary(tokens, α)` (mobile). The only `127,70,247` / `#7f46f7` literals are the canonical purple-scheme token in `globals.css` and the native widget/app.json/colors.xml configs. (The mobile `lightColor` literal is the one app-code exception — listed above.)
- **Check 3 (`transition-all`):** zero repo-wide. Every other web `transition-[…]` names paint props only (`background-color`, `box-shadow`, `color`, `border-color`, `transform`, `opacity`). The five layout-prop animations above are the only Check-3 violations.
- **Check 4 (`h-screen`):** zero. `not-found.tsx:14` uses `min-h-dvh` correctly.
- **Check 5 (per-component scheme branches):** zero styling branches. The `scheme !== 'purple'` checks (web `preferences/page.tsx:134`, mobile `preferences.tsx:142`) are Pro-gating business logic; `currentScheme === option.value` lines are scheme-picker selection state; `theme-provider.tsx:145` is a change-detection guard. Styling resolves through tokens everywhere.
- **Check 6 (fonts):** fully clean. Mobile uses only `Rubik_*`/`Inter_*`/`Roboto_*` literals; web uses only `var(--font-sans|display|mono)`. The `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` chains are the documented fallback tails INSIDE the three `--font-*` token definitions (`globals.css:10-12`), not app-code font picks. No Geist/Vercel/Helvetica/monospace in app code.
- **Check 8 (legacy aliases):** zero `--color-background`, `bg-surface-*`, `text-text-*`, `primary_10/15/20/30`, `primaryTint*`, or TS `colors.surface/border/textPrimary`. The Kotlin widget's `colors.surface/textPrimary/border` are its own native struct (round-1 disposition holds).
- **Check 11 (em dashes in copy):** zero `—` in `en.json` / `pt-BR.json` (the W2.5 i18n merge introduced none). No em dashes in rendered string literals.
- **Check 12 (status-color literals):** zero outside token definitions. All `--status-overdue/-bad/-frozen` + `-text` hexes (D6) live only in `globals.css:194-198,238-242`; the only other status hexes are the native widget struct. Mobile components carry no status hexes — status text uses `statusOverdueText`/`statusBadText` tokens.

Dropped as artboard-canonical / below-threshold after source verification (NOT findings, consistent with round-1 adjudication): small-element radii on both platforms — mobile `borderRadius: 2/4/6/10` (highlight marks, progress-bar halves, small chips, chat bubbles; round-1 dropped 10/6 as `orbit-screens-overlays.jsx`-canonical and pill-bone halves) and the web `highlight-text.tsx:50` `<mark>` `rounded-sm` (its mobile mirror `highlight-text.tsx:66` uses `borderRadius: 2` — internally consistent inline-highlight detail, unflagged in round-1). Dialog `borderRadius: 24` (artboard-exact). Backdrop alpha 0.5-0.65 (artboard range).

## Verdict

**6 STILL-OPEN findings: 0 HIGH · 4 MED · 2 LOW** (plus 1 carry-over LOW listed separately — the mobile `lightColor` accent literal — for 7 LOW-or-above total if counted; 6 in the primary table + the push-notification carry-over).

Counting all open items uniformly: **0 HIGH · 4 MED · 3 LOW = 7 open.**

- By check: ck3 ×4 MED (all five D9 motion rewrites — onboarding dots counts both platforms in one finding; tour dots; collapsible; refetch wrapper) · ck10 ×1 LOW (404 gradient) · ck7 ×2 LOW (skeleton radii ×2 files) · ck9 ×1 LOW (overlay border) · ck2 ×1 LOW carry-over (mobile `lightColor`).
- **3 round-1 findings CONFIRMED FIXED:** D10 themeColor, mobile radius `2xl`, mobile tailwind.config drifted literals.
- The dominant theme: the **entire D9 motion-rewrite batch is still open on both platforms** — the recovery-to-green commit (`ae5c150`) reverted those wave-2 changes. Checks 4, 5, 6, 8, 11, 12 remain fully clean; Checks 1 and 2 clean in app code.
