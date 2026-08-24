# Claude Design setup payload for the Orbit design system

> **At a glance** - the five setup fields, filled and ready to paste, plus the checklist to run right
> after the design system is created. One time use, for ticket `#36`. The assets it points at live
> beside it in `design/brand/`. The tool itself is documented in the brain vault at
> `2 Areas/20-29 Orbit Engineering/How Claude Design works (operator reference).md`.

**Build the design system first, as its own object. Screens come after, with it selected.** These two
jobs are two different screens in the product. This file covers the first one only.

---

## Field 1. Company name and blurb

**Name**

```
Orbit
```

**Blurb**

```
Orbit is an AI habit tracker for overwhelmed adults who cannot keep a routine. Astra, the AI, sits on the primary path: it starts a routine, changes it, and acts on it, rather than living in a separate chat tab.
```

`BRAND.md` states the positioning as "an AI that tracks habits, not a habit tracker with an AI". That
sentence is a binary contrast frame, which entry 3 of the banned word set forbids in long form copy.
The blurb above carries the same positioning and brand principle 3 without the frame, so the tool
never learns the frame and repeats it back in generated copy.

---

## Field 2. Link code from GitHub

**Leave this field empty.**

The field takes a whole repository URL. It gives no branch control, so it reads
`github.com/thomasluizon/orbit-ui-mobile` at its default branch, `main`. The redesign lives on
`redesign/main`, and `main` predates the whole of it.

That alone settles the field, but the deeper reason survives even if branch control appears later.
Claude Design derives a working design system from whatever you attach. The frontend code in this
repository still carries the exact system that `DESIGN.md` deletes. Read live from
`apps/web/app/globals.css` on `redesign/main`:

| what the file still holds | what `DESIGN.md` says |
|---|---|
| six colour schemes, `.scheme-purple` through `.scheme-cyan` | ONE scheme. The six are dead |
| `--primary: #7f46f7`, violet | the accent moved off violet under D68 |
| `--primary-glow` and `--primary-glow-hover` | no decorative glow, at any strength |
| `--gradient-header-from` per scheme | no gradient wash anywhere |
| `--status-done: var(--primary)` | done is unbound from the accent. It is an `--fg-1` disc |
| Rubik, Inter and Roboto | Geist, Space Grotesk and Geist Mono |
| `oklch()` literals in the token source | never an `oklch()` literal in a shared token |

Attaching that teaches the tool the system the redesign exists to kill. The token rewrite is R ticket
work and lands after the accent grant, so this stays true for the whole canvas phase.

**What is lost, stated honestly:**

- **`apps/web`**: the component inventory, the real file paths, the route list, and the desktop shell
  shape. This is the only genuine loss. `DESIGN.md` recovers most of it: the **Primitives kit** table
  names all 22 primitives with the file path on both platforms, so paste that table when the tool
  needs to map a generated screen onto a real component. That happens at the SCREEN stage, not now.
- **`apps/mobile`**: the 412px shell and the NativeWind idiom. Claude Design emits HTML and React, not
  React Native, so it can act on almost none of this. Near zero loss.
- **`packages/shared`**: the Zod contract types and the locked `theme/button.ts` size table. The
  contract types describe data, not design. The button geometry matters, and `DESIGN.md` **Buttons**
  already states it as 5 variants by 4 sizes off shared data.

## Field 2b. Link code from your computer

This is the field whose help text recommends a frontend focused subfolder, and it is the only one
where you control which branch's bytes get read.

**Drag this folder:**

```
C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile\design
```

Take it from a working tree on `redesign/main`. It is real frontend code, it is small, and every byte
in it belongs to the new system. It carries `reference.html`, which is the rendered authority, and
`brand/`, which carries the mark, the glyph and the three type families.

Confirm the branch before you drag, because the folder path is identical on every branch:

```bash
git -C "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile" branch --show-current
```

---

## Field 3. Upload a .fig file

**Nothing to upload. No `.fig` file exists.** Orbit has never had a Figma source, and Claude Design
has no Figma export, so one will not appear from this work either. Skip the field.

---

## Field 4. Add fonts, logos and assets

Drag these 5 files. Every path is relative to `design/brand/`.

**Type, 3 files.** Upload the TTF files, never the `woff2` data inside `reference.html`. Those are
subsets and do not carry the whole character set, which breaks pt-BR copy.

```
fonts/Geist[wght].ttf
fonts/GeistMono[wght].ttf
fonts/SpaceGrotesk[wght].ttf
```

**Vector brand, 2 files.** These are the only brand vectors that exist.

