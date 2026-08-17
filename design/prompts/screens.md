# The screen prompts, paste ready

> **At a glance** - copy a fenced block below and paste it into the chat of the Claude Design
> **screens** project. Nothing here needs composing. Written 2026-08-17, after the design system was
> repaired and the decision was taken to build screens next and fix the system on demand.

**Project**: `https://claude.ai/design/p/87c2d1c5-d02d-4840-98e8-3abc270d2928`

**Model**: `claude-opus-4-8`. It is the strongest that surface offers. There is no Opus 5 entry and the
only alternative is Fable 5.

## Two facts about that project before you start

1. **Its pinned copy of the design system is current.** `_ds/orbit-design-system-918bd5.../` already
   carries the 2026-08-17 tokens, including `--primary-hover` at 94 percent toward the canvas and the
   canvas-only note on `--primary-soft`. It tracks the design system project automatically.
2. **It holds 12 documents from the first run and every one of them is product wrong.** They are a
   record, not a target. Each wave below replaces the documents it owns. Do not read them for content.

## The order

| paste | builds | replaces |
|---|---|---|
| **0** | the standing brief | paste once, first, on its own |
| **1** | Hoje | `Orbit Today.dc.html` |
| **2** | the conversation and the five blocks | `Orbit Astra Chat.dc.html`, `Orbit Astra Cards.dc.html` |
| **3** | habit creation, habit detail | `Orbit Habit Form.dc.html`, `Orbit Habit Detail.dc.html` |
| **4** | Calendario, Progresso | `Orbit Calendar.dc.html`, `Orbit Goals.dc.html`, `Orbit Goal Detail.dc.html`, `Orbit Retrospective.dc.html` |
| **5** | onboarding and auth | `Orbit Onboarding.dc.html`, `Orbit Auth.dc.html` |
| **6** | Perfil and upgrade | new |
| **7** | the long tail | new |

`Orbit Insights.dc.html` is deleted in paste 0, because the route no longer exists.

**One paste per turn.** The canvas builds one document per turn whatever the prompt asks for, so give
each paste its own turn and check the result before the next.

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

WHAT ORBIT IS
Orbit is an AI habit tracker for overwhelmed adults who cannot keep a routine. Astra is the AI, and it
sits on the primary path: it starts a routine, changes it and acts on it. Positioning: an AI that
tracks habits, not a habit tracker with an AI. Never write that contrast as copy.
Primary market is Brazilian Portuguese. "Orbit" and "Astra" are never translated.

THE INFORMATION ARCHITECTURE, SETTLED AND NOT OPEN
Astra is a layer with a front door, never a destination. There is no Astra tab and no bubble. ONE
persistent composer lives in the shell, pinned to the bottom of the content column, on every primary
screen, carrying 3 to 6 suggestion chips built from live state. The Astra glyph at the head of that
composer is a real button labelled "Abrir conversa", and it is how a person who never types still
finds the conversation. The conversation is a full height overlay at 412 and a side panel at the wide
width: one feature, two presentations, not a shell divergence.

The shell is four destinations on both platforms: Hoje, Calendario, Progresso, Perfil. Bottom tab bar
on mobile, sidebar on web. No drawer and no hamburger. The web sidebar carries navigation and identity
only: the lockup, the search control, the four destinations, the one filled create action, the account
row. There is no right stats rail; the width it held goes to the conversation panel.

The core loop is never mediated. Marking a habit done is one tap, optimistic, deterministic, offline
tolerant, no model call, ever. Saying "I did X, Y and Z" to Astra is a different interaction with the
same outcome and it does go through the model, as one bulk operation. Both exist and neither replaces
the other.

Astra speaks first. A proactive line sits at the top of Hoje with what Astra noticed and one action.
It replaces itself: no dismiss control, no persistence, and when Astra noticed nothing the slot is
absent rather than empty.

Confirmation is decided by reversibility, never by item count. Bulk log and bulk skip carry none.
Bulk create, bulk delete and anything that removes data carry one.

