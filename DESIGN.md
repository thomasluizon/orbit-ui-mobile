# Orbit Design System

> **At a glance** - the authoritative spec for every Orbit UI surface; it overrides generic and user-global design defaults.
> - Anchor (locked, 2026-07-17 freeze): de-decorated navy-violet orbital. Neutral canvas, rationed violet accent, hierarchy from surface steps + hairlines. **No decorative glow, no gradient wash, anywhere.**
> - Identity is carried by the orbital logo mark, the Astra orbital glyph, and ring-shaped indicators. Never by background decoration.
> - Semantic tokens only (`--bg`, `--bg-card`, `--bg-elev`, `--fg-1..4`, `--primary`, `--primary-soft`, `--primary-rgb`, `--hairline`, `--scrim`, ...); no raw hex in UI.
> - Scales: type, **spacing (enumerated: `0 4 8 12 16 20 24 28 32 40 48 56 64`, three named exemptions, gated by `local/spacing-scale`)**, radius, motion. Ships light AND dark, all 6 color schemes; mobile-first 412px shell.
> - Tokens live in `apps/web/app/globals.css` + `apps/mobile/lib/theme.ts` + `packages/shared/src/theme/`.
> - Sections (exact `##` names, so this line is greppable): Identity & anchor · Tokens · Type roles · Layout & spacing · Primitives kit · Buttons · Surface rules · Habit list · States · Copy · Desktop density & orientation · Sub-screen navigation · Motion · Accessibility · Special surfaces (paywall, landing hero) · Bans · Working model · Enforcement.
> - Read the whole doc before shaping, reviewing, or theming any surface. `## Enforcement` says which rules are gate-backed and which are reviewer judgment.

**Authority note:** this DESIGN.md is authoritative over any generic or user-global design default, including the global anti-Inter and anti-violet rules. Orbit adopts Inter for display type and a violet accent deliberately; that deviation is documented here once and applies repo-wide. Deliberate emoji use (habit emoji wells, stat tiles, streak flame, celebration heroes) is part of the language and overrides the global anti-emoji rule on those surfaces only.

It is authoritative for **both platforms** (`apps/web`, `apps/mobile`) and for the `orbit-landing-page` mirror. A rule is cross-platform unless it names a platform.

**Provenance.** The visual language is frozen by the owner-approved Today mockups (desktop `KQMPM`, mobile `N8aEDF`, 2026-07-17). The frozen decisions win over every other input. The craft rules below are the 2026-07-17 harvest of 193 external design skills, deduplicated and routed in the vault note `Orbit skill harvest - canonical rule set (#539)`; where a harvested rule contradicted the freeze it was dropped upstream and is not here.

## Identity & anchor (locked)

Orbit is a **de-decorated navy-violet orbital habit tracker**. Near-black neutral canvas, one rationed violet accent, opaque-reading surface steps built from a white-alpha ladder, hairline rings and dividers, rounded geometry (8/12/16/18/20/999), Rubik/Inter/Roboto type, deliberate emoji.

Identity comes from three things and nothing else:

1. the **orbital logo mark**,
2. the **Astra orbital glyph** (which replaces the sparkle icon; the "AI"/"IA" badge is dropped, since the word is the liability, not the glyph),
3. **ring-shaped status and progress indicators**.

It does **not** come from a background gradient, a glow, decorative background orbit arcs, or any texture. Those were tried and rejected. Hierarchy is bought with surface steps, hairlines, size, weight, and whitespace.

The anchor is locked. Do not re-pick, do not hybridise, do not add a "variance" or "intensity" dial. The output should read as **calm, spacious, quietly cosmic**: a personal orbit, not a SaaS dashboard.

**Quiet decoration is still decoration.** A softened glow, a 0.03-opacity texture, a "subtle" mesh gradient, a barely-there blur are all the same violation as the loud version. The freeze removes the layer; it does not dim it.

## Tokens

Canonical CSS lives in `apps/web/app/globals.css`; the mobile equivalent is `createTokensV2` in `apps/mobile/lib/theme.ts`; shared ramp data in `packages/shared/src/theme/`.

### Type

- Families: `--font-sans` **Rubik** (UI), `--font-display` **Inter** (hero, big numerals), `--font-mono` **Roboto** (meta + tabular numerals, the "mono" role; intentionally NOT a true monospace; use `font-variant-numeric: tabular-nums` / RN `fontVariant: ['tabular-nums']`).
- Weights loaded: Rubik 400/500/600/700 · Inter 500/600/700 · Roboto 400/500/700. Weight scale is deliberately squashed: regular=400, medium/semibold=500, bold=600.
- Scale: `--fs-xs 12 / sm 14 / base 16 / md 18 / lg 22 / xl 28 / 2xl 34 / 3xl 44 / 4xl 60`. Line-heights: tight 1.15 / snug 1.3 / body 1.55 / loose 1.7. Tracking: tight -0.01em / wide 0.06em / widest 0.12em.
- **`font-synthesis: none` on the document root** so an unloaded weight or style fails visibly instead of rendering a browser-faked bold or italic. Only the weights listed above exist; any other weight is a bug, not a rendering.
- Express a typographic feature through its dedicated CSS property, never the raw axis or feature tag: `font-weight` not `font-variation-settings: "wght"`, `font-variant-numeric: tabular-nums` not `font-feature-settings: "tnum" 1`, `font-optical-sizing` not `"opsz"`.

### Spacing (base 4)

**The scale is these thirteen values and nothing else:**

```
0  4  8  12  16  20  24  28  32  40  48  56  64
```

A spacing value outside that set is a defect. The set is enumerated rather than described as "a multiple of 4" because a machine has to be able to check it: `local/spacing-scale` reads exactly this list, and "base 4" as prose let 6, 10, 14, 18 and 22 accumulate across a third of the app before anyone counted.

Negative values are legal only at the negation of a scale step (`-8`, not `-6`), and only where a negative offset is genuinely the layout — never to undo a parent's padding (see **Bans**).

| token | px | typical use |
|---|---|---|
| `space-1` | 4 | icon-to-label inside a dense control |
| `space-2` | 8 | within-group gaps, chip padding |
| `space-3` | 12 | row internal gaps |
| `space-4` | 16 | card padding, list-row horizontal padding |
| `space-5` | 20 | row vertical padding, right-rail module gap |
| `space-6` | 24 | section padding, between-group air |
| `space-7` | 28 | dense section padding |
| `space-8` | 32 | between sections |
| `space-10` | 40 | screen top/bottom padding |
| `space-12` | 48 | between major blocks |
| `space-14` | 56 | large hero inset |
| `space-16` | 64 | hero and empty-state breathing room |

**What the scale governs:** `margin` and `padding` (every side, every logical and React Native `Horizontal`/`Vertical` variant), `gap` / `rowGap` / `columnGap`, and the positional insets (`top` / `right` / `bottom` / `left` / `start` / `end` / `inset*`). It governs them wherever they are written — a Tailwind utility, a Tailwind arbitrary value, a JSX inline `style={{ }}` object, or a React Native `StyleSheet.create` object. Inline style objects are where most of Orbit's spacing actually lives and are invisible to CSS tooling; they are not a loophole.

**What the scale does not govern:** `width` and `height`. An avatar diameter, an icon box, a sheet height are component dimensions, not layout rhythm. They answer to the primitives kit, not to this scale. Folding them in would force an exemption list wide enough to make the gate meaningless.

Mechanics: use a flex or grid container with `gap-*`. **Never `space-x-*` / `space-y-*`, never a margin for sibling spacing.**

**The named exemptions — these three, and nothing else.** An exemption is a category with a reason, never a value added to the scale because code already used it:

| name | what it covers | why |
|---|---|---|
| `pill-button-geometry` | the locked size table in `packages/shared/src/theme/button.ts` (heights 38/40/50/56, `paddingX` 18/26/30, icon `gap` 7/9/10) | A primitive's internal geometry, off-scale by history and frozen as shared data. It is read through `PillButton`, never hand-tuned per call. **The exemption is scoped to that one file.** Re-typing 9 or 26 into a chip, badge, or toolbar is not covered — that is the leak this scoping exists to stop. |
| `hairline-inset` | `±1` on a positional inset only (`top` / `right` / `bottom` / `left` / `start` / `end` / `inset*`) | Aligning an element to a 1px hairline is a rendering fact, not a spacing decision. It never applies to padding, margin, or gap. |
| `explicit-allow` | values passed to the rule's `allow` option | The escape hatch, and it is deliberately loud: adding one is a diff to the lint config, reviewed like any other. Per **Standing rules / product-and-content #2**, expanding the system is a request, not a judgement call. |

