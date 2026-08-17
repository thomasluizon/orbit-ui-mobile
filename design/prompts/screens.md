# The screen prompts, paste ready

> **At a glance** - copy a fenced block below and paste it into the chat of the Claude Design
> **screens** project. Nothing here needs composing. Rewritten 2026-08-17 after a 14 agent research
> pass traced every state in this file to the code that produces it.

**Project**: `https://claude.ai/design/p/87c2d1c5-d02d-4840-98e8-3abc270d2928`

**Model**: `claude-opus-4-8`. It is the strongest that surface offers. There is no Opus 5 entry and the
only alternative is Fable 5.

## Why this file was rewritten

The first version told the canvas to draw a habit in a **frozen** state. No such thing exists.
`StreakFreeze` is `(UserId, UsedOnDate, CreatedAtUtc)`, so a freeze marks a **day** for a **user**.
`Habit` has no freeze member in 499 lines. The prompt was written from a document instead of from
code, the canvas obeyed, and the result was a state the product cannot produce.

This version fixes the class, not the symptom. **Every state named below is traced to the code that
produces it.** Two more states died in the same pass, for the same reason: a **skipped** habit row
(skip advances the schedule and the row leaves the day) and an **archived** habit with a restore
(delete is a soft delete behind a global query filter, and no query can list restorable habits).

## Three facts about that project before you start

1. **Its pinned copy of the design system is current** and tracks the design system project
   automatically.
2. **It holds 12 documents from the first run and every one of them is product wrong.** They are a
   record, not a target. Each paste below replaces the documents it owns.
3. **`Orbit Hoje.dc.html` carries four known defects.** Three of them belong to the design system, not
   to a screen. Paste **D** below fixes them, and it goes to the **design system** project, not this
   one.

## The order

| paste | goes to | builds | replaces |
|---|---|---|---|
| **D** | **design system project** | four defect repairs | paste first, before any screen |
| **0** | screens | the standing brief | paste once, on its own |
| **1** | screens | Hoje | `Orbit Today.dc.html`, `Orbit Hoje.dc.html` |
| **2** | screens | the conversation and the five blocks | `Orbit Astra Chat.dc.html`, `Orbit Astra Cards.dc.html` |
| **3** | screens | habit creation, habit detail | `Orbit Habit Form.dc.html`, `Orbit Habit Detail.dc.html` |
| **4** | screens | Calendario | `Orbit Calendar.dc.html` |
| **5** | screens | Progresso | `Orbit Goals.dc.html`, `Orbit Goal Detail.dc.html`, `Orbit Retrospective.dc.html` |
| **6** | screens | onboarding, auth | `Orbit Onboarding.dc.html`, `Orbit Auth.dc.html` |
| **7** | screens | Perfil, notifications | new |
| **8** | screens | upgrade: the pitch and the manage view | new |
| **9** | screens | the long tail: celebration, errors, overlays, search, step up | new |
| **10** | screens | Wrapped, about, support, privacy, terms | new |
| **11** | screens | the Android home screen widget | new |

`Orbit Insights.dc.html` is deleted in paste 0, because the route no longer exists.

**One paste per turn.** The canvas builds one document per turn whatever the prompt asks for, so give
each paste its own turn and check the result before the next. Pastes 9, 10 and 11 are the lowest
priority. Stop there if the weekly limit bites.

---

## Paste D: the design system repairs

**This one goes to the design system project `918bd5d7-839c-4dd0-811b-4a8781f60507`, not to screens.**
Paste it first. The screens project pins this system and syncs automatically, so every screen after it
inherits the repairs.

```
Four defects, found on the first composed screen. Fix all four here, in the system, so every consumer
inherits the fix. Do not build or change a screen.

1. THE ICON IS NOT ALIGNED WITH ITS LABEL.
components/brand/Icon.jsx renders a Tabler webfont glyph inside an <i>, and TabBar gives it
display:block with width 22px and height 22px. The glyph is TEXT inside that block, so it sits at the
text origin instead of the centre, and any glyph narrower than 22px reads as shifted left.
Fix it in Icon itself: make it a self centring square. display:inline-flex, both axes centred, width
and height both equal to the size prop, line-height 1. Inline styles beat the class rule, so no
consumer needs touching.

2. StatusRing USES EMOJI AND PUNCTUATION AS ICONOGRAPHY.
Its glyph map is the snowflake character, an exclamation mark and an arrow. That breaks three rules at
once: the icon source is Tabler only, emoji appear only as a user chosen habit icon inside a row well,
and state is never encoded in punctuation.
Replace the whole map with Tabler names. Every name below is verified present in 3.46.0 AND in the
3.31.0 webfont the canvas runs, so all of them will render:
  done      IconCheck, inside a filled --fg-1 disc
  overdue   IconAlertTriangle, in --status-overdue
  bad       IconAlertCircle, in --status-bad
  empty     no glyph. The ring track alone, --status-empty
Do not add a frozen glyph and do not add a skip glyph. See defect 3.

3. `frozen` IS NOT A HABIT STATUS, AND NEITHER IS `skip`.
Remove both from StatusRing, from StatusDotState, from HabitRow and from anything else habit shaped.
In the .d.ts, say what a freeze actually marks: "A freeze marks one calendar day for one user. It
holds the streak on a day the person missed. It is never a property of a habit."
The snowflake survives in exactly one place, the streak day strip, where a day is the subject. Keep a
day scoped frozen treatment there: IconSnowflake in --status-frozen, which is the neutral var(--fg-2).

4. EmptyState HAND DRAWS THE RETIRED MARK.
It inlines a tilted ellipse with an accent arc. That draft mark was replaced on 2026-08-16 and its
assets were deleted, and a hand drawn ellipse is a fourth identity carrier where exactly three are
allowed: the orbital mark, the Astra glyph, and ring indicators.
Use the real OrbitMark component at 96px, in --fg-1, with no arc and no accent on it. Add a prop so an
Astra owned empty state renders AstraGlyph instead.
There is no separate Satellite glyph any more. It was a generic illustration standing where the app's
own logo belongs. Delete it, and point every empty state in the system at this one mark.
The accent then lives only on the one filled action, which the component already has.

Reply with what you changed in each of the four, and nothing else.
```

