# The screen prompts, paste ready

> **At a glance** - copy a fenced block below and paste it into the chat of the Claude Design
> **screens** project. Nothing here needs composing. Rewritten 2026-08-17 after a 14 agent research
> pass traced every state in this file to the code that produces it.

**Project**: `https://claude.ai/design/p/87c2d1c5-d02d-4840-98e8-3abc270d2928`

**Model**: **Fable 5 Max** since 2026-08-20, at Thomas's instruction. The selector offers Fable 5,
Opus 5, Sonnet 5 and Haiku 4.5, with Effort as a separate control already set to Max. Two traps when
changing it: the picker will not apply a change **while a generation is running**, and it raises a
**"Switch model?" confirm dialog** that silently swallows the click if nothing answers it, so the
label keeps reading the old model and the change looks like it simply failed. Answer the dialog, then
re-read the label to confirm. **Fable draws down the weekly Claude Design budget 2x faster than
Opus 5**, which the composer states in its own banner; that budget is what ended the 2026-08-18
session.

**Pasting**: a block longer than about 5,000 characters does not land as inline text. Claude converts
it to a `Pasted text, N lines` attachment. That still works, but add one short line above it telling
the canvas the attachment is the brief and to follow it. Paste D is short enough to go inline.

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

## Run status: COMPLETE, 2026-08-18

Every paste in this file has run. The screens project holds **20 documents and 21 pages**, all new
canon, with no document surviving from the first run:

| document | from |
|---|---|
| `Orbit Hoje` | paste 1, corrected by 1C |
| `Orbit Habit Create`, `Orbit Habit Detail` | paste 3 |
| `Orbit Calendario` | paste 4, corrected by ANSWERS |
| `Orbit Progresso` | paste 5 |
| `Orbit Astra Conversation` | paste 2, rewired by 2B, corrected by ANSWERS |
| `Orbit Onboarding`, `Orbit Entrar` | paste 6 |
| `Orbit Perfil`, `Orbit Avisos` | paste 7 |
| `Orbit Pro`, `Orbit Assinatura` | paste 8 |
| `Orbit Celebracao`, `Orbit Estados`, `Orbit Offline`, `Orbit Busca`, `Orbit Verificacao`, `Orbit Sobreposicoes` | paste 9 |
| `Orbit Wrapped`, `Orbit Sobre` | paste 10 |
| `Orbit Widget Android` | paste 11 |

Three design system rounds ran alongside: **D** (the four first-Hoje defects), **D2** (DayStrip,
Checkbox, header slot, TimeField, StatTile states, Menu) and **D3** (BlockFrame, Composer busy and
atLimit, the authorable conversation slot).

Four API tickets were filed from what the screens reported they needed: `#331` the streak repair
endpoint, `#332` the achievements payload, `#333` the Astra metrics schema, `#334` the notification
urls.

**One correction after the run, 2026-08-18.** Wrapped shipped without a share action, because the
build reasoned that "the social layer is deleted" meant there was "nowhere outside to lead". That
conflated two different things. The **social layer** is internal (friends, cheers, challenges,
accountability) and D69 deleted it. **Sharing outward** was never deleted, and it is the reason Wrapped
survived the cut at all: the growth research of 2026-06-18 calls the shareable recap card the minimum
viable viral loop, and the debloat plan of 2026-08-05 keeps Wrapped for exactly that word.

It also ships today, which settles it: `apps/web/hooks/use-share-card.ts` and
`apps/mobile/hooks/use-share-card.ts` render the card client side with `toBlob` at `pixelRatio: 3` into
`orbit-recap.png`, call `navigator.share`, and fire `card_shared`, which the API whitelists at
`AchievementEventMap.cs:10` and which grants the `show_off` achievement.

Wrapped now carries ten states, the last three being `share card`, `share sheet` and
`share unavailable`. The shared artefact is one composed 9 by 16 image carrying no controls, because it
becomes a file. **How Wrapped is reached is settled too**: the notification for the closed period is the
primary way in, matching how the periodic retrospective is already delivered, and Progresso carries an
entry for the period that just closed as the fallback. Neither is a nav row.

## The tickets now point at the canvas, 2026-08-18

Twenty one existing tickets carry a comment naming the document that defines their surface: `#42` `#44`
`#46` `#47` `#50` `#53` `#55` `#56` `#57` `#58` `#61` `#63` `#67` `#69` `#71` `#72` `#73` `#76` `#217`
`#318` `#329`. Their bodies were already corrected against D69 on 2026-08-16, so the comment adds the
drawing rather than re-stating the job.

Five surfaces gained a document in this run and had no ticket at all. They are now filed, all
`repo:ui`, all `parity:yes`, all in `539 Redesign`:

| ticket | surface | document |
|---|---|---|
| `#335` | the notification bell and its list | `Orbit Avisos` |
| `#336` | search results, including which field matched | `Orbit Busca` |
| `#337` | the step up code screen | `Orbit Verificacao` |
| `#338` | the error and static surfaces | `Orbit Estados` |
| `#339` | offline, including the dropped change that loses data | `Orbit Offline` |

`#335` is ordered behind `#334`, because rewriting the client while the server still writes `/streak`
leaves the two disagreeing.

**Still open after D4's partial round:** the month grid and day
cell, a `Skeleton` grid variant, a read only list row, `CapacityNotice` taking more than one message,
an event row, `Sheet` stating that it mounts fresh per open, and `OtpInput` being display only.

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

A FREEZE NEVER APPEARS ON A HABIT'S OWN HISTORY. The Hoje build drew a 14 day strip on the detail
carrying a snowflake, and called it the one place the snowflake appears. That is wrong and it is the
original defect in a new form: StreakFreeze is (UserId, UsedOnDate), so a freeze marks a USER day.
A snowflake inside one habit's own strip says that habit was frozen, which cannot happen. Draw the
per habit strip with completions only. The freeze lives on Progresso.

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

---

## Paste 1C: correct Hoje's interaction model, and build creation

Written 2026-08-18 after Thomas reviewed the first build and found the screen unusable: the create
button was inert, the overflow menu did not exist, and tapping a habit logged it. Every claim below was
read from `apps/*/components/habits/` and from the built document itself. Paste this into the screens
project.

```
Correct Hoje. Edit "Orbit Hoje.dc.html" in place. Do not rebuild it and do not create a second
document. Keep all thirteen states.

The screen looks right and behaves wrong. Every interaction below is wired to the wrong thing, and I
checked the real app to say what each one should be. File paths are from the Orbit repo so you can
trust these as facts rather than preferences.

PART 1. THE INTERACTION MODEL. This is the important part.

What the document does now, read from its own source:
  onClick on the row body  -> this.toggleStatus(...)     it LOGS the habit
  onMenu on the 3 dot      -> this.enterSelect(key)      it enters SELECT mode
  onClick on the Fab       -> () => {}                   it does NOTHING

What the shipping app does, and what you must draw instead:
  ROW BODY TAP opens the habit detail. apps/mobile/components/habits/habit-row.tsx:146: handlePress
    calls actions.onDetail(). It only toggles selection when already in select mode. Web is identical:
    habit-row.tsx:145, rowPrimaryAction = selectMode ? onToggleSelection : onDetail.
  THE TRAILING STATUS RING is the only thing that logs. Tapping it toggles: log when undone, unlog
    when done. It is a separate control from the row body and it always has been.
  THE 3 DOT OPENS AN OVERFLOW MENU. It never enters select mode. The menu has seven items and they
    are these, in this order, from habit-row-context-menu-items.ts:
      log (only when not done and the day is loggable), skip, view details, edit, duplicate,
      add sub habit, delete (destructive, last, visually separated)
  SELECT MODE IS ENTERED BY LONG PRESS on a row, never by the 3 dot.
    apps/mobile/components/habits/habit-row.tsx:192, onLongPress -> onLongPressCard.
  THE DISCLOSURE CHEVRON expands a parent in place. Keep what you have. It is the only control that
    expands, so the row body must not also expand: a parent row's body opens its detail like any
    other row.

Draw the overflow menu open, as one of the states, so the seven items are visible.

PART 2. THE FAB WORKS, AND CREATION IS A REAL SURFACE.
The Fab is present and its onClick is an empty function, so the screen has no way to create anything.
Wire it, and build what it opens.

CREATION, exactly as decided. Its job: describe a habit in as few decisions as possible.
It is NOT a schedule configuration form.
  ONE INPUT plus ONE live preview sentence. The person types or speaks what they want.
  The RECOGNISED WORDS ARE HIGHLIGHTED INSIDE THE INPUT, so it is visible which words the parser
    consumed. Beneath it, a plain sentence states what Orbit understood, for example
    "3 vezes por semana, qualquer dia" or "toda segunda e quinta as 08:00".
  CORRECTION IS TAPPABLE: day pills and a count stepper. Never a re typed syntax.
  ONE DISCLOSURE holds everything else: exact time, reminders, end date, description.
  A PARSER THAT CANNOT RESOLVE A PHRASE SAYS SO and offers the two controls. It never guesses
    silently. Draw that state.
  INFERRED VALUES USE THE PROPOSED STATE: the same field at --fg-3 with an inset dashed hairline,
    resolving to normal the instant the person accepts or edits it. It never takes the accent.
  THE FORM SHOWS AN IMMUTABLE START DATE, never the mutating next due date.

NEVER DRAW, because these are deleted or never render:
  A frequency type picker, and the four internal type names in either locale: not "recorrente", not
    "flexivel", not "tarefa unica", not "geral". The current app ships frequency-type-cards.tsx and it
    is dead.
  A colour swatch row. The current app ships color-swatches.tsx and it is dead. Colour as data is
    dead and a habit is told apart by its emoji, its name and its ring.

WHAT THE MACHINE CAN ACTUALLY PROPOSE. This needs no API work. HabitSetupSuggestion already returns
exactly this and its own doc comment says it maps 1:1 onto the create request:
  Emoji, FrequencyUnit, FrequencyQuantity, Days, IsFlexible, FlexibleTarget, DueTime,
  and EITHER SubHabits OR ChecklistItems, never both.
So the preview can propose an emoji, a cadence, fixed weekdays, a flexible "N times per period", a
time, and one breakdown. Nothing else. Do not propose a field outside that list.
An AI assisted creation path SPENDS an Astra message, so creation can fail at the daily ceiling. Draw
that at limit state on this surface.

Show creation reached three ways: from the Fab, from a sentence in the conversation, and from Astra
proposing it unasked.

PART 3. THE HABIT DETAIL OPENS FROM THE ROW.
Since the row body now opens it, draw it. Its job: is this one holding, and change it without leaving.
It is NOT a read only record: every fact on it that can be changed is changed in place.
It carries a composer scoped to that habit, and rescheduling is a PROPOSAL carrying its reason that
the person accepts, not a form they fill.
There is no archive and no restore, so do not draw one. Delete is a confirmed action.

PART 4. THREE THINGS FROM THE LAST ROUND THAT ARE STILL WRONG.

4a. THE PROACTIVE LINE IS A LINE, NOT A CARD.
It is a two sentence block of large text with a filled accent pill, and it dominates the top of the
screen. The decision says the content sits as ONE LINE at the top of Hoje with one action. It should
occupy less vertical space than the date below it. Its action is NOT a filled accent button, because
the Fab is the one filled action on this view. Make it a quiet text action. One clause, then the
action.

4b. THE DATE CONTROL MUST MOVE FORWARD. THIS ONE WAS MY ERROR, NOT YOURS.
My earlier brief said "7 days back and no further" and you correctly removed the forward chevron. That
sentence describes the LOGGING boundary and I wrongly applied it to NAVIGATION.
  AppConstants.MaxInstanceHorizonDays = 90: the schedule read returns instances up to 90 days AHEAD.
    Seeing tomorrow is a shipping capability. Restore the forward chevron.
  LogHabitCommand.ValidateTargetDate refuses a log more than 7 days back, and refuses a future log
    only when FrequencyUnit is not null, so a one time task CAN be logged ahead.
Navigation is free in both directions. The boundary is a ROW treatment, never a navigation treatment.

4c. OVERDUE IS A TRIANGLE.
The overdue row draws an exclamation mark inside a ring. The repaired design system maps overdue to
IconAlertTriangle in --status-overdue and reserves IconAlertCircle for a bad habit in --status-bad. If
your pinned copy still carries the old map, say so rather than redrawing the icon locally.

A STANDING RULE FROM THIS ROUND. Apply it to every screen from here on.
Never invent an interaction, and never remove one the app already has. Before you wire a control, say
what the real app does with it. A constraint on WRITING is not a constraint on READING. If a brief
seems to delete an existing behaviour, say so before you draw it.

Report back: what the Fab opens, how the overflow menu is dismissed, and how select mode is entered
and left.
```

