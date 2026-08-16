# Claude Design prompt: Today, the habit list

> **At a glance** - batch 2 of the Today screen, ticket `#36`. Batch 1 shipped and works, so this
> prompt repairs and completes it rather than regenerating it. Everything below the rule is the
> prompt. The original twelve frame version of this file is superseded: the matrix now comes from one
> interactive document, per `guidelines/screen-contract.md`.

## Before you paste

1. Run `wave0-design-system.prompt.md` first. This prompt uses `Shell412`, `ShellWide`,
   `CanvasControls`, `Skeleton`, `ErrorState`, `CapacityNotice` and the new `depth` prop, all of
   which wave 0 builds.
2. Open the existing **Orbit Today** project and refresh its design system so the wave 0 components
   are present. Check they resolve by name before building on them.
3. One batch. It ends with the report.

---

Complete the Today screen. **Batch 1 is on the canvas and it works. Do not rebuild it.** The state
class, the log and menu handlers, the family expand and collapse, the recomputed `2 de 3` meta and
done count, the overflow sheet with Editar, Pular hoje, Congelar and Arquivar, the create sheet, and
the per habit accessible menu labels are all correct. Keep that logic and extend it.

Read `guidelines/screen-contract.md` in the design system first and obey it, including the report it
asks for at the end.

## Repairs, in order

**1. Replace the inline phone frame with `Shell412`.** The current frame uses `min-height:820px` with
no scroll container, so seven panels grow it past 1200, and the FAB is positioned inside the content
block. On a device the create action scrolls off the screen. The shell owns the scroller and pins the
tab bar and the FAB outside it.

**2. Replace the hand rolled sub habit rows with `HabitRow` at `depth` 1.** The current rows reuse
`.ob-hrow`, `.main` and `.menu` from outside the component and will break the first time that
stylesheet changes. Behaviour stays identical: same handlers, same per row menu, same 24px ring.

**3. Delete the local `:has(.menu:hover)` patch** once wave 0 has moved that rule into `HabitRow`.
Verify the behaviour survives the deletion rather than assuming it.

**4. Fix the mock marking.** `data-mock="true"` currently sits on five of the seven panels and on the
panel wrapper rather than on the numbers. Put it on **every element that renders a number**, and that
includes the literal `11` in the done count and the `620 / 1000` beside it. Better, derive the total
from the list so only genuine constants stay literal.

## Additions

**5. Add `CanvasControls`** with its four axes, and drive the whole matrix from it: mode dark and
light, width 412 and wide, state, and locale pt-BR and en. Add two extra values to the state axis for
this screen, `many` and `too many`, described below.

**6. The wide layout, on `ShellWide`.** The habit list is identical, panel for panel. The sidebar
carries the create button above the account chip, and that button is the one filled action, so **the
wide layout has no FAB**. For the rail, propose **at most three modules**, each with a one line
reason, built from `StatTile` and `ProgressRing` rather than a new shape, and mark the proposal so I
can accept or cut it.

**7. The data states**, using the wave 0 components:

- **loading**: `Skeleton` shaped like the populated list, holding its dimensions.
- **empty**, zero habits: `EmptyState`, title `Nenhum hábito ainda`, action `Criar hábito`. Nothing
  else, and nothing parked in it.
- **error**: `ErrorState`, `Não foi possível carregar seus hábitos. Verifique sua conexão e tente de
  novo.` with `Tentar de novo`.
- **at capacity**: `CapacityNotice`, `Limite de 10 hábitos. Arquive um hábito para criar outro.` The
  create control is unavailable in this state and its reason reads in visible text beside it, which
  is also the screen's disabled state. Neutral tokens, no upgrade call to action.

**8. The listing thresholds**, on the two extra state values, because this list can grow:

- **many**, 8 to 20 habits: the normal list plus a count in the meta role.
- **too many**, 21 or more: virtualized or paginated, plus a persistent filter or search. A wrapping
  pill row is never that behaviour.

**9. The locale pass.** Under `en`, the heading, the row titles and the meta lines hold without a new
size, without a hand break, and without truncation that loses meaning. The two locales are the test,
not one of them.

## What stays true

Hover, focus and active stay live in the rendered output, so I can move a pointer and press Tab.
Logging a habit runs more than a hundred times a day, so it stays unanimated: the ring swaps
instantly, or with at most a 150ms colour or opacity transition, and the list never animates its data
while it is being read. The accent keeps exactly three instances on mobile, the FAB, the active tab
and the level bar while it is unfinished, and in the wide shell the FAB's role passes to the sidebar
create button. A done row is neutral end to end.

Add no token, no colour, no radius, no font and no spacing value. If this screen needs one, stop and
ask me.

## Then report

Everything `guidelines/screen-contract.md` asks for, plus one line naming each of the four repairs and
confirming it landed.