```
orbit-mark.svg
astra-mark.svg
```

Both are drawn on a 1024 grid, one `fill-rule="evenodd"` path each plus Orbit's moon, and both paint
with `fill="currentColor"` and carry no hex. Upload them as they are. There is no accent variant to
choose between, because the accent treatment is not built yet.

**Raster: none.** No PNG set exists. `#80` owns the app icons, store graphics, OG images, splash and
notification icon, and it derives them from the two files above.

**Do not look for the nine files an earlier revision of this document listed.** `mark-24-neutral.svg`,
`mark-16.svg`, `astra-24.svg`, `lockup-horizontal-neutral.svg`, `icon-512-orange.svg` and the four
`png/` files were the drafts PR #735 shipped to make the accent decidable. Every one of them is
deleted and `png/` no longer exists. The 24 grid variant, the native 16px redraw, the horizontal
lockup and the accent treatment are still to build, so a tool that asks for them gets nothing.

**Expect the mark to render BLACK in an upload preview, not near white.** `currentColor` resolves
against the SVG document's own root when the file is loaded as an image, and that document sets no
`color`, so it falls back to the browser default. Nothing inherits from the page around it. That is
correct, not a broken file. To see the mark in its real ink, inline the SVG and set
`color: var(--fg-1)` on the element that carries it.

**Say this in the first chat turn, because no field carries it:** the mark is final, not a draft.
Thomas granted `orbit-mark.svg` and `astra-mark.svg` on 2026-08-23 under ticket `#79`. Identity comes
from those two marks and ring shaped indicators and from nothing else, so do not let the tool invent
a third carrier.

---

## Field 5. Any other notes

This is the field that changes every generation, so it carries only rules a generator can obey
mechanically: exact values, closed sets, and hard prohibitions. It deliberately leaves out the
judgement rules from `DESIGN.md` (the squint test, the scene sentence test, one focal element per
view, the four option ceiling, the motion frequency gate, the listing thresholds). A design tool will
not apply those, and including them buries the rules it will apply. Those stay a human review job and
belong to the `design-reviewer` agent per diff.

**The accent byte is settled: `#C4530F`, warm orange, granted by Thomas on 2026-08-16.** Orange
`#C4530F` is retired. Do not re-open it and do not read the older recommendation below as live.