SURFACES THAT NO LONGER EXIST, SO DRAWING ONE IS THE DEFECT
The /insights route. The retrospective's empty, locked and no-data screens. Six of the seven
celebration overlays. The separate onboarding, tour, feature-guide and push-prompt systems. A
create-goal entry in navigation. The stats rail. The social layer. The colour-scheme picker. AI memory.
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
Spacing is 0 4 8 12 16 24 32 48 64 96 and nothing between. Gap, never a sibling margin.
The accent #C4530F has four roles and no fifth: next action, current position, progress toward
something UNFINISHED, one element in the mark. It NEVER marks completion. One filled action per view.
--primary-soft is accent TEXT on the canvas ONLY. On a card, field, well, overlay or hovered surface,
emphasis is a weight step, not a hue.
Hover DARKENS the accent fill. It does not lighten. There is no headroom to lighten it.
There is no habit colour palette. A habit is told apart by its emoji, its name and its ring.
The four internal schedule type names never render in either locale: not "recorrente", not "flexivel",
not "tarefa unica", not "geral".
Sentence case everywhere. No exclamation mark on a success. No shame language on a missed day. Copy
names the circumstance, never the person.
Emoji only as a user-chosen habit icon inside a row well, never in UI copy or as iconography.
Three contrast limits are known, measured and deliberately left open: fg-3 on a hovered row at 4.40,
fg-4 as a graphic above the canvas at 2.16 to 2.84, and light fg-4 on hover at 2.94. Do not "fix"
them; they are Thomas's call and each one trades against another rule.

Reply with just the deletion result and one line confirming you have the brief. Do not build anything
yet.
```

---

## Paste 1: Hoje

```
Build Hoje. It replaces "Orbit Today.dc.html", which you should delete when the new document is done.

ITS JOB, AND ITS ONLY JOB: answer "what do I do now".

WHAT IT IS NOT: not a dashboard, not a summary, not a feed, not a place to review the week. If a
person could get a number from this screen that they did not need in order to act in the next minute,
that number does not belong on it.

WHAT SITS ON IT, top to bottom, and nothing else above the list:
1. Astra's proactive line, carrying what Astra noticed and one action. It replaces itself.
2. The date.
3. The habits due.
Then the composer with its chips, pinned at the bottom of the content column.

THE DATE IS A CONTROL, NOT A LABEL. A person needs to log yesterday, because that is what an
overwhelmed adult actually does. Give it the smallest thing that lets them move a day at a time and
jump back to today, and make the current position obvious. It is not a month grid; that is Calendario.

STATES, all of them, in the one document:
loading, as a skeleton shaped like the final list and never a spinner
empty, a composed invitation with one action and no persistent explanatory prose
error, stating the fix next to what failed
at the daily Astra limit, which is the live at-capacity case now, because the habit ceiling is an
abuse guard at 1000 that is identical on every plan. It states the allowance and when it returns and
carries NO upgrade call to action.
and the RETURNING state, a person who has been away for several days. This is the state the product
exists to handle well, so give it the most thought: what they see first, what Astra says, and how the
gap is named without naming them.

Also render: the conversation open over Hoje at 412, and open beside it at the wide width.

Show one habit in each status so the neutral ranking is legible: done, overdue, skip, frozen, empty.
Every status carries an icon or shape as well as its colour.
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
interactive block built on BlockFrame. Build these five, each in every BlockFrame state that applies:
1. bulk log. "Hoje eu fiz a corrida e a leitura." One batch preview, per item edit, ONE accept.
2. a proposed schedule change, using the Proposed state on the rows it would change.
3. a habit being created from a sentence, with the fields proposed and editable before accept.
4. an answer about how a period went, built from real figures, with no chart the system cannot draw.
5. the repair: a person returning after a gap, offered a freeze to spend on it as an action they take.

RULES THE BLOCKS ENFORCE, and the document must show them:
The block is loading, resting or acting. Never half of two.
The client withholds the payload until the person accepts. A preview is a preview.
Text streams; the block arrives whole. Never animate a block's own reveal.
A stale block says so rather than acting on state that already moved.
Announcements are card scoped.
Bulk log and bulk skip carry no confirmation. Bulk create and anything destructive carry one.

Render it as the 412 overlay AND the wide side panel, plus: the composer at the daily limit inside the
conversation, an error from the model, and a partially failed batch where retry covers only what failed.
```

---

## Paste 3: habit creation and habit detail

```
Build two documents, creation first. They replace "Orbit Habit Form.dc.html" and
"Orbit Habit Detail.dc.html"; delete each when its replacement is done.

CREATION. Its job: describe a habit in as few decisions as possible.
It is NOT a schedule configuration form. The four internal schedule type names never render, in either
locale. Creation is ONE input plus a live preview sentence that says back what will happen, in words a
person would use. Intent forward: a person types or says what they want and the machine proposes the
structure, shown in the Proposed state, editable, accepted in one action.
Show it reached three ways: from the create action, from a sentence in the conversation, and from
Astra proposing it unasked.