**Space unevenly on purpose:** tight within a group, real air between groups. Uniform gaps everywhere is the tell of no decision, not a system.

### Dark mode (the primary theme, purple scheme, byte-exact targets)

The dark surfaces below are the **white-alpha ladder composited over the frozen canvas**. The alpha ladder is the mechanism; the hexes are what it resolves to on the purple scheme.

```
--bg              #070910                     /* frozen canvas, neutral / faint-cool, NOT violet-tinted */
--bg-card         rgba(248,250,252,0.04)      /* THE card. Habit tonal panels, Astra card, PlanCard. -> #111319 */
--bg-field        rgba(248,250,252,0.05)      /* Field, OTP fill */
--bg-well         rgba(248,250,252,0.06)      /* emoji wells, icon squares -> #16181E */
--bg-elev         rgba(248,250,252,0.06)      /* elevated / hover step, same alpha as the well. NOT the card. */
--bg-elev-2       rgba(248,250,252,0.10)      /* the highest step -> #1F2128 */
--bg-sunk         rgba(0,0,0,0.28)            /* recessed wells */
--hairline        rgba(255,255,255,0.08)      /* #FFFFFF14 */
--hairline-ghost  rgba(255,255,255,0.10)      /* #FFFFFF1A - the habit tonal panel's ghost-edge ring ONLY */
--hairline-strong rgba(255,255,255,0.16)      /* #FFFFFF29 */
--fg-1 #F6F7F9  --fg-2 #C7CBD2  --fg-3 #888E99  --fg-4 #565C67
--primary         #8659EA                     /* fill / graphic only. Never small text on canvas. */
--primary-soft    #B69BF8                     /* accent TEXT only */
--primary-dim     #8659EA2E                   /* the accent tint */
--primary-pressed #6E44D2
--fg-on-primary   #FFFFFF                     /* scheme x mode resolved; see hand-tune log */
--status-done var(--primary) · empty rgba(255,255,255,0.22) · skip #888E99
--status-overdue rgb(254,154,0) · bad rgb(251,44,54) · frozen rgb(0,211,243)
--status-overdue-text rgb(254,154,0) · bad-text rgb(251,44,54)   /* = base; AA >= 4.5 on canvas */
--fg-on-bad rgb(2,6,24) · --fg-on-overdue rgb(2,6,24)   /* painted ON the bad|overdue fill; per-mode, see hand-tune log */
--selection-bg rgba(var(--primary-rgb),0.32)
--scrim rgba(0,0,0,0.55)                     /* THE modal/sheet/dialog backdrop. Theme-independent. Web `bg-black/55`, mobile `tokens.scrim`. */
```

There is **no `--gradient-header`** and **no glow shadow**. Both tokens are deleted, not softened.

### Light mode (MANDATORY, ships with every surface, all 6 schemes)

The freeze re-anchored dark only. Light keeps its slate-50 canvas and opaque white cards, minus the deleted gradient and glow. Its hairline alphas (0.08 / 0.16 ink) now match dark's, so the two modes share one ring weight.

```
--bg #F8FAFC · --bg-card #FFFFFF (opaque white cards) · --bg-elev #FFFFFF · --bg-elev-2 #FFFFFF · --bg-sunk rgb(241,245,249)
--hairline rgba(2,6,24,0.08) · --hairline-ghost rgba(2,6,24,0.10) · --hairline-strong rgba(2,6,24,0.16)
--fg-1 rgb(15,23,43) · --fg-2 rgb(49,65,88) · --fg-3 rgb(98,116,142) · --fg-4 rgb(144,161,185)
--primary-soft = --primary   /* on light, the accent is already dark enough to be text. See the accent split below. */
--status-empty rgba(2,6,24,0.18) · skip rgb(98,116,142) · overdue rgb(225,113,0) · bad rgb(231,0,11) · frozen rgb(0,146,184)
--status-overdue-text rgb(180,91,0) · bad-text rgb(231,0,11)   /* overdue darkened to AA; bad = base */
--fg-on-bad rgb(255,255,255) · --fg-on-overdue rgb(2,6,24)
--selection-bg rgba(var(--primary-rgb),0.18)
```

### The accent, and why `--primary` and `--primary-soft` are two tokens

This split is the single most-load-bearing token decision in the spec, and the accent-AA gate is designed to assert it directly (bundle 4 builds it; see `## Enforcement`). It exists because **no single violet can satisfy both floors at once, and the two floors contradict**:

- "white text ON the accent >= 4.5:1" needs a **dark** accent,
- "the accent as small text ON the dark canvas >= 4.5:1" needs a **light** accent.

Orbit resolves this by splitting the roles rather than compromising the color:

| token | role | floor | purple/dark measurement |
|---|---|---|---|
| `--primary` `#8659EA` | **fill and graphic only**: CTA background, FAB, progress ring, done dots, level bar, active tab | white on it >= 4.5 (text-on-fill) **and** it on canvas >= 3.0 (graphic) | white on `#8659EA` = **4.54:1** ✓ · `#8659EA` on `#070910` = **4.38:1** ✓ |
| `--primary-soft` `#B69BF8` | **accent text only**: an accent-colored word, link, or numeral on the canvas | it on canvas >= 4.5 (text) | `#B69BF8` on `#070910` = **8.6:1** ✓ |

Consequences that are not negotiable:

- **`--primary` is never small text on the canvas.** If you want an accent-colored word, it is `--primary-soft`. This is why a blanket "primary as text >= 4.5" assertion would be wrong: it would false-fail a fill-only accent.
- White-on-`--primary` clears AA at **4.54:1**, a thin margin. A future accent change must re-measure, not eyeball.
- The accent is off the indicted Tailwind violet-500 (`#7f46f7`) deliberately. Do not drift back toward it.
- On light, the accent is already dark (`rgb(99,29,242)`, measured **6.71:1** on `#F8FAFC`), so `--primary-soft` equals `--primary` there. The split only bites where the accent must be light enough to read on a dark canvas.

**Accent rationing.** The accent appears on: the active tab, progress and ring indicators, done dots, the primary CTA, the FAB, and active nav. That is the whole list. It is **never** decorative on a card, a row, a border, a heading, or an icon that is not communicating state. Rationing is what makes the accent mean something.

**Fixing a failing contrast ratio:** move the **OKLCH L channel only**. Chroma has negligible effect on contrast, so hold C and H fixed and the color stays recognisably itself. This is the method that keeps a future scheme's AA fix from drifting the hue and re-opening the locked accent identity.

### Per-scheme accents (exact)

| Scheme | dark primary / pressed | light primary / pressed |
|---|---|---|
| purple | `#8659EA` / `#6E44D2` | rgb(99,29,242) / rgb(81,15,211) |
| blue | rgb(43,127,255) / rgb(21,93,252) | rgb(21,93,252) / rgb(20,71,230) |
| green | rgb(0,201,80) / rgb(0,166,62) | rgb(0,166,62) / rgb(0,130,54) |
| rose | rgb(255,32,86) / rgb(236,0,63) | rgb(236,0,63) / rgb(199,0,54) |
| orange | rgb(255,105,0) / rgb(245,73,0) | rgb(245,73,0) / rgb(202,53,0) |
| cyan | rgb(0,184,219) / rgb(0,146,184) | rgb(0,146,184) / rgb(0,117,149) |

Each scheme needs its own `--primary-soft` satisfying the text floor on its canvas, derived from its primary by the L-only method above. Purple/dark is the only one measured to a byte so far (`#B69BF8`); the rest are derived and asserted by the accent-AA gate, per scheme, per mode.

### Shape, shadow, motion, icons

