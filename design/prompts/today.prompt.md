# Claude Design prompt: Today, the habit list

> **At a glance** - the prompt for the first screen of the redesign, ticket `#36`. Everything below
> the rule is the prompt. Copy it whole.

## Before you paste

1. Open `claude.ai/design` and pick the **Orbit** design system in the selector.
2. Attach `design/reference.html` in this same turn. There is no field for it in the setup screen,
   so it enters as an attachment and acts as the visual bar.
3. Model: Fable 5.
4. The prompt builds in four batches and stops after each one. Look at each batch before you say
   continue, because the canvas shares the ordinary usage pool.

---

Build the **Today** screen for Orbit, the habit list. It is the core loop of the product: the screen
a person opens to see what is left today and to log a habit in one tap. Build it against the Orbit
design system that is selected. Every token, component and rule below already exists in that system.
Add nothing to the system.

## Ground rules, before anything is drawn

1. **Compose the existing components.** `HabitRow`, `StatusRing`, `ProgressBar`, `Fab`, `Button`,
   `TabBar`, `SectionTitle`, `EmptyState`, `StatTile`, `Badge`, `Icon`, `OrbitMark`, `AstraGlyph`.
   Do not re-implement a primitive that exists, and do not fork one to change its look.
2. **Tokens only.** No literal colour, no literal radius, no font family or weight outside the
   system. Spacing is the ten values `0 4 8 12 16 24 32 48 64 96` and nothing between them. Card and
   panel padding is 24, list row padding is 16.
3. **If this screen needs a token, a colour, a radius, a font or an effect the system lacks, stop and
   ask me.** Name it, name its role, and say why the current system cannot do the job. Never invent
   one on the canvas.
4. **Same rule for layout divergence.** The only sanctioned differences between the mobile shell and
   the wide layout are the navigation chrome, the desktop stats rail, the command palette with its
   keyboard shortcuts, and hover affordances on that chrome. Everything below the shell is identical
   on both. A new divergence comes back to me as a request.
5. **Start from the kit.** `ui_kits/app/TodayScreen.jsx` is the current baseline, not the target. It
   already carries the date eyebrow, the display heading, the level progress row, the habit panels
   and the FAB. It does **not** yet carry habit families, the per row overflow menu wired to
   anything, the loading, empty, error and at capacity states, the listing thresholds, the light
   mode, or the wide layout. Raise it, keep what the spec settles, and say in chat what you changed
   and why.

## Say this back before you generate

Three lines, then build:

- **Context**: the screen's job in one sentence.
- **Focal element**: the one element that wins this view, and how it wins, by size, weight, contrast
  and surrounding space. Name what you deliberately demoted.
- **Differentiator**: the one memorable move on this screen. It must come from the identity carriers,
  which are the Orbit mark, the Astra glyph and ring shaped indicators. It may not come from added
  decoration.

## What to build, in four batches

Stop after each batch.

**Batch 1, the core frame.** Today at the 412px mobile shell, dark mode, populated.
**Batch 2.** The same frame in light mode, then the wide layout in dark and in light.
**Batch 3.** The state frames: loading, empty, error, at capacity, and the interaction states.
**Batch 4.** The scale frames and the locale check.

### Frame 1: mobile shell, 412px, dark, populated

The shell is 412 wide, the canvas is `--bg`, and the tab bar sits at the bottom with the four
destinations Hoje, Metas, Astra and Perfil. The Astra destination uses the Astra glyph, never a
sparkle. Respect the safe area insets on the fixed chrome.

Content, top to bottom:

- the date, then the screen heading;
- the level progress row, which is the one progress element on this screen;
- the habit list;
- the FAB, which is the one filled action on this screen.

The habit list carries **seven top level entries**, and between them every status the ring can hold:

| entry | shape | status |
|---|---|---|
| 1 | simple habit, has a time and a streak in its meta line | done |
| 2 | simple habit | empty, so it is still pending |
| 3 | simple habit | overdue |
| 4 | simple habit | frozen |
| 5 | simple habit | skip |
| 6 | **a family, collapsed** | the parent row shows the family's own state |
| 7 | **a family, expanded in place**, with three sub habits | mixed sub statuses |

Rules the list obeys, all of them checkable:

- **Every top level habit sits on its own panel**: `--bg-card`, an inset 1px `--hairline-ghost` ring,
  radius 20. A family is one panel carrying its parent row and its sub rows. Never a shared panel
  with internal hairlines across separate habits, which would be two separation devices on one
  boundary.
- A single row panel is the same row height as a family's parent row.
- **Sub habit rows indent, take a smaller well and dimmer text. Zero connector lines and zero tree
  lines.**
- **Two levels inline, then drill in.** A grey caret expands a family in place. A grey chevron marks
  a collapsed family. An accent chevron opens a habit in focus. Nothing deeper than two levels
  renders inline.
- The per row overflow menu stays, at a 44px hit target, and it is the trailing control.
- The emoji well is 46px, radius 12, `--bg-well`, and nothing else. **No coloured ring on the well.**
  The habit palette says which habit, not which state, and it does not enter this screen.
- Status lives only in the trailing ring: done is an `--fg-1` disc with a filled check, empty is an
  `--status-empty` track, overdue takes `--status-overdue`, frozen is neutral plus the snowflake,
  skip is `--status-skip`. Every one of them also carries a glyph or a shape, never colour alone.
- **The accent never marks completion.** A done row is neutral end to end.
- Tapping a row logs the habit. That control is at least 44px tall, and the whole row is the target.

### Frame 2: mobile shell, 412px, light, populated

The same frame, `data-mode="light"`. Light is not dark reversed. Check `--status-overdue` in light,
which is `#946A00` with white on it, and check that the accent still separates from it.

### Frames 3 and 4: the wide layout, dark and light

Same information architecture, different shell:

- **Sidebar**, on the canvas background, with a hairline as its only separation. Every primary
  section is one click away. It is grounded at the bottom: the account chip sits last, and the create
  button sits directly above it. The sidebar may carry the command palette entry point with its
  shortcut hint. The palette itself is out of scope for this screen.
- **Main column capped at about 740px and centred.** The habit list is identical to the mobile list,
  panel for panel.
- **Stats rail** beside the column. Its module list is deliberately not frozen in the spec, so
  propose **at most three modules**, each with a one line reason, and mark the proposal clearly so I
  can accept or cut it. Use `StatTile` and `ProgressRing` rather than a new shape.
- **No FAB in the wide layout.** The sidebar create button is the one filled action there.
- Content composes horizontally. A single stretched mobile column at desktop width is a defect.

### Frames 5 to 9: the nine states

The system requires all nine states before a surface is done: default, hover, focus, active,
disabled, loading, error, empty, at capacity. Frame 1 is the default. Build the rest.

- **Loading**: a skeleton shaped like the final layout, holding the final dimensions so nothing
  shifts when data lands. Mark the region `aria-busy="true"`. No spinner on the list.
- **Empty**, zero habits: `EmptyState` with the satellite graphic, one line naming what belongs here,
  and one primary action. Copy: title `Nenhum hábito ainda`, action `Criar hábito`. Nothing else, and
  no persistent information parked in it.
- **Error**, the list failed to load: state the fix beside where it broke, then one action. Copy:
  `Não foi possível carregar seus hábitos. Verifique sua conexão e tente de novo.` with a
  `Tentar de novo` action. Calm and plain, no blame, no error code on the surface.
- **At capacity**, the list ceiling: **a boundary is not an error.** Neutral tokens only, never
  `--status-bad`. It states the limit and the one action that changes it, and it carries **no upgrade
  call to action**. Copy: `Limite de 10 hábitos. Arquive um hábito para criar outro.`
- **Disabled**: in that same at capacity frame, the create control is unavailable and its reason
  reads in visible text beside it, because a disabled control cannot carry a tooltip.
- **Hover, focus and active**: one annotated frame showing a single habit panel three times, once
  under a pointer, once with a visible keyboard focus ring, and once mid press. Same for the FAB and
  the overflow menu button. These are live states in the rendered output, not painted mockups, so I
  can move a pointer and press Tab on the canvas.

### Frames 10 and 11: listing scale

Today's list can grow, so it declares its behaviour before it ships. Two mobile frames:

- **8 to 20 habits**: the normal list plus a count in the meta role.
- **21 or more**: virtualized or paginated, plus a persistent filter or search. A wrapping pill row is
  never that behaviour.

### Frame 12: the locale check

