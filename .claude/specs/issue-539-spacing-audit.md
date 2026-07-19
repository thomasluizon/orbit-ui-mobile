# Spacing-scale audit — baseline for `local/spacing-scale` (#539)

**At a glance** — the report-only baseline for the `local/spacing-scale` gate.
- **1157 violations across 333 files** (of 1889 parsed `.ts`/`.tsx` in `apps/web`, `apps/mobile`, `packages/shared`).
- **173 (15.0%) are mechanically autofixable**; the remaining 984 are layout decisions.
- The rule is **written and tested but NOT registered** in any lint config. Arming it is one line — see **Arming the gate**.
- Regenerate by re-running the rule (see **Reproducing**), never by hand-editing the counts.
- **Snapshot caveat:** measured 2026-07-18 while the #539 visual pass had ~75 uncommitted files in `apps/`. Re-run this baseline against a clean tree before arming the gate; the shape of the debt is stable, the exact totals will drift.

## What this is

`DESIGN.md` said "base 4" as prose for the entire life of the design system. Prose is not checkable, so nobody counted, and a third of the app's spacing drifted off it. `### Spacing (base 4)` now enumerates the scale (`0 4 8 12 16 20 24 28 32 40 48 56 64`) and three named exemptions precisely enough for a machine, and `eslint-rules/spacing-scale.cjs` is that machine.

This file is the honest baseline: what the gate finds today, so the debt is a number instead of a feeling.

## Why it ships report-only

The #539 whole-app visual pass is mid-flight and touching the same files. Flipping this to `error` today fails every gate in the repo and blocks that work. It ships as code + tests + this baseline; it is armed once the visual pass lands.

## The scale decision, and its cost stated plainly

The de-facto scale in the code is **base 2**, not base 4. Off-scale spacing is 1179 of 3489 total spacing occurrences — **33.8%** — and 79% of that off-scale mass is a handful of even values that base-4 excludes:

| value | occurrences | files |
|---|---|---|
| 10 | 280 | 154 |
| 6 | 222 | 141 |
| 14 | 210 | 130 |
| 2 | 88 | 73 |
| 18 | 80 | 62 |
| 22 | 55 | 46 |

The tempting move is to widen the scale to base 2. **That was rejected**: a scale containing 2, 6, 10, 14, 18 and 22 flags only ~190 sites, which is not a rhythm — it is a rounding rule with a lint rule attached. It would also silently reverse a frozen `DESIGN.md` decision to make the existing code pass, which is backwards.

So the scale stays base-4-enumerated and **the migration cost is real: 1157 violations across 333 files.** That is a multi-bundle mechanical pass, not a cleanup afternoon. It is sequenced, per `planning-and-artifacts` rule 5 (wide refactor → blast-radius-sized batches), as:

1. **Wave 1 — free (173 sites, 91 files).** Every odd value (3, 5, 7, 9, 11, 13, 15, 17, 33 and their negatives) is within 1px of a unique non-zero step. `--fix` handles all of it, and a 1px shift is below the perceptual threshold. Ship this as one mechanical PR with visual-regression screenshots.
2. **Wave 2 — judgement (984 sites).** 10, 6, 14, 18, 22, 2 and the large one-offs each need a human choosing 8-or-12, 4-or-8, 12-or-16. These are deliberately **not** autofixed: a silent 10 → 8 changes a row's density. Batch by component family (below), one PR per family, screenshots per surface per `visual-delivery` rule 4.

### Named exemptions (three — see `DESIGN.md ### Spacing`)

| name | scope | why it is narrow |
|---|---|---|
| `pill-button-geometry` | the single file `packages/shared/src/theme/button.ts` | The pre-existing `DESIGN.md` exemption, now **file-scoped**. It previously read as a value exemption, and the values leaked: `gap: 7` / `paddingVertical: 9` / `paddingHorizontal: 26` are hand-copied into `components/ui/chip.tsx`, `components/ui/badge.tsx`, `gamification/streak-badge.tsx`, `share/share-card-entry-button.tsx` and dozens more. The exact PillButton geometry numbers (7, 9, 18, 26, 30) account for **150 violations outside `button.ts`** — 7 and 9 alone span 51 files. File-scoping is what turns those from "exempt" into "violation", which is the point. |
| `hairline-inset` | `±1` on `top`/`right`/`bottom`/`left`/`start`/`end`/`inset*` only | Aligning to a 1px hairline is a rendering fact. Verified against the code: **every** `1px` hit in the repo is on a box property (`marginTop`, `paddingVertical`, `gap`), so this exemption currently excuses zero real violations — it exists to prevent a future false positive, not to launder a present one. |
| `explicit-allow` | the rule's `allow: number[]` option | Empty today. Adding a value is a reviewed diff to the lint config, per `product-and-content` rule 2. |

`width` / `height` are **out of scope entirely** rather than exempted — a 34px avatar or a 220px sheet is a component dimension, not layout rhythm. Including them would have forced an exemption list wide enough to make the gate meaningless.

## Violations by value