- Radii: 8 / 12 / 16 / 18 / 20, pill 999. Cards and habit tonal panels 18, emoji wells 12-14, fields 14, sheets **26 top radius**, CTAs pill.
- **Nested rounded surfaces use concentric radii: outer = inner + padding.** A parent and its inset child never share a radius. (The 46px emoji well at r14 inside a habit panel at r18 is the reference.)
- Shadows: hairline `0 0 0 0.5px rgba(255,255,255,0.06)`, sh-1 `0 1px 2px rgba(0,0,0,.20)`, sh-2 `0 4px 16px rgba(0,0,0,.28)`, sh-3 `0 12px 40px rgba(0,0,0,.45)`. **There is no primary glow.** Shadows model real occlusion under a lifted surface (sheets, menus); they are never a depth decoration and never carry the accent hue.
- Motion: `--ease-standard cubic-bezier(0.2,0,0,1)`, `--ease-out cubic-bezier(0.16,1,0.3,1)`, `--ease-in` for exits, durations 160/220/280. Transform + opacity only. Presets stay in `packages/shared/src/theme/motion.ts`. Full governance in **Motion** below.
- Icons: **Tabler**, always through the per-platform barrel `@/components/ui/icons` (never a direct `@tabler/*` import — the barrel wraps Tabler to a Lucide-compatible prop shape so a future set-swap is one file, and `no-restricted-imports` enforces this). strokeWidth **1.8** default, **2.2** active/emphasis, size 22 default. The barrel exports icons under their familiar Lucide names, so a swap of the underlying set never touches a callsite. The orange Sparkles ✨ is never an AI/default marker (identity is the Astra glyph); see Habit list.
- Hit targets: 44 min / 56 comfortable. See **Accessibility** for how to reach the minimum without growing the glyph.
- **Align optically, not geometrically.** Icons with directional or asymmetric mass (chevrons, play triangles, a leading plus, a glyph in a circular well) need a 1-2px nudge off mathematical center. This applies to the NavHeader back chevron, the ListRow trailing chevron, and PillButton leading icons.

### Derivation rules, per-scheme neutral tinting

Each scheme tints the neutral ramp; dark/light/system per scheme; 12 variants total.

1. **Alpha tokens are scheme-independent constants.** `--bg-card`, `--bg-elev`, `--bg-field`, `--bg-well`, `--bg-elev-2`, `--bg-sunk`, all three hairlines, `--status-empty` are white-alpha (dark) / ink-alpha (light) and inherit tint optically from the canvas beneath. They are identical across all 6 schemes. Preserve this mechanism; it is what makes the surface ladder cost nothing per scheme.
2. **Opaque neutrals re-derive per scheme via OKLCH:** convert each neutral (`--bg`, `--fg-1..4` dark; `--bg`, `--bg-sunk`, `--fg-1..4` light) to OKLCH; **lock L and C per token** (the ramp shape, shared by all schemes); hue varies per scheme.
3. **Per-scheme neutral hue:** purple = the hue of the frozen canvas `#070910`, which is neutral / faint-cool and deliberately **not** the old violet-tinted 265.1322. Other 5 schemes: `neutralHue(s) = accentHue(s) + Δ` where `Δ` is the purple offset, then hand-tuned per scheme so each looks intentional (clamp chroma in the 50-170° hue band to avoid murk). Every hand-tune is one documented line below.
4. **Acceptance (testable):** `createTokensV2('purple','dark')` and the web `.scheme-purple.dark` CSS resolve to exactly `#070910` bg, `#F6F7F9` fg-1, `#C7CBD2` fg-2, `#888E99` fg-3, `#565C67` fg-4, `#8659EA` primary, `#B69BF8` primary-soft. Light purple: `#F8FAFC` bg, white cards, `#0F172B` fg-1. A shared unit test asserts this.
5. **Status colors:** overdue/bad/frozen are fixed (not scheme-tinted) per mode. `--status-done = var(--primary)`.
6. **Primary-derived tints** (the accent at α = 0.08/0.10/0.12/0.15/0.18/0.28): web exposes `--primary-rgb` per scheme × mode; mobile gets `tintFromPrimary(tokens, alpha)` in `lib/theme.ts`. Never hardcode violet rgba in a component. There is no 0.45 glow alpha; it was deleted with the glow.
7. **Raw-slate mapping rule** (legacy porting): translate `--slate-200/300 → fg-2`, `--slate-400 → fg-3`, `--slate-500/600 → fg-4`, `rgba(248,250,252,α) → surface/hairline tokens`, literal `#fff` on primary → `fg-on-primary`. **Never copy a raw slate var into app code.**
8. **`color-scheme: light dark` is declared on the web document root**, with a matching `theme-color` meta, so scrollbars, native form controls, and the pre-CSS canvas follow the active mode. Without it the browser paints a light scrollbar against the dark canvas. Web only.

**Recompute note for bundle 5:** the canvas, fg ramp, hairline alphas, and accent all moved in the 2026-07-17 freeze. The derivation *mechanism* above is unchanged, but every per-scheme byte and every AA measurement other than the purple/dark ones stated in this doc must be recomputed against the new anchors, and the hand-tune log re-verified line by line. Do not assume a pre-freeze byte still holds.

Hand-tune log (rule 3):

- **Ramp hue drift (all schemes):** the neutral ramp is not iso-hue; each neutral token carries a hue offset relative to the canvas hue, preserved across schemes so purple stays byte-exact. This drift is deliberate. Do not "fix" it to constant hue.
- **green:** Δ-derived hue 121.74° sat in the 50-170° murk band (olive); nudged to 140 with chroma ×0.6 on both groups, giving cool sage instead of khaki.
- **orange:** Δ-derived hue 18.36° read rose-tinted; nudged to 32 (warm brown-black canvas).
- **blue / cyan:** canvas chroma gamut-clamped at the locked L; cyan's fg ramp also clamped. Values sit at the sRGB gamut ceiling ×0.985 so web CSS and the TS pipeline resolve identical bytes.
- **fg-on-primary (scheme × mode):** white fails 4.5:1 on green/orange/cyan (both modes) and blue/rose (dark), so those eight resolve to the canvas ink rgb(2,6,24). White stays on purple (both modes), blue light, rose light. Data in `color-schemes.ts` `fgOnPrimary`, mirrored per scheme × mode in `globals.css`.
- **fg-on-bad / fg-on-overdue (per mode):** the fixed bad / overdue fills flip lightness across modes, so their text flips too. `fg-on-bad` = canvas ink on the lighter dark-mode red, white on the deeper light-mode red; `fg-on-overdue` stays canvas ink in both modes (white fails AA on amber).

## Type roles

Use the semantic classes (web `.t-*`) / shared role data (`packages/shared/src/theme/type-roles.ts`), not raw sizes.

| Role | Family | Size/Weight | Extras | Color |
|---|---|---|---|---|
| eyebrow | Rubik | 12/500 | +0.08em, UPPERCASE | fg-3 |
| display | Rubik | 34/500 | tight tracking, lh 1.15 | fg-1 |
| hero | Inter | 60/700 | -0.02em, lh 1.15 | fg-1 |
| h1 | Rubik | 28/500 | tight, lh 1.3 | fg-1 |
| h2 | Rubik | 22/500 | -0.01em, lh 1.3 | fg-1 |
| row | Rubik | 18/400 | lh 1.3 | fg-1 |
| body | Rubik | 16/400 | lh 1.55 | fg-1 |
| secondary | Rubik | 14/400 | lh 1.55 | fg-2 |
| meta | Roboto | 12/400 | +0.02em, tabular | fg-3 |
| num | Roboto | inherit/500 | tabular | fg-1 |
| num-xl | Inter | 44/700 | -0.02em, lh 1, tabular | fg-1 |

**A visual type role is not a semantic level.** `display`, `h1`, `h2` are looks; `<h1>`, `<h2>`, `<h3>` are structure. Choose them independently: do not skip heading levels, keep one `h1` per surface, and never borrow a heading style for non-heading content.

### Measure and wrapping

- **Cap body and prose measure at 45-75 characters, target ~65ch.** A paragraph never spans the full container. This is the strongest single consensus in the harvest and it bites hardest at the desktop breakpoint, where the main column is already capped at ~740px. The mobile 412px shell is naturally inside the band; the web desktop surfaces are where this must be applied explicitly.
- `text-wrap: balance` on headings, `text-wrap: pretty` on body and description copy. Skip both in long-form. **Never hand-break with `<br>`**: pt-BR rewraps anyway and the break lands mid-phrase.
- **A display or hero heading never exceeds 2-3 lines.** Test heading copy at every breakpoint in **both** locales. Fix an over-wrapping heading by widening the container and reducing the size, never by accepting the wrap.
- **Ration eyebrows: at most one per three sections, hero included.** When in doubt drop it; the headline alone carries the section. An eyebrow labels a section, it never enumerates one. Numbered meta-labels ("SECTION 01", "QUESTION 05") are banned outright: delete, do not restyle.

