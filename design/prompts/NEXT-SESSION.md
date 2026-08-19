# The prompt for the next session

Copy the fenced block below into a fresh Claude Code session started in `orbit-ui-mobile`.

Written 2026-08-18, at the end of the session that built the whole canvas. The previous handoff existed
because two prompts were written from documents instead of from code. That defect is closed. This
handoff exists for a different reason: **the design is complete and Thomas does not like all of it**,
and the weekly Claude Design budget ran out before it could be reviewed screen by screen.

**Do not start this before Thursday 2026-08-20, 04:00.** The weekly limit sat at 90 percent when this
was written and the canvas itself refused to start a nine component build at that level.

---

```
Continue Orbit ticket #36, the canvas-first redesign. The canvas is BUILT. This session finishes the
four components it could not afford, then reviews every screen WITH Thomas and fixes what he does not
like.

## What is already true, so do not redo it

The screens project holds 20 documents covering every surface, and nothing from the first run survives:
https://claude.ai/design/p/87c2d1c5-d02d-4840-98e8-3abc270d2928

  Orbit Hoje              Orbit Habit Create      Orbit Habit Detail
  Orbit Calendario        Orbit Progresso         Orbit Astra Conversation
  Orbit Onboarding        Orbit Entrar            Orbit Perfil
  Orbit Avisos            Orbit Pro               Orbit Assinatura
  Orbit Celebracao        Orbit Estados           Orbit Offline
  Orbit Busca             Orbit Verificacao       Orbit Sobreposicoes
  Orbit Wrapped           Orbit Widget Android

Four design system rounds ran alongside them (D, D2, D3, D4 part one), all recorded in
design/prompts/screens.md, which is the file of record for every prompt this project has run.

Nine API tickets are filed: #331 the streak repair endpoint, #332 the achievements payload, #333 the
Astra metrics schema, #334 the notification urls, #335 the notification list, #336 search results, #337
the step up screen, #338 the error surfaces, #339 offline. Twenty one older tickets carry a comment
naming the document that defines their surface.

## Phase 1: finish the four components the canvas could not afford

They go to the DESIGN SYSTEM project, not screens:
https://claude.ai/design/p/918bd5d7-839c-4dd0-811b-4a8781f60507

The canvas already holds these four on its own todo list with their constraints, so open that chat and
say to continue rather than restating the brief. In priority order:

1. DayCell and MonthGrid. The largest, and it has TWO consumers waiting. Four outcomes: nothing
   scheduled draws no ring at all (an absence, not a failure), partially logged draws an arc at the
   EXACT fraction, fully logged draws a filled neutral disc, today is current position. The cell states
   loggable versus read only BEFORE it is tapped, and its accessible name carries the date and the
   outcome. MonthGrid takes the week start as DATA.
2. OtpInput gains onChange, an error state and disabled. It is display only today, so Entrar and the
   step up screen both compose the typing beside it.
3. Pager, for Wrapped: segments, back and forward, the last page swapping forward for the closing
   action, and never auto advancing.
4. Columns, for Wrapped's weekday page. State in the component that a column set is NOT a timeline.

The canvas confirmed none of the four needs a new token.

THEN rewire the two screens that are still composing them by hand, the way paste 2B rewired the
conversation after D3: Calendario for DayCell, MonthGrid, the Skeleton grid variant, the read only
ListRow and EventRow; Wrapped for Pager and Columns. Tell each to DELETE the local workaround and
report which ones it removed.

## Phase 2: the review pass, WITH Thomas, one screen at a time

This is the reason the session exists. Thomas said there is a lot in the canvas he does not like and he
has not had a chance to go through it.

**Run it as a loop, one screen per round, and do not batch.**

For each screen, in this order (a person's path through the product, not alphabetical):
  Onboarding, Hoje, Habit Create, Habit Detail, Astra Conversation, Calendario, Progresso, Pro,
  Assinatura, Wrapped, Perfil, Avisos, Entrar, Verificacao, Busca, Celebracao, Estados, Offline,
  Sobreposicoes, Widget Android

do this:

1. Read the document through the claude_design MCP (DesignSync, method get_file) rather than opening a
   canvas turn. Reading is free; canvas turns are not. Its report block states what it drew and why,
   and is the fastest way to know its intent.
2. Tell Thomas in a few lines what the screen is, what states it carries, and the two or three calls it
   made that he might disagree with. Name them specifically. Do not summarise the report block back at
   him; he can read.
3. Ask him what he wants changed. Use the ask-user tool, and give him your recommendation on each
   point so he can say yes. He is terse. Never present a menu.
4. Turn his answer into ONE corrective paste and run it. Edit in place, keep the state axis, never
   rebuild.
5. Verify through the MCP that the change landed, then move to the next screen.

**Watch the budget on every canvas turn.** Read the usage banner after each send. Stop at 98 percent,
and tell him where you stopped. The canvas will also refuse work it cannot finish cleanly, which it did
correctly on 2026-08-18: treat that refusal as sound and split the work rather than pushing it.

## Phase 3: what comes after, and it is the real work

The canvas is a design, not a product. Everything below is still open.

**The API tickets block the screens.** #331 to #334 exist because three screens each reported server
work they need. Nothing drawn on Progresso can ship until #332 ungates achievements, and the Astra
metrics block cannot ship at all until #333 gives it a schema. `/orchestrate <ticket>` is how they get
built.

**Three things are recorded and unresolved**, each needing Thomas rather than a worker:
  - `#329`'s body still specifies the Satellite glyph for the Progresso empty state, which now
    contradicts DESIGN.md. The document was never corrected.
  - `--status-skip` binds to nothing since skip stopped being a row state. Deleting a token is a design
    system contraction, so it is his call.
  - The titles of `#44`, `#46` and `#50` still describe the pre-D69 app. A hook blocks title edits, so
    each carries a correction erratum in its body instead.