---

## Paste D2: the second design system round

Written 2026-08-18 from the gaps the Hoje and Habit Detail builds reported, each one verified against
the design system source before it was written down. **Goes to the design system project
`918bd5d7-839c-4dd0-811b-4a8781f60507`, not to screens.** Run it before paste 5, because two of the six
are about to be composed by hand a second time inside Progresso.

```
Six components are missing and two screens have already worked around them by hand. Add them here so
nothing composes them locally again. Do not build or change a screen.

Add no new token, colour, radius, shadow or font. Every one of these is buildable from what exists. If
one genuinely is not, stop and tell me which and why.

1. DayStrip. THE MOST IMPORTANT ONE, and it must be built so a known bug cannot come back.
Two surfaces need a row of day cells and neither can have it: the habit detail composed a 14 day strip
from 20px cells, and Progresso needs the same shape for the streak.
They are NOT the same data, and that is the whole point:
  scope="habit"    the history of ONE habit. Values: done, missed, not scheduled. There is NO frozen
                   value in this scope and the type must not offer one.
  scope="account"  the person's streak. Values: active, frozen, missed, today. Frozen renders
                   IconSnowflake in --status-frozen.
A freeze is stored as (UserId, UsedOnDate), so it marks a DAY for the WHOLE ACCOUNT and never a habit.
A snowflake inside one habit's strip asserts something the product cannot produce. Make that
impossible in the .d.ts rather than in a comment: the two scopes take two different value unions, so
passing frozen to a habit strip is a type error.
Props: scope, days (the values), length, and a label per cell for the accessible name.

2. Checkbox, and a CheckRow that uses it.
The checklist on the habit detail is composed from a button, a 24 box and a neutral check, because the
system has no checkbox. Build it. The check is neutral, never the accent, because a ticked item is a
completion and the accent never marks completion. Ship all nine states.

3. Shell412 needs a header slot, and so does ShellWide.
Shell412Props is children, tabBar, composer, fab, conversation, sheets. There is no header, so the
habit detail put NavHeader as the first child of the scroller and it scrolls away with the content. A
detail screen that loses its own title and its back control on scroll is broken, and Calendario,
Progresso and Perfil will all hit this next.
Add a header slot that PINS above the scroller. NavHeader already exists, so this is a slot, not a new
component. Say in the .d.ts that a screen with no header passes nothing and the scroller takes the
full height, which is what Hoje does.

4. A time field, and a read only date row.
The create form has no date field, so the start date is stated as text and the time is a plain text
input. The start date is deliberately IMMUTABLE and is never the mutating next due date, so it needs a
read only presentation rather than a picker. The time does need a real input.
Build: DateRow, read only, label plus value, no control. TimeField, a real 24 hour input that respects
the person's 12 or 24 hour setting.

5. StatTile ships its states.
StatTileProps is exactly { value, label } today, so the habit detail had to replace the whole tile row
to show loading. DESIGN.md requires every component to ship its full state set. Add at minimum loading
as a skeleton shaped like the final tile and holding its dimensions, and empty for a figure that has
no data yet. A tile that has no data says so; it never renders a zero that reads as a real measurement.

6. Menu, the anchored overflow.
Hoje's row overflow had to be a Sheet at BOTH widths because the system has no anchored popover. A
bottom sheet is right at 412 and wrong at the wide width, where a row menu should sit against the
control that opened it.
Build one Menu that presents as a Sheet at 412 and as an anchored popover at the wide width: one
component, two presentations, the same pattern the conversation already uses. It must support a
destructive item, separated and last, and dismissal by scrim or Escape that changes nothing.

For each of the six, ship the .d.ts, the prompt.md and a specimen card rendering dark AND light. A
card is a SPECIMEN: no named habits, no real times, no product copy.

Reply with what you added, and name anything you could not build without a new token.
```

---

## Paste D3: the third design system round

Run 2026-08-18 from the gaps the Astra conversation build reported. Goes to the design system project
`918bd5d7-839c-4dd0-811b-4a8781f60507`. **Landed.** `BlockFrameItem` gained `control`, `proposed` and
`irreversible`; `BlockFrameProps` gained `risk`, `irreversibleLabel` and `confirmNote`; `Composer`
gained a `busy` state and a discriminated `atLimit` that cannot render without `limitReason`; both
shells gained an authorable conversation slot with `conversationOpen`.

```
Five component defects, found by the Astra conversation build. Fix them here, in the system. Do not
build or change a screen.

Add no new token, colour, radius, shadow or font.

1. BlockFrame IS THE WRONG SHAPE. This is the important one.
BlockFrameItem is { label, meta, status, statusLabel } and nothing else. A block therefore cannot
express a row that carries its own control, a row the machine proposed, or a row whose action cannot be
undone. Three of the five generative blocks are currently authored against BlockFrame's own class names
instead of its props, which is the component failing at its stated job of enforcing the rules once.
Give BlockFrameItem what the five blocks actually need:
  children or a control slot per row, so the habit row can carry its logging ring and the breakdown row
    can carry its frequency pill, instead of the screen reaching around the component.
  proposed, a per row boolean. A proposed row renders --fg-3 inside an inset dashed hairline and never
    takes the accent. This is the tenth state and it already exists as a component; a row must be able
    to say it is in that state.
  irreversible, a per row boolean. Confirmation is decided by reversibility, never by item count, so
    the frame must be able to show WHICH rows are the reason a confirmation exists. A batch of ten
    reversible rows and a batch of ten with one deletion in it look identical today.
Keep the existing five states, the pinned action row and the body scoped live region. They are right.

2. BlockFrame HAS NO RISK SLOT.
The operation card renders five typed outcomes (PendingConfirmation, StepUp, Denied,
UnsupportedByPolicy, Succeeded or Failed) and each carries a risk class of Low, Destructive or High.
With no slot for it, the risk badge is composed above the actions by hand. Add a risk slot to the
header, beside the count.

3. Composer's CONTRACT MANDATES AN INVENTED VALUE. Fix the contract, not just the string.
Composer.d.ts says atLimit "states the allowance and when it returns", and its own example is
"Voce usou as 5 mensagens de hoje. Elas voltam amanha."
No endpoint returns that moment. AiMessagesResetAt exists on User and reaches no DTO, so any time the
component states is invented by whoever writes the string. A component contract that instructs the
caller to invent a value is a defect in the contract.
Change the doc to: atLimit states the allowance ONLY, and carries no upgrade call to action. Make the
message a required prop when state is atLimit, with no default, so nothing can render a fabricated
return time by omission.

4. Composer HAS NO BUSY STATE.
Its states are resting, focused, composing, sending, offline, atLimit. The concurrent chat limit is
exactly one, so a second message while one is in flight is REFUSED, not queued. That is not sending:
sending means the person's message is on its way, busy means it was not accepted. Drawing them the
same tells the person their message is on its way when it is not.
Add busy: the send control is inactive and the refusal is stated inline. There is no queue and no draft
buffer.

5. ShellWide's CONVERSATION SLOT CANNOT BE AUTHORED.
Both shells take conversation as a node, which is right for a screen that merely has the panel open.
It is wrong for the screen whose SUBJECT is the conversation: that screen cannot author the panel as
markup and has to pass a pre built node. Let the slot take markup as well as a node, the way the other
slots do.

For each of the five, ship the updated .d.ts, the prompt.md and a specimen card rendering dark AND
light. A card is a SPECIMEN: no named habits, no real times, no product copy.

Reply with what you changed, and name anything you could not build without a new token.
```

---

## Paste 2B: rewire the conversation to the repaired components

Run 2026-08-18 after D3. **Landed**: the document fell from 64 KB to 51 KB with the same 21 states, and
reported that no block reaches for a frame class name any more.