```
ORBIT DESIGN SYSTEM. Dark is primary and light is mandatory. Two variants, never more.

ACCENT: exactly ONE, #C4530F, a dark fill with #FFFFFF text on it. I may adjust this byte on the canvas. The accent takes FOUR roles and nothing outside them: (1) the next action, meaning the primary button, the floating action button, and an empty state invitation arc; (2) current position, meaning the active tab, active nav item, a selected card or option including its tint and ring, and a focused field ring; (3) progress toward something UNFINISHED; (4) one single element inside the logo mark. It NEVER marks completion: a progress ring at 100% goes neutral and a completed row is neutral. It is never decorative on a card, a row, a border, a heading, a static badge or chip, or an icon that is not communicating state. Fill exactly one action per view. Put the colour on the background, not on the label.

CANVAS AND SURFACES, dark: background #09090B, near black and never pure black. Surfaces are white alpha over that canvas, never lighter hex values: card rgba(250,250,250,0.04), field 0.06, well 0.08, second elevation 0.12, hover 0.14. The overlay panel is OPAQUE #1C1C1E, because it sits over arbitrary content. Hairline rgba(255,255,255,0.08), strong hairline 0.16. Scrim rgba(0,0,0,0.55).
FOREGROUND, dark: #F4F4F6, #C9C9CC, #8F8F93, #5D5D60.
LIGHT MODE: background #FAFAFA, cards opaque #FFFFFF, foreground #1A1A1D, #424247, #68686D, #89898D. Light is not dark reversed. Remeasure every pair.

STATUS COLOURS, five of seven are neutral: done is a #F4F4F6 disc carrying a filled check, frozen is #C9C9CC plus a snowflake glyph, skip is #8F8F93, empty is #5D5D60. Only overdue #FE9A00 and error #FB2C36 carry a hue. Never encode a state in colour alone: every status also carries an icon, a shape, or a label.

TYPE: three families, no fourth family and NO SERIF. Geist for UI (the real family name is "Geist"), Space Grotesk for display text and numerals, Geist Mono for meta text and tabular numerals. Loaded weights are Geist 400/500/600, Space Grotesk 500/600, Geist Mono 400/500. Any other weight is a bug. Space Grotesk defaults to weight 300 in its file: never use it. Sizes: 12 14 16 17 20 22 28 34 44 60. Large display text takes negative tracking, body sits at 0, small uppercase labels take positive tracking. Tabular numerals on any value that changes. Emphasis is one weight step up, never a size change. Cap prose at about 65 characters per line.

SPACING: exactly these ten values and nothing between them: 0 4 8 12 16 24 32 48 64 96. Card and panel padding is 24. List row padding is 16. The gap between two groups is at least twice the gap inside a group; uniform gaps everywhere are the tell of no decision. Use a flex or grid gap, never a margin between siblings.

RADIUS: 0 8 12 16 20 28, plus pill 999. Cards and panels 20, wells and fields 12, chips and badges 8, overlay 28 on the top corners. Radius 999 means interactive: a static element never wears it. Nested rounded surfaces use concentric radii, outer equals inner plus padding.

SHADOW: 0 1px 2px rgba(0,0,0,.20), 0 4px 16px rgba(0,0,0,.28), 0 12px 40px rgba(0,0,0,.45). A shadow never carries a hue. On the dark canvas a 1px inset hairline does the work of depth, not a layered shadow.

HOVER: every interactive element carries one, and a static surface carries none. A surface (row, card, panel) moves its background to the hover value over 380ms. A control (button, chip, icon button) changes fill or label colour over 240ms. Declare the transition on the base rule, never inside the hover rule. Hover moves exactly one step and never uses transform.

MOTION: animate transform and opacity only. Durations 160, 220, 280. Easing cubic-bezier(0.2,0,0,1) standard and cubic-bezier(0.16,1,0.3,1) out. No bounce, no elastic curve, no spring overshoot. Quiet motion travels 10 to 20px, never 40. No page load choreography and no whole section fade and rise on scroll.

BANNED WITHOUT EXCEPTION: decorative glow at any strength, gradient wash, gradient border, gradient text, mesh gradient, bloom, texture, film grain, scanlines, glass or frosted material, sparkle icons as an AI marker, decorative background orbit arcs, a default component library theme, a white accent, coloured side stripe borders on rows or callouts, connector or tree lines in a hierarchy, cards inside cards, rounded square icon tiles above headings, and em dashes and en dashes.

HIERARCHY: space is the primary device, then size, then weight, then contrast. A surface step or a hairline is the last resort. Use exactly ONE separation device per boundary, never two: where a gap already separates two things, do not also draw a line. A card is not a layout primitive; group with space and alignment first, and a card earns its place only when its content is a separable, actionable object.

IDENTITY: three carriers and nothing else, the orbital logo mark, the Astra glyph, and ring shaped indicators. Never background decoration. Warmth has exactly one source, the mark. The two marks are told apart by silhouette, not by a detail: a hollow ring is Orbit, a solid letterform is Astra. That distinction survives at 16px, which the earlier 'circle with a core' rule did not.

ICONS: Tabler only. Sizes 16, 20 and 24, default 24. Outline is the default and a filled icon marks the active state. Every icon stays legible at 16.

VOICE: calm and plain. No exclamation mark on a success or a completion. No shame language on a missed day. Sentence case everywhere; never type an uppercase string, use text-transform. Button labels are verb first and 1 to 2 words. Never add a subtitle that restates the heading above it. Never write "Oops", "Are you sure?", "Click here", or a bare "Learn more". Portuguese uses "voce", plain and warm, never corporate and never slang. "Orbit" and "Astra" are never translated.

STATES: every component ships all nine, default, hover, focus, active, disabled, loading, error, empty and at capacity. Every data surface ships loading, empty and error. An empty state is a composed invitation with one clear next action, never a blank region.

ACCESSIBILITY: WCAG 2.2 AA is the floor. Body text 4.5:1, large text 3:1, non text UI and graphics 3:1. Touch targets 44 minimum and 56 comfortable. Style focus-visible, never bare focus, and never remove a focus outline without a visible replacement in the same rule.
```

---

## The import checklist, run once and by hand

There is **no documented token export** from Claude Design, so nothing here can be diffed
programmatically. This is a hand check, and it is the only gate between the import and every screen
built on top of it. Run it before you generate a single screen.

Ask the tool, in one turn:

> Summarise the design system you extracted. List every colour token with its hex value, both modes.
> List every font family with the weights you loaded. List the spacing scale, the radius scale, and
> the hover and motion durations. Then list every component you derived.

Compare the answer against these rows. A miss is a re-import, not a note to self.

### A. The values that must come back exactly