## Layout & spacing

- **A card is not a layout primitive.** Group with spacing and alignment first. A card earns its place only when its content is a genuinely separable, actionable object. This is the upstream rule that prevents nesting, and it is the mechanism behind the habit list's grouped tonal panel.
- **Name one focal element per view before building.** Make it win by size, weight, contrast, and surrounding whitespace, and deliberately demote everything else. Only one element animates prominently at a time.
- **At any decision point keep simultaneously-considered options at <= 4.** Top-level nav <= 5, form fields <= 4 per visual group, 1 primary plus 1-2 secondary actions with the rest in a menu. 5 to 7 requires grouping or progressive disclosure; 8+ is a defect.
- **Give flex and grid children `min-width: 0`** (and `min-height: 0` for grid) so long unbroken content shrinks instead of blowing out the track. **Never put a fixed width on a text container.** Budget 30-40% string expansion for pt-BR everywhere, not just on buttons.
- **Align shared elements across side-by-side cards to the same Y** (title, description, price, CTA) and pin each card's CTA to its bottom, so the buttons form one line regardless of content length above. Applies to the PlanCard row and the StatTile grid.
- **Build multi-column layouts with CSS Grid**, never flexbox percentage math (`w-[calc(33%-1rem)]`). Web only.
- **Structural hacks are banned:** negative margins undoing a parent's padding, escape-hatch `calc()`, and absolute positioning used to dodge layout flow. Fix the layout instead.
- **Respect `env(safe-area-inset-*)` on fixed elements**, using `max(<base>, env(...))` so there is a floor, and ship `viewport-fit=cover`. This is load-bearing for the TabBar, the FAB, and the 26px-radius Sheet.
- **A sidebar uses the same background as the canvas**, never a different surface color. A hairline is the only separation it earns. Web only.

## Primitives kit

Web in `apps/web/components/`, mobile mirror in `apps/mobile/components/`: same name, same props, same behavior.

| Primitive | Key specs | Web | Mobile |
|---|---|---|---|
| NavHeader | 56px, centered UPPERCASE Rubik 13/500 +0.09em title, back chevron 26/2.0, right slot help (40px circled, inset 1.5px hairline-strong ring) / close / share | `ui/app-bar.tsx` | `ui/app-bar.tsx` |
| SectionTitle | Rubik 20/500 -0.01em, 24/14 padding | `ui/section-label.tsx` | `ui/section-label.tsx` |
| ListRow | 16/20 padding, icon 22/1.8 in 26px slot, title Rubik 18/400, desc 14 fg-3, value + trailing + chevron 22 fg-4, **draws no rule of its own**, danger=status-bad | `ui/settings-row.tsx` | `ui/settings-row.tsx` |
| SettingsGroup | the only owner of row separation: renders a hairline *between* adjacent rows and never after the last, so a rule can never trail into a section break or stack against a bordered element | `ui/settings-group.tsx` | `ui/settings-group.tsx` |
| Switch | 48×28 pill, 22px white thumb, on=primary / off=rgba(fg,0.16) | inside settings-row | inside settings-row |
| Radio/RadioRow | 24px, selected=primary fill + 9px white dot, else inset 2px fg-4 ring | `ui/select-check.tsx` | `ui/select-check.tsx` |
| Badge | pill 3/9px, 10.5/600 +0.06em UPPERCASE; tones violet/soft/outline/amber | `ui/badge.tsx` (+ pro-badge) | same |
| PillButton | pill CTA, 5 variants × 4 sizes off the shared `BUTTON_SIZES` geometry: primary (accent fill, **no glow**) / secondary (fg-1 bg + canvas text) / ghost (inset 1.5px hairline-strong) / destructive (status-bad fill + fg-on-bad) / caution (status-overdue fill + fg-on-overdue); md = h50·26px pad·Rubik 16/500·18 icon·9 gap (default), sm = h40, xs = h38 (grounded desktop-sidebar Criar), lg = h56. Hugs content; caps ~360px at desktop. Full canon in **Buttons** | `ui/pill-button.tsx` | `ui/pill-button.tsx` |
| StatTile | radius 18, `--bg-card` + inset hairline ring, emoji 28, value Inter 24/700 held to one line in a 29px box (web truncates with an ellipsis, mobile shrinks the font to 0.7), label 15/20 fg-2 clamped to **2 lines inside a fixed 40px reservation** so side-by-side tiles keep one baseline when a longer pt-BR label wraps. Tile and both text boxes carry `min-width: 0` | `ui/stat-tile.tsx` | same |
| PlanCard | radius 18, selected = `--primary-dim` tint + inset 1.5px primary ring; price Inter 22/700 | `upgrade/plan-card.tsx` | same |
| InfoCard | radius 18, borderless tonal aside (**no ring**); tone `quiet` (default, recedes) = `--bg-elev` bg + fg-3 icon, tone `accent` (focal call-out) = `rgba(var(--primary-rgb),0.14)` bg + `--primary-soft` icon; icon 22/1.8, 16/20 padding, gap 12 | `ui/info-card.tsx` | same |
| Field | min-height 54, radius 14, `--bg-field` + inset hairline, **visible persistent label** 14/500 fg-2 | `ui/field-input.tsx` | `ui/app-text-input.tsx` |
| OTP | 6 boxes 48×58, radius 14, `--bg-field`, active inset 2px primary, Roboto 26/500. Paste of a whole code MUST work | `ui/code-input.tsx` | `ui/code-input.tsx` |
| Sheet | backdrop `--scrim` (rgba(0,0,0,0.55)), panel 26px top radius, grabber 44×5 hairline-strong, title Rubik 24/500 | `ui/app-overlay.tsx` | `bottom-sheet-modal.tsx` |
| TabBar + FAB | top hairline, opaque canvas bg, **max 5 destinations**, icon 24 (active primary 2.2 / inactive fg-4 1.8), label 11; FAB 60px primary circle, ring `0 0 0 6px var(--bg)`, **no glow** | `navigation/bottom-tab-bar.tsx` | `navigation/bottom-tab-bar.tsx` |
| Satellite | 96px empty-state glyph, fg-4 strokes + primary arc. The empty half of the **state triad** | `ui/satellite-glyph.tsx` | same (react-native-svg) |
| VerifiedBadge | scalloped check, `--primary-dim` disc | `ui/verified-badge.tsx` | same |
| ProgressBar | 8px pill track rgba(fg,0.08), primary fill | `ui/progress-bar.tsx` | same |
| ProgressRing | thin band, `innerRadius` 0.94 (~6px stroke), primary sweep on a fg-4 track | right rail / Today | same |
| HabitRow | inside a tonal panel: 46px emoji well radius 14 `--bg-well`, name Rubik 16/500, meta 13 fg-3 + streak flame, trailing 30px check ring, per-row `⋮` overflow menu | `habits/habit-row.tsx` | `habits/habit-row.tsx` |

`GradientTop` is **deleted**. It backed the `--gradient-header` wash, which no longer exists.

## Buttons

`PillButton` (`ui/pill-button.tsx`, mirrored web + mobile) is the one pill CTA. Its geometry is shared data in `packages/shared/src/theme/button.ts` (`BUTTON_SIZES`) so the two platform mirrors cannot drift. Over-wide and over-wordy buttons are the two AI-slop tells this rule kills.

