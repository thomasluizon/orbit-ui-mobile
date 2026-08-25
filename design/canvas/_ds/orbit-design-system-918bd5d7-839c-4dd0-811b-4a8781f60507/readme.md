# Orbit design system

Orbit is an AI habit tracker for overwhelmed adults who cannot keep a routine. Astra, the AI, sits on the primary path: it starts a routine, changes it, and acts on it, rather than living in a separate chat tab. Positioning: an AI that tracks habits, not a habit tracker with an AI (never phrase it as that contrast in copy).

One product surface matters today: the app, designed mobile-first at a 412px shell with a wide layout (column capped at 740px plus a conversation panel). Primary market is Brazilian Portuguese (pt-BR) with English; "Orbit" and "Astra" are never translated.

## The information architecture, settled 2026-08-16 (D69)

`DESIGN.md` section `## Information architecture` is authoritative and outranks every other section on whether a surface should exist.

- **Astra is a layer with a front door, never a destination.** No Astra tab, no bubble. ONE persistent composer lives in the shell on every primary screen, carrying 3 to 6 suggestion chips built from live state. The conversation opens from that composer as a full-height overlay, and as a side panel at the wide breakpoint. Every object also carries an inline AI affordance where the machine can propose something.
- **The shell is four destinations on both platforms: Hoje, Calendario, Progresso, Perfil.** Bottom tab bar on mobile, sidebar on web. **No drawer and no hamburger.** Metas left navigation: goals live inside Progresso and are created from a habit or by asking.
- **The core loop is never mediated.** Marking a habit done is one tap, optimistic, deterministic, no model call, ever.
- **The desktop stats rail is deleted.** Progresso owns the question it answered, and the width goes to the conversation panel.
- **Astra speaks first.** A proactive line sits at the top of Hoje carrying what Astra noticed and one action.
- **Surfaces that no longer exist**, so drawing them is the defect: the `/insights` route, the retrospective's empty/locked/no-data screens, six of the seven celebration overlays, the separate onboarding/tour/feature-guide/push-prompt systems, a create-goal entry in navigation, the stats rail, the social layer, the colour-scheme picker, AI memory.

**The accent is warm orange `#C4530F`, granted by Thomas 2026-08-16, the only accent.** Rose is retired; there is no hue switch. To make orange legal in light mode, light `--status-overdue` moved from `#B45B00` (9.8deg from the accent, inside the 15deg same-colour band) to `#946A00` (hue 81.2, a 36.4deg gap; 4.66:1 on `#FAFAFA`, white on it 4.86:1). Dark `--status-overdue` is unchanged, and light `--fg-on-overdue` is `#FFFFFF`.

**The mark shipped**: `orbit-mark.svg` and `astra-mark.svg` replaced the draft tilted-ellipse mark and the circle-with-core Astra glyph on 2026-08-16; the old draft assets were deleted.

## Sources

- Local codebase folder `design/` from `orbit-ui-mobile` on branch `redesign/main`: `design/reference.html` (the rendered authority for values, though its accent comparison is now historical: read the banner at its top), `design/brand/` (marks, lockups, fonts, README.md, SETUP.md).
- Uploaded brand files (same assets): fonts, mark/lockup SVGs and PNGs, now in `assets/`.
- GitHub repo `github.com/thomasluizon/orbit-ui-mobile` exists but was deliberately NOT linked: its `main` branch carries the old system (six schemes, violet primary, glows, gradients, Rubik/Inter/Roboto) that this redesign deletes.
- No Figma source exists.

## Content fundamentals

- **Voice**: calm and plain. No exclamation mark on a success or completion. No shame language on a missed day. **Copy names the circumstance, never the person**: that is a research finding, not a preference (Silverman and Barasch, *Journal of Consumer Research* 2023, 49(6): the harm of a broken streak is amplified when the person attributes the break to themselves).
- **Casing**: sentence case everywhere. Never type an uppercase string; use `text-transform` (eyebrows, badges).
- **Buttons**: verb first, 1-2 words: "Log habit", "Registrar", "Criar meta", "Arquivar".
- **Never write**: "Oops", "Are you sure?", "Click here", a bare "Learn more", em dashes or en dashes, "this, not that" contrast frames.
- **Never** add a subtitle that restates the heading above it.
- **pt-BR**: "voce", plain and warm, never corporate, never slang. Sample copy: "Água da manhã", "Nenhum hábito ainda", "Você pode restaurar a qualquer momento."
- Errors state the fix, adjacent to the field: "Use um email completo, como nome@exemplo.com". Disabled controls carry the reason beside them: "Gerido pela sua assinatura."
- At capacity is a boundary, not an error. **It is no longer a habit count**: the ceiling is an abuse guard at 1000, identical on every plan, so the live at-capacity case is the daily Astra allowance, which the composer's `atLimit` state carries.
- **The four internal schedule type names never render**, in either locale: not "recorrente", not "flexivel", not "tarefa unica", not "geral". Creation is one input plus a live preview sentence.
- Emoji: only as user-chosen habit icons inside a row well (💧🏃📖), never in UI copy or as UI iconography.

