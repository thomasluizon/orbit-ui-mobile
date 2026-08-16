# The canvas work queue: every remaining screen

> **At a glance** - the seventeen screen documents that finish the app on the canvas, derived from
> `tools/redesign-coverage.mjs` groups rather than guessed. Each block below is a ready prompt built
> on `_screen-template.md`. The `m-` mirrored surfaces are covered by the width axis, so they are not
> separate documents.

**Run one wave per prompt block, in order.** Every prompt assumes `guidelines/screen-contract.md` in
the design system, so none of them restate the canon.

| wave | documents | coverage groups |
|---|---|---|
| 1 | habit detail, habit form, calendar | R7, R8 |
| 2 | goals, goal detail, insights, retrospective | R6, R12 |
| 3 | Astra conversation, Astra cards | R11 |
| 4 | onboarding, auth | R14, R15 |
| 5 | settings, monetization, streak and achievements, celebrations, static and errors, overlay primitives | R16, R17, R9, R10, R4, R18, R1, R2, R21 |

---

## Wave 1

Build three screen documents for Orbit, each following `guidelines/screen-contract.md`. Build them in
order and report after each. Compose `Shell412` and `ShellWide`, switched by `CanvasControls`.

**1. Hábito, detalhe.** Its job: see whether this habit is actually holding, and change it without
leaving. Content: the habit name with its emoji well leading, the streak and the completion rate as
mono meta, a month of history as a ring or dot grid, the linked goals, and the description, which is
long enough to need its own reading treatment. The trailing actions are edit, reschedule, freeze,
archive. States: empty is a habit logged zero times, `Nenhum registro ainda`; error is
`Não foi possível carregar este hábito. Verifique sua conexão e tente de novo.`; at capacity does not
apply here, so say so rather than inventing one.

**2. Criar e editar hábito.** Its job: describe a habit in as few decisions as possible. Content: the
name field, the emoji selector, the frequency, the time, the optional goal link, and the optional
description. Editing is the same surface with values in it and a delete action. Keep simultaneously
considered options at four or fewer per group. States: the error state is a real validation failure
on the name field with the message beside it, not a red border alone; at capacity is
`Limite de 10 hábitos. Arquive um hábito para criar outro.` with the submit unavailable and its
reason beside it. The emoji selector and the reschedule sheet are sub sheets of this document, so
build them here and not as separate screens.

**3. Calendário.** Its job: see which days held and which did not. Content: a month grid where each
day carries its completion as a ring, the selected day expanded into its habit list below, and the
calendar sync entry. Never encode a day's state in colour alone. States: empty is a month with no
logs; loading is the grid shaped and dimensionally stable, never a spinner over it.

Open, so ask Thomas rather than decide: whether the month grid shows one ring per day or one ring per
habit per day at the wide width.

---

## Wave 2

Build four screen documents, same contract, same shells, report after each.

**4. Metas.** Its job: see which goals are moving and open the one that is not. Content: five goals,
each a panel with its title, a mono meta line of progress in real units, and a `ProgressRing`. One
goal sits at 100 percent, so its ring is neutral. Two are part way and keep the accent. One has not
started. One is overdue. States: empty is `Nenhuma meta ainda` with `Criar meta`; at capacity is
`Limite de 5 metas. Arquive uma meta para criar outra.`

**5. Meta, detalhe e formulário.** Its job: see what a goal is made of and change it. Content: the
goal title, its progress in real units, the habits linked to it as rows, the target date, and the
history. The create and edit form is the same document behind the state axis: title, target, unit,
date, and the habit links. States: the error state is a validation failure on the target field.

**6. Insights.** Its job: understand the last month without reading numbers twice. Content: at most
four modules, each answering one question, built from `StatTile`, `ProgressBar` and `ProgressRing`.
Every figure carries `data-mock`. No chart library and no new shape: if a module genuinely needs a
chart the system cannot draw, stop and ask Thomas. States: empty is a person with too little history
to summarise, and it says what is missing rather than showing zeros.

**7. Retrospectiva e wrapped.** Its job: close a period and feel it was worth it. Content: a
retrospective of the period with its three real figures, and the wrapped variant which is the shared,
celebratory presentation of the same data. This is the one surface where the delight budget exists,
so it may carry motion, under one second, skippable, and never blocking. Quiet celebration and no
exclamation mark. States: empty is a period with nothing in it, and it says so plainly without shame
language.

---

## Wave 3

