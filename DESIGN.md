> **At a glance** - the authoritative spec for every Orbit UI surface; it overrides generic and user-global design defaults.
> - Anchor (D66, 2026-08-14): spacious, near-black, maximum contrast, warmth in ONE mark. Canvas `#09090B`, ONE colour scheme, ONE accent (the hue is decided at human grant 1). **No decorative glow, no gradient wash, no Liquid Glass, anywhere.**
> - Identity is carried by the orbital logo mark, the Astra orbital glyph, and ring-shaped indicators. Never by background decoration.
> - Semantic tokens only (`--bg`, `--bg-card`, `--bg-elev`, `--fg-1..4`, `--primary`, `--primary-soft`, `--primary-rgb`, `--hairline`, `--scrim`, ...); no raw hex in UI.
> - Scales: type, spacing (enumerated, gated by `local/spacing-scale`), radius, motion. Ships light AND dark, **two variants, not twelve**; mobile-first 412px shell.
> - Tokens live in `apps/web/app/globals.css` + `apps/mobile/lib/theme.ts` + `packages/shared/src/theme/`.
> - Sections (exact `##` names, so this line is greppable): Identity & anchor · Tokens · Type roles · Layout & spacing · Primitives kit · Overlay · Buttons · Surface rules · Habit list · Listing · States · Voice · Desktop density & orientation · Sub-screen navigation · Motion · Accessibility · Special surfaces · External component sources · Bans · Working model · Enforcement.
> - Read the whole doc before shaping, reviewing, or theming any surface. `## Enforcement` says which rules are gate-backed and which are reviewer judgment.

# Orbit Design System

**Authority note:** this DESIGN.md is authoritative over any generic or user-global design default. Deliberate emoji use (habit emoji wells, celebration heroes) is part of the language and overrides the global anti-emoji rule on those surfaces only.

It is authoritative for **both platforms** (`apps/web`, `apps/mobile`) and for the `orbit-landing-page` mirror. A rule is cross-platform unless it names a platform.

**Provenance.** The direction is the 2026-08-05 direction ADR, amended by D66 (2026-08-14). The mechanical rules come from the 2026-07-17 harvest of 193 external design skills, plus 45 skill files and one component library read live on 2026-08-15. The implement-or-reject verdict for every one of those inputs is recorded on ticket `#36`, not here: this document is the guidance, and which external source it came from does not change how a surface gets built. Where this document and a rendered `design/reference.html` disagree, **the page wins and this prose is the defect** (D42).

**Every sentence below changes an implementation choice.** Nothing here is advice.

## Identity & anchor (locked)

Orbit is a **spacious, near-black habit tracker with exactly one accent**. Space is the primary hierarchy device. Where a surface step or a hairline would separate two things, use space first.

Identity comes from three things and nothing else:

1. the **orbital logo mark**,
2. the **Astra orbital glyph** (which replaces the sparkle icon),
3. **ring-shaped status and progress indicators**.

It does **not** come from a background gradient, a glow, decorative background orbit arcs, a texture, or a glass material. Hierarchy is bought with space first, then size, weight, and contrast. A surface step or a hairline is the last resort.

**Warmth has exactly one source: the mark.** There is no warm palette, no texture, and no illustration set. If a surface feels cold, the answer is space and type, never a second warm element.

**Quiet decoration is still decoration.** A softened glow, a 0.03-opacity texture, a "subtle" mesh gradient, and a barely-there blur are the same violation as the loud version.

**"Design" means UX and accessibility, not appearance.** Do not read this document as a skin.

**Finish it or delete it. Nothing stays at 60%.**

## Tokens

Canonical CSS lives in `apps/web/app/globals.css`; the mobile equivalent is `createTokensV2` in `apps/mobile/lib/theme.ts`; shared ramp data in `packages/shared/src/theme/`.

**OKLCH is the derivation space. Hex and `rgba()` are the authored notation.** Derive every value in OKLCH, then write the resolved hex or `rgba()` into the token source. Never author an `oklch()` literal in a shared token or a mobile style: `@react-native/normalize-colors` parses `hex`, `rgb`, `rgba`, `hsl`, `hsla` and `hwb`, and has **no `oklch` branch** (read from the installed package, 2026-08-15), so an `oklch()` token is a runtime failure on Android and breaks the parity contract.

**A token carrying alpha cannot be contrast-checked on its own.** Its rendered value depends on what sits behind it. Every alpha token below therefore records the hex it resolves to over the canvas, and any surface that can sit over arbitrary content is authored **opaque**.

### Type

- Families: `--font-sans` **Geist Sans** (UI), `--font-display` **Space Grotesk** (display numerals and hero), `--font-mono` **Geist Mono** (meta and tabular numerals).
- Weights loaded: Geist Sans 400/500/600 · Space Grotesk 500/600 · Geist Mono 400/500. Any other weight is a bug, not a rendering.
- Scale: `--fs-xs 12 / sm 14 / base 16 / md 17 / lg 20 / xl 22 / 2xl 28 / 3xl 34 / 4xl 44 / 5xl 60`.
- **Size floors:** long-form body about 16, inputs and menus about 14, captions 13, rarely below 12. Below 18, stay at weight 400 or above; weights under 300 do not exist in this system.
- **Emphasis within a role is one weight step up, never a size change.**
- Line-height by role: display 1.05 / heading 1.15 to 1.2 / row 1.35 / body 1.55 / meta 1.4. Unitless values only. **Anything that wraps to 3 or more lines takes at least 1.4**, even in a height-constrained row.
- **Tracking is size-specific.** Large display text takes negative tracking; body sits at 0; small uppercase labels take positive tracking. A single `letter-spacing` value across the scale is wrong somewhere.
- **`font-synthesis: none` on the document root.** Verify first that every required weight loads, because disabling synthesis must never erase emphasis.
- **Apply `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` once on the root**, never per component. Web only.
- Express a typographic feature through its dedicated CSS property, never the raw axis or feature tag: `font-weight` not `font-variation-settings: "wght"`, `font-variant-numeric: tabular-nums` not `font-feature-settings: "tnum" 1`.
- **`text-box: trim-both cap alphabetic` on badges, chips and pill labels**, so text sits optically centred rather than low. Progressive enhancement; unsupported browsers keep the default leading. Web only.
- **Light text on a dark surface is compensated on three axes**: add `0.01em` tracking, add `0.05` to the line-height, and add one weight step where the face needs it. This is the legibility check that the maximum-contrast target requires, and it answers the halation risk the direction ADR recorded.

**There is no serif. Cut by Thomas against the rendered reference, 2026-08-15.** Instrument Serif was carried as D66 decision 9's provisional fourth family on warm surfaces. It is dropped, so **the direction ADR's ban on a display serif as a second warmth source stands unamended**, and D66 decision 9 resolves to "cut". Three families is the whole system. A warm surface gets its warmth from space, size and the mark, never from a second face.

### Spacing (base 4)

**The scale is these ten values and nothing else** (chosen by Thomas against the rendered reference, 2026-08-15):

```
0  4  8  12  16  24  32  48  64  96
```

It drops 20, 28, 40 and 56, which are the values the 1,436 existing violations cluster around, so there is less to choose wrongly between, and its jumps widen at the top to serve the spacious direction.

**The rule the values satisfy: the gap between two groups is at least 2x the gap within a group.** 8 inside a group means 16 or more between groups. Uniform gaps everywhere are the tell of no decision. This is the mechanical grounding the scale has.

**12 and 24 survive** because those are the measured control clearances below.

**Two padding roles sit on top of the scale**, because a card that hugs its text reads as cramped no matter how correct the gaps around it are:

| role | value |
|---|---|
| card and panel padding | **24** |
| list-row padding | **16** |

| between | clearance |
|---|---|
| adjacent bordered or filled controls | 12 |
| around borderless text and icon controls | 24 |
| unrelated control groups | 24 or more, and at least 2x the intra-group gap |

A spacing value outside the chosen set is a defect. The set is enumerated rather than described as "a multiple of 4" because a machine has to check it.

Negative values are legal only at the negation of a scale step, and only where a negative offset is genuinely the layout.

**What the scale governs:** `margin` and `padding` (every side, every logical and React Native variant), `gap` / `rowGap` / `columnGap`, and the positional insets. It governs them in a Tailwind utility, a Tailwind arbitrary value, a JSX inline `style={{ }}` object, and a React Native `StyleSheet.create` object.

**What the scale does not govern:** `width` and `height`. Those are component dimensions and answer to the primitives kit.

Mechanics: use a flex or grid container with `gap-*`. **Never `space-x-*` / `space-y-*`, and never a margin for sibling spacing.**

**The named exemptions, these three and nothing else:**

| name | what it covers | why |
|---|---|---|
| `pill-button-geometry` | the locked size table in `packages/shared/src/theme/button.ts` | A primitive's internal geometry, frozen as shared data. **The exemption is scoped to that one file.** |
| `hairline-inset` | `±1` on a positional inset only | Aligning to a 1px hairline is a rendering fact, not a spacing decision. |
| `explicit-allow` | values passed to the rule's `allow` option | The loud escape hatch. Adding one is a diff to the lint config. |

**Units: px everywhere, for parity.** React Native has no `rem`. Two web-only exceptions are sanctioned platform adapters: media-query breakpoints and the `max-width` of a text container may use `rem`, so both respond to the reader's base font size.

### Dark mode (the primary theme, byte-exact)