`DESIGN.md` already carries the matching changes: the empty state is the `OrbitMark`, the Satellite
glyph is gone from the primitives table and from the listing thresholds, and accent role 1 now reads
"an empty state's one filled action" rather than naming an arc.

---

## Paste 0: the standing brief

```
This is the screens project for Orbit. Read this once and hold it for every document you build here.
I will paste one screen brief per turn.

First, one deletion: delete "Orbit Insights.dc.html". The /insights route no longer exists, so a
document for it is a document for a surface that cannot be reached.

Second, the 12 documents already in this project are from an earlier run and every one of them is
product wrong. They rebuilt the app that existed instead of the app that was decided. Treat them as a
record, never as a source. Do not read them for content, layout or copy.

THE RULE THAT OUTRANKS EVERY OTHER RULE HERE
Never draw a state the product cannot produce. Every state named in these briefs is traced to the code
that produces it. If a brief asks you for something you cannot see a way to produce, or if you find
yourself inventing a status, a field, a count or a date to fill a space, STOP and say so instead of
drawing it. An invented state gets read as a contract by the next person who opens the document.

THREE STATES THAT LOOK REAL AND ARE NOT. Never draw any of them.
1. A frozen habit. StreakFreeze is (UserId, UsedOnDate), so a freeze marks a DAY for a USER. Habit has
   no freeze member. A freeze renders on Progresso and nowhere else.
2. A skipped habit row. Skipping advances the schedule, so the row leaves the day. Only a flexible
   habit even writes a log row for it.
3. An archived habit with a restore. Delete is a soft delete behind a global query filter and takes
   the whole subtree. Restore works only by explicit id, so no screen can list what is restorable.

DECIDED VERSUS SHIPPING
Some numbers below are decided and not yet built. Draw the DECIDED state. Where a brief gives you both,
the shipping value is there so you know the gap is an API ticket, not a design choice. Never draw the
shipping value.

WHAT ORBIT IS
Orbit is an AI habit tracker for adults who cannot keep a routine. Astra is the AI, and it sits on the
primary path: it starts a routine, changes it and acts on it. Positioning: an AI that tracks habits,
not a habit tracker with an AI. Never write that contrast as copy.
The product sells in English. Render the full locale matrix, English and Brazilian Portuguese, on every
document. "Orbit" and "Astra" are never translated and both carry translate="no".

THE INFORMATION ARCHITECTURE, SETTLED AND NOT OPEN
Astra is a layer with a front door, never a destination. There is no Astra tab and no bubble. ONE
persistent composer lives in the shell, pinned to the bottom of the content column, on every primary
screen, carrying 3 to 6 suggestion chips built from live state. The Astra glyph at the head of that
composer is a real 44px button labelled "Abrir conversa", and it is how a person who never types still
finds the conversation. The conversation is a full height overlay at 412 and a side panel at the wide
width: one feature, two presentations, not a shell divergence.

The shell is four destinations on both platforms: Hoje, Calendario, Progresso, Perfil. Bottom tab bar
on mobile, sidebar on web. No drawer and no hamburger. The web sidebar carries navigation and identity
only: the lockup, the search control, the four destinations, the one filled create action, the account
row, and the notification bell. There is no right stats rail; the width it held goes to the
conversation panel.

The core loop is never mediated. Marking a habit done is one tap, optimistic, deterministic, offline
tolerant, no model call, ever. Saying "I did X, Y and Z" to Astra is a different interaction with the
same outcome and it does go through the model, as one bulk operation. Both exist and neither replaces
the other.

Astra speaks first. A proactive line sits at the top of Hoje. It replaces itself: no dismiss control,
no persistence, and when Astra noticed nothing the slot is absent rather than empty.

Confirmation is decided by reversibility, never by item count. Bulk log and bulk skip carry none.
Bulk create, bulk delete and anything that removes data carry one.

SURFACES THAT NO LONGER EXIST, SO DRAWING ONE IS THE DEFECT
The /insights route; its figures fold into Progresso. The retrospective as a route, with its empty,
locked and no-data screens; it is now an event Astra delivers on the proactive line. Six of the seven
celebration overlays. The separate onboarding, tour, feature-guide and push-prompt systems. A
create-goal entry in navigation. The desktop stats rail. The social layer. The colour-scheme picker.
AI memory. Rewarded ads and any bonus-message affordance.
Goals live inside Progresso and are created from a habit or by asking Astra.

HOW YOU BUILD
Use the design system components from the pinned design system. Never rebuild a shell, a row, a
button or a field inline. Shell412 and ShellWide are the frames; Composer is Astra's front door;
BlockFrame is the container every generative block inherits; Proposed is the tenth state.
Follow guidelines/screen-contract.md: one interactive document per screen, carrying CanvasControls,
rendering the whole mode, width, state and locale matrix from one build.

HARD RULES
Never write an em dash or an en dash, anywhere.
Add no new token, colour, radius, shadow, font or spacing value. If a screen genuinely needs one,
stop and tell me what and why rather than inventing it.
Spacing is 0 4 8 12 16 24 32 48 64 96 and nothing between. Gap, never a sibling margin. The gap
between two groups is at least twice the gap within a group.
The accent #C4530F has four roles and no fifth: next action, current position, progress toward
something UNFINISHED, one element in the mark. It NEVER marks completion. One filled action per view.
--primary-soft is accent TEXT on the canvas ONLY. On a card, field, well, overlay or hovered surface,
emphasis is a weight step, not a hue.
Hover DARKENS the accent fill to #B74E12. It does not lighten. There is no headroom to lighten it.
Status is neutral and ranked: done --fg-1, frozen --fg-2, skip --fg-3, empty --fg-4. Two hues only,
overdue and bad. Never encode a state in colour alone; every status carries a glyph, a shape or a
label as well.
There is no habit colour palette. A habit is told apart by its emoji, its name and its ring. Habit
emoji render in FULL colour.
Icons are Tabler only. Sizes 16, 20, 24, with 24 the default. Never a sparkle as an AI marker, and
never a set-supplied atom glyph standing in for the Orbit mark.
Identity carriers are exactly three: the orbital mark, the Astra glyph, ring indicators. Orbit is a
hollow ring, Astra is a solid letterform, and silhouette tells them apart.
The four internal schedule type names never render in either locale: not "recorrente", not "flexivel",
not "tarefa unica", not "geral".
Listing thresholds: 0 is the empty state, 1 is the normal row, 2 to 7 is the normal list, 8 to 20 adds
a count in meta, 21 or more virtualizes or paginates with a persistent filter.
At capacity is the ninth state and it is a BOUNDARY, not an error: neutral tokens, never --status-bad,
it states the limit and the one action that changes it, and it carries NO upgrade call to action.
Sentence case everywhere. No exclamation mark on a success. No shame language on a missed day. Copy
names the circumstance, never the person.
Emoji only as a user-chosen habit icon inside a row well, and on a celebration hero. Never in UI copy
and never as iconography.
Three contrast limits are known, measured and deliberately left open: fg-3 on a hovered row at 4.40,
fg-4 as a graphic above the canvas at 2.16 to 2.84, and light fg-4 on hover at 2.94. Do not "fix"
them; they are Thomas's call and each one trades against another rule.

Reply with just the deletion result and one line confirming you have the brief. Do not build anything
yet.
```