| value | violations | files | autofixable |
|---|---|---|---|
| 10px | 267 | 152 | 0 |
| 6px | 219 | 140 | 0 |
| 14px | 207 | 128 | 0 |
| 2px | 87 | 72 | 0 |
| 18px | 78 | 60 | 0 |
| 22px | 55 | 46 | 0 |
| 3px | 51 | 44 | **51** |
| 9px | 32 | 29 | **32** |
| 7px | 31 | 22 | **31** |
| 5px | 17 | 17 | **17** |
| 15px | 15 | 11 | **15** |
| 11px | 12 | 9 | **12** |
| 1px | 10 | 10 | 0 |
| -10px | 10 | 6 | 0 |
| 36px | 9 | 9 | 0 |
| -6px | 6 | 2 | 0 |
| -3px | 5 | 5 | **5** |
| 13px | 5 | 4 | **3** |
| 30px | 5 | 4 | 0 |
| 26px | 4 | 4 | 0 |
| 100px | 4 | 2 | 0 |
| -30px | 3 | 2 | 0 |
| -7px | 3 | 3 | **3** |
| 220px, 52px, -14px, -2px | 2 each | | 0 |
| 80px, 76px, 72px, 50px, 34px, 112px, 128px, 192px, 88px, -1px | 1 each | | 0 |
| 17px, 33px, -5px, -13px | 1 each | | **1 each** |

`1px` is unfixable by design (snapping to 0 deletes spacing rather than correcting it); `2px`, `6px`, `10px`, `14px`, `18px`, `22px`, `26px`, `30px`, `36px` are all equidistant from two steps and are layout decisions.

## Violations by component family

| family | violations | files |
|---|---|---|
| web / (app) routes | 145 | 56 |
| mobile / habits | 101 | 12 |
| mobile / social | 90 | 28 |
| mobile / ui | 80 | 24 |
| web / habits | 77 | 27 |
| mobile / chat | 50 | 9 |
| mobile / (tabs) | 48 | 17 |
| web / ui | 40 | 15 |
| mobile / onboarding | 38 | 12 |
| mobile / upgrade | 30 | 4 |
| mobile / goals | 24 | 7 |
| web / onboarding | 23 | 10 |
| mobile / habit-list | 22 | 3 |
| web / upgrade | 22 | 5 |
| mobile / share | 21 | 3 |
| mobile / navigation | 20 | 3 |
| web / chat | 19 | 8 |
| web / navigation | 19 | 4 |
| mobile / route-level `*-styles.ts` (streak / retrospective / calendar-sync / advanced / ai-settings / wrapped / chat) | 90 | 7 |
| mobile / milestone-share | 11 | 1 |
| web / (chat) | 11 | 2 |
| web / goals | 11 | 8 |
| web / (public) | 10 | 4 |
| web / shell | 10 | 6 |
| remaining ~30 families | < 10 each | |

**Mobile carries ~65% of the debt**, concentrated in `StyleSheet.create` objects — exactly the surface no CSS tool can see.

### Densest files (top 15)

| file | violations |
|---|---|
| `apps/mobile/components/habits/habit-form-fields/styles.ts` | 39 |
| `apps/mobile/components/upgrade/styles.ts` | 23 |
| `apps/mobile/app/streak-sections-styles.ts` | 17 |
| `apps/mobile/components/share/share-card.tsx` | 17 |
| `apps/mobile/app/retrospective-styles.ts` | 16 |
| `apps/mobile/app/calendar-sync-styles.ts` | 15 |
| `apps/mobile/components/habit-list/styles.ts` | 13 |
| `apps/mobile/components/habits/reschedule-sheet.tsx` | 13 |
| `apps/mobile/app/advanced-styles.ts` | 12 |
| `apps/mobile/app/ai-settings-styles.ts` | 12 |
| `apps/mobile/app/social/_components/friend-profile-sheet.tsx` | 11 |
| `apps/mobile/components/chat/breakdown-suggestion.styles.ts` | 11 |
| `apps/mobile/components/habits/checklist-templates.tsx` | 11 |
| `apps/mobile/components/milestone-share/milestone-share-card.tsx` | 11 |
| `apps/web/app/(app)/streak/_components/streak-sections.tsx` | 11 |

## Arming the gate

Two edits, both in `apps/web/eslint.config.mjs` (and the mirror in `apps/mobile/eslint.config.*`):

```js
import spacingScale from "../../eslint-rules/spacing-scale.cjs"
```

then inside `plugins.local.rules`:

```js
"spacing-scale": spacingScale,
```

and the one line that actually arms it, inside `rules`:

```js
"local/spacing-scale": ["error", { exemptFiles: ["packages/shared/src/theme/button.ts"] }],
```

Start it at `"warn"` if Wave 2 is still in flight; promote to `"error"` when this file's violation count reaches 0. **Do not add values to `allow` to make the count fall** — that is the failure mode the enumerated scale exists to prevent.

## Reproducing

The rule has no repo-wide runner yet (it is unregistered). To regenerate this baseline, lint with the rule injected via a throwaway flat config:

```js
const config = {
  files: ["**/*.{ts,tsx}"],
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { local: { rules: { "spacing-scale": require("./eslint-rules/spacing-scale.cjs") } } },
  rules: { "local/spacing-scale": ["warn", { exemptFiles: ["packages/shared/src/theme/button.ts"] }] },
}
```

over `git ls-files "apps/web/**/*.{ts,tsx}" "apps/mobile/**/*.{ts,tsx}" "packages/shared/**/*.ts"`, excluding `*.d.ts`. Once armed, `npx eslint apps --rule ...` replaces this.

## Related follow-up (not done here)

There is **no shared spacing token module**. `packages/shared/src/theme/` exports `button`, `color-schemes`, `motion`, `neutral-ramp`, `type-roles`, `z-layers` — and no `spacing`. Every one of the 1157 violations is a hand-typed number because there was nothing to import. `z-layers.ts` is the proven pattern (`zLayers.modal`, enforced by `local/no-arbitrary-zindex`); spacing deserves the same `spacing.md` / `spacing[4]` treatment so the gate has a right answer to point at, not just a wrong one to reject.