Every value is derived in OKLCH against the canvas and measured. Do not eyeball a replacement.

```
--bg              #09090B                     /* canvas. oklch(0.141 0.004 285.8). White on it 19.90:1 */
--bg-card         rgba(250,250,250,0.04)      /* THE card -> #131315 */
--bg-field        rgba(250,250,250,0.06)      /* field, OTP fill -> #171719 */
--bg-well         rgba(250,250,250,0.08)      /* emoji wells, icon squares -> #1C1C1E */
--bg-elev         #1C1C1E                     /* OPAQUE. Overlay panel, menus, popovers */
--bg-elev-2       rgba(250,250,250,0.12)      /* the highest inline step -> #262628 */
--bg-hover        rgba(250,250,250,0.14)      /* THE hover surface -> #2B2B2C. 1.31:1 against the resting card */
--bg-sunk         rgba(0,0,0,0.28)            /* recessed wells -> #060608 */
--hairline        rgba(255,255,255,0.08)      /* separator: divides content */
--border-control  rgba(255,255,255,0.08)      /* border: encloses a control. Same value today, separate role */
--hairline-ghost  rgba(255,255,255,0.10)
--hairline-strong rgba(255,255,255,0.16)
--fg-1 #F4F4F6   /* 18.11:1 */   --fg-2 #C9C9CC   /* 12.04:1 */
--fg-3 #8F8F93   /*  6.18:1 */   --fg-4 #5D5D60   /*  3.03:1, clears the 3:1 non-text floor */
--primary         PENDING GRANT 1             /* fill and graphic ONLY. See "The accent" */
--primary-soft    PENDING GRANT 1             /* accent TEXT on the canvas */
--primary-pressed PENDING GRANT 1             /* the fill, 16% toward the canvas */
--primary-hover   PENDING GRANT 1             /* the fill, 12% toward its own foreground */
--primary-rgb     PENDING GRANT 1
--primary-dim     PENDING GRANT 1             /* the fill at 18% over the canvas */
--fg-on-primary   PENDING GRANT 1             /* white on a dark fill, the canvas ink on a light fill */
--status-done     var(--primary)
--status-empty    var(--fg-4)                 /* ring track. 3.03:1 */
--status-skip     var(--fg-3)
--status-frozen   var(--fg-2)                 /* NEUTRAL. See the note below */
--status-overdue  #FE9A00                     /* 9.32:1, hue 65.4 */
--status-bad      #FB2C36                     /* 5.23:1, hue 25.4 */
--fg-on-bad       #020618      --fg-on-overdue #020618
--selection-bg    the fill at alpha 0.32
--scrim           rgba(0,0,0,0.55)            /* THE overlay backdrop. Theme-independent */
```

**The canvas is near-black, not pure black.** `#09090B` is the measured Pierre value; Linear sits at `#08090a`. White on `#09090B` is 19.90:1 against 21.00:1 on pure black, so the contrast cost is 5% and the halation cost is real. Maximum contrast is a floor plus a legibility check, never "as much as possible".

**The neutral ramp is effectively hueless and stays that way.** Every neutral carries chroma at or below 0.006, which is below the nameable threshold, and holds one hue end to end. A ramp that does not lean on the accent hue does not have to be re-derived the next time the accent moves, which is the cost this redesign just paid.

**`--status-frozen` is retired as a hue.** Measured 2026-08-15: the old `#00D3F3` sits 12.0 degrees from the new accent, inside the 15-degree band where two hues read as one colour, so streak-freeze and done would have looked like the same state. **Frozen renders as a neutral chip plus the snowflake glyph.** This removes a colour from the system, and the no-colour-only rule already required the glyph.

### Light mode (MANDATORY, ships with every surface)

Light is first-class and dark is primary. After the scheme collapse the matrix is **two variants**.

```
--bg #FAFAFA · --bg-card #FFFFFF (opaque white cards) · --bg-elev #FFFFFF · --bg-elev-2 #FFFFFF
--bg-sunk rgba(9,9,11,0.04)
--bg-hover rgba(9,9,11,0.06)
--hairline rgba(9,9,11,0.08) · --border-control rgba(9,9,11,0.08)
--hairline-ghost rgba(9,9,11,0.10) · --hairline-strong rgba(9,9,11,0.16)
--fg-1 #1A1A1D  /* 16.64:1 */   --fg-2 #424247  /*  9.57:1 */
--fg-3 #68686D  /*  5.31:1 */   --fg-4 #89898D  /*  3.34:1 */
--primary        PENDING GRANT 1   /* light mode always takes the DARK fill, with white on it */
--primary-soft   PENDING GRANT 1   /* derived against #FAFAFA, not against the canvas */
--fg-on-primary  #FFFFFF
--selection-bg   the fill at alpha 0.18
```

**Dark is not light reversed.** Reversal is the starting point. Vividness comes down, the dark end needs more separation than the light end, and every pair is remeasured, because contrast is not symmetric.

**One switching mechanism.** A class (or the mobile mode value) is the switch, and `prefers-color-scheme` only sets the initial value. Never let a media query own some tokens and a class own others.

### The accent: the method is settled, the hue is open

**The hue and the fill treatment are decided at human grant 1**, from `design/reference.html`, which renders ten hues against both treatments on real components. Everything below is settled regardless of which one wins.

**The shortlist, narrowed by Thomas on 2026-08-15**, is three schemes. The page presents them as presets and keeps the full grid for comparison:

| candidate | fill | on the fill | note |
|---|---|---|---|
| **Emerald** `#008854` | dark | white | clean: 93 degrees from overdue, 133 from bad |
| **Rose** `#BF4D8A` | dark | white | **moved from hue 15 to 350.** At 15 it sat 10 degrees from the destructive red, so the primary CTA and the delete button read as the same colour. At 350 it clears it by 35 and stays a pink-red |
| **Orange** `#C4530F` | dark | white | passes at 20 degrees from both overdue and bad, which is the tightest of the three |

**Three roles, three floors, and every candidate clears all three:**

| token | role | floor |
|---|---|---|
| `--primary` | **fill and graphic only**: CTA background, FAB, progress ring, done dots, level bar, active tab | `--fg-on-primary` on it >= 4.5 **and** it on canvas >= 3.0 |
| `--primary-soft` | **accent text only**: an accent-coloured word, link, or numeral on the canvas | it on canvas >= 4.5 |
| `--fg-on-primary` | whatever sits on the fill | 4.5 on the fill |

**One fill treatment, settled 2026-08-15: a dark fill with white on it.** `--primary` is the lightest value at which white still clears 4.5 on it, and `--fg-on-primary` is always `#FFFFFF`. The light-fill alternative, a bright fill carrying the canvas ink, was rendered and rejected by looking.

Consequences that hold either way:

- **`--primary` is never small text on the canvas.** Use `--primary-soft` for an accent word, even where the two resolve to the same byte.
- **A selected state may carry the accent on its glyph and label.** That is state, not emphasis, and it is the one exception to fill-only.
- A future accent change re-measures all three floors. It never eyeballs them.

**Accent rationing.** The accent appears on: the active tab, progress and ring indicators, done dots, the primary CTA, the FAB, and active nav. That is the whole list. It is **never** decorative on a card, a row, a border, a heading, or an icon that is not communicating state. **Fill exactly one action per view.** Put the colour on the background, not the label: a filled button reads as primary, accent-coloured text on a neutral button reads as a link.

**One colour, one meaning, in both directions.** Treat two hues within 15 degrees as the same colour. A status hue inside that band of the accent must move or be retired. Equally, an interactive element rendered neutral is as misleading as a static element rendered in the accent.

**Fixing a failing contrast ratio: move the OKLCH L channel only.** Chroma has negligible effect on contrast, so hold C and H and the colour stays recognisably itself. Remeasure after every change; never assume a fix landed.

### Derivation rules

1. **Alpha tokens are constants.** The surface ladder and the hairlines are white-alpha on dark and ink-alpha on light. They inherit tint optically from the canvas beneath. This is what makes the ladder cost nothing.
2. **The ladder steps must be two visible surfaces.** Adjacent steps sit at least 0.02 alpha apart. The pre-D66 ladder ran 0.04 / 0.05 / 0.06 / 0.06, and `#151517` against `#171719` is not a step.
3. **Any surface that can sit over arbitrary content is authored opaque**, never as an alpha value. That is `--bg-elev`: the overlay panel, menus and popovers.
4. **Opaque neutrals re-derive in OKLCH**: lock C per token, hold one hue across the ramp, and step L evenly in perceived lightness.
5. **Both ends stop short of pure black and pure white.** Neither can carry hue.
6. **Status colours are fixed per mode**, are never accent-tinted, and each stays more than 15 degrees from the accent hue.
7. **Primary-derived tints** come from `--primary-rgb` (web) and `tintFromPrimary()` (mobile). Never hardcode an accent `rgba` in a component.
8. **`color-scheme: light dark` is declared on the web document root**, with a matching `theme-color` meta. Web only.
9. **`prefers-contrast: more` is a token-override layer, not a third variant.** Override only the tokens that carry the contrast: raise the surface ladder toward solid, give controls a defined border, and widen each foreground gap by at least 15 points of perceived lightness. Then remeasure against the preferred APCA thresholds. Widening without remeasuring is not a fix.
10. **Suppress transitions during a theme flip.** Inject `*,*::before,*::after{transition:none !important}`, force a synchronous style flush, then remove it on the next frame. Without it every colour transition fires at once and the switch smears.