```
Rewire "Orbit Astra Conversation.dc.html" to the design system's new props. Edit it in place. Do not
rebuild it, do not change the layout, and keep all twenty one states.

You reported that BlockFrame took items as label, meta and status only, so three of the five blocks were
authored against its class names instead of its props. The system has been fixed. Use the real props
now, and delete every local workaround they replace.

BlockFrameItem gained three fields:
  control       the row's own control, at the trailing edge before the status glyph. The habit block's
                logging ring and the breakdown block's frequency pill both belong here.
  proposed      the machine proposed this row. It renders through the Proposed component, at --fg-3
                inside an inset dashed hairline, and never takes the accent. The breakdown block's rows
                use this instead of drawing the dashed hairline themselves.
  irreversible  this row cannot be undone. The row carries a neutral mark, default DEFINITIVO.

BlockFrameProps gained three:
  risk              a node in the header beside the count. The operation card's risk badge goes here
                    instead of being composed above the actions.
  irreversibleLabel the mark's text.
  confirmNote       the line in the action row shown when ANY row is irreversible.

Composer changed in two ways:
  busy is now a real state, separate from sending. Use it. sending means the message was accepted and
    is in flight, with the accent send button. busy means it was refused because the concurrent limit is
    one, with a NEUTRAL inactive control and the refusal inline. Pass busyReason.
  atLimit now REQUIRES limitReason and it has no default. It states the allowance only. It must not
    state when the allowance returns, because no endpoint provides that moment.

ShellWide's conversation slot now takes authored markup plus a conversationOpen flag, so this document
can write the panel inline instead of handing over a pre built node.

One rule while you do it: if any block still reaches for a frame class name after this, say which and
why, rather than leaving it. That is the thing this round exists to remove.

Reply with which workarounds you deleted, and confirm no block authors against a frame class name.
```

---

## Paste ANSWERS: the six open questions, decided

Run 2026-08-18. Thomas answered all six. **Landed**, both documents edited in one turn.

```
Six open questions are answered. Apply them to the two documents that raised them. Edit both in
place, keep every state, and do not rebuild either one.

IN "Orbit Calendario.dc.html":

1. AN EMPTY ACCOUNT STILL PAGES.
You asked whether a month with no habits should page. It should. Keep the grid and its chevrons on an
account with zero habits, and keep the empty state's message inside the grid rather than replacing it.
The chrome stays consistent and a person can still move through the months.

2. THE MONTH RATE NOW HAS A DEFINITION. State it and hold it.
You computed the rate over the days that had something scheduled up to today, and flagged that as a
reading rather than a documented rule. It is now the rule:
  completions divided by scheduled OCCURRENCES
  counting only days that had something scheduled
  up to and including today in the CURRENT month
  the whole month for a PAST month, because every day in it has been lived
Do not divide by every day in the month, which makes the current month read low until the last day, and
do not divide by every elapsed day, which counts days with nothing scheduled as successes.
Write the definition into the document's report block so the next surface computes the same number.

3. THE DAY ARC IS THE EXACT FRACTION.
You asked whether to round. Do not round. The arc sweeps the true completed over scheduled proportion,
because a ring can draw any angle, so rounding buys no legibility and only loses the difference between
one of three and two of three.

IN "Orbit Astra Conversation.dc.html":

4. A REJECTED PREVIEW COLLAPSES TO ONE LINE.
When a person rejects a preview, replace the block in place with a single line naming what was
declined. Do not keep the block with spent actions, because a block whose actions are dead reads as
broken rather than as finished. Do not remove it entirely either, because a person scrolling back
cannot then tell a decline from a failure. Draw that collapsed line as part of the preview state.

5. STEP UP STAYS A HAND OFF. Confirmed, no change needed.
Your reasoning was right and it is now the decision: a credential field inside a chat is the shape of a
phishing screen. It also matches D69, which removed managing the subscription, the API keys and the
account from the chat surface entirely, so the block is an unsupported by policy outcome with one
action that opens Perfil, never a challenge.

6. A PARTIALLY FAILED BULK CREATE KEEPS WHAT IT CREATED. Confirmed, no change needed.
The created rows are real habits and they stay. The block marks them done and the retry is scoped to
the failed rows only. Offer no undo of the whole batch: bulk create carries a confirmation precisely
because it is not reversible, and an undo would contradict the reason that confirmation exists.

Reply with what you changed in each document, and nothing else.
```

---

## Paste D4: the fourth design system round

Run 2026-08-18 from the gaps the Calendario, Wrapped, overlays and auth builds reported. Goes to the
design system project `918bd5d7-839c-4dd0-811b-4a8781f60507`.

**Partially landed.** The canvas read the whole brief, judged it did not have the headroom to build nine
components plus their cards without stopping mid way and leaving the system half edited, and wrote
NOTHING that round rather than risk it. That was the right call. It then took its own split.

**Done:** item 3 the `Sheet` mount contract, item 4 `CapacityNotice` gaining a body, item 5 the
`Skeleton` grid variant, item 6 the `ListRow` read only variant, item 9 `EventRow`.

**Still on its todo list, for after the Thursday reset:** item 1 `DayCell` and `MonthGrid`, which is by
far the largest and has two consumers waiting; item 2 `OtpInput` gaining `onChange`, an error state and
disabled; item 7 `Pager`; item 8 `Columns`.

```
Nine components are still composed by hand inside individual screens. Every one was reported by a
build, not guessed. Fix them here so nothing composes them locally again. Do not build or change a
screen.

Add no new token, colour, radius, shadow or font. If one genuinely needs a new value, stop and tell me
which and why.

1. DayCell and MonthGrid. THE BIGGEST, because it has two consumers already.
Calendario composed a month grid and a day cell from an SVG arc, a disc and a ring, and said it belongs
in the system if a second surface ever needs it. A second surface does: Progresso.
Build DayCell with the four outcomes Calendario proved are the real ones:
  nothing scheduled  no ring at all, and no mark. This is an absence, not a state, and it must not
                     read as a failure.
  partially logged   an arc at the EXACT completed over scheduled fraction. Never rounded: a ring can
                     draw any angle, so rounding only loses the difference between one of three and
                     two of three.
  fully logged       a filled neutral disc. Completion is never the accent.
  today              current position, which is the accent's role 2.
Two more facts the cell must carry, both traced:
  loggable versus read only. Only the last seven days can be logged, so for most of a month the day is
    read only. The cell states that BEFORE it is tapped, never after.
  the accessible name carries the date and the outcome, because the ring alone is colour and shape.
MonthGrid lays DayCell out, takes the week start as DATA rather than assuming Monday, and never encodes
a day's state in colour alone.

2. OtpInput is display only, and two screens work around it.
OtpInputProps is { length, value, activeIndex } with no onChange, no error and no disabled, so both
Entrar and the step up screen compose the typing and the error beside it. That is the component failing
at its only job.
Give it onChange, an error state, and disabled. Its own doc already says pasting a whole code must
work, so state that the paste handler belongs to the component and not to each caller. The error is
stated beside the cells, never as a colour on them alone.

3. Sheet must say that it mounts fresh per open.
The overlays build fixed an overlay that opened scrolled away from its own first line, and reported
that the fix depends on the component being mounted fresh per open rather than kept mounted and hidden.
SheetProps carries `open`, which invites exactly the wrong implementation.
Say it in the .d.ts: a Sheet is MOUNTED WHEN OPEN and unmounted when closed, so its body always opens
at its first line and its scroll position can never survive a close. A caller that keeps it mounted and
toggles `open` reintroduces the defect this rule exists to close.

4. CapacityNotice takes one message and needs more.
Calendario had to pass a two line paywall as one node because CapacityNoticeProps is { message, action }.
Let it take a body as well as the message: the message states the limit, the body explains it when the
limit is not self evident. Keep every existing rule. It is a boundary and never an error, it uses
neutral tokens and never --status-bad, and it carries no upgrade call to action.

5. Skeleton has no grid variant.
Calendario composed its loading cells from a well and one keyframe. Add a grid variant that takes rows
and columns and holds the final dimensions, so the month does not reflow when the data lands. The
existing rule stands: shaped like the final layout, opacity pulse, never a shimmer and never a spinner.

6. ListRow has no read only variant.
Calendario needed rows for a day that cannot be logged and could not use CheckRow, because switching
everything off still draws a control that is not there. Add a read only variant to ListRow that draws
no control at all rather than a disabled one. A control that cannot be used should be absent, not
greyed.

7. A pager, for Wrapped.
Wrapped composed its segment row and its paging by hand. Build Pager: the segment row, the forward and
back controls, and the rule that the last page swaps the forward control for the closing action. It
never auto advances, because Wrapped is a close rather than a broadcast.

8. A column chart, for Wrapped's weekday page.
Wrapped composed seven columns from divs at radius 999 over a track. Build Columns: n labelled columns
over a track, values as a fraction, the label under each. One constraint belongs in the component and
must be stated: a column set is NOT a timeline, so it takes labels rather than dates and it must not be
drawn or read as a series over time.

9. An event row, for Calendario.
Imported calendar events were composed from a well, the calendar glyph and text. Build EventRow: a time,
a title, and the fact that it came from outside Orbit. It is not a habit row and must not be mistaken
for one, so it never carries a status ring and it is never loggable.

For each of the nine, ship the .d.ts, the prompt.md and a specimen card rendering dark AND light. A
card is a SPECIMEN: no named habits, no real times, no product copy.

Reply with what you added, and name anything you could not build without a new token.
```

---

# The review pass with Thomas, 2026-08-20

Run after the four remaining D4 components landed. Every paste below is a CORRECTION to a document
that already exists: edit in place, keep the state axis, never rebuild. Thomas answers per screen
through the ask-user tool, one screen per round.

**Two standing instructions he gave during this run, both binding on every later paste:**

1. **"my answer is always the same: the best approach, no unfinished features, nothing to reduce
   time, its the best implementation always."** Never offer him a cheaper or partial option. Take the
   best one and say what you took. A question only earns his time when both paths are the best
   implementation and they differ in what the product should be.
2. **Plain words, not design jargon.** He stopped a round to say it. Jargon makes him answer "i dont
   know" instead of deciding, so it costs a round rather than saving one.

## Paste D4-rest: the four components the previous round could not afford

Run 2026-08-20 into the design-system project `918bd5d7`. Landed: `DayCell`, `MonthGrid`, `OtpInput`
gaining a required `onChange`, `Pager`, `Columns`, plus the cards `lists/calendar.card.html` and
`forms/flow.card.html`. **The todo list is empty.** None needed a new token.