## Visual foundations

- **Modes**: dark is primary, light is mandatory. Two variants, never more. Light is not dark reversed; every pair is remeasured.
- **Canvas**: dark `#09090B` (never pure black), light `#FAFAFA`.
- **Surfaces (dark)**: white alpha over the canvas, never lighter hexes: card .04, field .06, well .08, elev-2 .12, hover .14. Overlay panel is OPAQUE `#1C1C1E`. Hairlines: .08 / ghost .10 / strong .16. Scrim rgba(0,0,0,.55). Light: cards opaque `#FFFFFF`.
- **Foreground**: dark `#F4F4F6 #C9C9CC #8F8F93 #5D5D60` (fg-4 sits at exactly the 3:1 non-text floor); light `#1A1A1D #424247 #68686D #89898D`.
- **Accent**: exactly one, a dark fill with `#FFFFFF` text. Four roles only: (1) next action (primary button, FAB, empty-state invitation arc); (2) current position (active tab/nav, selected card tint+ring, focused field ring); (3) progress toward something UNFINISHED; (4) one element in the logo mark. It NEVER marks completion: 100% rings and done rows go neutral. Never decorative. One filled action per view. Colour on the background, not the label.
- **Accent text is canvas only.** `--primary-soft` (the accent-coloured label, e.g. the active tab or nav item) is scoped to the canvas, where it measures 4.58:1. On a card, field, well, elevated panel or hovered surface it drops to 4.28:1 and below, so accent text never appears there: on a raised surface, emphasis is a weight step, not a hue. The accent as a fill or a graphic is unaffected; this is the coloured-label token only.
- **Status**: five of seven neutral. done = `--fg-1` disc + filled check; frozen = `--fg-2` + snowflake; skip = `--fg-3`; empty = `--fg-4`. Only overdue (dark `#FE9A00`; light `#946A00` with white text) and error (dark `#FB2C36`; light `#E7000B`) carry a hue. Never colour alone: every status also carries an icon, shape, or label.
- **There is no habit colour palette. Colour-as-data is dead** (2026-08-16). The eight `--p-hab-*` hues were deleted, and so was the monochrome-emoji-tinted-by-habit-colour direction. Reason: the accent is rationed to four roles and every status is unbound from it, so eight more meaning-bearing colours reopen the "the accent does six jobs" defect this redesign exists to close. **A habit is told apart by its emoji, its name and its ring, and by nothing else.** Habit emoji render in full colour.
- **Type**: Geist (UI, 400/500/600), Space Grotesk (display + numerals, 500/600 - its file defaults to 300, never use it), Geist Mono (meta + tabular numerals, 400/500). Sizes 12 14 16 17 20 22 28 34 44 60. Display gets negative tracking, body 0, uppercase labels positive. Tabular numerals on changing values. Emphasis = one weight step up. Prose capped ~65ch.
- **Spacing**: 0 4 8 12 16 24 32 48 64 96, nothing between. Card/panel padding 24; list row 16. Group gap >= 2x in-group gap. Flex/grid gap, never sibling margins.
- **Radius**: 0 8 12 16 20 28 + pill 999. Cards/panels 20, wells/fields 12, chips/badges 8, overlay 28 top. 999 means interactive. Concentric nesting: outer = inner + padding.
- **Shadow**: three neutral levels (`--sh-1..3`). Never a hued shadow. On dark, a 1px inset hairline does depth, not shadow stacks.
- **Hover**: every interactive element has one; static surfaces have none. Surface -> `--bg-hover` over 380ms; a control darkens its fill (never lightens: the accent has no headroom toward white) over 240ms. Transition declared on the base rule. One step, no transform. The accent ladder is monotonic: rest `#C4530F` 4.57:1, hover `#B74E12` 5.11:1, pressed `#A24716` 6.09:1 (white label throughout); each mixes with the `--p-canvas` primitive so it resolves identically in both modes. transform (transform belongs to press: `:active{scale:.96}` on buttons). **The accent fill darkens on hover, never lightens**: white on `--primary` is only 4.57:1, so `--primary-hover` mixes toward `--p-canvas` (`#B74E12`, white 5.11:1) and `--primary-pressed` darkens further (`#A24716`, 6.09:1); both mix with the primitive canvas so they hold in either mode.
- **Motion**: transform + opacity only. 160/220/280ms. `cubic-bezier(0.2,0,0,1)` standard, `cubic-bezier(0.16,1,0.3,1)` out. Travel 10-20px. No page-load choreography, no scroll-triggered section rises. **Never animate a generative block's own reveal**: text streams, the block arrives whole.
- **Hierarchy**: space, then size, then weight, then contrast; surface step or hairline last. ONE separation device per boundary. A card is not a layout primitive; it earns its place only for a separable, actionable object.
- **Banned without exception**: glow, gradients of any kind, mesh, bloom, texture, grain, scanlines, glass/frost, sparkle-as-AI icons, decorative orbit arcs in backgrounds, white accent, coloured side-stripe borders, connector/tree lines, cards inside cards, rounded icon tiles above headings, em/en dashes, a habit colour palette.
- **States**: an interactive component ships every state it can hold and no component leaves one ambiguous. The full set is default, hover, focus, active, disabled, loading, error, empty, at capacity, **plus a tenth, `proposed`**, wherever a value can be inferred by the machine: the same field or row at `--fg-3` with an inset dashed hairline, resolving to normal the instant the person accepts or edits it. It never takes the accent. Static and identity components (Badge, StatTile, InfoCard, the bars, the marks, the icon) hold none of the nine and their cards say so in one line. **A derived value is not a proposed value**: it renders like a typed one, carries no edit control, and the surface names what it derives from. The `Proposed` wrapper in `display/` carries this treatment for a field, a row and a whole block.
- **Accessibility**: WCAG 2.2 AA floor. Body 4.5:1, large text 3:1, non-text UI 3:1. Touch 44 min / 56 comfortable. `:focus-visible` only, never bare `:focus`, never removed without a visible replacement in the same rule.