---

## Paste 1: Hoje

```
Build Hoje. It replaces "Orbit Today.dc.html" and "Orbit Hoje.dc.html". Delete both when the new
document is done.

ITS JOB, AND ITS ONLY JOB: answer "what do I do now".

WHAT IT IS NOT: not a dashboard, not a summary, not a feed, not a place to review the week. If a
person could get a number from this screen that they did not need in order to act in the next minute,
that number does not belong on it.

WHAT SITS ON IT, top to bottom, and nothing else above the list:
1. Astra's proactive line.
2. The date.
3. The habits due today.
4. A quiet group of habits with no schedule, below the dated list.
Then the composer with its chips, pinned at the bottom of the content column.

THE PROACTIVE LINE IS AN OFFER, NOT A SUMMARY.
It carries one thing Astra noticed that needs a decision now: one short observation clause, then one
action the person can take in one tap. For example, an observation that the run has not happened,
and an action that moves it to this evening.
It is NEVER a count of what is done. It is NEVER a recap of yesterday. It is NEVER praise.
It replaces itself: no dismiss control, no persistence. When Astra noticed nothing the slot is ABSENT,
not empty, so Hoje starts at the date. Draw that absent case as one of the states.
What ships today is a prose paragraph from an AI summary endpoint. Do not reproduce it. It reports on
the day, and this screen was not asked that question.

THE DATE IS A CONTROL, NOT A LABEL. A person needs to log yesterday, because that is what an
overwhelmed adult actually does. Give it the smallest thing that lets them move a day at a time and
jump back to today, and make the current position obvious. It is not a month grid; that is Calendario.
IT HAS A HARD BOUNDARY AND THE SCREEN MUST SHOW IT. A day can be logged 7 days back and no further.
On the eighth day back and earlier, the rows are read only: the status dot renders dimmed and is not
tappable. Draw that read only day as one of the states. Do not draw an error for it. The boundary is
visible before the person tries, not after.

THE HABIT ROW STATES. These four are the only ones a row can reach, so show one of each:
  pending    the empty ring, --status-empty track, no glyph
  done       an --fg-1 filled disc carrying IconCheck. Neutral, never the accent
  overdue    IconAlertTriangle in --status-overdue
  bad habit  IconAlertCircle in --status-bad. A bad habit is NEVER overdue
Plus two more treatments that are real and that the old brief never asked for:
  read only  the dimmed, untappable dot described above
  parent     a parent habit shows a ring of done over total, not a dot
Never draw a frozen row and never draw a skipped row. Neither exists.

MORE THAT IS TRUE AND CHANGES THE DRAWING:
A habit may have no emoji. The field is nullable, so the no-emoji well is common, not an edge case.
Sub habits nest up to five levels. Show two levels inline, then drill in. No connector lines and no
tree lines. The indentation must be structural, so a leaf still reserves its chevron column.
Marking done is a TOGGLE. Tapping a done row unlogs it.

BULK SELECT. Draw it. It is what the reversibility rule is about, and it is undrawn today.
A selection mode with a floating action bar: log, skip, delete. Log and skip carry NO confirmation
because they are reversible. Delete carries one. The cap is 100 items.
Draw the partially failed batch too: the same per-item rows, a status glyph on each, and a retry that
covers only the rows that failed. This is real, not aspirational; the API already returns a per-item
result carrying an index, a status and an error code.

STATES, all of them, in the one document:
loading, as a skeleton shaped like the final list and never a spinner
empty, and there are TWO of them, not one: "no habits yet", and "everything due today is done". They
  are different moments and they say different things. Neither parks persistent information.
error, stating the fix next to what failed
offline. Mobile queues the change and mutates the row optimistically with NO pending mark on the row,
  speaking only through a global toast. Draw it that way rather than as a full page offline screen.
at the daily Astra limit, which is the at-capacity case on this screen. It states the allowance and
  carries NO upgrade call to action. Do NOT write when the allowance returns: no endpoint returns that
  moment, so any time you write would be invented.
and the RETURNING state, a person who has been away for several days. This is the state the product
  exists to handle well, so give it the most thought: what they see first, what Astra says, and how
  the gap is named without naming them. The repair itself lives on Progresso, so this state points
  there rather than performing it.

Also render: the conversation open over Hoje at 412, and open beside it at the wide width.

DECIDED, NOT YET BUILT, so draw the decided version: the Astra allowance is DAILY, 5 free and 50 Pro,
resetting at local midnight. The shipping code still counts 20 and 500 per rolling 30 days. Draw the
daily one. There is no habit count paywall: the habit ceiling is an abuse guard at 1000 that is
identical on every plan. The shipping code still refuses a free account at 10 with a real 403, and no
screen renders that wall, which is a known gap rather than something for you to draw.
```