```
Continue with item 1, DayCell and MonthGrid. Then item 2 OtpInput, item 7 Pager, item 8 Columns, in
that order. The brief for all four is unchanged from the D4 paste you already have, so do not restate
it back to me. If this round only holds item 1 cleanly, build item 1 alone and say so rather than
starting item 2 half way. Two rules apply to all four. First, put the constraint in the .d.ts where a
type can carry it, not only in the prompt.md: DayStrip's scope union is the model, because it made a
frozen habit a type error instead of a review note. So DayCell's loggable versus read only, and the
fact that a Columns set is not a timeline, belong in the types. Second, add no new token, colour,
radius, shadow or font. If one genuinely needs a new value, stop and name it and why. Reply with what
you built and what is still on the todo list.
```

`DayCell` came back as a discriminated union on `loggable`, so a read-only cell takes
`onPress?: never` and a loggable one cannot omit it. That is **D71** applied rather than stated.

## Paste SHELL: navigation presence belongs in the shell, not in a screen's stylesheet

Run 2026-08-20 into `918bd5d7`, from a defect the Onboarding correction hit. Landed: both shells now
discriminate on `nav`, and with the sidebar off every sidebar prop is rejected.

```
One more, and it comes from a real defect the Onboarding document just hit.

Onboarding needs the navigation absent while the person makes the three decisions, and back at the
last step. Shell412 handles it: the tab bar is a slot, so passing nothing is enough. ShellWide does
not: it draws its sidebar unconditionally, so that document had to reach in from outside with a CSS
rule that hides a child by class name. That works and it is wrong: a screen is suppressing a shell's
own chrome by knowing its internals.

Whether navigation is present is a behaviour, and both platforms have to agree on it, so it belongs in
the shells as one prop rather than in a stylesheet.

Give ShellWide a way to render with no sidebar at all. Not a disabled sidebar and not an empty one:
absent, the same rule ListRow's read only variant follows. Then make it impossible to get wrong the
way DayCell does it: if the sidebar is off, items, activeId, onSelect, account and onPalette should
not be accepted, because none of them can do anything. If the sidebar is on, items and activeId stay
required. Do the same on Shell412 so the two shells state the rule the same way rather than one
stating it and the other relying on a caller passing null.

Say in both prompt.md files that a screen must never hide shell chrome from outside, and name this as
the reason.

Reply with what you changed.
```

## Round 1: Onboarding

Thomas's calls: drop the mic; restore the dead exit action; strip navigation during the flow. The
mic's label also claimed voice spends an Astra message, which is **false**: `ChatController.cs:107`
transcribes with no `TryConsumeAiMessage`. The canvas additionally caught a hole the paste created,
adding a `CapacityNotice` to the when step, since the removed composer had been carrying the at-limit
message.

## Round 2: Hoje

**The important one.** The canvas drew a seven-item overflow menu and dropped **Select**, which both
platforms ship: `apps/web/components/habits/habit-row-menu.tsx:57` and
`apps/mobile/components/habits/habit-row-menu.tsx:95` both render `common.select` calling
`onEnterSelectMode`. Thomas caught it, not the review. Restored as the eighth item, hidden while
selection is already on. Nothing in any decision removed it, so drawing the menu without it removed a
capability the app has.

The returning state also moved from nine days to **three**, which the report block had itself flagged
as a number with no code behind it.

## Round 3: Habit Create

**The collision between two of Thomas's own decisions.** D69 asked for a live preview as the person
types; D70 set the free allowance at five Astra messages a day. The canvas called Astra on every
sentence, so making five habits emptied the day. It was also a change from what ships:
`create-habit-modal.tsx:256`, `handleSuggest`, only runs on a button press, so creating a habit costs
nothing today.

Resolved as **local first**: the document's own regex parser runs on every keystroke and costs
nothing, Astra becomes an explicit fallback for a sentence the device could not read, and only that
fallback spends a message. A value the phone read is resolved; a value Astra read still wears the
proposed state.

Two more false claims fixed in the same paste: voice spending a message again, and a sentence saying
the end date and description have no live write path. Both are writable, at
`packages/shared/src/types/habit.ts:236,255` and `CreateHabitCommand.cs:15,162`.

## Round 4: Habit Detail, plus the Wrapped rewire

Three of the document's five recorded gaps were **stale**, written before design round D2 shipped the
parts that fill them: `forms/Checkbox` and `forms/CheckRow` exist, `lists/DayStrip` exists with the
`HabitDayValue` scope built exactly for a habit strip, and `Shell412` has a header slot.

The completion rate was drawn at 14 days against no endpoint. `HabitMetricsCalculator.cs:28,29`
computes 7 and 30. Thomas picked **30**, with the strip stretched to match so the number and the
picture describe the same period.

**Goals: the canvas was right and D69's wording is wrong.** `GoalType` has exactly two values and only
`Streak` derives, through `SyncStreakProgress`. A `Standard` goal has no derivation path, so its
number only moves by hand. The drawing stands; the gap is now ticket **`#340`** on the api.

## The XP and levels ruling

`Design spacious black and maximum contrast...` said whether XP and levels survive is "a RENDERING
question, decided by looking, not by argument", and it had sat deferred since 2026-08-05 because
nothing had rendered it. Progresso rendered it. Thomas looked, 2026-08-20, verbatim: **"i like it,
keep it."**

They survive as drawn: one row on Progresso, directly above the achievements grid and below the four
figures, in small type. The level number and its title on one line, the XP figure on the other end,
one bar beneath. No ring, and no cap past level 10, so past that the number keeps climbing and the
title stays the one level 10 carries. The achievements grid remains the last thing on the screen.

## The review pass finishes, 2026-08-20 (session 2)

The first session reviewed 11 of 21 documents. This one read the other 10 against the code, found ten
more defects, and sent the corrections. Two of the ten are the same class Thomas caught on Hoje: a
capability the app ships that the drawing dropped.

### The systemic one: every screen called a Composer that no longer exists

D2 and D3 replaced `Composer`'s `label` and `busyReason` props with one required `words` vocabulary
object. The design system shipped it. **No screen was ever rewired.** Seven call sites across six
documents still passed `label:`, two still passed `busyReason:`, and not one of the 21 documents
contained the string `words:`. The mirrored `_ds/` bundle inside the screens project predates the
change, so the preview still drew a placeholder and nothing looked wrong from the canvas.

Then the i18n audit closed in the design system and widened it. **Thirteen** components now take every
word they render from the caller, required, with no default in either language: `StatTile`, `EventRow`,
`NavHeader`, `BlockFrame`, `DayStrip`, `Composer`, `Pager`, `StatusRing`, `Skeleton`, `OtpInput`,
`Columns`, `HabitRow`, and both shells' own chrome words (`navLabel`, `paletteLabel`, `createLabel`,
`conversationLabel`). So the carry is not one prop on six screens, it is every screen, and each review
turn does its documents' words carry in the same pass.

The lesson is D71 from the other side. The type was right and the callers were stale, and nothing
checked. **A contract change needs its caller sweep in the same run**, not in a later one.

### The other nine

**Avisos dropped a capability the app ships.** Its `open` paragraph said a mark-all-read action is
something "no endpoint exposes today". `NotificationController.cs:44` is `[HttpPut("read-all")]`, and
both platforms ship the control: `apps/web/components/navigation/notification-bell.tsx:278-282` and
`apps/mobile/components/navigation/notification-bell.tsx:66,278`.

**Sobreposicoes drew the seven-item overflow menu Hoje already had corrected**, without `select`.

**Busca invents a fragment for two of its four match kinds.** The API returns
`SearchMatchField(string Field, string? Value)` and `HabitScheduleFilters.cs:255,257` pass **null** for
`title` and `description`. Only `tag` (`:260`) and `child` (`:284`) carry a value. The document quotes
a fragment on all four.

**Estados' `mock` paragraph is false.** It claims the version numbers and the reference code carry
`data-mock`. Only the countdown does; the versions are baked into a plain sentence.

**Pro and Assinatura both carried the pre-`#144` price**, 19,90 and 159,00 against the live 29,90 and
199, and both called billing a step up after the ruling that it is not one. **Pro's segmented-control
gap was stale** since `SegmentedControl` shipped.

**Celebracao and Offline both evict the composer**, riding the `composer` slot because nothing else was
pinned to the bottom, on screens where D69 says the composer is present.

**The widget and the habit list disagree on what overdue means.** `GetHabitWidgetQuery.cs:151-176`
keeps a private rule capped at `MaxRangeDays`; `HabitScheduleFilters.cs:99-100` delegates to
`HabitScheduleService.IsOverdueOnDate`, whose own comment says the point is a single definition. The
widget document was right to flag it.

### The design system closed three more gaps

- **`Toast` is built**, discriminated on `kind`. `lost` cannot be constructed without both its detail
  line and its action, because a toast that says a change was dropped and offers no way back is the
  worst state in the product. `working` draws its own three-dot mark so no caller passes a glyph,
  `done` is the only kind that leaves on its own, and only `lost` may carry `--status-bad`. Four
  screens had been composing one by hand.
- **`Sheet.open` accepts only the literal `true`.** The mount rule had been prose in the type comment
  and Sobreposicoes' own gaps paragraph asked for it to become a contract. Now `open={false}` on a
  kept instance is a type error and the only way to hide a sheet is to unmount it.
- **Both shells gained a `notice` slot**, pinned above the composer, so transient chrome never takes
  Astra's front door.

### Decisions recorded this session

- The Pro headline is the arithmetic, not the claim: **"Dez vezes mais Astra."** Thomas's reasoning is
  the rule: a paywall is the worst place in the product to say something the next line contradicts.
- **Billing is not a step up.** Two operations are: account deletion and API keys. The Stripe customer
  portal authenticates the person itself, so a code before opening it buys no security.
- **The weekday short form everywhere**, three letters, in both the page-4 sentence and the share card.
  The card's weekday line is its widest and breaks first.
- **Every past period stays reachable, permanently** (Wrapped).
- **A lapsed subscription names its reason when the reason is actionable**, phrased as a circumstance
  and never as blame; withheld entirely when it is not actionable.
- **The Play variant deep links to the specific subscription**, and the implementing ticket confirms
  the URL shape against Google's own documentation rather than assuming it.