**Two open questions Wrapped raised and nobody answered**: whether a period a person never opened stays
reachable afterwards and for how long, which nothing currently stores, and whether the copy may ever use
the full weekday form, since "quarta-feira" is the stress case that would break the widest line on the
share card.

## Operational notes that will save you an hour

**Read documents through the MCP, never by opening a canvas turn.** `DesignSync` with
`method: "get_file"` and the project id. `list_files` first if you need the names. A document runs 50 to
100 KB, so it saves to a file rather than your context; grep that file.

**Driving the canvas through claude-in-chrome**, because the composer has two traps:
  - The page has TWO contenteditable elements. The composer is `eds[0]`; the second is the document
    editor. `find` returns the composer's ref but clicking it can focus the wrong one, so ALWAYS assert
    `document.activeElement === eds[0]` before pasting. Pasting into the wrong one edits the project's
    readme, which happened on 2026-08-18 and had to be undone.
  - The composer sends on Enter, so never type multi line text. Set the text on `window`, then dispatch
    a synthetic `ClipboardEvent('paste')` at the editor.
  - Anything over about 5,000 characters becomes a `Pasted text` attachment rather than inline text.
    That works, but add one short line above it saying the attachment is the brief.

## Standing rules

- Never write an em dash or an en dash, anywhere. The gate is `node tools/check-dashes.mjs --files <paths>`.
- Work on `redesign/main`. It has no CI and no Pullfrog, so a green PR is not a reviewed PR.
- Never name a state, field or gate the code cannot produce. That rule closed the defect that started
  this run, and it held: `frozen` came back twice under different disguises and is now a TYPE ERROR in
  `DayStrip`, not a review note. Prefer enforcing a rule in a contract over stating it in prose.
- Never remove a capability the app has today unless a decision removed it. A constraint on WRITING is
  not a constraint on READING.
- Ask Thomas on any product or taste call. Make mechanical choices yourself and say what you chose.
- Take every identifier from live output in this run, never from memory.
```