- **Variants:** `primary` (accent fill, no glow), `secondary` (fg-1 fill, canvas text), `ghost` (transparent, inset 1.5px hairline-strong ring), `destructive` (status-bad fill, fg-on-bad text), `caution` (status-overdue amber fill, fg-on-overdue text — the reversible-danger sibling of `destructive`, for the account-reset / fresh-start action; full account deletion stays `destructive`). `ConfirmDialog` builds its paired action row from `PillButton` itself — `ghost` for cancel, `primary` / `destructive` for confirm — never a hand-rolled pill.
- **Sizes:** `xs` (h38, 18px pad, 14px label, 16 icon, 7 gap; the grounded desktop-sidebar Criar), `sm` (h40, 18px pad, 14px label, 16 icon, 7 gap), `md` (h50, 26px pad, 16px label, 18 icon, 9 gap; the default), `lg` (h56, 30px pad, 17px label, 20 icon, 10 gap). A size is a fixed height + horizontal padding + label / icon / gap set; never hand-tune per call.
- **Width, hug by default.** A pill sizes to its content. A lone CTA in a wide container caps at ~360px and never spans a desktop content column. Full-width (`fullWidth`, or a phone-shell stretch) is sanctioned ONLY in: (1) the single primary action of a mobile bottom-sheet or dialog, (2) a form submit at or below the mobile breakpoint (auth, onboarding, support, create flows), (3) a full-screen empty-state primary CTA. `ConfirmDialog`'s paired action row is also allowed. Everywhere else the pill hugs. `fullWidth` enforces this itself: it stretches below the `sm` breakpoint and **releases to intrinsic (hug) width at `sm` and up**, capped at ~360px and centred in both block and flex parents — so a callsite never needs a `self-center` or width patch, and passing `fullWidth` can never produce a desktop slab.
- **Labels, 1-2 words, action-first.** Strip words the surrounding dialog title or section header already carries ("Log all" becomes "Log", "Registrar todos" becomes "Registrar"). pt-BR runs longer than en, so the size scale must absorb the longer string without going full-bleed.
- **One label per CTA intent per surface, and the name survives the whole flow.** The button that says "Publish" produces "Published", never "Submit" for "Save changes". Nav, hero, and footer pointing at one action use one string. This has real teeth here: every string exists twice (`en.json` + `pt-BR.json`) and the shortening rule above is exactly when a label and its toast drift apart.
- **Icons, a leading glyph where it aids recognition** (create → plus, confirm → check, destructive → trash), sized and gapped from the size token. Icon-only pills MUST carry a localized `aria-label` / `accessibilityLabel`. No decorative icons.
- **Press feedback:** see **Motion**. A pill scales to 0.96-0.97 on pointer-down, never lower.

## Surface rules

- **Translucency ladder on dark:** 0.04 card / 0.05 field / 0.06 well / 0.10 elev-2, white-alpha over the canvas. Surfaces stack by alpha, not by lighter hexes.
- **Opaque white cards on light.** Never translucent.
- **Inset 1px hairline rings instead of borders** (web `box-shadow: inset 0 0 0 1px var(--hairline)`; RN border with the same color reads equivalently).
- **No opaque card-on-card on dark.**
- **Minimal dividers.** Separate with whitespace or an inset ring first; a hairline rule is earned only between two adjacent flat rows. **Separation is the container's job, never the row's** — a row cannot know whether it is last or what follows it, so a row that draws its own rule inevitably trails one into a section break. Rows render flat; wrap them in `SettingsGroup` when adjacent rows earn a rule between them. Never stack two hairlines.
- **Blur and glass are never a default or a decoration.** A backdrop blur must be rare and purposeful or absent. An animated blur stays <= 8px, short, one-time, and never on a large surface. Orbit's ladder is an alpha ladder, not a blur ladder; with glow gone, backdrop-blur is the likeliest place decoration creeps back in.

## Habit list (frozen treatment)

The approved Today mockups define this exactly. It is the surface the whole design freeze was fought over.

- **Every top-level habit lives on its own tonal panel:** `--bg-card` + an inset `--hairline-ghost` ring, radius 18. Single-row for a simple habit, multi-row for a family (parent + sub-habits on ONE panel). A childless habit is never a flat row sitting next to family panels.
- **Panel row height matches across kinds.** A single-row panel is sized to the same row height as a family's parent row: web ~70px (via zeroed panel vertical padding), mobile ~66px.
- The panel is `--bg-card` (the quietest step) so the `--bg-well` emoji squares inside it read as the lighter elevation. The panel recedes; the content does not.
- **Two levels inline, then drill in.** A node with children beyond level 2 shows a **violet `›`** (open in focus); a grey `⌄` means expand in place; a grey `›` means a collapsed family. Drilling makes the node the root and shows a breadcrumb (`‹ Water › Água da manhã`) to climb back: full width, always legible, unlimited depth. Reuses `onDrillInto` / `canDrillInto` in `habit-row.tsx`.
- **Sub-habit rows:** indent + smaller well + dimmer text. **Zero connector or tree lines.** Connector lines are an AI-slop tell.
- **The per-row `⋮` overflow menu stays.** The mockup omits it; the mockup is a mockup. The mockups define the visual language (surfaces, spacing, tokens, panel treatment, ring, layout), not the complete control set. Existing per-row affordances (kebab, swipe actions) are retained unless a decision explicitly removes them.
- **Habit emoji render in full color.** The mockup shows them monochrome only because the design tool tints emoji by their fill. Do not judge icon color from the mockup. The orange Sparkles ✨ used as the default/AI habit marker is removed; color emoji stay.
- **Never animate the habit list's data while the user is reading or acting on it.** See **Motion**.

## States

**Every component ships its full state set before it is done: default, hover, focus, active, disabled, loading, error, empty.** A missing state is an unfinished interface, not a follow-up. This is where the two platform mirrors drift, so it is checked per diff.

**Every data surface ships the loading / empty / error triad.** The Satellite glyph is the primitive that exists to serve the empty half; if you shipped a data surface with no empty state, you did not use it.

- **Loading:** show a skeleton for any operation expected to exceed ~300ms. Below that, show nothing rather than a flashing spinner. The skeleton is **shaped like the final layout** and occupies the final content's dimensions, so nothing shifts when data lands. Never a generic centered spinner.
- **Empty:** a composed invitation to act (Satellite glyph + one line of copy + one primary CTA), never a blank region and never bare text.
- **Error:** see **Copy** below.

## Copy

- **Prefer an icon over a text label wherever a universal glyph exists** (add, close, copy, share, edit, delete, search, back, more, settings). Icon-only controls MUST carry a localized accessible label in both locales. `BulkActionBarV2` is the house pattern.
- **Words are reserved for:** primary and destructive CTAs that commit something, menu and list rows, and actions with no established glyph.
- **Strings stay short:** 1-2 words on buttons, chips, tabs, and labels. Sentences live only in body, description, and empty-state copy.
- **Say it once.** No header restating the intro beneath it, no explanation in two places on one surface. Each element does exactly one job: a label labels, an example demonstrates, nothing quietly does double duty.
- **Name every control by what the person controls and recognizes, never by how the system is built.** A person manages notifications, not webhook config. This bites hardest on Orbit's implementation-flavored concepts (sync, streak freeze, MCP, retrospective). Describe rather than sell; specific beats clever.
- **Store copy in natural case and control presentation with `text-transform`.** Never type UPPERCASE into a string: every string is duplicated across `en.json` and `pt-BR.json`, so baked-in caps double the cost of any restyle and fork the locales. Headings and descriptions are sentence case. The only uppercase surfaces are the locked roles: eyebrow, NavHeader title, Badge.
- **Errors appear next to where the action happened**, in plain language answering what happened, why, and how to fix it. Never blame the user. Never use humor in an error. Never a bare code or "Invalid input". Use active voice. No exclamation mark on success.
- **Reserve confirmation dialogs for genuinely destructive, irreversible actions.** Prefer easy undo for slips. A confirmation names the specific action and its consequence ("Delete 'Água da manhã'? This can't be undone."), never "Are you sure?". A confirmation on a reversible action trains users to click through the ones that matter.
- **Never invent precise-looking numbers.** A figure either comes from real data, is explicitly marked mock in the markup, or does not ship.
- **"Orbit" and "Astra" are never translated.** No em dashes in copy: use a comma, a period, or a hyphen.
- **Astra's register:** calm, no em dash, no exclamation.

## Desktop density & orientation

- At the desktop breakpoint, content composes **horizontally**: multi-column layouts, side rails, and grids. A single stretched mobile column is a defect, not a layout.
- **The main content column caps at ~740px and is centered.**
- **Right rail (desktop), top to bottom:** progress ring · stats (Restantes / Sequência / Nível + bar / Conquistas) · Consistência 7-day mini bar chart · Próxima conquista progress module · Astra pill. The rail uses `justify-content: space-between` so the modules distribute evenly, the Astra pill pins to the bottom, and Próxima conquista sits directly above it. Rail gap 20; no redundant per-section top padding.
- **Sidebar:** grounded at the bottom with the account chip and a Criar button (height 38) above it, on the canvas background with a hairline as its only separation.
- Primary app sections are one click away in the desktop sidebar. A section reachable only through Profile is buried.
- **Never hide core functionality at a breakpoint**, and keep one information architecture across every context. Adapt the layout, not the feature set or the mental model.
- **Match a feature's flow shape to its neighbors**, not just its surface: the same progressive-disclosure depth, the same modal-vs-full-page and inline-vs-route and save-on-blur-vs-submit choices, the same conceptual weight given the same visual weight, the same nouns and verbs.
- **A modal is never the first thought.** Exhaust inline and progressive-disclosure alternatives before reaching for one.