- **The about screen drops "Feito no Brasil" / "Made in Brazil".**
- `--status-skip` **is kept, not deleted**, because three shipping components read it
  (`habit-row-check-circle.tsx:12`, `status-dot.tsx:28`, `bulk-action-bar-v2.tsx:163`). It dies with
  the row work in `#46` and `#50`, and no new surface may use it. Written into `DESIGN.md`.

### Tickets filed this session

- **`#343`** (api) the widget and the habit list disagree on what overdue means.
- **`#344`** (api) a lapsed subscription cannot say why it lapsed.
  `HandleWebhookCommand.cs:207-210` runs one `CancelStripeSubscription()` for both `"canceled"` and
  `"unpaid"`, `User.cs:249-254` keeps nothing, `SubscriptionDtos.cs:7-18` returns no reason, and there
  is no `invoice.payment_failed` handler anywhere.

### Tickets repointed at the canvas

`#42`, `#44`, `#46` and `#50` each carry a 2026-08-20 erratum naming its canvas document as the
authority over its own scope bullets. `#46` needed it most: its erratum said the title was stale, but
its scope section still instructed a worker to add `Habit.Color`, append a `color` field to the Zod
schema and tint the emoji, all of which D69 deleted. `#329`'s acceptance line naming the deleted
Satellite glyph is corrected to the orbital mark.

### Operational note

**Closing a browser tab kills the generation running in it**, and the server then holds a lock that
answers "your other tab is working on a request" for a minute or so. Two tabs pointed at the same
project also show the same chat rather than two, so a second tab buys no parallelism. Work one tab at
a time and never close it mid-run.

## Hoje's surfaces stop being thin, 2026-08-21

Thomas looked at the rendered Hoje surfaces the last round added and said the move habit drawer is
very simple, and the one in the shipping code is much better. He was right, and it was not only that
one. This round read every surface Hoje opens against its real component and raised each to what the
app already does. Two rounds ran, the design system first and the screens rewire second.

### The design system: two components could not draw the shipping overlay

**`RadioRow` became the system's one single-choice row.** A move target is a single choice, so it is
this component rather than a second one. It gained `leading` (a 30px slot the caller styles),
`depth` (20px of indent per level), `meta` (a mono tabular child count), `tag` (one uppercase word,
so the current parent says so on its own row), and a selected treatment of a 10 percent primary tint
plus a 1.5px primary ring.

**`disabled` without `reason` is now a type error.** A refused choice that does not say why is the
defect the round existed to remove, so the contract enforces it rather than the prose asking. That is
D71 applied a second time. A disabled row renders as a `div`, at 50 percent, with its reason under the
label.

**The shipping dashed border on the root row was NOT carried across.** In this system an inset dashed
hairline means `proposed`, and a destination a person picks by hand is not an inferred value. The root
row stays distinct by its Home glyph, its position above the eyebrow, and its words.

**`Input` gained `trailing`**, because the search field puts a glyph inside the field and there was no
slot for one.

### The mirrored `_ds` bundle went stale a THIRD time

The brief told the screens round to check the mirror before using the new props and to say so rather
than work around it. It did: the mirror lacked every new `RadioRow` prop and `Input.trailing`, both
already live in the source. **The whole mirror was re-synced from source rather than patched.** This
has now broken or nearly broken three rounds. Treat the mirror as stale by default and check it in the
same turn that uses a new prop.

### The fourteen surface gaps

**The move sheet** was the worked example and had the most missing: a search field once there are more
than eight destinations (`SEARCH_THRESHOLD = 8`) with its own no-results line, the root row as its own
thing above a destinations eyebrow, a real pre-order tree at 20px per level with a child count, a
current-parent tag, **selection that works at all**, all three refusals from `validateMoveTarget` each
on its own disabled row, completed one-time habits omitted unless a descendant is still active, and a
cancel plus confirm footer with a busy confirm. The fixture could not produce a depth refusal, so it
gained a third level (`house > bath > pia`, `estudos > ingles > anki`) and now produces a real one at
`maxHabitDepth = 5`.

**The reschedule sheet did not exist.** The document had a comment saying the instance date picker was
not drawn; there is no date picker in the app. `reschedule-sheet.tsx` is an Astra sheet that proposes a
whole new plan, in four states, and all four are drawn now.

**Three of five confirm dialogs were missing**, and a fourth had no entry point. Duplicate asks once
and copies everything the habit holds, rather than opening creation with the name filled in. Skip is
two questions and three bodies, decided by the habit: a one-off postpones to tomorrow, a flexible habit
spends a weekly slot, everything else advances the due date. **Log anyway** was unreachable because the
parent ring was inert; the parent ring is now a control, as `habit-row-trailing.tsx` has it.

**Open the sub habits was an expand, not a drill.** In the app it replaces the list with that parent's
own list, as a stack, with a back button, a mono done count, a back-to-all-habits line once the stack
is deeper than one, an add action, and its own loading, failed and empty states.

**Rows reorder by dragging** (`habit-list.tsx:443`) and the drawing had none. The two gestures are now
separated in words: hold and move reorders, hold still for 500ms selects.

**Both empty states had lost their actions.** No habits shows a body line and two actions, ask Astra and
create manually. Everything done shows a title, a line, and a route to tomorrow's habits.

**The detail had lost five things**: the interactive checklist with its progress, reset, clear and the
two questions those raise; the three numbers from `HabitDetailStatsGrid`; the reminders it actually
holds, read only; the end date; the linked goals; and the month calendar, which answers a different
question from the fourteen day strip and does not replace it.

**Templates are the person's own**, not a fixed four: save the current items under a name, delete one.
**Checklist items are editable text** and can be duplicated, not just removed.

**The last offset reminder cannot be removed**, because reminders on with nothing set is a lie. A fixed
time is added through a form with two chips and a time field, and the duplicate refusal says so.

**Two caps were not drawn**: twenty sub habits and five tags.

### What the round still admits

Two real component defects, both filed in the document's own gaps paragraph rather than worked around:
`HabitRow` nests its trailing slot inside the row body button, so the ring that logs is a button inside
a button and the component needs a real trailing action slot; and `ListRow`'s trailing slot rightly
refuses interactive controls, so the template sheet's per-row delete is composed by hand.

The state axis is now: default, no notice, read only, returning, select, batch failed, loading, no
habits, all done, error, offline, at limit, conversation, menu, list controls, move parent, parent
prompt, drill, drill failed, reschedule free, reschedule working, reschedule failed, reschedule plan,
duplicate, skip, postpone, log anyway, detail, create, create from chat, create proposed, create
unclear, create at limit.

### The plan becomes a switch, 2026-08-21 (later)

Thomas opened the reschedule sheet and said: reschedule requires Pro, but there is no selector to tell
it I am Pro, so I cannot see the real thing.

He was right, and the defect was structural. `CanvasControls` carried four fixed axes, mode, width,
state and locale, and no way to add a fifth. So a plan gated surface could only ever draw one side of
its own gate. `menuNode` hardcoded `phase: 'free'`, which meant the only reschedule reachable by using
the screen was the upsell; working, failed and the plan sat on the state axis where a reviewer had to
jump to them cold, never arriving through the flow that produces them. The document's own report said
it "draws the free account throughout", and that sentence was the defect.

**`CanvasControls` gained an optional `plans` axis.** No default: omit it and no segment renders, so a
screen with no plan gate does not grow a dead switch. It sits after `state` and before `locale`,
because state and plan are both about the account. The option words are the caller's, and "Pro" is
never translated.

Hoje passes `plans={['free', 'Pro']}`, defaults to free, and carries `plan` through like locale. Three
gates now draw from both sides, each traced: **reschedule** (`reschedule-sheet.tsx`) opens on the
upsell for free and on working for Pro, settling on the plan after a beat, the same transition retry
takes; **slip alert** (`slip-alert-section.tsx:21`) is the Pro badge row for free and the real switch
with its shield glyph for Pro; **add a sub habit** (`habit-list.tsx:702`) routes to the upgrade for
free and opens creation for Pro, in both the row menu and the drill. **The goal link stays ungated**,
because D70 moved goals out of the paywall and a gate a decision removed does not come back.

### The dead control the axis exposed

With the switch in, the row menu's add a sub habit rendered identically to every other item on a free
account and swallowed the tap. That is worse than the gate it models. The drill's own add action had
it right, because `ListRow` has a `trailing` slot and put the Pro badge there; a `Menu` item had
nowhere to put one.

**`Menu` items gained an optional `badge`**, one short word through the neutral `Badge` at the row's
inline end. The contract states it: a badged item is a **route, never a dead control**, so it stays a
real button, fires `onSelect`, and `disabled` is ignored when a badge is present.

All four plan gated taps now leave for `Orbit Pro.dc.html` through one shared route rather than three
different silences. **A gated tap that does nothing is a dead control** is now a rule the report
states.

### The mirror went stale twice more

Fourth and fifth time running. Both were caught only because the brief said to check the mirrored
`_ds` bundle before using a new prop and to say so rather than work around it. Keep that sentence in
every brief that depends on a contract change.

## The other twenty screens, 2026-08-21 (session 2)

Hoje's surfaces were raised in the last session. This one runs the same pass over the other twenty
documents: read each surface against the real shipping component and raise it to what the app already
does. A surface that exists but is thinner than the shipped one is the same defect as a missing one.

### The design system first: the two row defects the last round filed and did not fix

**`HabitRow` now has a real trailing action slot.** Its `trailing` node used to render INSIDE the row
body button, so the ring that logs a habit was a button inside a button and every screen composed
around it. The node now renders as a SIBLING of the body button, so a caller can never nest a control
in a button again, and `onLog` makes the ring a real 44px button with the same treatment the overflow
menu has. `logLabel` is REQUIRED with `onLog` at the TYPE level, a three way union on the props, not
a `console.warn`: that is D71 a third time. `onMenu` and `menuLabel` became the same kind of pair in
the same edit. `habit-row-trailing.tsx` in the app had it right all along, with the check circle a
sibling of the row body.

**`ListRow` now has a per row action.** Its `trailing` slot rightly refuses interactive controls, so
a list whose rows each need a delete had nowhere to put one and composed it by hand, twice. `action`
takes one object of `icon`, `label`, `onPress` and `danger`, renders as a real 44px sibling button
after `trailing` and before the chevron, and `label` is required by the object's own type so an
unnamed icon button cannot be constructed. `readOnly` with `action` is a type error: an action beside
a row that says it cannot be acted on contradicts the only thing `readOnly` says.

