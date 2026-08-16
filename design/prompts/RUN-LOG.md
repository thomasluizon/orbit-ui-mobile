# Canvas run log

> **At a glance** - what was actually built on the Claude Design canvas, in order, with what was
> verified rather than reported. Written by the unattended run of the night of 2026-08-16.

| # | document | model | state | verified |
|---|---|---|---|---|
| 0 | design system, wave 0 | Fable 5 | done | six items present, zero tokens added, checked against the manifest |
| 0b | design system, wave 0 patch | Fable 5 | done | all five fixes present in the live project files |
| 1 | `Orbit Today.dc.html` batch 2 | Fable 5 | done | rendered and clicked: wide shell, at capacity, all four axes |
| 2 | `Orbit Habit Detail.dc.html` | Opus 4.8 | running | |
| 3 | `Orbit Habit Form.dc.html` | Opus 4.8 | queued | |
| 4 | `Orbit Calendar.dc.html` | Opus 4.8 | queued | |

## Budget

Fable 5 hit 83% of its weekly allowance during the Today batch 2 run and resets Thursday 20 August.
Everything from wave 1 onward runs on `claude-opus-4-8` so a document is never cut off mid build.

## Operating notes, learned live

- **The canvas caches the design system per project.** The Today project carried a `_ds` snapshot that
  predated wave 0, and the model noticed and refreshed it. A screen project opened before a system
  change needs that refresh, so say it in the prompt rather than assuming.
- **A finished document can render blank until the page is reloaded.** Reload before judging it
  broken.
- **The first click into the canvas only focuses the iframe.** The second click registers. Click
  twice when driving a control.
- **A browser batch longer than about 60 seconds times out.** Keep polling batches to five waits.

## Verified on Today, batch 2

- `CanvasControls` renders all four axes plus the two extra state values, `many` and `too many`.
- The wide layout composes `ShellWide`: sidebar with the lockup, four destinations with Hoje active
  in the accent, the capped column, and the rail carrying the module proposal.
- At capacity is neutral, states the limit, offers `Arquivar`, and the create control is unavailable
  with its reason in visible text beside it. No upgrade call to action.
- The self check found issues and fixed them before finishing, without being asked.

## Open questions raised on the canvas, for Thomas

Recorded here as they come, answered by Thomas, never decided on the canvas.

1. The rail module proposal on Today: accept or cut, once he looks at it.