### Stacking

One semantic z-index scale, shared across both platforms. Overlays stack on a named tier, never a hand-picked number. Web reads it as Tailwind `z-<tier>` utilities from the `--z-index-*` theme tokens (`app/globals.css`); mobile reads `zLayers.<tier>` from `@orbit/shared/theme`. Values are spaced by 100 (1000–1700) so they sit far above local stacking and leave room without inviting off-scale literals.

Six tiers ascend: `dropdown` (1000) < `sticky` (1100) < `modalBackdrop` (1200) < `modal` (1300) < `toast` (1600) < `tooltip` (1700). Plus two Orbit carve-outs a generic scale gets wrong:

- **`celebration` (1500)** sits **just below `toast`**: an achievement/all-done/goal/streak-freeze overlay is modal-ish but transient, and a toast may still need to surface over it.
- **`tourSpotlight` (1400)** sits **above `modal`**, inverting the usual order, because a tour points AT modals.

Local sibling stacking is a different thing and stays local: lifting content above a `::before`, ordering a sticky table header, sending a decoration behind its content. Use a small `z-[1..9]` / standard `z-{n}` utility (web) or `zIndex: 1..9` (mobile) for those — they are not overlays and have no tier on this scale. Android shadow `elevation` is a depth cue, orthogonal to stacking, and is unaffected. The one banned thing is the arms-race literal: an arbitrary `z-[9999]` or raw `zIndex: 10003` that means "add until it works."

## Sub-screen navigation

Every sub-screen (anything that is not a top-level tab or sidebar destination) shows a visible back affordance (NavHeader back chevron), on both platforms and at every breakpoint. Hardware or browser back is never the only way out.

## Motion

Motion is governed on two axes: **whether** to animate, then **how**. The first axis is the one that was missing, and it subtracts.

### Whether (the gate)

**Gate every animation on frequency.** How often does the user see this?

| frequency | budget |
|---|---|
| 100+/day (keyboard shortcuts, command palette, core nav, habit toggling) | **none, ever** |
| tens/day | near-imperceptible or none |
| occasional (modals, sheets, drawers, toasts, settings) | the standard scale below |
| rare / first-run (onboarding, milestone, celebration) | the only place the delight budget lives |

**Every animation must name its purpose from this closed list:** feedback · spatial consistency · state indication · preventing a jarring change · explanation · delight (rare/first-run tier only). **If you cannot name it, delete it.** Apply the removal test: take it away; if nobody notices, it was decoration.

**Never animate data the user is trying to read or act on.** The habit list, streaks, and retrospective metrics are information-dense functional UI; motion there hinders.

**When motion is wrong, fix it in this order and stop at the earliest move that works:** (1) delete, (2) reduce, (3) fix the easing, (4) fix origin or physicality, (5) make it interruptible, (6) move it to the GPU, (7) make timing asymmetric, (8) polish. **Deleting outranks tuning.**

**Delight amplifies, never blocks.** Under ~1 second total, never delaying core functionality, always skippable, and rationed to earned moments (completion, a first-time action, a milestone crossing, error recovery). Never distributed across a surface. If the user notices the delight more than the goal, cut it.

### How

- **Transform and opacity only**, named explicitly. Durations 160 / 220 / 280. Presets in `packages/shared/src/theme/motion.ts`. Respect `prefers-reduced-motion`.
- **Quiet motion travels 10-20px, not 40px.** Shorten the distance before weakening the easing; when motion feels slow, shorten the duration before reaching for a sharper curve. Distance, not curve, is the difference between calm and dramatic at a fixed duration.
- **Motion must be interruptible.** Use CSS transitions (not keyframes) for anything rapidly re-triggered, retarget from the element's live presentation value on interrupt, and never lock out input while a transition runs. This is what makes rapid habit-toggling feel responsive rather than stuck.
- **Never animate an entrance from `scale(0)`.** Nothing appears from nothing. Enter at `scale(0.95)` + `opacity: 0`.
- **Exits are faster and softer than entrances** (~75% of the entrance duration), using a small fixed translate, never a full-height collapse. Slow where the user is deciding, fast where the system is responding.
- **Mirror `exit` against `initial`.** An element entering from `{ opacity: 0, y: 20 }` leaves to `{ opacity: 0, y: 20 }`, not to an unrelated transform. A reversible transition exits along the path it entered.
- **Easing by direction:** entrances ease out (`--ease-out`), exits ease in (`--ease-in`), view and mode transitions ease in-out, state changes use `--ease-standard`.
- **Linear easing is reserved for honest time representation** (progress bars, loading, scrub). A linear curve on a spatial move reads mechanical. Orbit has exactly the surfaces this exempts: ProgressBar and the ring sweep.
- **Springs vs curves, by the motion's origin:** user-driven motion (drag, flick, swipe) and anything interruptible mid-flight uses a spring, **critically damped by default** (damping ratio 1.0, response 0.3-0.4s), **no overshoot**. System-driven state changes and feedback use an eased curve with a fixed duration. There is no bounce and no elastic curve in Orbit.
- **Trigger-anchored overlays** (popover, dropdown, tooltip, menu) scale from their trigger via `transform-origin`, never from center. Modals are the exception and stay centered.
- **Directional slides are reserved for hierarchical navigation** (list → detail, the habit-list drill-in) and ordered sequences (prev/next, pagination), where direction encodes position. Lateral or unordered navigation (tab to tab) cross-fades or does not animate; a directional slide there falsely implies spatial depth.
- **Press feedback** is a transform `scale(0.96-0.97)` on `:active` / pressed over ~160ms, never below 0.95; any squash or stretch stays within 0.95-1.05. It **fires on pointer-down, never on release**, and stays continuous for the whole duration of a drag or sheet gesture rather than only when the gesture commits.
- **Gate hover-triggered motion behind `@media (hover: hover) and (pointer: fine)`**, never behind `(pointer: coarse)`, so a touch tap does not fire a false hover state. `apps/web` ships a 412px mobile-first shell used on touch, so this is live. Web only.
- **Stagger group entrances 30-80ms per item**, cap the total (~10 items × 50ms = 500ms), and never block interaction while it plays.
- **`AnimatePresence mode="wait"` runs exit and enter sequentially and nearly doubles perceived duration.** Halve each element's duration when using it, or a compliant 280ms preset silently becomes 560ms. Use `mode="popLayout"` for lists so exiting and entering items do not compete for layout space.
- **Pause looping animations when their element is off-screen.** This includes Orbit's own sanctioned loops (the `status-sweep` stroke-dashoffset keyframe, skeletons).
- **SVG `stroke-dashoffset` ring and progress sweeps are sanctioned** (paint-only, no layout). Derive `stroke-dasharray` from `path.getTotalLength()` (rounded up by 1) at runtime; never hardcode the dash length, or the stroke pre-reveals or over-draws. Animate the inner piece, not its container.

### Scroll reveals

- **A reveal never gates content visibility.** The pre-reveal state IS the visible state; the script only animates from it. Never ship CSS that hides content waiting on JS. A transition that never fires would otherwise ship a blank hero, which the hermetic screenshot gates would then bless.
- **A scroll reveal fires once per element** and is unobserved after firing. It never replays on scroll-back: a replaying reveal reads as a glitch, and live observers on every heading are a real cost.
- **Whole-section fade-and-rise on scroll is an AI-slop tell, not choreography.** Reserve scroll-triggered motion for moments that earn it. Never add page-load choreography. This names the landing page's `reveal.ts` directly, where the reveal is currently the entire motion budget.

## Accessibility

Orbit has no a11y gate today. This section is where it starts, and bundle 4 turns the checkable half into lint. **Automated accessibility testing covers only 30-50% of issues:** an axe or Lighthouse pass is a floor, never evidence of conformance, and a green Lighthouse a11y category is not a verdict. Keyboard and screen-reader checks stay manual.

