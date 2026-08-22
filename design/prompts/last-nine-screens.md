# Handoff: the last nine screens

Paste everything below this line into a fresh session.

---

Continue Orbit ticket #36, the canvas-first redesign. Twelve of the twenty-one screen documents are
done. Do the same pass on the last nine.

## What "the same pass" means

Every screen document is thinner than the app it draws. Read the document, then go surface by surface
against the real shipping component in the repo, and raise each one to what the app already does. A
surface that exists but is thinner than the shipped one is the same defect as a missing surface. That
is the whole job.

Work through the MCP. Screens project `87c2d1c5-d02d-4840-98e8-3abc270d2928`, design system
`918bd5d7-839c-4dd0-811b-4a8781f60507`. Read documents through the MCP; never open a canvas turn just
to read.

## Read these first

1. `design/prompts/screens.md`, the section "The other twenty screens, 2026-08-21 (session 2)" and
   everything after it. That is the twelve screens already done, the defects each one had, and the
   recipe that worked.
2. The vault at `C:/Users/thoma/Documents/Programming/Projects/brain`:
   `2 Areas/20-29 Orbit Engineering/20-29 Orbit Engineering.md`, and the D69 and D70 notes. Do not
   re-read the whole decision register.

## The nine, in order

One screen at a time. A screen is done when its rewire lands and its record is written.

1. **Onboarding.** `apps/web/app/(onboarding)/onboarding` and `apps/web/components/onboarding/`:
   `onboarding-flow.tsx`, `onboarding-welcome.tsx`, `onboarding-meet-astra.tsx`,
   `onboarding-create-habit.tsx`, `onboarding-create-goal.tsx`, `onboarding-complete-habit.tsx`,
   `onboarding-template-packs.tsx`, `onboarding-features.tsx`, `onboarding-complete.tsx`,
   `feature-guide-drawer.tsx`, `retained-onboarding-overlay.tsx`. D69 item 17 caps it at three
   decisions with no paywall and no preference quiz, so several of those shipping steps are deleted
   BY DECISION and must not come back. The ones that are not covered by a decision are the ones to
   look at, and the retained overlay and the feature guide are the likely finds.
2. **Wrapped.** Blocked as a feature by `#341`, which blocks nothing about the drawing. Every past
   period stays reachable, permanently (decided 2026-08-20), and the last page's primary action is
   the share.
3. **Entrar, Verificacao.** The sign in and the code. Read the real auth screens and the failure
   paths: account enumeration, per-account throttling, single-use tokens, the resend timer.
4. **Sobre.** It drops "Feito no Brasil" and "Made in Brazil" (decided 2026-08-20).
5. **Estados.** It carries a known false claim: the report says the version numbers and the reference
   code carry `data-mock`, and only the countdown does. Fix that and check every other `mock`
   sentence in it the same way.
6. **Celebracao, Offline.** Both used to evict the composer by riding the `composer` slot; both
   shells have a `notice` slot now and both were corrected on 2026-08-20. Check that held.
7. **Widget Android.** `#343` on the api carries the widget and the habit list disagreeing on what
   overdue means. The drawing was right to flag it; keep the flag.

## Two sweeps that cross every screen

**The plan axis.** `CanvasControls` takes an optional `plans` axis, no default. Any screen with a Pro
gate passes `plans={['free', 'Pro']}` and draws both sides of every gate it has. A gate drawn from
one side only is half a drawing. Of the nine, Wrapped is the one most likely to have a real gate;
check the others rather than assuming. A screen with no gate does not pass the axis and does not grow
a dead switch. Say in the report why a screen has no axis, so the absence reads as a decision.

**No dead controls.** A gated affordance is a route to the upgrade, never a disabled control and
never a silent no-op. `Menu` items take a `badge` for this, and a badged item is a route. On the
screens project every gated tap goes to `Orbit Pro.dc.html`. Also check for plain no-ops: Assinatura
had a subscribe again button wired to nothing, and that is the same defect without a gate.

## What the design system has, so use it

- `RadioRow` is the system's ONE single-choice row. `disabled` without `reason` is a type error.
- `Input` takes `trailing`, and that is where a search glyph goes.
- `CanvasControls` takes `plans`.
- `Menu` items take `badge`.
- `HabitRow` takes `onLog` with a REQUIRED `logLabel`; the trailing node is a sibling of the row body,
  so a control never nests in a button. `onMenu` and `menuLabel` are the same kind of pair.