---

## Paste 2: the conversation and the five blocks

```
Build the conversation. It replaces "Orbit Astra Chat.dc.html" and "Orbit Astra Cards.dc.html";
delete both when the new document is done.

ITS JOB: say what you did or what you want, and have it happen.

WHAT IT IS NOT: not a transcript, not a help desk, not a place that answers with prose. A read-only
card is a screenshot of the app pasted into a chat.

THE ASSISTANT ALMOST NEVER ANSWERS WITH PLAIN PROSE. Every answer that touches data comes back as an
interactive block built on BlockFrame. Build these five, in this order, each in every BlockFrame state
that applies:
1. THE PREVIEW of anything Astra is about to write. One batch preview, per item edit, ONE accept.
   The actions are approve, edit and reject, never a single OK. Irreversible rows look different from
   reversible ones. The preview never auto dismisses.
2. THE HABIT LIST with in place logging. The trailing check logs optimistically; the row body opens
   the habit. The chat teaches no new gesture. Pagination pages IN PLACE: never drill out of a reply
   into a full list.
3. THE CLARIFICATION block: one short question with tappable answers. This one is required by the
   contract whenever Astra cannot resolve what was said, so it is not optional politeness.
4. THE METRICS block: one overview answering how a period went, with a chip through to Progresso.
   Never a per habit drill in inside the chat. Build it from real figures and no chart the system
   cannot draw. THIS BLOCK HAS NO SERVER SCHEMA AT ALL. The other four have one. Draw it, and say in
   your reply that it needs a new API schema, so the follow up ticket is visible.
5. THE BREAKDOWN PROPOSAL: rows plus a frequency control, using the Proposed state on the rows it
   would change. It carries a conflict warning when the proposal collides with something that exists.

RULES THE BLOCKS ENFORCE, and the document must show them:
The block is loading, resting or acting. Never half of two.
The client withholds the payload until the person accepts. A preview is a preview.
Text streams; the block arrives whole. Never animate a block's own reveal.
A stale block says so rather than acting on state that already moved, and offers a refresh.
Announcements are card scoped: a polite live region local to each block, and aria-busy on the feed for
the length of a batch.
Bulk log and bulk skip carry no confirmation. Bulk create and anything destructive carry one.

THE OPERATION CARD renders five typed outcomes, so draw all five: PendingConfirmation, StepUp, Denied,
UnsupportedByPolicy, and Succeeded or Failed. Risk class is Low, Destructive or High.
Three capabilities left the chat and live only in Perfil: manage subscription, manage API keys, manage
account. Astra never pitches the paywall and never starts a checkout.

Render it as the 412 overlay AND the wide side panel, plus these states:
the composer at the daily limit INSIDE the conversation. The refusal arrives on the stream as an
  inline error event, not as a failed request, so it renders inline in the thread.
the busy state. A second message while one is in flight is refused, because the concurrent limit is
  exactly one. The composer needs a busy state, not a queue.
an error from the model.
a partially failed batch where retry covers only what failed, using the same per item rows.
a message with an explicit copy control, on both platforms.

DECIDED, NOT YET BUILT: the allowance is DAILY, 5 free and 50 Pro. A PRO person can hit the ceiling
too, and their refusal carries no upgrade path, so draw a Pro at-limit state as well as a free one.
Never write when the allowance returns; no endpoint returns that moment.
```