### Shape, shadow, motion, icons

- Radii, enumerated: **0 / 8 / 12 / 16 / 20 / 28**, pill 999. Cards and habit panels 20, wells 12, fields 12, chips and badges 8, overlay panel **28 top radius**, CTAs pill.
- **The pill radius means interactive.** Radius 999 is reserved for something you can press. A static element never wears it, because a non-clickable shape identical to the buttons beside it collects dead clicks. Badges and status chips use radius 8.
- **Nested rounded surfaces use concentric radii: outer = inner + padding.** A parent and its inset child never share a radius. Where the padding exceeds 24, treat the layers as separate surfaces and choose each radius independently.
- Shadows: sh-1 `0 1px 2px rgba(0,0,0,.20)`, sh-2 `0 4px 16px rgba(0,0,0,.28)`, sh-3 `0 12px 40px rgba(0,0,0,.45)`. **There is no glow.** Shadows model occlusion under a lifted surface and never carry a hue.
- **Shadows are for elevation, borders are for structure.** Replace a border that only faked depth with a shadow. Keep a border that divides content or marks a state: dividers, table boundaries, input outlines, selected and focus states.
- **On dark, the 1px ring does the work.** Layered depth shadows are barely visible on a near-black canvas, so a lifted surface reads from its inset hairline plus the scrim beneath it. Reserve sh-2 and sh-3 for surfaces genuinely floating over a scrim.
- **Images carry a 1px outline** at `rgba(255,255,255,0.10)` on dark and `rgba(0,0,0,0.10)` on light, with `outline-offset: -1px` so the ring hugs the corner radius. Never a tinted neutral, which reads as dirt on the image edge, and never `border`, which changes layout.
- Motion: `--ease-standard cubic-bezier(0.2,0,0,1)`, `--ease-out cubic-bezier(0.16,1,0.3,1)`, `--ease-in` for exits. Movement durations 160/220/280; hover durations 240 for a control and 380 for a surface. Transform and opacity only for movement. Full governance in **Motion**.

#### Icons

- **Tabler**, always through the per-platform barrel `@/components/ui/icons`. Never a direct `@tabler/*` or `lucide-*` import: the barrel wraps Tabler to one prop shape so a future set swap is one file. `no-restricted-imports` enforces this and **lands with #210**, which migrates the callsites as one sweep.
- **Sizes are the set's native grid: 16, 20, 24. The default is 24.** Tabler is drawn on a 24 grid (`width="24" height="24"`, read from the source 2026-08-15), so an off-grid size such as 22 renders with fractional scaling and looks soft. Inline with text, size to about 1em to 1.25em so the pair scales together.
- **Stroke matches the optical weight of the adjacent text**, on the 24 grid: `1.5` beside 400-weight text at 14 to 16, `2` beside 500 and 600, `2.5` beside 700 or an emphasised standalone glyph. Tabler's own default is 2. One stroke strategy per surface; never mix icon sets on one toolbar.
- **One SVG, recoloured per state.** Icons use `currentColor` and take their states from colour and opacity, never from separate assets. Strip any hardcoded `fill` on import.
- **Outline is the default; fill marks the active state.** Use the pair to communicate state, not interchangeably.
- **Every icon is legible at 16.** Test at the smallest size it renders. Prefer a simplified glyph for small contexts over scaled-down detail.
- **Align optically, not geometrically.** Icons with directional or asymmetric mass need a 1 to 2px nudge off mathematical centre. For a pill with a trailing icon, the icon-side padding is the text-side padding minus 2.
- **Under RTL, flip only direction-dependent glyphs**: navigation chevrons and arrows, text-block glyphs, send-style glyphs. Never flip logos, checkmarks, physical objects, or media playback controls.
- Hit targets: 44 minimum, 56 comfortable. See **Accessibility**.

## Type roles

Use the semantic roles, not raw sizes.

| Role | Family | Size/Weight | Line-height | Tracking | Colour |
|---|---|---|---|---|---|
| hero | Space Grotesk | 60/600 | 1.05 | -0.025em | fg-1 |
| display | Space Grotesk | 44/600 | 1.05 | -0.02em | fg-1 |
| h1 | Geist Sans | 28/600 | 1.15 | -0.015em | fg-1 |
| h2 | Geist Sans | 22/500 | 1.20 | -0.01em | fg-1 |
| row | Geist Sans | 17/400 | 1.35 | 0 | fg-1 |
| body | Geist Sans | 16/400 | 1.55 | 0 | fg-1 |
| secondary | Geist Sans | 14/400 | 1.55 | +0.005em | fg-2 |
| meta | Geist Mono | 12/400 | 1.40 | +0.02em, tabular | fg-3 |
| eyebrow | Geist Mono | 12/500 | 1.20 | +0.08em, UPPERCASE | fg-3 |
| num | Space Grotesk | inherit/500 | 1 | 0, tabular | fg-1 |
| num-xl | Space Grotesk | 44/600 | 1 | -0.02em, tabular | fg-1 |

**A visual type role is not a semantic level.** `display`, `h1` and `h2` are looks; `<h1>` and `<h2>` are structure. Choose them independently, do not skip heading levels, and keep one `h1` per surface. Never pick a heading element for its default size.

**Heading sizes descend with level.** A subordinate heading never renders more prominently than its parent. A heading is never smaller than body text unless it is deliberately a label-style overline.

**Tabular numerals on any value that changes.** A timer, a counter, a streak count and a price all shift layout as they update.

**Text stays selectable**, including chrome. Use `user-select: none` only on a specific drag or gesture surface.

### Measure and wrapping

- **Cap body and prose measure at 45 to 75 characters, target about 65ch.** A paragraph never spans the full container. Tune line-height with the measure: a wider line needs more leading.
- **Break an unbroken token only when running prose cannot otherwise fit.** Paragraphs, links, headings, list items and inline code use `overflow-wrap: anywhere`.
- `text-wrap: balance` on headings, `text-wrap: pretty` on body and description copy. Skip both in long-form. **Never hand-break with `<br>`.**
- **A display or hero heading never exceeds 2 to 3 lines.** Test heading copy at every breakpoint in **both** locales. Fix an over-wrapping heading by widening the container and reducing the size, never by accepting the wrap.
- **Ration eyebrows: at most one per three sections, hero included.** An eyebrow labels a section, it never enumerates one. Numbered meta-labels are banned outright.
- **When text is truncated, keep the full value reachable** if the hidden text carries meaning.
- **Text aligns to the start edge.** Numbers in a table align to the trailing edge. Justified text does not exist in this interface.
- **Underlines take their metrics from the font**: `text-underline-position: from-font` and `text-decoration-thickness: from-font`, with `text-decoration-skip-ink: auto`. Only colour animates reliably on a real underline; build any other animated underline as its own element.

## Layout & spacing