## Identity and iconography

- **Identity carriers, exactly three**: the orbital mark, the Astra glyph, ring-shaped indicators. Never background decoration. Warmth has one source: the mark.
- **The mark**: a planet drawn as a ring with an open centre, an orbital band crossing in front across the lower left and passing behind at the upper right, and a small solid moon above right (`assets/orbit-mark.svg`, 1024 grid). One asset at every size. The moon carries the accent; the monochrome treatment is for the neutral lockup.
- **Astra**: a letter A carrying the same orbital band and the same solid dot (`assets/astra-mark.svg`). The Astra glyph is the AI marker - never a sparkle. They differ by SILHOUETTE: Orbit is a hollow ring, Astra is a solid letterform, and that reads at 16 pixels.
- **ProgressRing** is a true circle with a sweep over a track - deliberately not the mark's shape.
- **UI icons: Tabler only.** Sizes 16/20/24, default 24. Outline default; filled marks active state. Legible at 16. Loaded from CDN webfont (`@tabler/icons-webfont`) in cards and kits - see `components/brand/Icon`. SVGs from Tabler are also fine inline. The product code migrated to Tabler behind a per-platform barrel on 2026-08-16.
- **Assets** (`assets/`): `orbit-mark.svg` and `astra-mark.svg` (the shipped marks; fills resolve `var(--fg-1, #F4F4F6)` so they follow the page mode inline and fall back to dark values standalone), variable TTFs in `assets/fonts/`. Lockups and platform icons are composed live from the mark (see `guidelines/brand-lockup.html`, `guidelines/brand-platform-icons.html`); no baked lockup or icon rasters exist yet for the new mark. The near-white mark looks invisible on white previews - that is correct.

## Component inventory

Groups under `components/`:

- `actions/`: Button (primary/ghost/secondary/destructive/caution, sm, disabled, loading), Fab
- `forms/`: Input (label, error, disabled), OtpInput, Switch
- `lists/`: HabitRow (own panel per habit, with a per-row overflow menu), ListRow (icon slot, title 17/400, value + chevron; danger variant; draws no rule of its own), RadioRow (24px control; selected = accent fill with 9px dot), RowList (settings-style shared lists only, never habits), SettingsGroup, StatusRing (done/empty/frozen/overdue/skip)
- `display/`: Badge, StatTile, InfoCard, PlanCard, ProgressBar, ProgressRing, **BlockFrame** (the container every generative block inherits: header, scrolling body, per-row status glyph slot, stale banner, and an action row that never scrolls with the body; loading/resting/acting/partiallyFailed/stale), **Proposed** (the tenth state on a field, a row or a whole block)
- `navigation/`: TabBar, NavHeader, SectionTitle
- `overlay/`: Sheet (short + long content), EmptyState (the orbital band with one open accent invitation arc), Skeleton (final-layout shaped, aria-busy, no spinner), ErrorState (message states the fix + one action), CapacityNotice (neutral boundary, never --status-bad), Scrim
- `brand/`: OrbitMark, AstraGlyph, Lockup, Icon (Tabler wrapper)
- `shell/`: Shell412 (the mobile shell: one scroller, pinned tab bar + FAB, safe-area aware), ShellWide (sidebar + 740 column, composer pinned to the bottom of that column; sidebar create is the one filled action), **Composer** (Astra's front door: one bar plus 3 to 6 live-state chips; its head Astra glyph is a 44px `Abrir conversa` button; resting/focused/composing/sending/offline/atLimit, and `atLimit` carries no upgrade call to action)
- `canvas/`: CanvasControls (the review bar: mode / width / state / locale; canvas chrome, not product UI)

**Wave 0 landed 2026-08-16**: Composer, Proposed and BlockFrame are built, with `components/shell/composer.card.html` and `components/display/generative.card.html` as their specimen cards.

**Shell state (2026-08-16)**: `ShellWide` no longer carries the deleted stats rail, and its composer pins to the bottom of the 740 column (matching mobile) rather than the sidebar. `Shell412`'s tab bar is Hoje / Calendario / Progresso / Perfil with the composer above it. `components/shell/shell.card.html` documents both shells structurally, as labelled empty slots, not as a product screen.

## Measured and open contrast limits

These three pairs miss their WCAG floor. They are recorded here with their numbers because each trades against a rule Thomas set, so closing them is his call, not a silent pigment change. Item 1 (accent text on a raised surface, 4.28:1) was closed by scoping `--primary-soft` to the canvas.

- **Limit 2. fg-3 text on a hovered dark row: 4.40:1** (floor 4.5). fg-3 clears every resting dark surface (canvas 6.18 down to elev-2 4.69) and misses only while a row is under the pointer, on the `--bg-hover` .14 surface. Cheapest fix: lower the hover alpha, but that shifts the whole surface ladder, so it is deferred.
- **Limit 3. fg-4 as a graphic on any dark surface above the canvas: 2.16 to 2.84:1** (floor 3.0). fg-4 is defined to hit exactly 3.03 on the canvas; the empty status ring drawn in fg-4 on a card, field, well, panel or hover surface falls short. Cheapest fix: draw the empty ring in fg-3 whenever it sits above the canvas, but that collapses the four-step neutral status ranking (done / frozen / skip / empty) into three, so it is deferred.
- **Limit 4. fg-4 as a graphic on the light hover surface: 2.94:1** (floor 3.0). The light-mode counterpart of limit 3, on `--bg-hover` only; fg-4 clears the light canvas (3.34), card (3.48) and well (3.07). Same cheapest fix and same reason for deferring.

## Index

- `styles.css` - global entry; imports everything in `tokens/`
- `tokens/` - fonts, colors, typography, spacing, shape+motion, base
- `assets/` - marks, lockups, platform icons, PNG set, fonts
- `guidelines/` - foundation specimen cards (Design System tab) + `screen-contract.md` (the ten rules every screen document follows)
- `components/<group>/` - React primitives, one card per group
- `SKILL.md` - agent skill entry point

`ui_kits/app/` was **deleted on 2026-08-16**. It held Today / Metas / Astra / Perfil at 412px, which is the pre-D69 shell: Astra as a destination and Metas as a tab, both of which no longer exist. The replacement is built in the rewritten waves.