---

## Paste 3: habit creation and habit detail

```
Build two documents, creation first. They replace "Orbit Habit Form.dc.html" and
"Orbit Habit Detail.dc.html"; delete each when its replacement is done.

CREATION. Its job: describe a habit in as few decisions as possible.
It is NOT a schedule configuration form. The four internal schedule type names never render, in either
locale. Do not draw a type picker at all.
Creation is ONE input plus ONE live preview sentence. The recognised words are highlighted INSIDE the
input, so the person sees which words the parser consumed. A plain sentence beneath states what Orbit
understood, for example "3 times a week, any days".
Correction is tappable: day pills and a count stepper. Never a re-typed syntax. Exact time, reminders,
end date and description sit behind ONE disclosure.
A parser that cannot resolve a phrase SAYS SO and offers the two controls. It never guesses silently.
Inferred values use the Proposed state: the same field at --fg-3 with an inset dashed hairline,
resolving to normal the instant the person accepts or edits. It never takes the accent.
The form shows an IMMUTABLE START DATE, never the mutating next due date. Today's field is a moving
cursor wearing a fixed label, and that is a structural defect, not a copy one.
Show it reached three ways: from the create action, from a sentence in the conversation, and from
Astra proposing it unasked.
DRAW ITS AT-LIMIT STATE. Every AI assisted creation path spends an Astra message: the setup
suggestion, the tag suggestion and voice transcription all consume from the same allowance. So
creation itself can fail at the daily ceiling. That state belongs on this surface, not only on the
composer.

DETAIL. Its job: is this one holding, and change it without leaving.
It is NOT a read-only record. Every fact on it that can be changed is changed in place.
It gains a composer scoped to that habit. Rescheduling becomes a PROPOSAL carrying its reason, which
the person accepts, not a form they fill.
Show these states:
the habit holding, and the habit slipping. Slipping is NOT a status; no such field exists. Build it
  from the per habit metrics that are real: a current streak, a completion rate and a last completed
  date. Name the circumstance, never the person, and never use --status-bad for it. A red badge here
  is the shame treatment the voice rules forbid.
a habit with sub habits, nested two levels inline with the indentation structural.
a habit with a checklist. The checklist lives on the HABIT, not on the day: checking an item never
  completes the habit, and the whole checklist resets when the habit is logged.
a habit linked to a goal. Only a STREAK type goal derives its progress, from the minimum current
  streak across its linked habits, and that one carries no edit control while the surface names what
  it derives from. Every other goal keeps its manual input however many habits are linked to it.
  Getting this wrong removes the only control that can move the goal.
delete, with its confirmation. There is no archive and no restore shelf, so do not draw one.

DO NOT DRAW: a colour swatch row, a habit colour palette, a note field on a log. The colour system is
dead, and no live write path sends a note.
```

---

## Paste 4: Calendario

```
Build Calendario. It replaces "Orbit Calendar.dc.html"; delete it when the new document is done.

ITS JOB: where did the time actually go.

WHAT IT IS NOT: not a second habit list and not a data view. A person opens it to see the shape of the
last few weeks and to fix one specific day.

ONE RING PER DAY in the month grid, never one ring per habit per day. It is an orientation view.
Reaching a day has to lead somewhere: tapping a day acts.

WHAT THE API ACTUALLY RETURNS, because it changes the drawing:
The month response is a list of habits plus a dictionary of habit id to log list. It returns NO per day
status at all. Empty, full, partial and missed are computed in the client from raw logs. So the ring is
a client computation, and the screen must not imply the server ranked the day.
General habits are EXCLUDED from the calendar entirely. A habit with no schedule never appears here.
The log dictionary is built only for top level habits, so a sub habit's completion never reaches a day
cell. Do not draw a day cell that claims to summarise sub habits.
The week start comes from the person's own setting, resolved on the server. Do not assume Monday.
The clock is 12 hour or 24 hour by the same person's setting. Do not assume either.

THE 7 DAY BOUNDARY IS THE MAIN INTERACTION FACT. Only the last 7 days can be logged. For most of any
month the day is READ ONLY: tapping it shows what happened and offers no completion control, with no
error and no explanation. Draw the interactive day and the read only day as two distinct states, and
make the difference visible before the person taps.

DO NOT DRAW A FREEZE HERE. A freeze marks a user day, and the freeze history the API serves reaches
back 30 days only. A month grid pages back much further, so a freeze marker would appear on recent
cells and silently vanish on older months. The same day would tell two different stories depending on
when it was viewed. Freezes render on Progresso, which is always inside that window.

Imported Google events render BESIDE the habits on a selected day, rather than inside a separate sync
surface, so the integration becomes visible by existing instead of by a settings row.
Calendar sync stays Pro. It is the one thing on this screen that is gated, and it is a real integration
with a real per user cost. The paywall is a BOUNDARY, never an error, and it states what it is.

Never encode a day's state in colour alone. The loading state is the grid, shaped and dimensionally
stable, never a spinner over it.
Stat tile labels must never wrap or misalign in either locale, and Portuguese is the longer one, so
check it there.

STATES: loading, a month with data, a month with nothing in it, error, the read only day, the selected
day with its habits and its imported events, and the calendar sync paywall.
```

---

## Paste 5: Progresso