Build two screen documents for Astra, same contract, same shells. Astra is the AI on the primary
path, and its presentation is generative UI: the server sends directives and the client renders real
components, never a wall of text. The Astra glyph is the AI marker and a sparkle is banned.

**8. Astra, conversa.** Its job: say what you did or what you want, and have it happen. Content: the
message list with both roles, the composer bar, the suggestion chips before the first message, the
action chips under a reply, and the typing indicator. The empty state is the first run: it says what
Astra can do in one line and offers three concrete openers rather than a blank field. States:
streaming is a real state on the state axis, so add it, and it never animates text the reader is
trying to read; error is a failed send with a retry beside the message that failed, never a toast
alone.

**9. Astra, cartões generativos.** Its job: turn what Astra proposes into something you can accept in
one tap. Content: the habit list card, the goal list card, the breakdown suggestion with its habit
rows and its frequency picker, the clarification card that asks one short question, the conflict
warning when a proposal collides with an existing habit, and the pending operation card that shows
what is about to happen with an accept and a cancel. Every one of these composes the existing rows
and rings, never a new card shape. States: the pending card carries loading, error and a confirmed
resting state.

Open, so ask Thomas rather than decide: whether an accepted proposal collapses into a summary row or
disappears into the habit list.

---

## Wave 4

Build two screen documents, same contract, same shells.

**10. Onboarding.** Its job: get one habit created and understood in under a minute. Content: the
flow as a short sequence of steps, each asking one thing, with visible progress and a way back. Then
the feature guide drawer, the tour spotlight, the tour tooltip and the replay entry. This is
first-run, so the delight budget applies once, at the end, and never between steps. States: the
error state is a failed first save that does not lose the typed input.

**11. Auth.** Its job: get in without friction. Content: the sign in screen with the Google path
leading, the email path beside it, the six box code entry with paste working, the callback waiting
state, and the auth error. Never block paste, never disable zoom, and the code field carries
`autocomplete` for a one time code. States: error is a wrong code with the message beside the field
and the input preserved.

---

## Wave 5

Build six screen documents, same contract, same shells. These are the long tail, so keep each one
tight and do not invent surfaces the list does not name.

**12. Perfil e configurações.** Its job: change one setting and get out. Content: the profile screen,
then preferences, then advanced, each a settings group of rows. Include the preference picker sheet,
the edit name sheet, the notification bell with its detail, the API key creation, the Astra settings,
and the delete account path, which is destructive and confirms with the consequence named. A toggle
is labelled for its on state.

**13. Assinatura e indicações.** Its job: understand what Pro costs and what it gives. Content: the
upgrade screen with at most three plans, exactly one marked recommended, outcomes rather than feature
names, the same CTA verb on every tier, and the monthly to annual toggle with the arithmetic visible.
Then the referral drawer, the referral prompt, the code screen, the trial expired modal, the
marketing consent prompt and the milestone share prompt. Never a dark pattern: the decline path is as
reachable as the accept path.

**14. Sequência e conquistas.** Its job: see the record without being sold to. Content: the streak
screen with the current and best streak and the freeze state, and the achievements screen as a grid
where earned and unearned read differently by shape as well as colour. A record is not a next action,
so none of this takes the accent.

**15. Celebrações.** Its job: mark a real moment and get out of the way. Content: level up, all done
for the day, goal completed, streak milestone, streak freeze used, fresh start, the achievement toast
and the welcome back toast. Every one is under a second, skippable, never blocking, and carries a
static cue as well as motion. Quiet celebration, no exclamation mark, no confetti wall.

**16. Estático e erros.** Its job: answer a question or explain a failure. Content: about, support,
privacy, terms, then the application error, the global error, the not found screen and the chat
error. Every error says how to fix it, in plain language, with one action. No "Oops".

**17. Primitivas de overlay.** Its job: prove the overlay canon once so every caller inherits it.
Content: the confirm dialog, the context menu, the popover, the date picker, the time picker, the
share card sheet, the command palette and the rail drawer, plus the home screen widget at its real
size. Content height by default, one scroll container, the action row never scrolling, focus moving
into the panel on open and back to the trigger on close, and the least destructive action focused in
a destructive confirmation.

---

## After every wave

1. Verify with `DesignSync` `list_files` and read the new document, rather than trusting the report.
2. Pull the wave into the repository so the canvas is never the only copy.
3. Record what landed and what was asked in `design/prompts/RUN-LOG.md`.