### Perception

- **Never encode state or meaning in color alone.** Every status (done / overdue / bad / frozen / skip) must also be carried by an icon, a shape, a text label, or a position. Orbit's status language is currently dots and rings whose only differentiator is hue, across 6 schemes, which is unreadable to a colour-blind user. Contrast ratios do not fix this; redundancy of encoding does.
- **Non-text UI elements meet 3:1 contrast against their adjacent surface** (control borders, icons, focus rings, state indicators). Text stays at 4.5:1. This matters more now that glow is gone and hairlines carry the hierarchy.
- **Honour `prefers-reduced-transparency`** (raise surface opacity toward solid) and **`prefers-contrast: more`** (near-solid backgrounds plus a defined contrasting border). The whole dark surface ladder is white-alpha translucency, so reduced-transparency is directly load-bearing.
- **Never ship a full-viewport moving background, a slow ~0.2 Hz oscillation, or an abrupt light/dark brightness jump.** (The de-decorated base already forbids the first; this is the vestibular reason it also stays forbidden.)
- **When text is truncated** with `text-overflow: ellipsis` or `line-clamp`, keep the full value reachable (tooltip, expanded view) if the hidden text carries meaning. HabitRow names, ListRow descriptions, and friend names are all truncation candidates in a 412px shell.

### Keyboard and focus

- **Every interactive element carries a visible `:focus-visible` state:** a 2px ring with an offset, painted from the accent token. Prefer `:focus-visible` over `:focus` so the ring appears only on keyboard navigation. A focus ring reads as a keyboard affordance, not decoration, so it survives the de-decorated base. **No surface may contain a keyboard trap.**
- **Never remove a focus outline** (`outline-none`, `outline: none`) without shipping a visible focus replacement in the same rule.
- **When a dialog, sheet, or overlay opens, move focus into it and trap focus inside; on close, restore focus to the trigger.**
- **Provide a "Skip to main content" link as the first focusable element on the web shell.** The desktop sidebar and tab bar put many links before content. It is visible on focus only, so the de-decorated base is untouched. Web only.
- **Never let a hit area overlap another interactive element's.** Reach the 44/56 minimum by expanding with an absolutely-positioned `::before` at a negative inset on a `position: relative` parent, not by growing the visible box and not by adding a wrapper that moves layout. Zero visual footprint. Web only for the pseudo-element mechanism; mobile uses `hitSlop`.
- **Never make functionality reachable only through hover.** A touch user cannot hover, so a hover-revealed action needs a tap-reachable equivalent. This is affordance reachability, distinct from gating hover *motion*.

### Semantics

- **Reach for semantic HTML before ARIA.** ARIA is the fallback when no native element carries the semantics, never the first solution. Web only.
- **Mark a purely decorative icon SVG `aria-hidden="true"`** so it is not announced. An icon that carries meaning gets a label on its control instead. This is the complement to the icon-only-control label rule: an icon sitting next to a text label should be silenced.
- **Expandable controls carry `aria-expanded` and `aria-controls`.**
- **Link text must carry standalone meaning** ("View pricing plans", never "Click here" or "Read more").
- **When text is split into per-word or per-character spans for animation**, set the original sentence as `aria-label` on the parent and `aria-hidden="true"` on every fragment, preserve the spaces, and never split a link or a button. This constrains the markup, not the motion. Landing page.

### Forms

- **A placeholder is never a field's only label.** Every input carries a visible, persistent label; the placeholder carries the format example; helper text lives in the markup.
- **Style a native input's placeholder with `::placeholder`.** Never simulate one with a conditionally-rendered absolutely-positioned span over the input: it breaks the accessibility tree, IME, and autofill.
- **A field's error is linked with `aria-describedby`, the field carries `aria-invalid`, and required state is announced.** A validation error never clears the user's input. The error renders adjacent to its field; a summary at the top of the form is never the only signal.
- **Never block paste in an `input` or `textarea`.** Orbit's canonical exposure is the 6-box OTP primitive, where hand-rolled per-box key handling is exactly what breaks pasting a whole code.
- **Keep input text at 16px minimum on mobile web viewports** (`text-base sm:text-sm`) so iOS Safari does not zoom the page on focus. `apps/web` is the iOS surface; `apps/mobile` is Android-only. Web only.
- **Never disable zoom** (`user-scalable=no` / `maximum-scale=1`) and keep every web surface usable at 200% zoom. If the layout breaks at 200%, fix the layout rather than pinning the viewport. The fixed-412px shell language makes a scale lock a live temptation; it is still banned. Web only.

### Announcements

- **A toast is never the only channel for information the user must act on.** Mirror it in a persistent surface.
- **If audio feedback is ever added:** sound never replaces visual feedback, ships behind an explicit off toggle, defaults subtle (~0.3 volume), and is suppressed under `prefers-reduced-motion`. Orbit ships no audio today; this is a standing gate on a future addition.

## Special surfaces

**Paywall.** At most 3 plans. Mark exactly one recommended and style it subtly with the existing PlanCard selected treatment. Write bullets as outcomes, not feature names, 3 to 6 visible per plan. Keep the CTA verb identical across every tier. Pair the monthly/annual toggle with an explicit savings callout: the arithmetic is visible, never implied.

**Landing hero (`orbit-landing-page`).** A 3-second message gate: the headline and CTA are readable within 3 seconds, with no visual treatment between the visitor and the offer. If a treatment competes, reduce the treatment, not the copy.

## Bans

- **No decorative glow.** The primary-glow shadow token is deleted. Not on the CTA, not on the FAB, not anywhere. A softened glow is still a glow.
- **No gradient wash.** `--gradient-header` and `GradientTop` are deleted. No decorative gradient of any kind: no gradient borders, no gradient text (`bg-clip-text` over a gradient), no mesh, no bloom, no scanlines, no film grain, no "subtle texture".
- **No decorative background orbit arcs.** Identity is the logo, the Astra glyph, and ring indicators.
- No accent outside the rationed list (active tab / progress / done dots / primary CTA / FAB / active nav).
- No coloured side-stripe: never a `border-left` / `border-right` thicker than 1px as an accent stripe on a card, row, callout, or alert.
- No raw `--slate-*` references in app code. Semantic tokens only.
- No hardcoded violet rgba. Tints come from `--primary-rgb` / `tintFromPrimary`.
- No off-scale shadow. Lifted surfaces (sheets, menus, dialogs, toasts, tooltips) read sh-1/sh-2/sh-3 (`--shadow-1/2/3`, mobile `shadowsV2`) verbatim, paired with `inset 0 0 0 1px var(--hairline)` for the lift ring. Never a hand-rolled `box-shadow` with a heavier blur or darker alpha than the token — a bespoke `0 24px 60px rgba(0,0,0,0.55)` is a depth decoration, which shadows are never.
- No opaque card-on-card on dark. No borders-as-borders where the kit uses inset rings. No stacked hairlines.
- No off-scale spacing value — the legal set is `0 4 8 12 16 20 24 28 32 40 48 56 64` and the three named exemptions in **Spacing**, nothing else. No `space-x-*` / `space-y-*`. No margins for sibling spacing.
- No `transition-all`. Animate `transform` and `opacity` only, named explicitly.
- No bounce or elastic easing (any `cubic-bezier` whose y control points fall outside `[0,1]`). No spring overshoot.
- No `h-screen`. Use `min-h-dvh`.
- No structural hacks: no negative margin undoing a parent's padding, no escape-hatch `calc()`, no absolute positioning to dodge layout flow.
- No arbitrary z-index (`z-[9999]`, `zIndex: 999`). Overlays stack on the semantic scale in the theme tokens — see **Stacking**.
- No new font families, radii, or colors outside this spec. Rubik/Inter/Roboto only.
- No per-component scheme branches. Schemes resolve through tokens only.
- No em dashes in copy. No UPPERCASE typed into a string.
- No `<br>` to hand-break copy.
- No text button where a universal glyph exists; no icon-only control without an accessible label.
- No full-bleed pill CTAs outside the **Buttons** allowlist, and never at the desktop breakpoint.
- No ad-hoc raw pill button, no hand-tuned button height or padding, no `variant="white"`. Use `PillButton` with a canonical variant and size.
- No fabricated numbers in a shipped UI.
- No numeric design score. The design is frozen; it is not a metric to optimize, and a self-score invites re-litigating a locked decision.