```
Build Progresso. It replaces "Orbit Goals.dc.html", "Orbit Goal Detail.dc.html" and
"Orbit Retrospective.dc.html"; delete all three when the new document is done.

ITS JOB: answer "am I moving".

WHAT IT IS NOT: not a trophy cabinet and not a chart gallery. This screen composes four things that
used to be four separate screens, and it has to read as ONE answer to ONE question, not four stacked
sections. Name the one focal element before you build, and demote everything else deliberately.

IT CARRIES FOUR THINGS:
1. GOALS.
2. THE STREAK, with its repair.
3. ACHIEVEMENTS.
4. At most four figures folded out of the deleted insights route, each answering one question, built
   only from StatTile, ProgressBar and ProgressRing. No chart library and no new shape. If a figure
   genuinely needs a shape the system cannot draw, stop and say so.

A RECORD IS NOT A NEXT ACTION, so nothing on Progresso takes the accent: not an earned badge, not a
streak total, not a completed goal's ring. A goal at 100 percent renders --status-done, a filled disc
with a check, and there is no intermediate flip. Below 100 the ring sweeps --primary over a
--status-empty track. The accent enters only on progress toward something unfinished.

GOALS, exactly as the code produces them:
Three statuses and no others: Active, Completed, Abandoned. There is no paused, no draft, no archived.
Tracking status on an Active goal is one of on_track, at_risk, behind, no_deadline or completed, and an
abandoned goal reports nothing at all.
A goal has no colour, no icon and no emoji. Do not design a coloured goal card.
Only a STREAK type goal derives its progress, from the minimum current streak across its linked habits,
and that one hides its manual input while naming what it derives from. Every other goal keeps a manual
input however many habits are linked.
A streak goal can sit at 100 percent while still Active, because the read path refreshes the value and
never flips the status. Design the completion moment as a write path event, not as a render.
There is NO per user goal cap, so there is no at capacity state and no "X of Y goals" counter. The only
real ceilings are 10 goals per habit and 20 habits per goal, both neutral and both with no upgrade CTA.
There is NO create-goal entry. A goal is created from a habit, answering what it is for, or by asking
Astra. The empty state's action must NOT open a create-goal form: it routes to a habit or seeds the
composer.

THE STREAK AND THE REPAIR:
There is exactly ONE streak per person, never one per habit.
An unlogged TODAY does not break it. Only a fully elapsed scheduled day with no completion and no
freeze resets it.
The day strip carries exactly four derived values: active, frozen, missed, today. Frozen renders as
IconSnowflake in --status-frozen, which is the neutral --fg-2. THIS IS THE ONLY PLACE IN THE WHOLE
PRODUCT WHERE A FREEZE RENDERS, and it is a DAY that is frozen, never a habit.
Never draw TODAY as frozen. No writer can produce a freeze for the current date, so it is unreachable.
THE REPAIR is the important part and it is new. A person returns after a gap. The surface shows the
gap, and offers a freeze to spend on it as an action THEY take, rather than insurance applied silently
for them. Copy names the circumstance, never the person.
The freeze bank has a real ceiling of 3, and one is earned every 7 streak days. So draw an at capacity
state for the bank: neutral, stating the limit, no upgrade CTA. This is the one genuine at capacity
state on this screen.
Say this in your reply: the repair needs a new endpoint. Today every freeze is written automatically
and retroactively by exactly one day, and the gamification controller exposes no write verb at all.

ACHIEVEMENTS:
Earned and unearned must differ by SHAPE as well as colour, never by colour alone.
An achievement has two persisted states, earned or not. In progress is derived from a current over a
target, and BOTH are null for a one shot achievement, so the tile needs a NO BAR variant. Draw it.
An earned achievement always reports a full bar, so an earned tile can never show a partial one.
No achievement is secret: every name and description shows even when unearned.
HIDE the Social, Sharing and Together categories. The social layer is deleted, and their progress
metrics count friends and cheers, so those tiles can never move. Say in your reply that this needs an
API change to stop returning them.

XP AND LEVELS render as a ROW, not a ring. The ladder has no cap: past level 10 the number keeps
climbing and the title stays the same.

NO ENTRANCE ANIMATION AND NO STAGGER. This is a destination reached many times a day, so the motion
frequency gate rules it out. A ring sweep is sanctioned, because it indicates state.

THE EMPTY STATE is the OrbitMark at 96px, one line and one action. It parks no persistent information
and shows no upgrade call to action.

DECIDED, NOT YET BUILT, so draw the decided version: NOTHING on Progresso is gated. Goals are free and
achievements are ungated. The shipping code gates goals end to end, even reading one, and hard gates
achievements on Pro so a free account receives an empty list and a zero count. Draw the ungated screen
and say in your reply that it needs those two API changes.
```

---

## Paste 6: the first minute, and getting in

