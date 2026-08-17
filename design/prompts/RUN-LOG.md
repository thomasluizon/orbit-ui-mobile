# Canvas run log

> **At a glance** - what was actually built on the Claude Design canvas, in order, with what was
> verified rather than reported. The unattended run of the night of 2026-08-16, stopped by the
> account usage limit with six documents left, and then **superseded the same day** by the
> information architecture.

## Halted and superseded, 2026-08-16

**Thomas read the twelve documents and stopped the run.** They are token correct and **product
wrong**: they faithfully reskin the app that exists, which is a habit tracker with a chat tab, and
`BRAND.md` has said since 2026-08-05 that exactly that reads as a failure of the positioning.

**The cause is the prompts, not the canvas.** The old wave prompts described the content of each
screen as it exists today, so the canvas rebuilt those screens in the new tokens. That was the
correct output for the prompt it was given.

What happened next, in one line each:

1. The information architecture was settled with Thomas in an attended session, six rounds and 26
   questions, recorded as **D69** and **D70** in the brain vault.
2. `DESIGN.md` gained a `## Information architecture` section, which is now read first and outranks
   every other section on whether a surface should exist.
3. `waves.md` beside this file was **rewritten from scratch**. Every prompt now states the job of the
   screen and what it must not become. The old prompts are gone rather than edited.
4. `Orbit Insights.dc.html` was deleted: the route is cut and its charts fold into the streak surface
   and Wrapped.
5. The eleven surviving documents are kept as a record, not as a target. `design/canvas/README.md`
   says so at the top.

**The canvas can rebuild immediately.** Read live on 2026-08-16 from the usage panel: the weekly
**all-models** bucket was **72 percent** used and the **session** bucket **1 percent**. Only the
**Fable** bucket was near its ceiling at **96 percent**. See the corrected operating note below.

**The operating notes below are still true and still worth reading.** They are about driving the
tool, not about what to build, and nothing in this supersession touches them.

## Where the first run stopped

**Twelve of eighteen documents are built and exported to `design/canvas/`.** The account hit its
usage limit part way through wave 5, before the first of its six documents started. The limit resets
**Thursday 20 August**. Nothing is half built: the pause landed between documents, and the canvas
reports the work so far as saved.

The remaining six are already queued **inside the canvas chat** as a todo list, and the prompt that
produced that list is wave 5 in `waves.md`. To resume: open the project, press **Resume** in the
paused panel, or paste the wave 5 block again.

| # | document | model | state | verified |
|---|---|---|---|---|
| 0 | design system, wave 0 | Fable 5 | done | six items present, zero tokens added, checked against the manifest |
| 0b | design system, wave 0 patch | Fable 5 | done | all five fixes present in the live project files |
| 1 | `Orbit Today.dc.html` batch 2 | Fable 5 | done | rendered and clicked: wide shell, at capacity, all four axes |
| 2 | `Orbit Habit Detail.dc.html` | Opus 4.8 | done | rendered: nav header, mono meta, 30 day ring grid, state axis correctly drops at capacity |
| 3 | `Orbit Habit Form.dc.html` | Opus 4.8 | done | mechanical check clean |
| 4 | `Orbit Calendar.dc.html` | Opus 4.8 | done | rendered: month grid of rings, today carries the accent, future days dimmed |
| 5 | `Orbit Goals.dc.html` | Opus 4.8 | done | mechanical check clean |
| 6 | `Orbit Goal Detail.dc.html` | Opus 4.8 | done | mechanical check clean |
| 7 | `Orbit Insights.dc.html` | Opus 4.8 | done | mechanical check clean |
| 8 | `Orbit Retrospective.dc.html` | Opus 4.8 | done | rendered: wrapped state, calm copy, real figures |
| 9 | `Orbit Astra Chat.dc.html` | Opus 4.8 | done | one finding, a false positive |
| 10 | `Orbit Astra Cards.dc.html` | Opus 4.8 | done | mechanical check clean |
| 11 | `Orbit Onboarding.dc.html` | Opus 4.8 | done | one real defect, below |
| 12 | `Orbit Auth.dc.html` | Opus 4.8 | done | rendered: Google path leading, code entry, six state axis |
| 13 | `Orbit Settings.dc.html` | | **blocked on the limit** | |
| 14 | `Orbit Upgrade.dc.html` | | blocked | |
| 15 | `Orbit Streak.dc.html` | | blocked | |
| 16 | `Orbit Static.dc.html` | | blocked | |
| 17 | `Orbit Celebrations.dc.html` | | blocked | |
| 18 | `Orbit Overlays.dc.html` | | blocked | |