The caller sweep ran in the same turn, by script: 10 call sites, 2 `HabitRow` and 8 `ListRow`, none
broken by the new contracts.

### Habit Detail and Habit Create, reconciled with Hoje

These two ran first and together, because Hoje now draws its own detail and create states and the two
standalone documents draw the same surfaces. The standalone is the authority for the whole surface;
Hoje's state is that same surface reached from Hoje. Eleven disagreements were settled on the detail,
and the create document turned out to be drastically the thinner of its pair: four fields in its
disclosure against Hoje's ten real sections.

**The strip is 30 days on both.** Hoje drew 14, which has nothing behind it; Thomas ruled 30 on
2026-08-20 so the picture and the rate beside it describe one window.

**The frozen day left the habit's strip.** Hoje's detail drew a snowflake cell, composed by hand
precisely because `DayStrip`'s habit scope refuses `frozen`. `StreakFreeze.Create(Guid userId,
DateOnly date)` marks a user and a date and carries no habit id, so a snowflake inside one habit's
history asserts something the code cannot produce.

**The three numbers are the shipping three**, `HabitDetailStatsGrid`: the current streak or days free
on a habit to avoid, the longest streak, and the 30 day rate, which IS `monthlyCompletionRate`
(`HabitMetricsCalculator.cs:29`). The detail document had drawn the last logged day, a real field the
app does not show here. All three of the grid's states carry across, including the one centred no
data line rather than three zeros, and the whole grid renders only when the habit has a frequency or
is a general one.

**Two capabilities were found lost, the seventh and eighth of this run.** The shipping detail header
draws every TAG (`habit-detail-header.tsx`) and neither document drew any; they come back as plain
word pills with no colour dot, because colour as data is dead (`DESIGN.md:737`) and that half is a
decision. And `habit-form-fields.tsx:242` renders `HabitEmojiSelector`, which no document in the
project drew at all: the emoji well is now the control, opening a search that clears, the eleven
categories from `habit-emoji-options.ts` and a grid, on the detail and on creation.

**The detail's editable half is creation's field set.** `edit-habit-modal.tsx:262` renders the same
`HabitFormFields` creation renders, so the redesign's merge of detail and edit means one disclosure
holding creation's ten sections, not a smaller second version of four of them. The checklist is ONE
list with two jobs: interactive in the open part, creation's editable one while the disclosure is
open, never both drawn at once.

**The goal progress stepper is deleted from the habit detail.** The app shows linked goals as plain
rows here and D69 item 8 gave goals to Progresso. The reasoning that produced the stepper, only
`GoalType.Streak` derives and everything else moves by hand, moved to Progresso's round with `#340`.

**The reset rule got its condition.** `Habit.cs:186-190` resets the checklist on a log only when the
habit has a frequency, is not flexible, and the due date advances. A flexible habit's list does not
reset, and the line now says so only where it is true.

**Creation lost the microphone and gained the fallback ask.** The create field reserved 60px for a
mic; `use-speech-to-text.ts` is imported by the chat composer, the copilot rail and the composer
hook, and by nothing under `components/habits`, so the control was drawn for a capability this screen
does not have. Hoje's create, meanwhile, had no explicit ask Astra fallback and no cost line, which
is the round 3 ruling about what actually spends a message; it has both now.

Both screens carry the plan axis. The detail has three gates (reschedule, add a sub habit, the slip
alert), creation has one (the slip alert), and the goal link stays ungated on both sides.

### Perfil

Five capabilities were lost and three documents were unreachable. **The display name is editable**
(`edit-name-sheet.tsx`) and the report had written its absence up as if a decision caused it; nothing
did. **Theme is a real setting**, `themePreference` written through `/api/profile/theme-preference`,
with exactly two values (`themeModeSchema`), so without it nobody could choose light or dark
anywhere. **Show general habits on Hoje**, **export my data** and **fresh start** were all real and
all missing, and the export was already named in the screen's own composer chips.

**The API keys row was one row where the app has a section.** `advanced/page.tsx:81-110`: a Pro badged
heading, a lock row that routes for a free account, and for a Pro account the step up, the key list
with a per row revoke and its confirmation, create, scoped create and the MCP connection line. The
per row revoke is the first caller of `ListRow`'s new `action`.

**Three documents stopped being dead ends.** `PROFILE_NAV_ITEMS` is the app's own list of where
Perfil goes. Preferences and ai-settings fold into Perfil, achievements went to Progresso and the
retrospective into Astra's line, which accounts for four; the other four, Wrapped, about, the Android
widget and calendar sync, had no route anywhere in the project. A fifth group holds them, plus
support, which routes to the conversation because support runs through Astra's own tool.

`free` and `pro` came OFF the state axis in the same edit that added the plan axis.

### Progresso

It composes three screens and was thinner than all three.

**The streak gained the shipping figures**: the longest streak and the tier beside the current
number, the timeline's three word legend, and the freeze bank as `FreezeProgressCard` draws it,
banked over the ceiling of 3, used this month, and the days toward the next freeze as a bar. The
protected days list and the frozen banner came with them. The automatic freeze explainer stays
deleted, because D69 item 10 replaced it with a repair.

**One of the document's own claims was false.** Its open question said an abandoned goal cannot be
reopened because no restore path exists. `goal-action-footer.tsx:55` renders
`goals.detail.reactivate`, `UpdateGoalStatusCommand.cs:44` runs `goal.Reactivate()`, and
`RestoreGoalCommand.cs` is its own command. That is the second time this run a document asserted an
absence that was not real, and both were caught by checking rather than by reading the document. It
also claimed today can never be frozen, which contradicted the frozen banner the app mounts.

Goals gained their four status views, the filter empty case, reordering by dragging, the goal's own
progress history, the linked habits section, and the rest of the footer. Achievements are grouped by
category, as `achievements/page.tsx:96-99` groups them, rather than one flat grid. XP and levels stay
exactly as Thomas ruled on 2026-08-20.

### Calendario

**One view where the app has four.** `apps/web/app/(app)/calendar/page.tsx:56` declares
`'month' | 'week' | 'range' | 'agenda'` and `:253-260` builds the switcher; the drawing had month.
Week over the time grid, range with its own header, and agenda are all real components. **The agenda
is drawn at both widths**, against the app, which folds it back to month below the breakpoint
(`:77,:259`): a whole view is not one of the three sanctioned layout shell divergences, so that gate
is a parity defect the code should lose, and the report says so.

Also missing and now drawn: the three shipping tiles (best streak, total logs, missed, `:244-251`)
against the two the drawing had invented, the recurring toggle, paging by swipe as well as by the
chevrons, the day panel's route into Hoje (`calendar.goToDay`), the inline day panel at the wide
width, and **the bad habit vocabulary**: `calendar-day-detail.tsx:74-79` reads a completed bad habit
as indulged and a missed one as resisted, so the drawing's day panel had been saying the opposite of
what the app says for those rows.

The gaps paragraph also carried a stale claim, that neither `ListRow` nor `DayCell` has a trailing
status slot. `ListRow` has one and its contract names this exact case.

### The composer gains the half it was missing

A second design system round, because the conversation uses the same `Composer` the shell does and
the shipping `chat-composer-bar.tsx` does three things it could not.

**Voice**, as `onVoice` with a required `voiceWords` pairing and two new states, `recording` (the
field replaced by a live row, a running mono time, the stop control carrying the accent) and
`transcribing` (the same row, the stop inactive and neutral). The contract states that **speaking
spends nothing from the daily allowance**, with `ChatController.cs:107` beside it, so no caller
writes a cost line next to a microphone the way two screens did before.

**Attachments**, as `onAttach` with a required `attachWords` pairing, a file and an image control
that go unavailable while offline, and a pending tray with a named remove per item. `attachments`
without `onAttach` is a type error.

**Offline gains its way back**, `onRetry`, valid only in the offline state, and passing it narrows
`words` to require the retry word.

Every new vocabulary is its own object tied to its own handler, so no existing caller broke and no
sweep was forced.

### Astra Conversation

**A whole block was missing.** `goal-list-card.tsx` is real, rendered by `message-bubble.tsx:165-166`
off `message.goalList`, and `[[orbit:goals]]` is D69's third directive token. The document drew five
blocks and not the sixth. It now draws goals through the same `BlockFrame`, with its percentage, its
progress line, its deadline and its own empty line, and a goal row opens the goal exactly as a habit
row opens the habit (`chat/page.tsx:208,214`).

The composer gained all three shipping capabilities above, and **the empty state arrived**: the
title, the prompt over the suggestions, and `aiDisclosure.notMedicalAdvice`, the one line saying what
Astra is not, at `--fg-4` and never styled as a warning.

**At limit free and at limit Pro came off the state axis**, replaced by the plan axis and one at
limit state that reads its ceiling from the plan. The report states why this screen carries a plan
axis and still has no upgrade route anywhere: Astra never pitches the paywall, so the axis exists to
draw the two ceilings honestly and not to add a gate.

### Busca

**The palette has a second page and the drawing had none.** `command-menu.tsx:15` declares
`type CommandPage = 'log' | 'skip'`: choosing log or skip does not act, it opens a second page
listing the habits to act on, with a back out of it (`:155`) and the page's own label in the field's
chrome (`:113`). The drawing's single "log everything for today" was an action the palette never
performs.

Four groups, not three (`:194,:209,:224,:122`), with the habit group's loading skeleton; the row of
keyboard hints rather than one escape line; and the empty line the app draws when nothing matches at
all. **Create goal does not come across**, because D69 item 9 removed the create goal entry, and that
half is a decision.

The search field is now `Input` with its `trailing` slot on both surfaces, so the search field is one
object across the product and the gap claiming forms has no search field is gone.

### Avisos

The drawing could read a notification and do nothing else with it. Three capabilities came back.
**A notification opens into its own sheet** (`notification-detail-modal.tsx:54-64`): the timestamp
eyebrow, the body in full, and view, mark as read and delete. **A row can be deleted and the delete
can be undone**: `notification-bell.tsx:186-192` does not delete, it queues through
`lib/pending-notification-deletes.ts`, hides the row at once and raises a toast whose undo cancels
it, which is exactly the shape `Toast` exists for. **The whole list can be cleared**, asking first.

### Sobreposicoes