```
Build two documents, onboarding first. They replace "Orbit Onboarding.dc.html" and
"Orbit Auth.dc.html"; delete each when its replacement is done.

ONBOARDING. Its job: produce ONE real habit that the person typed.
It is NOT a tour, NOT a quiz and NOT a preference survey. There is no separate tour, feature guide or
push prompt system; those are deleted. It ends when a real habit exists and the person is on Hoje
looking at it.
At most three decisions: what do you want to keep doing, when does it happen, may we remind you.
Reuse the creation input from paste 3 rather than designing a second one.
Notification permission is asked AFTER the habit exists, never before.
There is NO paywall anywhere in onboarding.
No choice is made before the person has seen the interface.
The person meets Astra here, because that is the positioning, and it has to earn the meeting by doing
something rather than by introducing itself. The tour it replaces becomes 3 to 6 quick start intent
chips above the composer.
The delight budget applies once, at the end.

AUTH. Its job: get in without friction.
It is NOT a place to explain the product. Show the email step, the code step, the Google path, and the
loading state that is not a spinner over a blank screen.
THE CODE IS SIX DIGITS AND IT HAS THREE DIFFERENT FAILURES, not one. Draw all three, because they need
different copy and different actions:
  wrong code       the error sits next to the field, in plain language, and the field stays usable
  expired code     the code lasts 5 minutes. This one offers a resend, not a retype
  locked out       three failed attempts lock verification for 15 minutes. This one has to say how
                   long, and it cannot offer an action that will not work
Also draw the resend countdown and the resend-available state.
Every auth error renders next to the field in both locales. No bare error code and no blaming copy.
Offline is a real state on this screen today, so draw it.
```

---

## Paste 7: Perfil and notifications

```
Build two documents.

PERFIL. Its job: change one setting and get out.
It is NOT a profile and NOT a home for anything else.
THREE GROUPS, named for what the person controls: You, Astra, Notifications.
Everything destructive sits at the BOTTOM under a plain heading, never disguised as an ordinary row.
A toggle is labelled for its ON state.
Billing, API keys and account deletion live here and are the ONLY step-up operations in the product,
so they are reachable here and NOT from the conversation.
Nothing may look pressable without a handler behind it.

WHAT EACH GROUP ACTUALLY CONTAINS, from the fields that exist:
You: the account row, which no longer links to a profile page, plus timezone, week start day, 12 or 24
  hour clock, and language. Those four drive every dated screen in the product, so they are not
  decoration.
Astra: the daily allowance with its remainder, proactive check ins, the daily summary, and API keys
  with MCP.
Notifications: this group is much smaller than it looks. There is exactly ONE per user notification
  field, the product email consent, and it is nullable, so it has THREE states: on, off, and never
  asked. Draw the never-asked state. Everything else is a per device push registration, capped at 5
  devices. Every reminder and slip alert control belongs on the HABIT, where those fields live. Do not
  invent global reminder toggles; there is nothing for them to write to.

ROWS THAT STOP EXISTING: the colour scheme picker, AI memory, and every social row.

NOTIFICATIONS. Its job: what did I miss.
The payload is a list of items carrying a title, a body, a link, an optional habit, a read flag and a
timestamp, plus an unread count. The bell lives in the web sidebar and in the mobile shell.
Draw: the bell at zero, the bell with an unread count, the list with read and unread differing by more
than colour, a single item, a full list, the empty state, and the loading skeleton.
One live defect to draw as FIXED: notifications currently write links to routes the four destination
shell removes, so an existing link can land nowhere. Every link in your design points at one of the
four destinations or at a habit. Say in your reply that the API needs the matching cleanup.

DECIDED, NOT YET BUILT: the Astra allowance row is DAILY, 5 free and 50 Pro, resetting at local
midnight. The shipping code is monthly. Draw the daily one. Do not write when it resets: no endpoint
returns that moment.
```

---

## Paste 8: upgrade, the pitch and the manage view

```
Build two documents. The pitch first, then the manage view. Most people who open this surface after
buying land in MANAGE, not in the pitch, so the second document is not an afterthought.

THE PITCH. Its job: Astra without the daily ceiling.
It is NOT a feature matrix. That sentence IS the screen.
The shape: the sentence, then the honest arithmetic of 5 a day against 50 a day, then three outcomes
and no more: the calendar, the periodic retrospective, and Astra noticing things without being asked.
Goals are NOT Pro any more, so no copy may sell them. Calendar sync is Pro.
At most three plans, exactly ONE marked recommended, the same CTA verb on every tier, the monthly to
annual arithmetic visible, and decline as reachable as accept.
Annual is the visual default. Free is a quiet inline link. A monthly-to-annual segmented control
replaces choosing an interval by pressing one of three stacked cards.
NEVER TYPE A PRICE. No price exists in either repository: the server asks the billing provider at
request time and returns two amounts, a currency, a savings percent and an optional coupon percent.
Render every number as a variable fed by that response. Do not hardcode an amount and do not hardcode
a savings percentage; the saving is derived server side from the two amounts.
New accounts get a 7 day trial, so the screen has to make sense to someone already inside one. There is
no way to start, extend or restart a trial, so never draw a "start your trial" button.

THE MANAGE VIEW. Its job: see what I am paying for, and change or stop it.
It has two structurally different variants and you must draw both, because the difference is not
cosmetic: a subscription bought through Google Play CANNOT open the Stripe portal, so the Play variant
sends the person to Play instead. Draw the Play dashboard and the Stripe portal as separate paths.
Also draw: lifetime Pro, which is read only and can never be bought from any screen; and a lapsed plan,
which currently reads silently as free, so the person is given no account of what changed.
The portal path has its own loading state and its own error state, including the case where the portal
itself fails to open. Mobile also renders offline on both of these screens, so draw that too.
A trial reads as plan "pro" with a separate trial flag, so a trial badge is DERIVED. Never read it off
the plan field, which says only "pro" or "free".

Never draw a rewarded ad or a bonus message affordance. That path is deleted.
```

---

## Paste 9: the long tail