## What the mechanical check found

Run over all twelve exported documents: **no em or en dash** (the repo's own
`tools/check-dashes.mjs` passes on them too), no raw hex outside a `var()` fallback, no gradient, no
blur or glass material, no `transition: all`, no sparkle, no arbitrary z index, no off scale radius,
and every document composes `Shell412`, `ShellWide` and `CanvasControls` and marks its numbers with
`data-mock`.

Two findings, one real:

1. **Real.** `Orbit Onboarding.dc.html` uses `gap:2` in a two line label stack. 2 is not on the
   spacing scale. Fix it on the canvas, not in the export, or the next export overwrites the fix.
2. **False positive.** `Orbit Astra Chat.dc.html` sets `fontFamily:'inherit'` on an input, which is
   correct practice rather than a raw font.

## Budget

Fable 5 was at 83% of its weekly allowance before the run and carried the Today batch 2 build. Waves
1 to 4 ran on `claude-opus-4-8`.

**CORRECTED 2026-08-16: the claim that the limit is "account wide, not per model" is FALSE**, and it
cost four days of assumed waiting. The usage panel shows **three separate buckets**: a rolling
**session** limit, a weekly **all models** limit, and a weekly **Fable** limit. Read live on
2026-08-16: session **1 percent**, all models **72 percent**, Fable **96 percent**, the last two
resetting Thursday 03:59.

So what actually stopped wave 5 was the **session** bucket, which resets every few hours, and the only
bucket anywhere near exhaustion is **Fable**. `claude-opus-4-8` draws on the all-models bucket, which
had 28 percent left. **Check the usage panel rather than reading a pause banner as an account-wide
stop.**

## Operating notes, learned live

- **The canvas caches the design system per project.** The Today project carried a `_ds` snapshot
  that predated wave 0, and the model noticed and refreshed it. Say so in the prompt rather than
  assuming.
- **A finished document can render blank until the page is reloaded.** Reload before judging it
  broken.
- **The first click into the canvas only focuses the iframe.** The second click registers.
- **A browser batch longer than about 60 seconds times out.** Keep polling batches to five waits.
- **The canvas builds one document per turn**, whatever the prompt asks for, so a wave needs a nudge
  between documents. Confirm a send landed by checking the composer is empty, not by the click, and
  locate the send button by role rather than by coordinates, because the composer grows with the
  text.
- **Switching documents inside the app renders them without a reload** and does not disturb a running
  generation, so a finished wave can be spot checked while the next one builds.
- **The canvas asks its open questions as an interactive card.** The standing answer given this run:
  render both options and label the proposal, never stall.
- **A usage pause is soft at first.** The Resume button continues the run, until it is not, and then
  Resume returns straight to the pause.
- **Export is free and instant.** Share, then Project HTML, then Project archive, which does not
  consume usage. The standalone HTML option does.

## Open questions raised on the canvas, for Thomas

Answered by Thomas, never decided on the canvas.

1. The rail module proposal on Today: accept or cut.
2. The calendar month grid at the wide width: one ring per day, or one ring per habit per day. Both
   are rendered in `Orbit Calendar.dc.html`, the second labelled as the proposal.
3. The onboarding replay entry: in the Perfil rows, or opened by the last tour step. Both rendered
   and labelled in `Orbit Onboarding.dc.html`.

---

## Design system run, 2026-08-16 into 2026-08-17

Not a wave. This run repaired the design system project itself, after Thomas looked at wave 1 and
found it was documenting a product rather than a kit.

### What was wrong

* `components/shell/shell.card.html` rendered a whole Hoje screen with named habits and times, and a
  whole Astra conversation with real messages. A design system holds reusable parts; a specimen shows
  a component and its states and never pretends to be the app.
* `components/overlay/overlay.card.html` painted a fake Perfil screen at 45 percent behind the sheet.
* The `ShellWide` sidebar carried the composer. A 232px rail cannot hold an input, 3 to 6 chips and a
  send control without every one of them dropping under its own minimum.
* The composer had no visible way into the conversation. Focus is not an affordance.
* `components/navigation/navigation.card.html` still demoed the pre-D69 tabs, Hoje Metas Astra Perfil.

