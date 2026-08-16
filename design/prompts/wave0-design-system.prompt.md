# Claude Design prompt: wave 0, the design system gaps

> **At a glance** - the one prompt that pays for every screen that follows. Run it in the **Orbit
> design system project**, not in a screen project. Everything below the rule is the prompt.

## Before you paste

1. Open the **Orbit design system** project itself, the one whose id ends `...4a8781f60507`. This
   prompt writes components into the system, so it does not run in a screen project.
2. Nothing to attach. The system already carries `readme.md`, `SKILL.md` and the token files.
3. It is one batch. Say continue only once, at the end, to register the cards.

---

Add the missing pieces of the Orbit design system. Every screen of the app is about to be built on
this system, and each of the five items below is something a screen would otherwise hand roll and get
subtly different every time. This is a system change, so it lands here once.

**Add no token, no colour, no radius, no font and no spacing value.** Everything below composes what
already exists. If one of these genuinely needs a value the system lacks, stop and ask me.

## 1. `Shell412`, the mobile shell

The screens currently rebuild the phone frame inline, and the version in the Today screen is wrong:
it uses `min-height` with no scroll container, so a long list grows the frame past 820 and the create
action scrolls off the screen. Fix it once, here.

- Fixed 412 wide by 820 tall, radius `--r-sheet`, an inset 1px `--hairline-strong` ring,
  `overflow:hidden`, `background:var(--bg)`.
- **Exactly one scroll container**, the content region: `overflow-y:auto` plus
  `overscroll-behavior:contain`. The chrome never scrolls.
- Slots: `children` for the screen content, `tabBar`, `fab`, and `sheets` for anything overlaid.
- The tab bar is pinned to the bottom, outside the scroller. The FAB is pinned above it, also outside
  the scroller, so it can never be clipped or scrolled away. Keep the FAB's 6px `--bg` ring.
- Respect the safe area insets on the pinned chrome with `max(<base>, env(safe-area-inset-*))`.
- The content region ends with enough bottom padding that the last row clears the tab bar and the
  FAB, and the next item peeks past the scroll edge rather than being cut flush.

## 2. `ShellWide`, the desktop shell

The three sanctioned differences from `Shell412` are the navigation chrome, the stats rail, and the
command palette entry. Everything below the shell stays identical.

- A **sidebar** on the canvas background, with a hairline as its only separation. Every primary
  section is one click away. It is grounded at the bottom: the account chip sits last and the create
  button sits directly above it. It may carry a command palette entry with its shortcut hint.
- A **main column capped at about 740 and centred**.
- A **rail** slot beside the column.
- **No FAB.** The sidebar create button is the one filled action in this shell.
- Slots: `children`, `rail`, and `nav` items with an active id.

## 3. `HabitRow` gains a `depth` prop

The Today screen hand rolls its sub habit rows by reusing `HabitRow`'s own `.ob-hrow`, `.main` and
`.menu` class names from outside the component. That works today and breaks the first time this
component's stylesheet changes. Give it the prop instead.

- `depth` of 0 is today's row, unchanged. **Do not alter the default rendering.**
- `depth` of 1 is the sub habit row: indented, a 32px well, title at `--fs-sm` in `--fg-2`, a 24px
  `StatusRing`, the compact row height. Zero connector lines and zero tree lines.
- The overflow menu keeps its 44px target at every depth.
- A family is still one panel carrying a parent row and its sub rows.

While you are in this component, fix the hover rule it is missing at every depth: **a row suppresses
its own hover while the pointer is on an interactive descendant**, so the row and its overflow button
never light at once. The Today screen currently patches this from outside with a local
`:has(.menu:hover)` block, which is the system's defect showing through. Fix it here and that patch
disappears.

## 4. The three missing data states

`EmptyState` already exists. Add its two siblings, plus the skeleton, so no screen invents them.

- **`Skeleton`**: shaped like the final layout and occupying the final dimensions, so nothing shifts
  when data lands. Takes a `rows` count and a `variant` for the shape it is standing in for. Sets
  `aria-busy="true"` on the region. **No spinner.**
- **`ErrorState`**: one plain message that states the fix, and one action. Calm, no blame, no code on
  the surface. Example content: `Não foi possível carregar seus hábitos. Verifique sua conexão e
  tente de novo.` with a `Tentar de novo` action.
- **`CapacityNotice`**: a boundary, not an error, so **neutral tokens only and never
  `--status-bad`**. It states the limit and the one action that changes it, and it carries **no
  upgrade call to action**. Example content: `Limite de 10 hábitos. Arquive um hábito para criar
  outro.` It pairs with a create control that is unavailable and carries its reason in visible text
  beside it.

## 5. `CanvasControls`, the review bar

Every screen document from here on renders its whole matrix from one build, switched by this bar.
Build it once.

Four axes, each a small segmented control:

| axis | values |
|---|---|
| mode | dark, light |
| width | 412, wide |
| state | default, loading, empty, error, at capacity |
| locale | pt-BR, en |

- Mode sets `data-mode` on the document wrapper, which the system already registers as a theme.
- **This bar is canvas chrome, not product UI.** Style it so nobody can mistake it for a screen
  element and paste it into the app: quiet, mono, `--fg-3` on the canvas, no accent anywhere, and no
  pill radius. Mark it `data-canvas-chrome="true"`.
- It is keyboard reachable and every button carries an accessible name.

## 6. Write `guidelines/screen-contract.md`

One page, in the system, naming the contract every screen document follows from now on, so a screen
prompt can point at it instead of restating it. It says:

1. A screen is **one interactive document**, not a set of static frames. It carries `CanvasControls`
   and renders the whole mode, width, state and locale matrix from one build.
2. It composes `Shell412` or `ShellWide`. It never rebuilds a shell inline.
3. It ships all nine states: default, hover, focus, active, disabled, loading, empty, error, at
   capacity. Hover, focus and active are live in the rendered output, not painted.
4. **Every number is mock data** and carries `data-mock="true"` **on the element that renders the
   number**, not on its container. A literal number beside a computed one still carries the mark.
5. The accent keeps its four roles and its per screen budget: one filled action, one current
   position, progress only while unfinished. Completion is always neutral.
6. Motion: any interaction that runs a hundred times a day gets no animation. Never animate list data
   while it is being read or acted on. Hover is 380 on a surface and 240 on a control, declared on
   the base rule, one step, never `transform`. Press is `scale(0.96)`.
7. Accessibility: 44 minimum targets, `:focus-visible` only, no status carried by colour alone,
   tabular numerals on anything that changes.
8. Copy: pt-BR primary with an en pass, sentence case, verb first buttons, no subtitle restating a
   heading, **no em dash and no en dash**.
9. A screen never adds a token, a colour, a radius, a font or a spacing value. A need for one is a
   question for Thomas, not a decision on the canvas.
10. Every document reports back: spacing values used, radii used, accent instances and their roles,
    measured contrast for white on `--primary`, `--primary` on the canvas and `--status-overdue` in
    light, which states are covered, the three shipping tests, and anything the spec did not settle.

## When you are done

Register a card for each new component so it appears in the Design System pane, using the same
`@dsCard` first line comment convention the existing cards use. Group the four shell and state pieces
under Components, and put `screen-contract.md` under whichever group the guidelines already use.

Then report: the files you added, each component's props, and one line confirming that no token,
colour, radius, font or spacing value was added.