Its row menu was the old eight item list, two rounds behind Hoje's, which had been corrected against
both platforms. It now draws Hoje's menu item for item, including **move parent**, **reschedule**
only on an overdue row (`habit-list.tsx:906`) and **open sub habits**, with log and view details
still absent because the ring logs and the row body opens the detail. Add a sub habit carries
`Menu`'s `badge` and routes on a free account, so the document gained the plan axis.

### Assinatura

**One line in it was false.** It said the receipts stay with the provider.
`upgrade/billing-dashboard.tsx:190-238` lists the invoice history IN the app, with a download on each
row, four reasons (created, cycle, updated, manual) and three statuses (paid, open, void). The
history is drawn now, with the download as `ListRow`'s per row action.

Also lost and now drawn: the payment method with its card, expiry and change action (`:133-159`), the
**canceled** and **past due** plan states with their badges and their own line (`:105,:108,:115`),
the usage figure the subscription buys (`upgrade/usage-stats.tsx`), a billing LOAD failure with its
retry (`:81-89`) which the document's own report said was a different thing from a failed portal and
then did not draw, and the Play variant's renewal date.

The lapsed state's subscribe again button was wired to a no-op. It leaves for `Orbit Pro.dc.html`
now, and the report says plainly that Pro and Assinatura are the two halves of one route
(`upgrade/page.tsx:95` against `:123`), which is why neither grows a plan axis.

### Pro

**The trial state said something the line above it contradicted.** The trial notice states that the
50 messages a day are already on, and the display headline directly under it offered ten times more
Astra. That is exactly the defect Thomas ruled on for the headline on 2026-08-20. The app has two
headings for this reason (`pricing-section.tsx:49`), and the trial state now carries its own: the
arithmetic from the other direction, what happens when the trial ends.

The eyebrow has three variants in the app and one in the drawing (`:40-47`), and the missing one is
**the last day**, its own string rather than a count of one. It is now on the state axis.

Five reassurance lines were simply lost, and two of them are what a person looks for before they pay:
the promise, the trust line (shown only outside a trial), **cancel anytime**, **the renewal note**,
and the annual tier's hero line.

Three places where the app and the drawing disagree stay as drawn, because a decision put them there:
one CTA verb on every tier, free as a link rather than a card, and no feature matrix.

### What the mirror did this session

It went stale a **sixth** time (both row contracts) and a **seventh** time (the whole composer voice,
attachment and retry contract). Both were caught only because every brief carried the sentence
telling the round to check the mirror before using a new prop and to say what it found. Five later
rounds checked and found it clean. Keep the sentence in every brief that depends on a contract
change.

### Three false absences, all found by checking rather than by reading

A document asserting that the code cannot do something has now been wrong three times in this run:
Avisos claimed no endpoint exposes mark all read, Progresso claimed no restore path exists for an
abandoned goal (there are two) and that today can never be frozen (the app mounts a banner for it),
and Assinatura claimed the receipts live with the provider (the app lists them in the app). None of
the three was caught by reading the document. All three were caught by opening the file the sentence
was about. **Treat every "the code does not do this" sentence as a claim to verify, not as context.**

### Where this session stopped

Twelve documents landed, plus two design system rounds: Habit Detail, Habit Create, Hoje, Perfil,
Progresso, Calendario, Astra Conversation, Busca, Avisos, Sobreposicoes, Assinatura and Pro.

**Nine documents still need the pass**, in this order:

1. **Onboarding, Wrapped.** Wrapped is blocked as a feature by `#341` but its drawing can still be
   raised. Onboarding was corrected in round 1 and is the least likely to be thin.
2. **Entrar, Verificacao, Sobre, Estados, Celebracao, Offline, Widget Android.** Estados carries a
   known false claim already recorded: it says the version numbers and the reference code carry
   `data-mock` when only the countdown does.