| check | expected | authority in `DESIGN.md` |
|---|---|---|
| canvas, dark | `#09090B`, not `#000000` | `## Tokens`, Dark mode block |
| canvas, light | `#FAFAFA` | `## Tokens`, Light mode block |
| number of colour schemes | **1** | `## Tokens`, Light mode block, "the matrix is two variants" |
| number of modes | **2**, dark and light | same |
| foreground ramp, dark | `#F4F4F6` `#C9C9CC` `#8F8F93` `#5D5D60` | Dark mode block |
| foreground ramp, light | `#1A1A1D` `#424247` `#68686D` `#89898D` | Light mode block |
| surface ladder, dark | alpha `0.04 / 0.06 / 0.08 / 0.12`, hover `0.14` | `## Surface rules` |
| overlay panel | opaque `#1C1C1E`, never an alpha value | `## Overlay`, Anatomy |
| accent count | exactly **1** | `### The accent` |
| `--status-done` | an `--fg-1` disc, **not** the accent | Dark mode block, and `## Habit list` |
| status hues | only overdue `#FE9A00` and bad `#FB2C36` carry a hue | Dark mode block |
| font families | **3**. Geist, Space Grotesk, Geist Mono | `### Type` |
| serif present | **none** | `### Type`, "There is no serif" |
| Geist weights | 400, 500, 600 only | `### Type` |
| Space Grotesk weights | 500, 600 only, **never 300** | `### Type`, plus `README.md` trap 2 |
| Geist Mono weights | 400, 500 only | `### Type` |
| type scale | 12 14 16 17 20 22 28 34 44 60 | `### Type` |
| spacing scale | 0 4 8 12 16 24 32 48 64 96, and nothing else | `### Spacing (base 4)` |
| spacing values absent | 20, 28, 40, 56 must **not** appear | `### Spacing (base 4)` |
| card padding | 24 | `### Spacing (base 4)`, padding roles table |
| list row padding | 16 | same |
| radius scale | 0 8 12 16 20 28, pill 999 | `### Shape, shadow, motion, icons` |
| hover, a control | 240ms | `### Hover`, durations table |
| hover, a surface | 380ms | same |
| movement durations | 160 / 220 / 280 | `### How` |
| icon set | Tabler, sizes 16 / 20 / 24 | `#### Icons` |

### B. The three contrast floors

Measure the pair that actually renders, in **both** modes. A pair that passes in light can fail in
dark, and the reverse.

| requirement | WCAG 2 AA floor | APCA preferred |
|---|---|---|
| body text | **4.5:1** | Lc 90 |
| large text, 24px or 18.5px bold | **3:1** | Lc 60 |
| non text UI and graphics | **3:1** | Lc 30 |

`--fg-4` is derived to exactly the non text floor at **3.03:1** on the dark canvas. If the tool
reports a lighter or darker `--fg-4`, it re-derived the ramp and the whole ramp needs a re-import.

The accent carries three floors of its own, and they are separate from the table above:

| token | role | floor | measured, both candidates |
|---|---|---|---|
| `--primary` | fill and graphic only | white on it >= **4.5**, and it on the canvas >= **3.0** | orange 4.57 / 4.35, orange 4.52 / 4.40 |
| `--primary-soft` | accent text only | it on the canvas >= **4.5** | orange 4.58, orange 4.57 |
| `--fg-on-primary` | whatever sits on the fill | **4.5** on the fill | `#FFFFFF`, both |

Every one of those clears. **If you move the accent byte on the canvas, all three re-measure.** Never
eyeball a replacement, and fix a failing ratio by moving the OKLCH lightness channel only, holding
chroma and hue so the colour stays recognisably itself.

### C. The accent rationing list

Ask the tool to state where it will use the accent, then check the answer against these four roles.
An answer naming a fifth role means the notes field did not land.

| role | where it lands |
|---|---|
| **the next action** | the primary button, the floating action button, an empty state invitation arc |
| **current position** | the active tab, the active nav item, a selected card or option including its tint and ring, a focused field ring |
| **progress toward something unfinished** | a progress bar or ring that has not completed |
| **identity** | one element inside the logo mark, and only there |

And the negative half, which is the half that usually fails:

- a progress ring at 100% goes **neutral**;
- a completed row is **neutral**, and completion is not selection;
- never on a card, a row, a border, a heading, a static badge or chip, or a non state icon;
- exactly **one** filled action per view;
- the colour goes on the background, never on the label. Accent text on a neutral button reads as a
  link, not as a primary action.

### D. The four bans most likely to survive an import