- **A card is not a layout primitive.** Group with space and alignment first. A card earns its place only when its content is a genuinely separable, actionable object. This is the upstream rule that stops eight identical rectangles.
- **Group with space, not lines**, in this order: negative space, then a background shape when a group must read as one unit, then a separator line as a last resort for dense data. When a separator is genuinely earned, keep it quiet, and **never pair it with a large gap: the gap already did the job**.
- **Keep controls distinct from content, in both directions.** An interactive element carries a background, a border, or a consistent control zone. A static element never wears control styling.
- **Name one focal element per view before building.** Make it win by size, weight, contrast and surrounding space, and demote everything else deliberately. Only one element animates prominently at a time.
- **At any decision point keep simultaneously-considered options at 4 or fewer.** Top-level nav 5 or fewer, form fields 4 or fewer per visual group, 1 primary plus 1 to 2 secondary actions with the rest in a menu. 5 to 7 needs grouping or progressive disclosure; 8 or more is a defect.
- **Give flex and grid children `min-width: 0`** so long unbroken content shrinks instead of blowing out the track. **Never put a fixed width or a fixed height on a text container**; use `max-width` plus wrapping, and `min-height` where a floor is needed. Plan for substantial pt-BR growth rather than one universal percentage.
- **Align to shared edges.** Every stray edge reads as noise. Use one spacing step per level of subordination.
- **Order by importance.** The most important content sits near the top and the leading edge. Within a row, identifying content leads and metadata and actions trail. Think in leading and trailing, never left and right, and use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`) for anything direction-dependent.
- **Hint at hidden content.** Progressive disclosure needs a visible affordance: let the next item peek 16 to 32px past the scroll edge, or show a disclosure control whose label states what is hidden.
- **Align shared elements across side-by-side cards to the same Y** and pin each card's CTA to its bottom, so the buttons form one line.
- **Build multi-column layouts with CSS Grid**, never flexbox percentage math. Prefer container queries so a component adapts to its column rather than the viewport. Web only.
- **Structural hacks are banned:** a negative margin undoing a parent's padding, an escape-hatch `calc()`, and absolute positioning used to dodge layout flow.
- **Respect `env(safe-area-inset-*)` on fixed elements**, using `max(<base>, env(...))`, and ship `viewport-fit=cover`.
- **Content bleeds, controls float.** Backgrounds and media may reach the viewport edge; controls and text stay inside the layout margins and safe areas.
- **Breakpoints come from the content, not from device presets.** Hold the expanded layout while it genuinely fits and collapse late. Test the smallest and largest sizes first.
- **Never park a critical action where it can be clipped**: the bottom of a resizable pane, below the fold of a fixed-height overlay, behind the keyboard. If an overlay's body scrolls, its action row does not.
- **A sidebar uses the same background as the canvas.** A hairline is the only separation it earns. Web only.

## Primitives kit

Web in `apps/web/components/`, mobile mirror in `apps/mobile/components/`: same name, same props, same behaviour.

**Expose component state as `data-*` attributes** so styling and tests hook onto state rather than class names. A boolean attribute is present or absent, never `"false"`. An enumerated attribute carries a string value.

| Primitive | Key specs | Web | Mobile |
|---|---|---|---|
| NavHeader | 56px, centred UPPERCASE Geist Mono 13/500 +0.09em title, back chevron 24/2.0, right slot help / close / share | `ui/app-bar.tsx` | `ui/app-bar.tsx` |
| SectionTitle | Geist Sans 20/500 -0.01em | `ui/section-label.tsx` | `ui/section-label.tsx` |
| ListRow | icon 24/1.5 in a 28px slot, title Geist Sans 17/400, desc 14 fg-3, value + trailing chevron 24 fg-4, **draws no rule of its own**, danger = status-bad | `ui/settings-row.tsx` | `ui/settings-row.tsx` |
| SettingsGroup | the only owner of row separation: a hairline *between* adjacent rows, never after the last | `ui/settings-group.tsx` | `ui/settings-group.tsx` |
| Switch | 48x28 pill, 22px thumb, on = primary / off = `rgba(fg,0.16)` | inside settings-row | inside settings-row |
| Radio/RadioRow | 24px, selected = primary fill + 9px dot, else inset 2px fg-4 ring | `ui/select-check.tsx` | `ui/select-check.tsx` |
| Badge | **radius 8 chip, never a pill**, Geist Mono 10.5/500 +0.06em UPPERCASE, `text-box` trimmed; tones accent / soft / outline / caution | `ui/badge.tsx` | same |
| PillButton | pill CTA, radius 999, 5 variants x 4 sizes off shared `BUTTON_SIZES`. Full canon in **Buttons** | `ui/pill-button.tsx` | `ui/pill-button.tsx` |
| StatTile | radius 20, `--bg-card` + inset hairline ring, value Space Grotesk 24/600 tabular held to one line, label 14/20 fg-2 clamped to 2 lines in a fixed reservation | `ui/stat-tile.tsx` | same |
| PlanCard | radius 20, selected = `--primary-dim` tint + inset 1.5px primary ring; price Space Grotesk 22/600 | `upgrade/plan-card.tsx` | same |
| InfoCard | radius 20, borderless tonal aside; tone `quiet` = `--bg-elev` + fg-3 icon, tone `accent` = `--primary-dim` + `--primary-soft` icon | `ui/info-card.tsx` | same |
| Field | min-height 54, radius 12, `--bg-field` + inset `--border-control`, **visible persistent label** 14/500 fg-2 | `ui/field-input.tsx` | `ui/app-text-input.tsx` |
| OTP | 6 boxes, radius 12, `--bg-field`, active inset 2px primary, Geist Mono 26/500, `type="text" inputmode="numeric"`, `autocomplete="one-time-code"`, `spellcheck="false"`. Paste of a whole code MUST work | `ui/code-input.tsx` | `ui/code-input.tsx` |
| Overlay | see **Overlay** | `ui/app-overlay.tsx` | `bottom-sheet-modal.tsx` |
| TabBar + FAB | top hairline, opaque canvas bg, **max 5 destinations**, icon 24 (active primary 2.0 / inactive fg-4 1.5), label 11; FAB 60px primary circle, ring `0 0 0 6px var(--bg)` | `navigation/bottom-tab-bar.tsx` | `navigation/bottom-tab-bar.tsx` |
| Satellite | 96px empty-state glyph, fg-4 strokes + primary arc | `ui/satellite-glyph.tsx` | same |
| ProgressBar | 8px pill track `--fg-4`, primary fill | `ui/progress-bar.tsx` | same |
| ProgressRing | thin band, primary sweep on a `--fg-4` track | right rail / Today | same |
| HabitRow | inside a tonal panel: 46px emoji well radius 12 `--bg-well`, name Geist Sans 16/500, meta 13 fg-3, trailing 30px check ring, per-row overflow menu | `habits/habit-row.tsx` | `habits/habit-row.tsx` |

## Overlay

One primitive covers the drawer, sheet, dialog and modal. It presents as a bottom sheet below the `sm` breakpoint and as a centred dialog at `sm` and above. **83 callers inherit whatever this primitive gets wrong**, which is why the rules below are mechanical.

### The library, per platform

| platform | library | read live 2026-08-15 |
|---|---|---|
| **web** | **`@base-ui/react`**, `Dialog` from the `./dialog` subpath | 1.7.0, MIT, `github.com/mui/base-ui`, peer `react ^19` |
| **mobile** | **`@lodev09/react-native-true-sheet`** | 3.11.3, already installed |

**Web rationale.** `apps/web` ships no overlay library at all today. `app-overlay.tsx` hand-rolls the backdrop, the focus trap, the body-scroll lock, the overlay stack and the portal in one 375-line component that already carries a `no-giant-component` deferral. The root cause is visible in the markup: it renders `<dialog open>` rather than calling `showModal()`, so it gets none of the platform's free behaviour and has to rebuild the trap, the background inertness and the Escape handling by hand, and then needs `z-[9999]` because it never enters the top layer. Base UI's `Dialog` supplies all of that behind one `modal` prop, which is code standard 11 applied exactly.

Adopting it deletes `apps/web/lib/overlay-stack.ts` and two live defects: the `z-[9999]` that violates this document's own arbitrary-z-index ban, and a grabber with no gesture handler, so web drag-to-dismiss is decorative today and nothing is lost by not replacing it. Anatomy to build against: `Dialog.Root` (`open` / `onOpenChange`), `Portal`, `Backdrop`, `Viewport`, `Popup` (`initialFocus` / `finalFocus`), `Title`, `Description`, `Close`. Note the peer dependency `@date-fns/tz ^1.2.0`, which `apps/web` does not yet have; `date-fns ^4.4.0` is already present.

**Mobile rationale.** The library is not the defect, the wrapper is. TrueSheet handles detents, scroll coordination, the dimmed backdrop, the keyboard and the Android back button natively. `@gorhom/bottom-sheet` stays banned by `local/no-gorhom-sheet`, because its `present()` and portal no-op on the New Architecture in release builds. **Never navigate in the same tick as closing a sheet.**

**Migrating the 83 callers is R-ticket work, not this ticket.**

### Sizing

- **An overlay is content-height by default.** It grows to its content and stops.
- **A fixed detent is allowed only where the content is genuinely long, and never as the default.** `bottom-sheet-modal.tsx` currently defaults to `['50%','80%']`, which is the defect: a short sheet opens with a third of the panel empty.
- An overlay never exceeds 85% of the viewport height. Past that it is a screen, not an overlay.

### Scroll ownership

- **Exactly one scroll container per overlay, owned by the primitive.**
- **A caller never nests its own scroll container inside a scrollable sheet.** The mobile wrapper currently passes TrueSheet's native `scrollable` AND renders its own `ScrollView` inside it. That is what makes the reset-account sheet open already scrolled past its own warning copy, with no way to scroll back up.
- **An overlay never opens scrolled away from its own first line.**
- `overscroll-behavior: contain` on the scroll container, so scrolling inside never scrolls the page behind it.

### Anatomy

Grabber (mobile presentation only) · header (title, optional description, close) · body (the single scroll container) · footer (actions, pinned, never scrolling with the body) · safe-area and keyboard insets on both.

**The panel is `--bg-elev`, authored opaque.** An overlay sits over arbitrary content, so a translucent panel cannot have its text contrast checked. The backdrop is `--scrim`. Radius 28 at the top on mobile presentation, 20 all round at `sm` and above.

### Dismissal contract

- Escape, backdrop press, the close button and Android back all route through one `requestDismiss(reason)` path. Escape dismisses whatever opened last.
- A dirty form blocks interactive dismissal and routes to a confirm instead. It never discards silently.
- On open, set the background `inert`, then move focus into the panel. **For a destructive confirmation, focus the least destructive action.**
- On close, restore focus to the trigger. If the trigger is gone, move focus to the nearest logical container.
- The scrim is a control, not decoration, so it keeps its pointer events.

### States

All eight, by name: default · hover · focus · active · disabled · loading · error · empty. `design/reference.html` renders the overlay at **both short content and long content**, so the sizing and scroll rules are visible rather than described.

## Buttons

`PillButton` is the one pill CTA. Its geometry is shared data in `packages/shared/src/theme/button.ts` so the two mirrors cannot drift.

- **Variants:** `primary` (accent fill, `--fg-on-primary` text, no glow), `secondary` (fg-1 fill, canvas text), `ghost` (transparent, inset 1.5px hairline-strong ring), `destructive` (status-bad fill), `caution` (status-overdue fill). `ConfirmDialog` builds its action row from `PillButton`, never a hand-rolled pill.
- **Sizes:** `xs` / `sm` / `md` (default) / `lg`. A size is a fixed height plus horizontal padding plus label, icon and gap. Never hand-tune per call.
- **Width, hug by default.** A lone CTA in a wide container caps at about 360px and never spans a desktop content column. Full-width is sanctioned ONLY in: the single primary action of a mobile overlay, a form submit at or below the mobile breakpoint, and a full-screen empty-state primary CTA.
- **The one matched-width exception:** `EmptyState.matchActionFooterWidth`, for a primary pill stacked directly over a secondary pill as one visual unit. Two pills of visibly different width read as an unrelated pair, which is itself a slop tell.
- **Labels are verb-first and 1 to 2 words.** Strip words the surrounding title already carries. A confirmation button repeats the consequence, so the dialog is answerable without reading the body: "Delete habit", never "Yes".
- **One label per CTA intent per surface, and the name survives the whole flow.**
- **Keep submit enabled until the request starts**, then disable with a spinner and **keep the original label**, because the label is what tells assistive tech which button is busy.
- **Icons: a leading glyph where it aids recognition**, sized and gapped from the size token, with the icon-side padding 2px tighter. An icon-only pill MUST carry a localized accessible label.
- **Press feedback:** `scale(0.96)` on pointer-down over 150ms, `ease-out`, via a CSS transition so a release mid-press returns smoothly. A `static` prop disables it where motion would distract.

## Surface rules

- **Translucency ladder on dark:** 0.04 card / 0.06 field / 0.08 well / 0.12 elev-2, white-alpha over the canvas. Surfaces stack by alpha, not by lighter hexes.
- **Opaque white cards on light.** Never translucent.
- **Inset 1px hairline rings instead of borders.**
- **No opaque card-on-card on dark, and never a translucent surface stacked on another translucent surface.** Legibility collapses.
- **D34, one separation device per boundary.** Separation uses exactly ONE of a surface step, a hairline, or space. Never two. Space is the default choice among the three.
- **Separator and border are separate roles**, even though `--hairline` and `--border-control` carry the same value today. A separator divides content; a border encloses a control. They diverge the first time inputs are restyled.
- **Separation is the container's job, never the row's.** A row cannot know whether it is last, so a row that draws its own rule trails one into a section break. Never stack two hairlines.
- **Blur and glass are never a default or a decoration.** Orbit's ladder is an alpha ladder, not a blur ladder. An animated blur stays at 8px or less, short, one-time, and never on a large surface.
- **Do not use flat grey text on a translucent surface.** The whole dark ladder is translucency, so secondary text on a card takes the next weight step up rather than a dimmer colour.

## Habit list

- **Every top-level habit lives on its own tonal panel:** `--bg-card` plus an inset `--hairline-ghost` ring, radius 20. Single-row for a simple habit, multi-row for a family on ONE panel.
- **Panel row height matches across kinds.** A single-row panel is sized to the same row height as a family's parent row.
- The panel is the quietest step so the `--bg-well` emoji squares inside it read as the lighter elevation.
- **Two levels inline, then drill in.** An accent chevron opens in focus; a grey caret expands in place; a grey chevron is a collapsed family. Drilling shows a breadcrumb to climb back.
- **Sub-habit rows:** indent, smaller well, dimmer text. **Zero connector or tree lines.**
- **The per-row overflow menu stays.**
- **Habit emoji render in full colour.**
- **Never animate the habit list's data while the user is reading or acting on it.**

## Listing

How a collection renders at every size. This is checkable, not a taste call.

| count | rendering |
|---|---|
| **0** | The empty state: Satellite glyph, one line naming what belongs here, one primary CTA. Never a blank region and never bare text. |
| **1** | The normal row treatment. Never a special "only one" layout. |
| **few (2 to 7)** | The normal list. No pagination, no search, no count. |
| **many (8 to 20)** | The normal list plus a count in `meta`. Add search only if the item names are user-authored. |
| **too many (21 or more)** | Virtualize or paginate, and show a persistent filter or search. **Never let a wrapping pill row carry it**: the checklist-template pills break at 15 today, and that is the defect this rule exists to stop. |

A collection whose item count can exceed 20 declares its "too many" behaviour before it ships.

## States

**Every component ships its full state set before it is done: default, hover, focus, active, disabled, loading, error, empty, at capacity.** A missing state is an unfinished interface, not a follow-up.

**Every data surface ships the loading / empty / error triad.**

- **Loading:** a skeleton for any operation expected to exceed about 300ms. Below that, show nothing rather than a flashing spinner. The skeleton is **shaped like the final layout** and occupies the final dimensions, so nothing shifts when data lands. Set `aria-busy="true"` on the updating region.
- **Empty:** a composed invitation to act. It says what this place is and how to fill it, with one clear next action. A search or filter empty state names the query and offers an exit. **Never park persistent information in an empty state**; it disappears the moment content exists.
- **Error:** see **Voice**.
- **Disabled:** use native `disabled` when a control is genuinely unavailable. Use `aria-disabled="true"` only when the control must stay focusable and discoverable, and then block activation in the handler and explain why nearby. Never set both. A natively disabled control cannot carry a tooltip, so the reason goes in visible text beside it.
- **At capacity (the ninth state):** the surface has reached a real boundary, for example a plan limit or a list ceiling. **A boundary is not an error**: it uses neutral tokens, never `--status-bad`. It states the limit and the one action that changes it, and it carries **no upgrade call to action**.

## Voice

**Pillars.** Calm. No shame language on a missed day. No exclamation on success. Quiet celebration. Describe, never sell. "ADHD-friendly" is allowed; "treats ADHD" is never.

**pt-BR register: "você", plain and warm, never corporate and never slang.** Address the reader directly. "Orbit" and "Astra" are never translated, and both carry `translate="no"` so auto-translation cannot garble them.

**Tone flexes with the stakes:** warm on success, onboarding and empty states; neutral on routine actions and settings; calm and plain on errors and destructive confirmations; serious and explicit on data loss.

**The six Pierre rules**, extracted mechanically:

1. **The product speaks in the first person.** Astra speaks: "Me diz o que você fez hoje. Eu registro."
2. **Short question, short answer.**
3. **A supporting line explains the MECHANISM, never restates the promise.** Every word is new.
4. **Genuinely colloquial** where pt-BR allows it. Never "otimize", never "potencialize".
5. **Zero exclamation marks.** Confidence, not euphoria.
6. **A CTA is a plain verb.** "Começar grátis", never "Comece sua jornada".

### Rules

- **Strings stay short:** 1 to 2 words on buttons, chips, tabs and labels. Sentences live only in body, description and empty-state copy.
- **Say it once.** No header restating the intro beneath it. Each element does exactly one job.
- **Ban supporting copy by default.** Do not add a subtitle, a helper line, or a descriptive sentence beneath a heading, a label, a card, or a settings row. Prefer one concise, self-explanatory heading. Add supporting copy only when Thomas asks for it, or when it genuinely prevents a misunderstanding or an error, and **never** to restate the heading above it. **The form-field carve-out is explicit and survives unchanged:** an input still carries a visible, persistent label, and its helper text still lives in the markup, per "a placeholder is never a field's only label" in **Accessibility**. The two rules are not in conflict, because a field label is not supporting copy.
- **Name every control by what the person controls**, never by how the system is built.
- **A settings toggle is labelled for its ON state.** "Send read receipts", never "Don't send read receipts". Link directly to a referenced setting rather than describing the path to it.
- **One capitalization policy per element type.** Sentence case is the default. **Store copy in natural case and control presentation with `text-transform`.** Never type UPPERCASE into a string.
- **A multi-step flow uses one vocabulary.** Pick "Continue" or "Next" and keep it.
- **Link text carries standalone meaning.** "Read the billing docs", never "Click here" or a bare "Learn more".
- **Errors say how to fix, next to where it broke.** Plain language, active voice, no blame, no humour, no bare code, no "Oops". Phrase hints positively and show them before the mistake. A validation error never clears the input. If the same error keeps firing, redesign the interaction rather than rewording it.
- **Reserve confirmation dialogs for genuinely destructive, irreversible actions.** A confirmation names the specific action and its consequence, never "Are you sure?".
- **Never invent precise-looking numbers.** A figure comes from real data, is explicitly marked mock in the markup, or does not ship.
- **Never build a sentence by concatenating fragments around a variable.** Word order changes per language. Use full templated strings with pluralization.
- **Match the verb to the input device**: "tap" on mobile, "click" on web with a pointer, "select" when both are possible.
- **No em dash and no en dash** anywhere in copy, code, or this document. Use a comma, a period, or a hyphen.

### The banned-word set

Enumerated and greppable, so `/deslop` can execute it over 2,905 i18n keys without a taste call. Each entry declares its scope. **microcopy** = i18n string values. **long-form** = the landing page, ADRs and store copy. **both** = everywhere.

| # | pattern | scope |
|---|---|---|
| 1 | `!` on a success, completion or celebration string | both |
| 2 | "It's not X. It's Y." and every binary-contrast frame | long-form |
| 3 | "not just X, but Y" | long-form |
| 4 | Throat-clearing openers: "In today's world", "Let's face it", "The truth is" | long-form |
| 5 | Faux-insight setups: "What nobody tells you", "Here's the thing" | long-form |
| 6 | Colon reveals in a heading: "One habit: everything changes" | long-form |
| 7 | Importance puffery: "crucial", "pivotal", "vital", "essential", "game-changing" | both |
| 8 | "delve", "leverage" (verb), "harness", "unlock", "elevate", "empower", "supercharge", "seamless", "robust", "cutting-edge", "revolutionary" | both |
| 9 | Weasel attribution: "experts agree", "studies show", "science says" | both |
| 10 | Fake-strong verbs where a plain one exists: "utilize" for use, "commence" for start | both |
| 11 | Synonym cycling for one product noun across a surface | both |
| 12 | Negative listing: "no fluff, no gimmicks, no nonsense" | long-form |
| 13 | Dramatic one-word fragmentation: "Simple. Powerful. Yours." | long-form |
| 14 | Mechanical rule of three in a single sentence | long-form |
| 15 | Title-case headings | both |
| 16 | Boldface used for emphasis inside running body copy | long-form |
| 17 | Em dash and en dash | both |
| 18 | "Oops", "Uh oh", "Whoops" | both |
| 19 | "Are you sure?" as a confirmation body | microcopy |
| 20 | "Click here", "Read more", bare "Learn more" | both |
| 21 | "the user" in reader-facing copy | both |
| 22 | "otimize", "potencialize", "maximize" (pt-BR) | both |
| 23 | "Comece sua jornada" and journey framing | both |
| 24 | A descriptive subtitle restating the heading above it | both |
| 25 | "treats ADHD", "cures", "fixes your brain" | both |

**The structural tells do not apply to UI microcopy.** A button label has no narrative shape. Scope explicitly stating the theme, dialogue used for philosophical debate, and flat event escalation to long-form only.

## Desktop density & orientation

- At the desktop breakpoint, content composes **horizontally**. A single stretched mobile column is a defect, not a layout.
- **The main content column caps at about 740px and is centred.**
- **The right rail's contents are re-decided on the Claude Design canvas.** Its existence is a sanctioned divergence; its module list is not frozen here.
- **Sidebar:** grounded at the bottom with the account chip and a create button above it, on the canvas background with a hairline as its only separation.
- Primary app sections are one click away in the desktop sidebar.
- **Never hide core functionality at a breakpoint**, and keep one information architecture across every context. Adapt the layout, not the feature set.
- **Match a feature's flow shape to its neighbours**, not just its surface.
- **A modal is never the first thought.** Exhaust inline and progressive-disclosure alternatives first.
- **Do not overload the entry point.** The first screenful is a table of contents, not the whole book.

### The allowed shell divergences, enumerated

Exactly these four, and nothing more. Everything below the shell stays parity-bound.

1. Navigation chrome: sidebar (web) versus tab bar (mobile).
2. The desktop stats rail.
3. The command palette and keyboard shortcuts.
4. Hover affordances on that shell chrome.

**Any new divergence found during canvas work comes back as a request, never as a judgement call.**

### Stacking

One semantic z-index scale, shared across both platforms. Overlays stack on a named tier, never a hand-picked number.

Six tiers ascend: `dropdown` (1000) < `sticky` (1100) < `modalBackdrop` (1200) < `modal` (1300) < `toast` (1600) < `tooltip` (1700). Plus two carve-outs:

- **`celebration` (1500)** sits just below `toast`.
- **`tourSpotlight` (1400)** sits above `modal`, because a tour points AT modals.

Local sibling stacking stays local: `z-[1..9]` or `zIndex: 1..9`. The one banned thing is the arms-race literal.

## Sub-screen navigation

Every sub-screen shows a visible back affordance, on both platforms and at every breakpoint. Hardware or browser back is never the only way out.

**Wayfinding.** Every screen answers: where am I, where can I go, what is there, and how do I get out.

**On a client-side route change**, update `document.title` to the new context (most specific first) and move focus to the new view's `h1` (given `tabindex="-1"`) or to `main`. Restore scroll position on back and forward navigation; scroll to top on forward navigation. Web only.

## Motion

Motion is governed on two axes: **whether** to animate, then **how**. The first axis subtracts. **This section carries verbatim from the pre-D66 spec (D66 decision 11). Spacious argues for less motion, not different rules.**

### Whether (the gate)

**Gate every animation on frequency.**

| frequency | budget |
|---|---|
| 100+/day (keyboard shortcuts, command palette, core nav, habit toggling) | **none, ever** |
| tens/day | near-imperceptible or none |
| occasional (modals, sheets, drawers, toasts, settings) | the standard scale below |
| rare / first-run (onboarding, milestone, celebration) | the only place the delight budget lives |

**Every animation must name its purpose from this closed list:** feedback · spatial consistency · state indication · preventing a jarring change · explanation · delight (rare/first-run tier only). **If you cannot name it, delete it.**

**Never animate data the user is trying to read or act on.**

**When motion is wrong, fix it in this order and stop at the earliest move that works:** (1) delete, (2) reduce, (3) fix the easing, (4) fix origin or physicality, (5) make it interruptible, (6) move it to the GPU, (7) make timing asymmetric, (8) polish. **Deleting outranks tuning.**

**Delight amplifies, never blocks.** Under about 1 second total, never delaying core functionality, always skippable, and rationed to earned moments.

**Motion is never the only feedback channel.** Every animated state change also carries a static cue: a colour change, an icon swap, or a label.

**A high-frequency interaction gets instant feedback or an `opacity` / `background-color` transition of 150ms or less.** Never a full entrance on a hover or a keystroke.

### Hover, and why it is not governed by the frequency gate

**A clickable thing with no hover state is a defect.** A hover transition is feedback, not decoration, so the frequency gate does not suppress it: the gate subtracts animations that play at you, and a hover state answers you. Every interactive element carries one.

**A hover reads slower than a press.** The durations below are deliberately longer than the movement scale: a press is a confirmation and wants to be immediate, while a hover is an invitation and wants to arrive. These values were set by feel against the rendered reference, not derived. Thomas chose the slowest of three rendered options on 2026-08-15.

| target | duration | what changes |
|---|---|---|
| a surface (row, card, panel, list item) | **380ms** | background goes to `--bg-hover`, and its hairline to `--hairline-strong` |
| a control (button, chip, segmented control, icon button) | **240ms** | fill or label colour only |
| a link | **380ms** | colour, plus an underline scaling from the leading edge |

- **Hover is its own surface role and is never borrowed from the elevation ladder.** The ladder's steps are sized for stacking, not for being seen against one particular resting surface. Measured 2026-08-15: `--bg-elev` against a resting `--bg-card` is **1.09:1**, which reads as nothing on a near-black canvas; `--bg-hover` is **1.31:1**, which reads. **A hover step must clear 1.25:1 against the surface it replaces.** If a role has no token, add the token rather than borrowing one whose value looks right today.
- **Only an interactive surface gets a hover state.** A static card that lights up under the pointer advertises a click that does nothing. This is the "controls distinct from content" rule read in the other direction, and it is the more common half to get wrong.
- **A container suppresses its own hover while the pointer is on an interactive descendant.** Otherwise a button inside a card lights both, and the pointer appears to be in two places at once. On web, `:hover:not(:has(button:hover, a:hover, [role="button"]:hover))`.
- **Declare the transition on the base rule, never inside `:hover`.** A transition declared inside `:hover` applies on the way in and not on the way out, so the state arrives smoothly and snaps away. That single mistake is most of what makes an interface feel cheap.
- **Hover moves exactly one step.** One surface level, one colour step. Two simultaneous changes read as a different component, not the same one under a pointer.
- **Hover never uses `transform`.** Transform belongs to press. A card that lifts on hover is the SaaS-template tell.
- **Name the properties.** Never `transition: all`.
- **Gate hover behind `@media (hover: hover) and (pointer: fine)`**, so a touch tap does not latch a hover state that then sticks until the next tap elsewhere.
- **Easing is `--ease-standard` in both directions** for a colour change. Reserve `--ease-out` for anything that moves.

### How

- **Transform and opacity only**, named explicitly. Durations 160 / 220 / 280.
- **Use CSS transitions for interactive state changes** so they retarget mid-flight. Reserve keyframes for one-shot staged sequences.
- **Quiet motion travels 10 to 20px, not 40px.** Shorten the distance before weakening the easing.
- **Motion must be interruptible.** Retarget from the element's live presentation value on interrupt, and never lock out input while a transition runs.
- **Never animate an entrance from `scale(0)`.** Enter at `scale(0.95)` plus `opacity: 0`.
- **Exits are faster and softer than entrances** (about 75% of the entrance duration), using a small fixed translate.
- **Mirror `exit` against `initial`.** A reversible transition exits along the path it entered.
- **Easing by direction:** entrances ease out, exits ease in, view and mode transitions ease in-out, state changes use `--ease-standard`.
- **Linear easing is reserved for honest time representation** (progress bars, loading, scrub).
- **Springs are critically damped, damping ratio 1.0, response 0.3 to 0.4s, no overshoot.** There is no bounce and no elastic curve in Orbit. This is a deliberate hardening of the source rule, which permits a bounce on momentum-carrying gestures; Orbit does not.
- **Trigger-anchored overlays** scale from their trigger via `transform-origin`, never from centre. Modals stay centred.
- **Directional slides are reserved for hierarchical navigation** and ordered sequences. Lateral navigation cross-fades or does not animate.
- **Press feedback** is `scale(0.96)` on pointer-down, never on release, and stays continuous for the whole duration of a drag or sheet gesture.
- **Respond on pointer-down, not on release.** Audit every debounce, artificial timer and transition wait on the input path.
- **Gate hover-triggered motion behind `@media (hover: hover) and (pointer: fine)`.** Web only.
- **Stagger group entrances 30 to 80ms per item**, cap the total at about 500ms, and never block interaction while it plays. Do not stagger a routine, high-frequency interaction.
- **`AnimatePresence mode="wait"` nearly doubles perceived duration.** Halve each element's duration when using it. Use `mode="popLayout"` for lists.
- **Use `initial={false}` so a stateful element does not animate its default state on first render**, and verify a full refresh still looks right; do not apply it where the component relies on `initial` for a genuine first-time entrance.
- **An icon state swap cross-fades** at `opacity` 0 to 1, `scale` 0.25 to 1, `blur` 4px to 0, with `bounce: 0`. Import from `motion/react`, which is what this repo installs.
- **Pause looping animations when their element is off-screen.**
- **SVG `stroke-dashoffset` ring and progress sweeps are sanctioned.** Derive `stroke-dasharray` from `path.getTotalLength()` at runtime; never hardcode the dash length.
- **Transition only what changes.** Always name exact properties. Never `transition: all`.
- **Use `will-change` sparingly**, only for `transform`, `opacity` and `filter`, and only when you observe first-frame stutter.

### Scroll reveals

- **A reveal never gates content visibility.** The pre-reveal state IS the visible state.
- **A scroll reveal fires once per element** and never replays on scroll-back.
- **Whole-section fade-and-rise on scroll is a slop tell, not choreography.** Never add page-load choreography.

## Accessibility

The floor is **WCAG 2.2 Level AA**, and **WCAG is the gate while APCA is the tiebreaker above it**. **Automated testing covers only 30 to 50% of issues:** an axe or Lighthouse pass is an instrument reading, never a conformance verdict. Keyboard and screen-reader checks stay manual.

**The test matrix is keyed `route-or-journey x state x viewport x input-or-AT mode`.** Cover authenticated, empty, populated, loading, success, validation-error, permission-error, dialog, menu, disclosure and toast states where they exist. For axe, select all five tags, because they are incremental: `wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa`.

| requirement | WCAG 2 AA | APCA preferred |
|---|---|---|
| Body text | 4.5:1 | Lc 90 |
| Large text (24px, or 18.5px bold) | 3:1 | Lc 60 |
| Non-text UI and graphics | 3:1 | Lc 30 |

### Perception

- **Never encode state or meaning in colour alone.** Every status must also be carried by an icon, a shape, a text label, or a position.
- **Non-text UI elements meet 3:1 against their adjacent surface.** `--fg-4` is derived to exactly this floor at 3.03:1.
- **Measure the pair that actually renders**, not the page background, and remeasure in both modes. A pair that passes in light can fail in dark.
- **Honour `prefers-reduced-transparency`** (raise surface opacity toward solid) and **`prefers-contrast: more`** (see derivation rule 9). The whole dark ladder is white-alpha translucency, so reduced-transparency is directly load-bearing.
- **Never ship a full-viewport moving background, a slow oscillation near 0.2 Hz, or an abrupt light/dark brightness jump.**
- **When text is truncated, keep the full value reachable** if the hidden text carries meaning.

### Keyboard and focus

- **Style `:focus-visible`, never bare `:focus`.** Prefer the browser's own indicator with `outline-offset: 2px`, because it adapts to platform and forced-colours settings. Use a custom 2px ring from the accent token only where the design requires it, and only after inspecting the whole perimeter against every adjacent colour it crosses. **No surface may contain a keyboard trap.**
- **Never remove a focus outline** without shipping a visible replacement in the same rule. In `forced-colors: active`, keep the default adjustment or use a system colour; never freeze the authored colour.
- **Use `:focus-within`** when a wrapper should light up while an inner input has focus.
- **Every pointer interaction needs a keyboard path**, following the ARIA APG patterns: Escape closes overlays, arrow keys move within composite widgets, Tab moves between widgets, Enter and Space activate. Only `tabindex="0"` and `tabindex="-1"`, never a positive value. Composite widgets use roving tabindex.
- **Provide a "Skip to main content" link as the first focusable element on the web shell**, and give in-page anchor targets `scroll-margin-top`. Web only.
- **The WCAG 2.5.8 AA baseline is a 24x24 CSS-pixel target. Orbit's product floor is higher: 44 minimum, 56 comfortable.** Reach it by expanding with an absolutely-positioned pseudo-element on the wrapping label or button, never on the input itself, and never by growing the visible box. Under the spacing exception, a 20px target needs at least a 4px gap.
- **Never let two hit areas overlap.** Shrink the expansion until they do not.
- **A decorative layer gets `pointer-events: none` and `aria-hidden="true"`**, so it never swallows clicks meant for the control beneath. A scrim that dismisses on click is a control and keeps its pointer events.
- **Add `touch-action: manipulation`** to interactive elements to remove the double-tap delay, and `touch-action: none` scoped to a surface implementing its own gestures. Set `-webkit-tap-highlight-color` to match the design.
- **Never make functionality reachable only through hover.**

### Semantics

- **Reach for semantic HTML before ARIA.** `<a href>` navigates, `<button>` acts, `<div onClick>` is never either. No ARIA is better than bad ARIA. Web only.
- **Every interactive element has an accessible name.** Precedence: `aria-labelledby`, then `aria-label`, then the native label, then `title`. Prefer visible text.
- **The visible label must appear inside the accessible name** (WCAG 2.5.3), or voice-control users cannot activate what they can read.
- **Mark a purely decorative icon `aria-hidden="true"` and `focusable="false"`**, and never put `aria-hidden` on or above a focusable element. A meaningful standalone SVG takes `role="img"` plus a label.
- **Expandable controls carry `aria-expanded` and `aria-controls`.**
- **Alt text by purpose:** decorative takes `alt=""` (present, never missing), informative describes the meaning, functional describes the action.
- **Expose one visible `main` landmark**, label repeated landmarks, and keep headings forming a coherent outline.
- **When text is split into per-word spans for animation**, set the sentence as `aria-label` on the parent and `aria-hidden="true"` on every fragment, and never split a link or a button.

### Forms

- **A placeholder is never a field's only label.** Every input carries a visible, persistent label; the placeholder carries the format example. Label and control share one hit target.
- **Style a native input's placeholder with `::placeholder`.** Never simulate one with a positioned span.
- **A field's error is linked with `aria-describedby`, the field carries `aria-invalid`, and required state is announced.** Errors render inline beside the field with an icon or text, never a red border alone. On submit, focus the first invalid field.
- **Accept free text and validate after.** Never block typing or filter characters as the user types. Trim before validating.
- **Never block paste** in an `input` or `textarea`. The 6-box OTP primitive is the canonical exposure.
- **Add `autocomplete` with a meaningful `name`**, plus the correct `type` and `inputmode`. `one-time-code` for OTP, `current-password` and `new-password` for auth. Disable `spellcheck` on emails, codes and usernames.
- **Never lose typed input to a re-render**, and warn on unsaved changes before navigation.
- **Keep input text at 16px minimum on mobile web viewports** so iOS Safari does not zoom on focus, via `text-base sm:text-sm`. Web only.
- **Never disable zoom**, and keep every web surface usable at 200% zoom and reflowing at 320px width with vertical scrolling only. Genuinely two-dimensional content scrolls inside its own container. Web only.

### Announcements

Work down this list and stop at the first match: focus already moves there, so nothing is needed; tied to a control, so use `aria-describedby`; non-urgent and untied, so use a polite `role="status"`; urgent and untied, so use `role="alert"`.

- **Render the live region empty and stable before updating its text.** A region inserted together with its content is announced inconsistently.
- **Default to polite.** Overusing `assertive` interrupts whatever the reader was on.
- **A toast is never the only channel for information the user must act on.** Never move focus to a toast. A toast carrying an action or an error stays until dismissed; a timed one uses a 5 second floor and pauses on hover or focus.
- **Anything moving, blinking or updating automatically for more than 5 seconds needs a visible pause control.**
- **Under reduced motion**, replace slides, scales and parallax with opacity cross-fades, kill autoplay, and start carousels paused. Keep spinners, progress, instant state changes and brief press feedback. Wrap motion in `@media (prefers-reduced-motion: no-preference)` so it is opt-in; where a global kill switch is the only option, use `0.01ms` rather than `none` so `transitionend` still fires.
- **The `.sr-only` pattern uses 1px boxes, not zero**, with `clip-path: inset(50%)` and `white-space: nowrap`. Never `display: none`.
- **If audio feedback is ever added:** sound never replaces visual feedback, ships behind an explicit off toggle, defaults subtle, and is suppressed under `prefers-reduced-motion`.

## Special surfaces

**Paywall.** At most 3 plans. Mark exactly one recommended and style it with the existing PlanCard selected treatment. Write bullets as outcomes, not feature names, 3 to 6 visible per plan. Keep the CTA verb identical across every tier. Pair the monthly/annual toggle with an explicit savings callout: the arithmetic is visible, never implied.

**Landing hero (`orbit-landing-page`).** A 3-second message gate: the headline and CTA are readable within 3 seconds, with no visual treatment between the visitor and the offer. If a treatment competes, reduce the treatment, not the copy.

**Landing reference galleries.** `saaspo.com` and `saasframe.io` are recorded references for **landing and marketing surfaces only**, and for the shape of a spec rather than its content. **Never cite either for a product surface.** Marketing calm is not product density.

## External component sources

`beautifului.dev` (MIT) is an accepted source of AI-native primitives, and its record table, tool chips, streaming text and insight cards are the intended inputs to the Astra surfaces. **A component may be adopted as-is only while it passes this document and the repo gates.** As-is ends the moment a token, a glow, a gradient, a glass material, or an off-scale radius violates the canon: at that point it is a starting point to be re-tokenised, not a drop-in.

The same test governs any future external component, from any source. Nothing enters the codebase because it looked right on someone else's canvas.

## Bans

- **No decorative glow.** Not on the CTA, not on the FAB, not anywhere. A softened glow is still a glow.
- **No gradient wash.** No gradient borders, no gradient text, no mesh, no bloom, no scanlines, no film grain, no "subtle texture".
- **No Liquid Glass.** No glass material, no frosted chrome as a look, no translucent panel stacked on a translucent panel.
- **No sparkle icon** as an AI or default marker. Identity is the Astra glyph.
- **No interactive element without a hover state**, and no hover state that uses `transform` or that declares its transition inside `:hover`.
- **No pill used as a CTA outside `PillButton`**, and no pill in a hero. The pill radius means interactive; a static element uses radius 8.
- **No default component-library theme and no default white accent** on any surface, marketing included.
- **No decorative background orbit arcs.**
- No accent outside the rationed list.
- No coloured side-stripe border.
- No raw `--slate-*` references. Semantic tokens only.
- No hardcoded accent `rgba`. Tints come from `--primary-rgb` / `tintFromPrimary`.
- No `oklch()` literal in a shared token or a mobile style.
- No off-scale shadow, and never a hand-rolled `box-shadow` heavier than the token.
- No opaque card-on-card on dark. No borders-as-borders where the kit uses inset rings. No stacked hairlines.
- No off-scale spacing value outside the chosen set and the three named exemptions. No `space-x-*` / `space-y-*`. No margins for sibling spacing.
- No `transition-all`. Animate `transform` and `opacity` only, named explicitly.
- No bounce or elastic easing. No spring overshoot.
- No `h-screen`. Use `min-h-dvh`.
- No structural hacks.
- No arbitrary z-index. Overlays stack on the semantic scale.
- No off-grid icon size. The set is 16 / 20 / 24.
- **No new font families, radii, or colours outside this spec.** Geist Sans, Space Grotesk and Geist Mono. There is no fourth family and no serif.
- No per-component theme branches. The two modes resolve through tokens only.
- No em dashes and no en dashes. No UPPERCASE typed into a string.
- No `<br>` to hand-break copy.
- No text button where a universal glyph exists; no icon-only control without an accessible label.
- No full-bleed pill CTAs outside the **Buttons** allowlist.
- No ad-hoc raw pill button, no hand-tuned button height or padding.
- No fabricated numbers in a shipped UI.
- No numeric design score.

## Working model

1. **Context** - state the screen's job in one sentence.
2. **Anchor** - already chosen: **spacious, near-black, one rationed accent, warmth in the mark**. Do not re-pick the anchor. The accent HUE is the one open question and is settled at grant 1.
3. **Focal element** - name the one element that wins this view, and how. Demote everything else deliberately.
4. **Differentiator** - name the one memorable move for this screen. It must come from the identity carriers, never from added decoration.
5. **System** - use the tokens above. No new colours, families, radii, or spacing values.
6. **Implementation** - outline structure, then build. Then run the three tests below.

**When reviewing, slow the interface down.** Replay motion at 10% speed and walk every state: hover, focus, active, loading, empty. What feels off at 10% is what is subtly wrong at full speed.

### AI-slop test

Before shipping, scan for the tells and delete what you find:

- decoration used as hierarchy: any glow, gradient wash, gradient border, gradient text, mesh, texture, bloom, or "quiet" background effect;
- **a glass or Liquid Glass material, or a frosted panel used as a look;**
- **a sparkle icon used as an AI or default marker;**
- **a pill used as a CTA outside `PillButton`, or any pill in a hero;**
- **a default component-library theme, or a default white accent on a marketing surface;**
- cards in cards, and cards used where spacing would have grouped;
- a coloured side-stripe border on a row or callout;
- connector or tree lines in a hierarchy;
- grey text on coloured backgrounds; rounded-square icon tiles above headings;
- an oversized centred H1 outside a hero context;
- the hero-metric template used as decoration, or any invented precise-looking number;
- a whole-section fade-and-rise scroll reveal, or any page-load choreography;
- an animation whose purpose you cannot name from the closed list;
- a heading and the intro beneath it saying the same thing;
- **a descriptive subtitle beneath a heading, label, card, or settings row that restates it;**
- an eyebrow that enumerates rather than labels.

### Squint test

Blur the surface. Hierarchy and section boundaries must still read, and nothing may jump out harshly. This catches the failure the slop test does not: flatness, and harsh lines.

### Scene-sentence test

Describe the rendered screen in one sentence as if narrating a film scene. If it reads like every other SaaS app, the design is generic. It must name Orbit's character: a near-black canvas with real air around everything, quiet tonal panels, one rationed accent reserved for what is done and what is next, and the orbital ring language carrying the identity. If the only way to make the sentence specific is by describing decoration, the design has failed.

## Enforcement

**Prose is not enforcement.** The rules above split three ways.

**The `eslint-rules/` re-derivation lands in the PR immediately after human grant 1**, because D66 decision 12 sets the spacing step values at that grant and several rules encode them. Until then the table below states the target, and the existing rules stay as they are.

### Gate-backed

| rule (section) | mechanism | status |
|---|---|---|
| The accent split and its three floors (Tokens) | accent-AA token test: ink on `--primary` >= 4.5; `--primary` on canvas >= 3.0; `--primary-soft` on canvas >= 4.5 | **re-baseline after grant 1.** The pairing is ink-on-fill, not white-on-fill |
| Byte-exact token acceptance | shared unit test on `createTokensV2` plus the resolved web CSS | re-baseline to the two variants |
| No decorative glow (Bans) | `local/no-decorative-glow` | **flip to `error`** after grant 1 |
| No gradient wash / gradient text (Bans) | `local/no-raw-gradient` + `local/no-gradient-text` | **flip to `error`** |
| No coloured side-stripe (Bans) | `local/no-side-stripe-border` | keep |
| No bounce or elastic easing (Motion) | `local/no-overshoot-easing` | keep |
| No `space-x-*` / `space-y-*` (Spacing) | `local/no-space-x-y` | **wire on mobile** |
| Off-scale spacing (Spacing) | `local/spacing-scale` | **re-enumerate to the chosen scale after grant 1** |
| No arbitrary z-index (Stacking) | `local/no-arbitrary-zindex` | keep. `app-overlay.tsx:235` is a live violation the Base UI adoption removes |
| Focus outline never removed bare (A11y) | `local/require-focus-replacement` | **wire on mobile** |
| Never disable zoom (A11y) | `local/no-user-scalable-no` | keep, web only |
| `<div onClick>`, positive `tabIndex` (A11y) | `jsx-a11y` rules at `error` | keep |
| Image alt text (A11y) | `jsx-a11y/alt-text` + `local/no-placeholder-alt` | keep |
| Dialog / Overlay accessible name (A11y) | `local/require-dialog-title` | keep |
| No `will-change` in a static class (Motion) | `local/will-change-discipline` | **wire on mobile** |
| Raw font feature / axis tags (Type) | `local/no-raw-font-feature-tag` | keep |
| No `calc()` percentage widths (Layout) | `local/no-calc-percentage-width` | keep, web only |
| AnimatePresence `exit` + stable keys (Motion) | `local/animate-presence-exit`, `local/animate-presence-stable-key` | keep |
| No em dash or en dash | `tools/check-dashes.mjs` | shipping |
| Banned-word set (Voice) | `tools/check-copy.mjs --check` | **extend to the 25 enumerated entries, with the scope column** |
| No UPPERCASE typed into a string | `tools/check-copy.mjs --check` | shipping |
| No full-bleed pill CTA (Buttons) | `local/no-fullbleed-button` | shipping, web only |
| Icons only through the barrel | `no-restricted-imports` | **lands with #210**, as one sweep |
| No gorhom sheet (Overlay) | `local/no-gorhom-sheet` | keep |
| No `oklch()` in a shared token or mobile style (Tokens) | **new rule** | after grant 1 |
| No sparkle icon as an AI marker (Bans) | **new rule** | after grant 1 |
| Off-grid icon size (Icons) | **new rule**: size outside 16 / 20 / 24 | after grant 1 |
| Pill radius on a static element (Shape) | **new rule**: radius 999 outside `PillButton` and the interactive kit | after grant 1 |

### Reviewer-judgment (the `design-reviewer` agent enforces these per diff)

Everything else, and specifically: the 65ch measure, the 2x gap rhythm, concentric radii, optical alignment, "a card is not a layout primitive", one focal element per view, the 4-option ceiling, blur restraint, the frequency gate and the closed purpose list, the motion remediation order, the delight budget, the loading/empty/error triad, the full nine-state set, the listing thresholds, the overlay sizing and scroll-ownership rules, copy naming, "say it once", the supporting-copy ban, error content and placement, confirmation-dialog warrant, eyebrow rationing, the habit-list treatment, the paywall shape, flow-shape parity, colour-as-only-signal, the 3:1 non-text floor, focus management in overlays, reduced-transparency and reduced-contrast handling, and all three shipping tests.

### Not enforceable here

`prefers-reduced-transparency` / `prefers-contrast` handling, the 200% zoom layout, the 320px reflow, keyboard traps, and screen-reader semantics need the **live rendered DOM**. They belong to the proposed a11y baseline-diff CI gate, keyed on the matrix above.