Two component defects were closed this session (`HabitRow`'s trailing action slot, `ListRow`'s per
row action) and one whole contract was added (`Composer`'s voice, attachments and retry). No
component defect is open. That is not a reason to assume the nine remaining documents need none: the
pattern all session has been that a screen needs a contract the system does not have yet, and the fix
belongs in the design system project first, as its own turn.

**The recipe that worked**, for whoever runs the next session: read the screen document through the
MCP, list every surface it draws, open the shipping component behind each one, and write the brief as
a list of what the app has and the drawing does not, each item with its file and its line. Then a
short list of what stays and why, then the rules. Put the mirror sentence at the top. Run
`node tools/check-dashes.mjs --files <brief>` before sending and read the document back through the
MCP afterwards rather than trusting the self check, which reported nothing three times on 2026-08-21.

## The last nine screens, 2026-08-21 (session 3)

The same pass over the nine documents session 2 left: Onboarding, Wrapped, Entrar, Verificacao,
Sobre, Estados, Celebracao, Offline and Widget Android. Read each surface against the real shipping
component and raise it.

### The design system first: two contracts the screens needed and did not have

**`Input` gained its multiline half.** Three screen documents needed a multiline field and none
could ask for one, so each composed a raw `<textarea>` with hand written token styles: Hoje, Habit
Create and Onboarding, twice each, six hand built fields for one missing prop. Two of them also draw
the words the schedule parser consumed, marked inside the person's own sentence, by painting an
aria-hidden `<p>` under a transparent `<textarea>` with every font, size, line height, padding,
radius and wrap declaration duplicated so the marks land under the right characters. One divergent
value slides the marks off the words silently. That is D71 again: the rule lived in nobody's
contract.

`multiline` is a `true` only literal, the way `Sheet.open` is. `rows` and `marks` are valid ONLY
with it, and `marks` without `multiline` is a TYPE ERROR. `marks` takes `[start, end]` ranges into
`value` and requires `marksLabel`, because the mirror is aria-hidden and without a name the marks
exist for a sighted person and for nobody else. A range past the end of `value` is clamped rather
than thrown. `maxLength` sits on the base, with the app's own `MAX_HABIT_TITLE_LENGTH` cited beside
it and no counter drawn. The mirror and the field are ONE box from one style declaration, laid out
from inside the component, so no caller can set one and not the other. The scripted sweep found 8
`Input` call sites and 0 broke.

**Both shells typed their pinned bottom slot for the two shapes it really has.** The `composer` slot
said "the composer and nothing else" in prose, and Onboarding already broke it at both widths,
because a flow with no composer still needs a pinned forward action and the shells offered no other
way to pin one. D69 says the composer is present on every DESTINATION, and `nav: false` already
means "a flow that owns the whole screen". So with `nav` on the slot is `composer` and `action` is
rejected; with `nav` off the slot is `action` and `composer` is rejected, because a flow that owns
the screen has no front door to pin. `notice` keeps working on both, which is what it exists for.
The scripted sweep found 6 shell call sites and 0 broke.

### Wrapped

**The entry screen was missing entirely.** `wrapped/page.tsx:32-41` renders a cover BEFORE the
player and `wrapped-cover.tsx` is the whole of it: the ring motif, the title, the period chips, one
Start action, and four states around it, loading, failed with a retry, empty, and ready. The drawing
opened straight on page 1, so it could not show the load failing, could not show a period with
nothing in it, and had nowhere to choose the period. **The period was pinned to one month** and
`RECAP_SHARE_PERIODS` is week, month and year, chosen on the cover, so the eyebrow, the period line
and every page's words now follow the choice. The API knows FIVE periods, adding quarter and
semester, and two have no chip anywhere in the app; that is now an open question rather than an
invented chip.

**Two real pages were missing and the page count was a constant.** `buildWrappedSlides:28-46` builds
intro, completions, active days, consistency, streak, the top habit when the period has one, and
share. Active days carries the completion rate in its line. The top habit is the only page in the
whole screen that names one of the person's own habits, and it exists only when the period has one,
so the count is seven or eight rather than five and `Pager` takes the real one. The streak page
draws TWO numbers, the best streak as the figure and the current one in the line.

**The player could not be driven the way the app drives it.** Tap zones over the page, a left zone
disabled on the first page and a right zone twice its width, both gone on the last page so the share
is never under an invisible button; the arrow keys and Escape; and focus landing on close when the
player opens. `Pager` stays at the foot carrying the same paging, which is the recorded decision, and
the zones and the keys sit on top of it as one action.

**The save is not a fallback.** `wrapped-slide.tsx:236-260` draws share and download SIDE BY SIDE,
with download becoming the filled action where the platform cannot share files. The drawing had
treated saving as a state reached only when the share sheet was unavailable.

**The share IS the referral loop and the drawing never said so.** `GetRecapQuery.cs:57` builds the
shared link as `{BaseUrl}/r/{referralCode}?recap={period}` and generates the code if the person has
none. The card carries a picture and the share carries an invitation.

**One sentence in the report was false and it decided the plan axis.** It said the retrospective's
Pro gate stood between people and Wrapped. That gate is real, `PayGateService.cs:141`, and it has
exactly ONE caller, `GetRetrospectiveQuery.cs:58`. Wrapped calls the recap, whose handler carries no
gate at all and whose own comment says "Free / ungated", `GetRecapQuery.cs:28`. Wrapped is free
today, so it carries NO plan axis, and access outside the Pro gate came off the `#341` list because
it is already true. That is the fourth false claim of the run.

**Empty and thin are two different things.** `isRecapShareEmpty` is no completions AND no active
days, and the app refuses to start the player at all in that case, so empty lives on the cover and
thin runs the player.

**Three documents disagreed about how a person reaches it.** This report said it had no entry; the
Perfil round added a row on the grounds that it had no route anywhere; the app reaches it from the
retrospective surface with its back going to the profile. All three routes are stated now, with the
2026-08-20 decision named as the authority for which is primary.

### Onboarding

**Three ways out of the flow were missing.** `onboarding-flow.tsx:299-301` renders a back link on
every step after the first and `:83-95` walks the flow backward. `:265-267` renders a skip on every
step except the last, and `:130-134` sends it to the end. `:248-264` draws the mono position
counter, `:289` the dots and `:290-296` an sr-only `progress` element. The drawing had none of the
three, and its own test 1 asserted the flow could not end without a habit, which described a trap:
the first step's action is disabled while the field is empty, so a person who did not want to type a
habit had no way out of the app's first screen. All three came back, with the counter over three
steps rather than eight, and test 1 was replaced by one the app can pass.

**The flow has two entrances and two endings and the drawing had one of each.** Signed in it is an
overlay over the app (`(app)/layout.tsx:380`); signed out it is a route (`onboarding/page.tsx:13`)
where every answer is buffered on the device (`onboarding-actions-context.tsx:96,133`), the last
step's words become the save your plan words (`onboarding-complete.tsx:102-109`), it routes to
`/login?from=onboarding` (`:134`), the habit is written to the account after sign in
(`use-onboarding-flush.ts:38`), and the first step carries a sign in link
(`onboarding-welcome.tsx:141-145`). That is the whole path from the landing page. It is a state now,
and its ring is not a control, because no habit exists on the server yet.

**Signed out, Astra cannot read the sentence at all.** `ChatController.cs:18` is `[Authorize]` for
the whole controller, so the pre auth flow has no model call and the schedule is not proposed: the
day pills and the time field carry the second decision, which is the shape the drawing already had
for `at limit`. Two different reasons reach one drawing.

**Creating the habit can fail and the permission ask has four outcomes, not two.**
`onboarding-create-habit.tsx:95-99` catches the failure, `:74-85` validates, `:182` caps the title.
`apps/mobile/hooks/use-push-notifications.ts:418-440` is the real permission shape: granted,
refused, `canAskAgain === false` where the system will not ask again, and a registration that fails
after permission was given; `push-prompt.tsx:46` does not ask at all once the browser has denied and
`:101-103` sets a retry hint. Three states were added, and in two of them the drawing's allow button
had been a control that could not do anything.

**The shell was drawn by reaching into it, twice.** The document hid the sidebar with a stylesheet
rule matching a class name, and rode the composer slot with each step's forward action. Both shell
contracts now cover it: `nav={false}` for the three decisions and `action` for the pinned forward
action, with `items`, `activeId`, `navLabel`, `account` and `onPalette` rejected rather than passed
as null. At the last step navigation returns, which makes it a destination, so its action moves into
the content column: the type is what settles that, not prose.

The report's mock line undercounted by one, and its claim that the feature guide was deleted was
taken out, because the guide is About's surface and not onboarding's. No plan axis: D69 item 17 says
there is no paywall in onboarding at all.

### Entrar and Verificacao

Both had their numbers right and both were missing whole halves of what ships.

**Entrar gained the referral banner** (`use-login-flow.ts:60`, `login-sections.tsx:93-133`), which is
where a shared Wrapped link lands, with words that promise nothing to an existing account because
the referral applies only to a new one (`VerifyCodeCommand.cs:100-101`). It gained **the arrival from
onboarding**, where the heading, the subtitle, the waiting habit count and the button's word all
swap; **the arrival from a link**, which opens on the code step with the six digits already filled
(`use-login-flow.ts:78-86`); **the legal line** (`email-step.tsx:91-110`); **the confirmation that a
code was sent** (`:117,:174`); **the returning deleted account** being told it is back
(`login-form-helpers.ts:110-112`); **a send failure** that is one shape for a rate limit, a server
error and a network error alike; and **a Google failure**.

**One open question was answerable and its answer changed the drawing.** It asked whether the lock is
per identity or per device and withheld the change of address while locked. `VerifyCodeCommand.cs:90`
keys the counter `verify-attempts:{email}` and nothing else, with the 15 minute window at `:87`. The
lock is per email address, so changing it works and the action stays. That is the fifth false
absence of the run. The report also records a defect that stays in the code rather than the drawing:
`use-login-flow.ts:96-99` shows one failure twice, inline and as a toast.

**Verificacao had no success state, and success is the whole point of the screen.** The confirm does
not delete: `ConfirmAccountDeletionCommand.cs:41-51` deactivates with a date seven days out, or seven
days after the plan expires for Pro (`:44-46`), capped at 30 (`AppConstants.cs:44`), and returns that
date. Two states now carry it, with the date, the fact that signing in before then brings the account
back, and the sign out the app performs.

**Its exhausted state offered the one action that cannot work.** The attempt counter is
`delete-attempts:{email}` over a rolling 15 minutes (`ConfirmAccountDeletionCommand.cs:68,:64`), so a
new challenge does not restore the attempts and starting again from Perfil inside that window hits
the same wall. The state now states the wait and offers no action that would be refused. Its open
question, whether the attempts are per challenge or per hour, was answerable and the answer is
neither: per email address, over 15 minutes. That is the sixth. Two dead controls, the cancel link
and the route back, became real routes, and the challenge now arrives with its 60 second cooldown
already running, because the screen is opened by the send.

### Sobre

**The feature guide was deleted citing a decision that does not exist.** The report said D69 deleted
it. D69 does not mention the feature guide anywhere; its item 17 deletes the onboarding tour, the
preference quiz and the goal survey. The guide is About's own drawer, opened from About's first row
on both platforms (`about/page.tsx:58-63,:84`; `apps/mobile/app/about.tsx:63-68,:87`). That is the
seventh false claim of the run, and the row is back, first, restoring the shipping order.

**Two facts had no producer.** The app shows the version and nothing else, from `packageJson.version`
and `Constants.expoConfig?.version`; there is no build number on either platform, so the build line
is gone. **The support success invented a reference number**, and nothing returns one, so it is gone
too. The support screen gained the draft that survives leaving the screen
(`support/page.tsx:46-54,:23-39,:75`) and the offline refusal (`:57`), and its message field became
`Input` with `multiline` and six rows, which is exactly what the app uses.

A second pass fixed two more: one guide entry said tapping the widget's ring logs the habit, which
contradicts both the widget's code and Thomas's 2026-08-20 decision, and two guide subjects had been
dropped whose surfaces are alive, the MCP and API keys subject and the XP, achievements and streak
freeze subject.

### Estados

**The recorded false mock claim was already fixed**, and checking said so rather than changing
anything: all four numbers carry `data-mock`.

**The update gate has two independent sources and the drawing knew one.** The server gate is the one
it had: `MinimumVersionMiddleware.cs:26,:41,:53-63` answers 426 with `minVersion`, web draws a
dismissible banner and mobile a non dismissible blocker. The store check never touches the API:
`use-version-check.ts:41` asks Google Play and `:49` the iTunes lookup, and two more mobile shapes
come from it, a forced update at Play priority 4 or higher (`:88`) which is Play's own screen, and a
**soft update** that is dismissible (`version-update-drawer.tsx:77`), now its own state. The report
also records that the server gate is fail safe and currently OPEN: an unparseable header is allowed
and the floor defaults to `0.0.0`.

**The throttle response says more than the report claimed.** `DistributedRateLimitAttribute.cs:73-97`
sends `Retry-After`, `retryAfterUtc`, `limit`, `count` and `requestId`. The screen still shows only
the countdown, but now as a choice with its producer named, and the open question about backgrounding
is answered by `retryAfterUtc` being absolute. The reference code's producer is named, the not found
mark divergence from the shipping satellite glyph is stated, and every dead action became a real
route or a real state change.

### Celebracao and Offline

Both confirmed the `notice` slot fix held: the panel and the toasts ride `notice` and the composer
stays beside them.

**Celebracao said the celebrations never queue, and they do.**
`packages/shared/src/stores/celebration-queue.ts:70-80` gives every kind a priority, `:82` orders by
it, and `:184` queues behind whatever is active. Its open question said the event stream cannot order
them; the order has been in shared code all along. That is the eighth. A `queued next` state draws
it, and closing the first panel promotes the second. **Four triggers is confirmed as a decision**, not
an omission: `CelebrationKind` has five and D69 item 11 names four, so the achievement panel stays
out and the report says so, with `StreakMilestoneTiers` named as 7, 14, 30, 90, 100 and 365.

**Offline called every queued change a log, and the queue holds about fifty mutation types**
(`packages/shared/src/types/sync.ts:3-13`), from creating a habit to changing the time zone. The
toasts count changes now. A missing state came back: `sync.ts:37` has `pending`, `syncing` and
`failed`, and a failed change stays IN the queue and retries, which is the common case and must never
read like the dropped one. **Its open question about how long a change is held is answered in the
client**: `maxRetries` is 3 and `offline-mutations.ts:342-346` drops on the third failure. That is the
ninth. One refusal sentence is now marked web only, because `createHabit` is a queued type on mobile.

### Widget Android

`#343` stays flagged exactly as it was. Six things the widget does were missing: **the header's second
line**, the completed over total figure that is the surface's only progress number and is empty until
the first sync (`OrbitWidgetProvider.kt:102-107`); **the tomorrow day label**
(`OrbitWidgetService.kt:368-372`); **a bad habit row**, which is drawn and never counted, because a
slip is not a completion (`:377-386`); **the whole card as one tap target**, not only a row
(`OrbitWidgetProvider.kt:150-155`); and **the refresh failing** (`OrbitWidgetService.kt:340-348`).
The signed out state had a Sign in button the widget does not have and cannot honour; the app's own
words are "Open Orbit to sign in" and the card is the only control.

**The document's central claim was half wrong.** RemoteViews cannot read a CSS custom property, but
the widget still FOLLOWS Orbit's tokens: the app syncs the resolved colours into shared preferences
and the widget reads them back per scheme and mode (`OrbitWidgetService.kt:148-153`). The literals are
the flattened results of that sync, and the hardcoded map is only the first paint, which is STALE: it
still carries the pre redesign purple, so a freshly added widget paints the old brand until the app
syncs. That is recorded as work the implementation owes.

### What the mirror did this session

It went stale an **eighth** time, and the sentence telling each round to check it before using a new
prop and to say what it found caught it again. The round re-synced the whole bundle and verified both
new contracts before use. Five later rounds checked and found it clean.

### Six more false claims, all found by opening the file

The count is now nine across the run. This session added: Wrapped's Pro gate (the gate's one caller
is the retrospective), Entrar's per device lock (it is per email), Verificacao's unanswerable attempt
window (per email over 15 minutes), Sobre's D69 deletion of the feature guide (D69 never mentions
it), Celebracao's unordered event stream (there is a priority queue in shared code), and Offline's
unbounded queue (three retries, then dropped). None was caught by reading the document.

### Where this run stands

All 21 screen documents have now had the pass. Three design system contracts landed this session:
`Input`'s multiline half, and both shells' pinned bottom slot typed for a destination and for a flow.
No component defect is open.

**Verification:** every one of the nine was read back through the MCP after its round. The canvas
self check stayed silent on Onboarding and on Entrar, which is why the read back is the protocol and
not the self check.