Frame 1 again with English copy, at the same 412 width. Headings and row titles must hold without a
new size, without a hand break and without truncation that loses meaning. The two locales are the
test, not one of them.

## The accent budget for this screen

The accent has exactly four roles: the next action, current position, progress toward something
unfinished, and one element in the mark. On Today that resolves to **three instances on mobile** and
no more:

1. the FAB, which is the next action;
2. the active tab in the tab bar, which is current position;
3. the level progress bar, while it is unfinished.

In the wide layout, instance 1 becomes the sidebar create button and instance 2 becomes the active
sidebar item. Anything else in the accent is a defect. A ring at 100% goes neutral. A streak total is
a record, not a next action, so it is neutral too.

## Motion, which mostly subtracts here

- **Logging a habit runs more than 100 times a day, so it gets no animation.** The ring swaps state
  instantly, or with at most a 150ms colour or opacity transition. No confetti, no bounce, no scale
  in, no stagger.
- **Never animate the habit list's data while it is being read or acted on.** No list entrance
  choreography and no reordering animation on this screen.
- Hover is feedback, so every interactive element has one: a surface goes to `--bg-hover` over 380ms,
  a control changes its fill or label colour over 240ms. Declare the transition on the base rule,
  never inside `:hover`. Hover moves exactly one step and never uses `transform`.
- A panel suppresses its own hover while the pointer is on an interactive descendant, so a row and
  its overflow button never light at once.
- Press is `scale(0.96)` on pointer down. Transform belongs to press, not to hover.
- Gate hover behind `@media (hover:hover) and (pointer:fine)` and honour `prefers-reduced-motion`.

## Accessibility, at the WCAG 2.2 AA floor

- Touch targets 44 minimum, 56 comfortable, and no two hit areas overlapping. The row control and the
  overflow button are separate targets.
- `:focus-visible` only, never bare `:focus`, and never removed without a visible replacement in the
  same rule.
- Every status carries a glyph, a shape or a label as well as its colour.
- Non text elements clear 3:1 against what sits behind them. Measure the pair that actually renders,
  in both modes.
- Tabular numerals on every value that changes: the streak, the count, the level numbers.
- The overflow button carries a localized accessible label. Decorative glyphs are hidden from
  assistive tech.

## Copy

- **pt-BR is the rendered locale**, plus the one English frame. "Orbit" and "Astra" are never
  translated.
- Calm and plain. No exclamation mark on a success or a completion. No shame language on a missed
  day. Buttons are verb first and one to two words.
- Sentence case everywhere. Never type an uppercase string, use `text-transform` for the eyebrow and
  the badges.
- No subtitle that restates the heading above it, and no helper line under a row or a card.
- **No em dash and no en dash anywhere**, in copy or in code. Use a comma, a period or a hyphen.
- **Every number on this canvas is mock data**, so carry `data-mock="true"` on the element that
  renders it: streaks, counts, level values, times. Never present an invented figure as real.

## Never, on any frame

Glow, gradient of any kind, mesh, bloom, texture, grain, glass or frost, a sparkle used as an AI
marker, decorative orbit arcs in the background, a white accent, a coloured side stripe on a row, a
card inside a card, a rounded icon tile above a heading, connector or tree lines, a pill radius on
anything static, a badge as a pill, an icon set other than Tabler, an icon size off the 16 / 20 / 24
grid, an arbitrary z index, and `transition: all`.

## Report these checks back with the batch

For each frame, in chat, short lines:

1. every spacing value used, so I can see it is inside the ten;
2. every radius used;
3. the count of accent instances, and which role each one is;
4. the measured contrast for white on `--primary`, `--primary` on the canvas, `--fg-3` on the canvas,
   and `--status-overdue` in light mode;
5. which of the nine states this frame covers;
6. the three shipping tests, in one line each: the AI slop test, the squint test, and the scene
   sentence test. The scene sentence has to name a near black canvas with real air around everything,
   quiet tonal panels, one accent reserved for what is next and never for what is finished, and the
   orbital ring language carrying the identity. If the only way to make that sentence specific is to
   describe decoration, the frame failed and you rebuild it.
7. anything you had to decide that the spec does not settle, listed as a question for me rather than
   resolved on the canvas.

Keep each frame separately addressable on the canvas, so it can be exported and pulled back into the
repository later.