A generator reaches for these by default, so check for them by name rather than waiting to notice.

1. **A glow on the primary button or the floating action button.** A softened one counts.
2. **A gradient**, of any kind, including a "subtle" background wash and gradient text.
3. **A glass or frosted panel**, and any translucent surface stacked on another translucent surface.
4. **A sparkle icon** as the AI marker. The Astra glyph is the marker.

### E. Two file level traps, confirmed by reading the fonts

1. The sans family reports itself as **`Geist`**. `Geist Sans` is the Orbit token name and exists only
   inside `@font-face`. If the tool reports "Geist Sans" as a family it found, ask which file it
   matched.
2. `SpaceGrotesk[wght].ttf` reports name ID 1 as **`Space Grotesk Light`** and defaults its weight
   axis to **300**. If the tool reports a 300 weight, or names the family "Space Grotesk Light", it
   took the default instance. Correct it to 500 and 600 before any screen is generated.

---

## The one open decision: warm orange or orange

The byte is Thomas's, and the canvas has its own colour controls, so it gets settled there. What
follows is a measurement, not a vote.

Both candidates clear all three accent floors in both modes, so contrast does not separate them. Hue
separation does. `DESIGN.md` rule: treat two hues within **15 degrees** as the same colour, and a
status hue inside that band of the accent must move or be retired.

Measured from the token bytes, in OKLCH:

| pair | hue gap | lightness gap | verdict |
|---|---|---|---|
| orange `#C4530F` vs dark overdue `#FE9A00` | 20.6 | 0.192 | clears, with 5.6 degrees of room |
| orange `#C4530F` vs dark bad `#FB2C36` | 19.3 | 0.058 | clears, with 4.3 degrees of room |
| **orange `#C4530F` vs LIGHT overdue `#B45B00`** | **9.8** | **0.012** | **fails. Inside the 15 degree band** |
| orange `#C4530F` vs light bad `#E7000B` | 16.3 | 0.003 | clears by 1.3 degrees, at identical lightness |
| orange `#C4530F` vs dark overdue | 75.4 | 0.184 | clears |
| orange `#C4530F` vs dark bad | 35.5 | 0.050 | clears |
| orange `#C4530F` vs light overdue | 64.6 | 0.020 | clears |
| orange `#C4530F` vs light bad | 38.6 | 0.005 | clears |

**The spec measured the accent against the dark status values only.** In light mode
`--status-overdue` darkens to `#B45B00` and pulls to hue 54.5 in order to clear 3:1 on `#FAFAFA`.
That puts it **9.8 degrees** from a hue 45 warm orange accent, at a lightness difference of 0.012.
The OKLab distance is 0.034, which is at the threshold where two colours stop being separable. An
accent progress ring and an overdue ring can sit in the same trailing column of one habit list, so
this is a real adjacency on the canonical Orbit surface, not a theoretical one.

Moving the orange is not the fix. Hue 45 already sits at the midpoint between the two dark status
hues, 25.4 and 65.4, so it is the best available warm orange. Moving it down collides with the
destructive red and moving it up collides with overdue.

Moving light overdue is also constrained. On a light canvas it is boxed between the destructive red
at hue 28.5 and the 3:1 floor on `#FAFAFA`, which is precisely why it was darkened and pulled to 54.5
in the first place. **On a light canvas the warm band from about hue 25 to 65 is already fully
occupied by the two status meanings.** There is no room in it for a third.

**Recommendation: orange `#C4530F`.** It sits at hue 350, outside the crowded warm band, and clears
every status colour in both modes with room to spare. It is a pink red rather than a magenta, it does
not put Orbit in the green checkmark habit tracker slot that `BRAND.md` names as a positioning
failure, and it costs nothing on the floors.

**This overturns the stated lean toward orange, so here is the honest case against the
recommendation.** The accent lands on one dot in the mark, which is its only identity use. A warm
orange body on a near black canvas reads as a lit body on an orbital path, which is exactly the thing
the mark depicts. Orange does not carry that reading. Orange is also the warmth the direction ADR asks
for, and in **dark mode**, the primary mode, orange clears everything.

**Orange stays reachable on one condition:** light mode `--status-overdue` moves off hue 54.5, or
retires as a hue the way `--status-frozen` already did on this exact precedent. That is a real
option, and `DESIGN.md` set the precedent itself. It is a decision about the status ramp, not about
the accent, and it is Thomas's.

**Test it on the canvas rather than on this table.** Put an accent progress ring and an overdue ring
side by side in one habit list, **switch to light mode**, and look. That single view decides it.
