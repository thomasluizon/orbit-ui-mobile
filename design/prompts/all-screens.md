Continue Orbit ticket #36, the canvas-first redesign. Hoje is finished. Do the same pass on the other
twenty screens.

## What "the same pass" means

Hoje's surfaces existed but were thinner than the app. Read each screen document, then go surface by
surface against the real shipping component in the repo, and raise every one to what the app already
does. A surface that exists but is thinner than the shipped one is the same defect as a missing
surface. That is the whole job.

Work through the MCP. Screens project `87c2d1c5-d02d-4840-98e8-3abc270d2928`, design system
`918bd5d7-839c-4dd0-811b-4a8781f60507`. Read documents through the MCP; never open a canvas turn just
to read.

## Read these first

1. `design/prompts/screens.md`, the last three sections. They are the Hoje pass and they show the
   shape of the work, the depth expected, and the defects it found.
2. The vault at C:/Users/thoma/Documents/Programming/Projects/brain:
   `2 Areas/20-29 Orbit Engineering/20-29 Orbit Engineering.md`, and the D69 and D70 notes. Do not
   re-read the whole decision register.

## The order

One screen at a time, deepest first. A screen is done when its rewire lands and its record is written.

1. **Habit Detail** and **Habit Create**. Do these two together and first, because Hoje now draws its
   own detail and create states and the two standalone documents draw the same surfaces. They must not
   diverge. The standalone document is the authority for the full surface; Hoje's state is the same
   surface reached from Hoje. Reconcile them rather than deepening both separately. If they disagree
   in a way that is a product question rather than a defect, ask Thomas.
2. **Perfil**, **Progresso**, **Calendario**. Many rows, many gates, and Progresso absorbed goals, the
   streak and the achievements per D69 item 8.
3. **Sobreposicoes**, **Astra Conversation**, **Busca**, **Avisos**.
4. **Pro**, **Assinatura**, **Onboarding**, **Wrapped**.
5. **Entrar**, **Verificacao**, **Sobre**, **Estados**, **Celebracao**, **Offline**,
   **Widget Android**.

You will not finish twenty screens in one session. When the session ends, append what you did and
what is left to `design/prompts/screens.md` and update `hot.md`, so the next one starts where you
stopped.

## Two sweeps that cross every screen

**The plan axis.** `CanvasControls` now takes an optional `plans` axis, no default. Any screen with a
Pro gate passes `plans={['free', 'Pro']}` and **draws both sides of every gate it has**. A gate drawn
from one side only is half a drawing: that is the defect Thomas found on Hoje's reschedule sheet.
Screens with real gates include Calendario, Pro, Assinatura, Perfil, Progresso, Astra Conversation and
Habit Create. A screen with no gate does not pass the axis and does not grow a dead switch.

**No dead controls.** A gated affordance is a route to the upgrade, never a disabled control and never
a silent no-op. `Menu` items now take a `badge` for this. On the screens project every gated tap goes
to `Orbit Pro.dc.html`. Check each screen's gated affordances actually route.

## What the design system gained on 2026-08-21, so use it

- **`RadioRow` is the system's ONE single-choice row**: `leading`, `depth` at 20px per level, `meta`,
  `tag`, and a selected treatment of a 10 percent primary tint plus a 1.5px primary ring. **`disabled`
  without `reason` is a type error.**
- **`Input`** takes `trailing`.
- **`CanvasControls`** takes `plans`.
- **`Menu`** items take `badge`, and a badged item is a route, never a dead control.

Two component defects are open and will bite other screens. Fix them in the design system project the
first time a screen needs them, not before:

- **`HabitRow` has no real trailing action slot.** Its trailing content nests inside the row body
  button, so the ring that logs is a button inside a button.
- **`ListRow` has no per-row delete.** Its trailing slot rightly refuses interactive controls, so any
  list needing a delete beside each row composes it by hand.

## How to work

A component defect belongs in the design system project and its screen rewire in the screens project,
**in that order**, as two turns.

**Check the mirrored `_ds` bundle in the screens project carries a new prop before you use it.** It
has gone stale five rounds running. Put that sentence in every brief that depends on a contract
change, and tell the round to say so rather than work around it.

Driving the canvas through claude-in-chrome: the composer is the contenteditable in the chat panel;
put the brief on the clipboard with PowerShell `Set-Clipboard` and paste with ctrl+v, so the text
never passes through your own output. Type one short line above it saying the attachment is the brief.
Anything over about 2,500 characters becomes a "Pasted text" attachment, which works. **Never close or
reload the tab while a turn is running.** Two tabs on the same project show the same chat, so a second
tab buys no parallelism. The canvas preview is a sandboxed frame that ignores automated clicks; to
look at a rendered screen yourself, open Present mode and hand Thomas the link rather than trying to
drive it.

**The canvas design self-check did not report back three times on 2026-08-21.** Do not treat a missing
verdict as a pass. Verify each rewire yourself by reading the document back through the MCP.

Both canvases run Fable 5 Max, which burns the weekly Claude Design budget twice as fast as Opus 5.

## Rules that caught real defects

- **Never name a state, field, number or gate the code cannot produce.** Trace every claim to a file
  and a line or leave it out.
- **Never remove a capability the app has today unless a decision removed it.** This has happened
  seven times across the run. When a shipped gate conflicts with a decision, the decision wins: goals
  are gated in `habit-form-fields.tsx:690` and stay ungated in the drawing, because D70 moved them out
  of the paywall.
- Prefer enforcing a rule in a contract over stating it in prose. That is D71.
- A contract change needs its caller sweep in the same run, checked with a script rather than by
  reading.
- Never write an em dash or an en dash. The gate is `node tools/check-dashes.mjs --files <paths>`. Run
  it on every brief before sending and on every document after.
- Work on `redesign/main`. It has no CI and no Pullfrog, so a green push is not a reviewed push.
- Take every identifier from live output in this run, never from memory.

## Thomas's standing instructions. These bind every turn.

1. "my answer is always the same: the best approach, no unfinished features, nothing to reduce time,
   its the best implementation always." Never offer a cheaper or partial option. A question only earns
   his time when both paths are the best implementation and differ in what the product should be, or
   in taste.
2. Plain words, never design jargon.
3. One question per decision. Never bundle.
4. **Keep replies short.**
5. Keep working without stopping to report until there is a real question or the work is done.

## Open, and blocked on nobody

`#341` blocks Wrapped shipping at all: no goal-completions producer, every retrospective window is
rolling and ends today, and the endpoint is Pro-gated while Wrapped is the growth loop. Wrapped's
document can still be raised; the ticket blocks the feature, not the drawing.