- `ListRow` takes `action`, one object of `icon`, `label`, `onPress`, `danger`. `readOnly` with
  `action` is a type error.
- `Composer` takes `onVoice` with a required `voiceWords` and the `recording` and `transcribing`
  states; `onAttach` with a required `attachWords` and an `attachments` tray; and `onRetry` with
  `words.retry` in the offline state. Speaking spends nothing from the daily allowance.

No component defect is open right now. That is not a reason to assume the nine need none: the pattern
all through this run has been that a screen needs a contract the system does not have yet. When one
does, **the component change belongs in the design system project and its screen rewire in the screens
project, in that order, as two turns.**

## How to work

**The recipe that worked, twelve times.** Read the screen document through the MCP. List every
surface it draws. Open the shipping component behind each one. Write the brief as a list of what the
app has and the drawing does not, each item with its file and its line. Then a short list of what
stays and why. Then the rules. Put the mirror sentence at the top.

**Check the mirrored `_ds` bundle in the screens project carries a new prop before you use it.** It
has gone stale seven rounds running. Put that sentence in every brief that depends on a contract
change, and tell the round to say what it found rather than work around it. That sentence is the only
reason the sixth and seventh staleness were caught.

**Treat every sentence in a document that says the code cannot do something as a claim to verify.**
It has been wrong three times: Avisos said no endpoint exposes mark all read, Progresso said an
abandoned goal cannot be reopened and that today can never be frozen, and Assinatura said the
receipts live with the provider. All four claims were false and none was caught by reading the
document. They were caught by opening the file the sentence was about.

**Driving the canvas through claude-in-chrome.** The project URL is
`https://claude.ai/design/p/<projectId>`. The composer is the contenteditable in the chat panel; put
the brief on the clipboard with PowerShell `Set-Clipboard` and paste with `ctrl+v`, so the text never
passes through your own output. Type one short line above it saying the attachment is the brief.
Anything over about 2,500 characters becomes a "Pasted text" attachment, which works. **Screenshot
after the paste and before sending**: the click sometimes misses because the window resizes, and a
send with no attachment wastes a full turn. Never close or reload the tab while a turn is running.
Two tabs on the same project show the same chat, so a second tab buys no parallelism, but a second
tab on the OTHER project runs in parallel fine. The canvas preview is a sandboxed frame that ignores
automated clicks; to look at a rendered screen yourself, open Present mode and hand Thomas the link.

**Verify every rewire yourself by reading the document back through the MCP.** The canvas design self
check reported nothing three times on 2026-08-21; a missing verdict is not a pass.

Both canvases run Fable 5 Max, which burns the weekly Claude Design budget twice as fast as Opus 5.

## Rules that caught real defects

- Never name a state, field, number or gate the code cannot produce. Trace every claim to a file and
  a line or leave it out.
- Never remove a capability the app has today unless a decision removed it. This has happened
  thirteen times across the run. When a shipped gate conflicts with a decision, the decision wins.
- Two documents drawing one surface must draw the same surface, and the report must name which one is
  the authority.
- Prefer enforcing a rule in a contract over stating it in prose. That is D71.
- A contract change needs its caller sweep in the same run, checked with a script rather than by
  reading.
- Never write an em dash or an en dash. The gate is `node tools/check-dashes.mjs --files <paths>`. Run
  it on every brief before sending and on every document after.
- Work on `redesign/main`. It has no CI and no Pullfrog, so a green push is not a reviewed push.
- Take every identifier from live output in this run, never from memory.

## Thomas's standing instructions. These bind every turn.

1. "my answer is always the same: the best approach, no unfinished features, nothing to reduce time,
   its the best implementation always." Never offer a cheaper or partial option. A question only
   earns his time when both paths are the best implementation and differ in what the product should
   be, or in taste.
2. Plain words, never design jargon.
3. One question per decision. Never bundle.
4. Keep replies short.
5. **Keep working without stopping to report until there is a real question or the work is done.**
   Nine documents is the work. Do not write a handoff and stop while documents remain.

## When you finish

Append what you did to `design/prompts/screens.md`, update `hot.md`, and commit the screens.md change
on `redesign/main`. The vault auto-commits hourly, so do not commit there.