DETAIL. Its job: is this one holding, and change it without leaving.
It is NOT a read-only record. Every fact on it that can be changed is changed in place.
Show the habit holding, the habit slipping, a habit with sub-habits, a habit linked to a goal where the
goal's progress is DERIVED and therefore carries no edit control while the surface names what it
derives from, and the archived state with its restore.
```

---

## Paste 4: Calendario and Progresso

```
Build two documents. They replace "Orbit Calendar.dc.html", "Orbit Goals.dc.html",
"Orbit Goal Detail.dc.html" and "Orbit Retrospective.dc.html"; delete all four when done.

CALENDARIO. Its job: where did the time actually go.
It is NOT a second habit list and NOT a data view. A person opens it to see the shape of the last few
weeks and to fix one specific day. Reaching a day has to lead somewhere: tapping a day acts.
Calendar sync stays Pro; the paywall is a boundary, never an error, and it states what it is.

PROGRESSO. Its job: answer "am I moving".
It is NOT a trophy cabinet and NOT a chart gallery. Read ticket #329 in spirit: it composes four
things that were four separate screens, and it has to read as ONE answer to ONE question, not four
stacked sections. Name the one focal element before you build and demote everything else deliberately.
It carries goals, the streak with its repair, achievements, and at most four figures folded out of the
deleted insights route, each answering one question, built from StatTile, ProgressBar and ProgressRing.
No chart library and no new shape. If a figure genuinely needs a shape the system cannot draw, stop
and say so.
A RECORD IS NOT A NEXT ACTION, so nothing on Progresso takes the accent: not an earned badge, not a
streak total, not a completed goal's ring. A goal at 100 percent renders --status-done, a filled disc
with a check, and there is no intermediate flip. The accent enters only on progress toward something
unfinished.
Nothing on Progresso is Pro. Goals left the paywall, and XP, levels and streak freezes never were.
There is no at-capacity state, because no per-user goal cap exists in the code.
```

---

## Paste 5: the first minute, and getting in

```
Build two documents, onboarding first. They replace "Orbit Onboarding.dc.html" and
"Orbit Auth.dc.html"; delete each when its replacement is done.

ONBOARDING. Its job: produce ONE real habit that the person typed.
It is NOT a tour, NOT a quiz and NOT a preference survey. There is no separate tour, feature guide or
push prompt system; those are deleted. It ends when a real habit exists and the person is on Hoje
looking at it. Reuse the creation input from paste 3 rather than designing a second one.
The person meets Astra here, because that is the positioning, and it has to earn the meeting by doing
something rather than by introducing itself.

AUTH. Its job: get in without friction.
It is NOT a place to explain the product. Show the email step, the code step, the Google path, the
error that states its fix next to the field, and the loading state that is not a spinner over a blank
screen.
```

---

## Paste 6: Perfil and upgrade

```
Build two documents.

PERFIL. Its job: change one setting and get out.
It is NOT a profile and NOT a home for anything else. No colour-scheme picker; that is deleted. No AI
memory. Billing, API keys and account deletion live here and are the only step-up operations in the
product, so they are reachable here and NOT from the conversation.

UPGRADE. Its job: Astra without the daily ceiling.
It is NOT a feature matrix. Pro is Astra without the daily ceiling, and that is the whole pitch. Goals
are NOT Pro any more. Calendar sync is. The AI allowance is DAILY: 5 free, 50 Pro. Do not write a
monthly message count anywhere.
Prices: USD 9,99 per month and 69,99 per year; BRL 29,90 per month and 199,00 per year. The annual
saving is derived from those two numbers, not typed: 42 percent USD, 45 percent BRL.
New accounts get a 7 day trial, so the screen has to make sense to someone already inside one.
```

---

## Paste 7: the long tail

```
Build the last document, or several if they do not fit.

THE ONE SURVIVING CELEBRATION. Six of seven are deleted. Draw the one that lives, and make the case in
one line for why it is the one worth interrupting someone for.

THE STATIC AND ERROR SURFACES: offline, the update-required gate, a 404, and a generic failure. Each
states the fix. None of them apologises.

THE OVERLAY PRIMITIVES IN SITU: the sheet at short and long content, the confirmation that only
appears for something irreversible, and the search or command palette on both platforms.
```

---

## After every paste

1. Look at the document at 412 and at the wide width, in dark and in light.
2. Check the four things the canvas cannot check itself: is anything here a surface that no longer
   exists, does the accent do a fifth job, is there a sibling margin, and is any spacing value off the
   scale.
3. If a screen proves the design system is missing something or wrong about something, fix the design
   system project, not the screen. That is the whole point of building screens next.
