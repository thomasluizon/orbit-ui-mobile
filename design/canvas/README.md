# The canvas documents

> **At a glance** - the screens built on the Claude Design canvas for ticket `#36`, exported so the
> canvas is never the only copy. Eleven documents survive of the twelve exported.
> **They are token-correct and product-wrong**, and they are kept as a record rather than as a target.
> `RUN-LOG.md` in `design/prompts/` says what was verified.

## Superseded by the information architecture, 2026-08-16

These documents reskin the app that exists. They were built before the information architecture was
written, so every one of them draws a habit tracker with a chat tab. `DESIGN.md` section
`## Information architecture` now says what each screen IS, and the prompts in `design/prompts/`
were rewritten against it.

**Do not build from these documents.** They are evidence of what the canvas produces when the
prompt describes the screen that exists instead of the job the screen does.

`Orbit Insights.dc.html` was deleted on 2026-08-16: the `/insights` route is cut, and its charts
fold into the streak and wrapped surfaces. The canvas built it by mistake.

## What these are

Each `.dc.html` is **one screen as one interactive document**, not a picture of a screen. It carries
a control bar with four axes, mode, width, state and locale, and renders the whole matrix from one
build. That convention is `guidelines/screen-contract.md` inside the design system project.

| document | screen |
|---|---|
| `Orbit Today.dc.html` | Hoje, the habit list, the core loop |
| `Orbit Habit Detail.dc.html` | one habit, its history and its actions |
| `Orbit Habit Form.dc.html` | criar e editar hábito, with the emoji and reschedule sheets |
| `Orbit Calendar.dc.html` | calendário, the month grid and the selected day |
| `Orbit Goals.dc.html` | metas |
| `Orbit Goal Detail.dc.html` | one goal, its habits and its form |
| `Orbit Retrospective.dc.html` | retrospectiva and the wrapped variant |
| `Orbit Astra Chat.dc.html` | Astra, the conversation |
| `Orbit Astra Cards.dc.html` | Astra, the generative cards |
| `Orbit Onboarding.dc.html` | onboarding and the tour |
| `Orbit Auth.dc.html` | entrar, the code entry and the callback |

## Rendering them

They resolve a `support.js` runtime beside them and a `_ds/` folder holding the design system
bundle, tokens and fonts. Neither is committed here. `_ds/` carries the font binaries and duplicates
the design system export, and `support.js` is the canvas runtime, vendor code whose em dashes the
repository dash gate rejects. To open a document locally, export the project archive from Claude
Design again and open it there, or drop these files beside an exported `support.js` and `_ds/`.

## Provenance and state

Exported 2026-08-16 from the Claude Design project `87c2d1c5-d02d-4840-98e8-3abc270d2928`. The
canvas remains the source of truth: **edit them there, not here**, or the next export overwrites the
edit.

Mechanically checked at export: no em or en dash, no raw hex outside a `var()` fallback, no gradient,
no blur or glass, no `transition: all`, no sparkle, no arbitrary z-index, no off scale radius, and
every document composes `Shell412`, `ShellWide` and `CanvasControls` and marks its numbers with
`data-mock`. One defect survives, recorded in `RUN-LOG.md`: a `gap:2` in `Orbit Onboarding.dc.html`,
which is off the spacing scale.