```
Build the remaining interactive surfaces. Use as many documents as they need.

THE ONE SURVIVING CELEBRATION. Six of seven are deleted. Draw the one that lives, with its FOUR
triggers and no others: a streak milestone, a goal completing, a level up, and everything due today
being done. NEVER an individual habit completion; that happens over a hundred times a day and the
motion frequency gate rules it out.
It is under a second, skippable, never blocking, quiet, and carries a static cue as well as the motion.
No exclamation mark. It needs a reduced motion variant that is a dignified static state, on both
platforms. Make the case in one line for why this one is worth interrupting someone for.

THE ERROR AND STATIC SURFACES: the update-required gate, a 404, and a generic failure. Each states the
fix. None of them apologises.
The update gate diverges by platform ON PURPOSE and that divergence is enumerated: mobile shows a full
screen non dismissible blocker with a store button, web shows a dismissible banner with a reload
button. Draw both.
A throttle state: the server can refuse for rate limiting with a retry time but WITHOUT a reason, so
the screen can show a countdown and must not invent an explanation.

OFFLINE IS NOT ONE SCREEN, so do not draw it as one. Draw it as it behaves:
  mobile   the change is queued and the row mutates optimistically with NO pending mark on it. Three
           global toasts carry the whole mechanism: queued, syncing, synced. Plus the error where a
           queued change is dropped.
  web      a small number of surfaces refuse to act and say so in place.
Draw both, and draw the dropped change error, which is the one that loses data and is undrawn today.

SEARCH. It has a control in the sidebar and no result anywhere. Draw the result.
The API already returns which FIELD matched: the title, the description, a tag, or a child habit. The
app never renders it today. Show the match field on each result, so a person understands why a habit
came back. Draw no results, one result, many results, and the state while it is searching.

THE COMMAND PALETTE on both platforms.

THE STEP UP CODE SCREEN. It guards the three most consequential actions in the product and nothing
draws it today. Its constraints are real: the challenge lasts 5 minutes, resend has a 60 second
cooldown, and there are 5 attempts. Draw the challenge, the cooldown, the wrong code, the expired
challenge and the exhausted attempts.

THE OVERLAY PRIMITIVES IN SITU: the sheet at short and long content, and the confirmation that appears
only for something irreversible.
Two live overlay defects to draw as FIXED: an overlay that opens scrolled away from its own first line,
and a caller that nests its own scroll container inside a scrollable sheet.
```

---

## Paste 10: Wrapped and the static screens

```
Build Wrapped, then the four static screens.

WRAPPED. Its job: close a period and feel it was worth it. It is NOT a report.
This is the one place the delight budget is spent in full.
It has no navigation entry in the four destination shell, so say in your reply how you think a person
reaches it. That is genuinely unresolved and I would rather have your answer than an invented nav row.
Build it from figures the product actually has: completions, streak length, the per weekday consistency
array, and goal completions. That consistency array is indexed by WEEKDAY starting Monday, not by seven
consecutive dates, so do not draw it as a timeline.

ABOUT, PRIVACY, TERMS, SUPPORT. Unchanged in purpose, redrawn in the new canon.
ONE DEFECT MUST BE FIXED, not inherited: the about screen clips horizontally at 412px in Portuguese, in
both themes. Lay it out so Portuguese fits, not just English. Portuguese is the longer language
throughout, so check every one of these four at 412 in Portuguese.
The about screen's navigation labels and their order are load bearing strings. Keep them and keep their
order.
SUPPORT is a form, so it needs the full control state set plus a designed SUCCESS state. No exclamation
mark in the success.
```

---

## Paste 11: the Android home screen widget

```
Build the Android home screen widget. It is the last unredesigned surface, it is the most used surface
of the only paying subscriber, and it is ugly enough that Thomas stopped using it. That is the whole
case for the work.

IT CANNOT INHERIT THE DESIGN SYSTEM, and that constraint shapes everything. Android RemoteViews cannot
read a CSS token, so the widget carries literal colour values. Every literal you specify must name the
token it came from, so the two can be checked against each other later. Its strings live in an Android
resource file and not in the shared translation files, so this surface is outside the copy pass and its
copy has to be right here.

ITS REAL STATES, all of them, in one document:
signed out
first load, as a skeleton
empty, meaning nothing is due
refreshing
and per row: completed, overdue, pending, a children done-over-total badge, a checklist badge, a child
indent, and a truncated level where the tree goes deeper than the widget can show.
The streak hides at zero rather than showing a zero.

Draw it at the sizes a home screen actually gives it, and draw the configuration preview the picker
shows, which must match the shipped widget rather than an idealised version of it.
Dark and light both, because the host launcher decides and the widget does not.

The widget computes overdue with its OWN rule, capped at a maximum range, which is not the rule the
main app list uses. Do not try to reconcile them in the design. Draw what the widget produces and note
the divergence in your reply.
```

---

## After every paste

1. Look at the document at 412 and at the wide width, in dark and in light, in English and in
   Portuguese.
2. Check the five things the canvas cannot check itself:
   - is anything here a surface that no longer exists
   - is any state here one the code cannot produce
   - does the accent do a fifth job
   - is there a sibling margin
   - is any spacing value off the scale
3. If a screen proves the design system is missing something or wrong about something, fix the design
   system project, not the screen. That is the whole point of building screens next.
4. Collect what each paste reports back as needing an API change. The run so far names five: the
   streak repair endpoint, the metrics block schema, removing the achievements Pro gate, removing the
   goals Pro gate, and dropping the social achievement categories.