## Working model

1. **Context** - state the screen's job in one sentence. Who, what density, what mood.
2. **Anchor** - already chosen and locked: **de-decorated navy-violet orbital**. Do not re-pick.
3. **Focal element** - name the one element that wins this view, and how (size, weight, contrast, whitespace). Demote everything else deliberately.
4. **Differentiator** - name the one memorable move for this screen in one sentence. It must be visible in the build, and it must come from the identity carriers (logo, Astra glyph, ring indicators, rationed accent), never from added decoration.
5. **System** - use the tokens above. No new colors, font families, radii, or spacing values.
6. **Implementation** - outline structure, then build. Then run the three tests below.

### AI-slop test

Before shipping, scan for the tells and delete what you find:

- decoration used as hierarchy: any glow, gradient wash, gradient border, gradient text, mesh, texture, bloom, or "quiet" background effect;
- cards in cards, and cards used where spacing would have grouped;
- a coloured side-stripe border on a row or callout;
- connector or tree lines in a hierarchy;
- grey text on coloured backgrounds; rounded-square icon tiles above headings;
- an oversized centered H1 outside a hero context;
- the hero-metric template (big number, small label, stat row) used as decoration, or any invented precise-looking number;
- a whole-section fade-and-rise scroll reveal, or any page-load choreography;
- an animation whose purpose you cannot name from the closed list;
- a heading and the intro beneath it saying the same thing;
- an eyebrow that enumerates rather than labels.

### Squint test

Blur the surface. Hierarchy and section boundaries must still read, and nothing may jump out harshly. This catches the failure the AI-slop test does not: flatness, and harsh lines.

### Scene-sentence test

Describe the rendered screen in one sentence as if narrating a film scene. If the sentence reads like every other SaaS app ("a clean modern dashboard with cards"), the design is generic. It must specifically name Orbit's character: a near-black neutral canvas, quiet tonal panels separated by hairlines, one violet reserved for what is done and what is next, and the orbital ring language carrying the identity. If the only way you can make the sentence specific is by describing decoration, the design has failed and the decoration is not the fix.

## Enforcement

**Prose is not enforcement.** The rules above split three ways. Bundle 4 (#539) builds the gates; this table is the contract it implements against.

### Gate-backed (bundle 4 builds these; the prose above is the intent, the gate is the enforcement)

| rule (section) | mechanism | notes |
|---|---|---|
| The accent split and its three floors (Tokens) | **accent-AA token test**, per scheme × mode: (1) white on `--primary` >= 4.5; (2) `--primary` on canvas >= 3.0; (3) `--primary-soft` on canvas >= 4.5 | The headline gate. **Not** a blanket "primary as text >= 4.5", which would false-fail a fill-only accent. |
| Byte-exact token acceptance (Derivation rule 4) | shared unit test on `createTokensV2` + the resolved web CSS | Targets moved in the freeze; re-baseline. |
| No decorative glow (Bans) | `local/no-decorative-glow` lint | The token is deleted; the lint stops it being re-derived from `--primary-rgb`. |
| No gradient wash / gradient text (Bans) | `local/no-raw-gradient` + `local/no-gradient-text` | |
| No coloured side-stripe (Bans) | `local/no-side-stripe-border` | Mobile via the style-object branch. |
| No bounce or elastic easing (Motion) | `local/no-overshoot-easing`: any `cubic-bezier(a,b,c,d)` with `b` or `d` outside `[0,1]` | 4 skills independently proposed overshoot and were dropped each time; the ban is the settled position. |
| No `space-x-*` / `space-y-*` (Spacing) | `local/no-space-x-y` | |
| Off-scale spacing (Spacing) | `local/spacing-scale`: margin / padding / gap / inset values checked in Tailwind utilities, Tailwind arbitrary values, JSX inline `style={{ }}`, and `StyleSheet.create` | Reads the enumerated scale, carries the three named exemptions (`allow` option + the file-scoped PillButton exemption + the `±1` inset hairline). Autofixes only an unambiguous snap (within 1px of a unique non-zero step: 9 → 8, 13 → 12); leaves 6/10/14/18/22 unfixed because those are layout decisions. **Ships report-only** — see `.claude/specs/issue-539-spacing-audit.md` for the arming line and the 1157-violation baseline. |
| No arbitrary z-index (Stacking) | `local/no-arbitrary-zindex`: arbitrary `z-[n]` / raw `zIndex: n` with `n >= 10` | Bans the arms-race literal only. Local sibling stacking (`z-[1..9]`, `zIndex: 1..9`), the `z-<tier>` utilities, `zLayers.<tier>`, and Android `elevation` are allowed — see **Stacking**. |
| Focus outline never removed bare (A11y) | `local/require-focus-replacement`: `outline-none` with no `focus-visible:` sibling | WCAG 2.4.7. |
| Never disable zoom (A11y) | `local/no-user-scalable-no` over the viewport meta / Next `viewport` export | Web only. |
| `<div onClick>`, positive `tabIndex` (A11y semantics) | *enable, do not write*: `jsx-a11y/no-static-element-interactions`, `no-noninteractive-element-interactions`, `click-events-have-key-events`, `tabindex-no-positive` at **error** | |
| Image alt text (A11y semantics) | *enable* `jsx-a11y/alt-text` + `local/no-placeholder-alt` (`alt="image"` / `"photo"` / `"img"`) | |
| Dialog / Sheet accessible name (A11y) | `local/require-dialog-title` | |
| No `will-change` in a static class (Motion) | `local/will-change-discipline` | Mechanical half only. |
| Raw font feature / axis tags (Type) | `local/no-raw-font-feature-tag` | |
| No `calc()` percentage widths (Layout) | `local/no-calc-percentage-width` | Web only. |
| AnimatePresence `exit` + stable keys (Motion) | `local/animate-presence-exit`, `local/animate-presence-stable-key` | Silent failures: nothing errors, the animation just does not play, or the wrong row animates out. |
| No em dashes in copy | `.claude/hooks/forbid-em-dashes.mjs` | **Already shipping.** |
| No hardcoded brand color | `.claude/hooks/forbid-hardcoded-brand-color.mjs` | **Already shipping.** |
| No full-bleed pill CTA (Buttons) | `local/no-fullbleed-button` | **Already shipping**, web only. Mobile StyleSheet width is not statically linkable, so mobile stays reviewer-judgment. |
| Icons only through the barrel (Icons) | `no-restricted-imports` bans `lucide-react(-native)` + `@tabler/icons-react(-native)` outside `components/ui/icons.tsx` | #539 b6. The barrel is the only file allowed to import the icon set directly. |
| AI-cliché copy words | `.claude/hooks/forbid-ai-cliche-copy.mjs` (new) | Wordlist over `en.json` + `pt-BR.json` values. Same shape as the em-dash hook. |
| No UPPERCASE typed into a string (Copy) | wordlist/shape check over i18n **values** in the same hook family | Must not fire on keys or on acronyms. |

### Reviewer-judgment (the `design-reviewer` agent enforces these per diff)

Everything else, and specifically: the 65ch measure, the spacing rhythm (tight within a group, air between groups), concentric radii, optical alignment, "a card is not a layout primitive", one focal element per view, the <=4 options ceiling, blur and glass restraint, the frequency gate and the closed purpose list, the motion remediation order, the delight budget, the loading/empty/error triad, the full state set, copy naming and "say it once", error content and placement, confirmation-dialog warrant, eyebrow rationing, the habit-list treatment, the paywall shape, flow-shape parity with neighbors, colour-as-only-signal, the 3:1 non-text contrast floor, focus management in overlays, reduced-transparency and reduced-contrast handling, and all three shipping tests (AI-slop, squint, scene-sentence).

### Not enforceable here

`prefers-reduced-transparency` / `prefers-contrast` handling, the 200% zoom layout, keyboard traps, and screen-reader semantics need the **live rendered DOM**. They belong to the proposed a11y baseline-diff CI gate (reusing `visual.yml`'s hermetic mock-api plus `perf.yml`'s fake-JWT harness), which reports only diff-introduced violations. Note the baseline must be captured **without** `git stash` / `git checkout`: the `/drive` engine's children share the tree.