### What the run changed

Six prompt rounds on `claude-opus-4-8`, which is the strongest model that surface offers; there is no
Opus 5 entry in its picker and the only alternative is Fable 5.

1. The shell card became structural anatomy: every region a labelled empty slot carrying its name and
   its size rule, no product content anywhere.
2. The composer left the sidebar and pins to the bottom of the 740 column, the same position it holds
   on mobile. The sidebar carries navigation and identity only.
3. The Astra glyph became a real 44px button labelled `Abrir conversa`.
4. Every card audited for pretending to be the app. Two were; ten were already legitimate.
5. The `sidebar` variant deleted from `Composer`, since task 2 killed its only caller.
6. Every Components card now renders dark AND light side by side. Light was previously unproven for
   almost every component in the kit, and proving it found real defects.
7. Usage notes written for every card that had none.

### The defects that only appeared once light mode was drawn

* **A `var()` inside a custom property resolves where the property is DECLARED.** Every semantic alias
  declared only at `:root` locked to the dark value and never re-resolved under `[data-mode="light"]`.
  `--primary-dim` gave light mode `#261611`, a near-black wash on a white card, which is what a
  selected `PlanCard` rendered. The status aliases had the same leak.
* **`--primary-hover` failed its own label.** It was the fill mixed 12 percent toward white, `#CD6939`,
  and white on it measures 3.70:1, under the 4.5 floor, on the primary button. The fill itself is only
  4.57:1 with white, so there was no headroom to lighten it at all. Hover now darkens, `#B74E12`, and
  the ladder reads 4.57 rest, 5.11 hover, 6.09 pressed.

### Measured and left open, because each one is Thomas's call

The full table is in `DESIGN.md` under `### Measured contrast, and three limits that are open`.
`--primary-soft` was closed by scoping it to the canvas rather than by changing the colour. The other
three trade against rules Thomas set: fixing the hovered-row miss moves the surface ladder, and
fixing the empty ring collapses the four-step neutral status ranking to three.

### Operating facts learned this run

* **The `DesignSync` write API never rebuilds `_ds_bundle.js` or `_ds_manifest.json`.** Those two are
  what the Design System pane actually reads, and the app rebuilds them only when the APP edits.
  Writing sources over the API leaves new cards invisible and deleted cards rendering `file not found`.
  `unregister_assets` returns success and changes nothing. `design/canvas/tools/build-ds-bundle.mjs`
  regenerates both by hand when that happens.
* **A prompt sent through the browser can be silently truncated.** One five-task message arrived with
  only two tasks. Send in smaller messages and read back what the canvas says it received.
* **Reloading the page fixes a wedged viewport.** A resize left the window at 270x112 and
  `resize_window` reported success while changing nothing; a reload restored it.
* **The weekly usage limit was at 75 percent when this run ended.**

### Card harness cleanup, 2026-08-17

Thomas reported misalignments and hover not working. Read from the fresh export rather than guessed:

* **12 of 12 rewritten cards used a sibling margin.** The light and dark mode panels put
  `marginBottom:16` on the mode label. `DESIGN.md` bans sibling margins outright: gap, never margin.
  The panel is now a flex column with `gap:16`. This is the misalignment: a margin that does not
  participate in the column's gap.
* **`gap:20` appeared twice** in the generative card. 20 is not on the spacing scale, and the system's
  own `Spacing scale` card says in words that 20, 28, 40 and 56 must not appear. Now 24.
* **The shell diagram used `margin:8` and `margin:'0 8px 8px'` as insets**, plus a `14px` padding.
  Both slots now carry the inset as padding on a wrapper, and 14 became 12.
* Every rewritten card was re-parsed through Babel afterwards: 12 checked, 0 failing.

**`check_design_system` passed clean through all of this.** It validates tokens and manifest sync; it
does not read the specimen harness, so a card can break three written rules and still report no
issues. That is worth remembering before trusting it as a completion signal.

**Hover is correct in the source and cannot be judged in the Design System pane.** Every interactive
component carries a `:hover` inside `@media (hover:hover) and (pointer:fine)` with the transition on
the base rule, 21 such blocks compile into `_ds_bundle.js`, and the only `pointer-events:none` in the
project is on the `Proposed` dashed outline, a decorative pseudo-element. The pane makes each card
clickable to open it, which is what eats the hover. Judge hover in the expanded card view or on a real
screen document.
