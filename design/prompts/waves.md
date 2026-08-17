# The canvas work queue, rewritten against the information architecture

> **At a glance** - the prompts that build Orbit on the Claude Design canvas, rewritten on 2026-08-16
> after the first run produced a faithful reskin. Every prompt below states **the job of the screen**.
> None of them lists the content of the screen that exists today, because that is exactly what
> produced the wrong output the first time.

## Why the previous prompts failed

The first run built twelve documents that were token correct and product wrong. The cause is in the
prompts, not in the canvas: they described the screens Orbit already had, so the canvas rebuilt those
screens in the new tokens. A prompt that says "content: the habit name, the streak, a month of
history, the linked goals" can only ever return the current app in a new skin.

The old prompts are gone rather than edited. `RUN-LOG.md` records what they produced.

**The rule for every prompt below: say what the screen is FOR and what it must not become. Never
enumerate what is on it today.**

---

## The standing preamble

Paste this once at the start of the project, and reference it rather than repeating it. It is the
same contract as `DESIGN.md` section `## Information architecture`, which is authoritative if the two
ever disagree.

> **Orbit is an AI that tracks habits, not a habit tracker with an AI.** Astra is the AI.
>
> **Astra is a layer with a front door, never a destination.** There is no Astra tab and no bubble.
> One persistent composer lives in the shell on every primary screen, carrying 3 to 6 suggestion chips
> built from live state. The conversation is a full height overlay opened from that composer, and a
> side panel at the wide breakpoint. Every object also carries an inline AI affordance where the
> machine can propose something.
>
> **The shell is four destinations on both platforms: Hoje, Calendário, Progresso, Perfil.** Bottom
> tab bar on mobile, sidebar on web. No drawer and no hamburger anywhere.
>
> **Two tests run on every screen before it is drawn.** Delete Astra from the design: if the person
> can still start, change, understand and restart a routine in the same number of steps, the screen
> has failed the positioning. Then the inverse: if a fast deterministic action was routed through the
> assistant to make the AI look central, the screen has also failed. Both, every time.
>
> **Marking a habit done is one tap**, optimistic, deterministic, no model call, ever.
>
> **A value the machine inferred looks different from a value the person typed.** That is the tenth
> state, `proposed`: the same field or row at `--fg-3` with an inset dashed hairline, resolving to
> normal the moment it is accepted or edited. It never takes the accent.
>
> **The four internal schedule type names never render, in either locale.** Not "recorrente", not
> "flexível", not "tarefa única", not "geral".
>
> Compose `Shell412` and `ShellWide`, switched by `CanvasControls`, and follow
> `guidelines/screen-contract.md`. Mark every figure `data-mock`. When a question is a product or
> taste call, render both options, label the proposal, and never stall.

---

## The screen prompts are paste ready in `screens.md`

`waves.md` is the reasoning: what each wave is for and why it sits where it does.
**`design/prompts/screens.md` is the operating file**, eight prompts written to be copied into the
screens project one per turn, with nothing left to compose. Read the wave here, paste from there.

Decided 2026-08-17: **build screens next and fix the design system on demand.** Every real defect
found so far came from drawing something rather than reading the system, three of them only once light
mode was rendered for the first time, and the system's own checker stayed green while a dozen cards
broke the spacing rule. Alignment, hover and taste are only judgeable at real size on a real surface.

---

## Two projects, and never mix them

This is the mistake that cost wave 1 a rebuild on 2026-08-16, so it is written here rather than
learned again.

**The design system project holds only the reusable parts**: the tokens, the primitives, the
components in isolation with all of their states, and the guidelines that govern them. A specimen
card shows a component and its states. It never pretends to be the app.

**The screens project holds the composed surfaces.** A screen is one interactive document that
composes `Shell412` or `ShellWide` and renders the whole mode, width, state and locale matrix from
one build. It never rebuilds a shell inline.

The tell that the boundary broke: a card in the design system rendered a whole Hoje screen with named
habits and times, and a whole conversation with real messages, so the system was documenting a
product instead of a kit. A shell IS a legitimate system member, but it is documented as **structural
anatomy**: every region drawn as a labelled empty slot carrying its name and its size rule, with no
product content in it at all.

The same rule kills invented product data anywhere in the system. A field specimen is labelled
`Nome do hábito`; it does not carry a fake habit. A sheet specimen shows a neutral placeholder behind
the scrim; it does not paint a fake Perfil screen at 45 percent.

---

## Wave order

| wave | what it builds | why it is in this position |
|---|---|---|
| 0 | design system additions: the composer, the `proposed` state, the block primitives | nothing below can be drawn without them |
| 1 | the shell and Hoje | the shell decides the frame every later screen sits in |
| 2 | the conversation and the five blocks | the most important surface in the product |
| 3 | habit creation, habit detail | the intent-forward input is the second most important |
| 4 | Calendário, Progresso | the two remaining destinations |
| 5 | onboarding and auth | onboarding reuses wave 3's input, so it cannot run before it |
| 6 | Perfil, upgrade | settled but low risk |
| 7 | celebrations, overlay primitives, static and errors | the long tail |

---

## Wave 0: what the design system is missing

Three additions to the existing Orbit design system. Do not restate what is already in it.

**1. The composer.** Its job: let a person say anything to Astra from anywhere, without leaving where
they are. It is a single input bar living in the shell, above the tab bar on mobile and in the sidebar
on web. Above it sit 3 to 6 suggestion chips. Build the chips as a component that takes its labels as
data, because they are generated from live state and are never a fixed list. States: resting, focused,
composing, sending, offline, and **at the daily limit**, which states the limit and when it returns
and carries **no upgrade call to action**.

**2. The `proposed` state.** Its job: show that the machine suggested this and the person has not
accepted it yet. Apply it to a field, a list row and a whole block. Render it as the normal component
at `--fg-3` with an inset dashed hairline. It resolves to normal on accept or edit. It never takes the
accent, because a proposal is not what is next.

**3. The block frame.** Its job: be the container every generative block inherits, so the rules are
enforced once. It carries a header, a body, an action row that never scrolls with the body, a stale
banner, and a per-row status glyph slot. Show it in five states: loading, resting, acting, partially
failed, and stale.

---

## Wave 1: the shell and Hoje

**1. The shell.** Its job: put the person one tap from the four things they do, and one tap from
Astra, at both widths. Show the mobile tab bar with four destinations and the composer above it, and
the web sidebar with the same four and the composer inside it. Show the conversation open, as an
overlay at 412 and as a side panel at the wide width, so the same feature in two presentations is
visible side by side. **There is no right stats rail.** Do not draw one.

**2. Hoje.** Its job: answer "what do I do now", and nothing else. It is not a dashboard, not a
summary and not a feed. Three things live on it above the list: Astra's proactive line at the top,
carrying what Astra noticed and one action; the date; and nothing else. The list is the habits due.
The composer and its chips sit at the bottom. States: loading as a shaped skeleton, empty, error, and
the returning state, a person who has been away for days, which is the state this product exists to
handle well. **At capacity is not a habit count any more**, because the ceiling is now an abuse guard
at 1000 identical for every plan, so draw it as the daily Astra limit instead.

**Answered 2026-08-16: the proactive line replaces itself.** No dismiss control and no persistence.
The slot carries the single most relevant thing Astra noticed, acting on it advances the slot, and
when Astra noticed nothing the slot is absent rather than empty. `DESIGN.md` section
`### The proactive line` carries the reasoning.

---

## Wave 2: the conversation and the blocks

This is the most important surface in the product. It carries the positioning or it fails it.

**3. The conversation.** Its job: say what you did or what you want, and have it happen. It is not a
transcript and not a help desk. The first run state is the one that matters most: it states Astra's
scope in one line and offers concrete openers, never a blank field. **The assistant almost never
answers with prose.** States on the axis: first run, streaming, acting, error with a retry beside the
message that failed, and at the daily limit. Never animate text the reader is trying to read.

**4. The five blocks.** Build all five, each interactive, each on the wave 0 block frame.

- **Preview.** Its job: show exactly what is about to happen and let the person change it before it
  does. One batch preview, per-item edit controls, one accept. Irreversible rows read differently.
  It never auto-dismisses. Actions are approve, edit and reject, never a single OK. Show it with 7
  rows, and show its partial-failure state reusing the same rows with a status glyph each.
- **Habit list.** Its job: act on what you just asked about, without leaving the reply. The trailing
  ring logs in place. The row body opens the habit.
- **Clarification.** Its job: ask exactly one short question with tappable answers, so Astra never
  guesses a schedule.
- **Metrics.** Its job: answer "how am I doing" without a paragraph of numbers.
- **Breakdown proposal.** Its job: turn a vague intention into habits you can accept in one tap, with
  the rows and the frequency control inline, every row in the `proposed` state until accepted.

---

## Wave 3: creating and holding a habit

**5. Creating a habit.** Its job: describe a habit in as few decisions as possible. **One input plus
one live preview sentence.** The person types or speaks. The recognised words are highlighted inside
the input, so it is visible which words were consumed. Beneath it a plain sentence states what Orbit
understood, for example "3 times a week, any days" or "every Monday and Thursday at 08:00". Correction
is tappable: day pills, a count stepper. Everything else, time, reminders, end date, description, sits
behind ONE disclosure. Show the state where the parser cannot resolve the phrase and says so rather
than guessing. Show the form carrying an **immutable start date**, never a next-due date. Editing is
the same surface with values in it. **Do not draw a type picker.**

**6. Habit detail.** Its job: see whether this one is holding, and change it without leaving. The
composer on this screen is scoped to this habit, so "why do I keep missing this" needs no name.
Rescheduling is a proposal carrying its reason, in the `proposed` state, that the person accepts. The
goal row is a **creation** path, not a display of links.

---

## Wave 4: the two remaining destinations

**7. Calendário.** Its job: answer "where did the time actually go". It is not a second habit list.
One ring per day in the month grid, because this is an orientation view rather than a data view. The
imported calendar events render **beside** the habits on a selected day, so the integration is visible
by existing rather than by a settings row. Never encode a day's state in colour alone.

**8. Progresso.** Its job: answer "am I moving". It is not a trophy cabinet and not a chart gallery.
It carries goals, the streak, achievements and the figures that used to live on the deleted insights
route. A goal renders as the behaviour of the habits under it, not as a bar somebody typed a number
into. **There is no create-goal button**, because a goal is created from a habit or by asking. The
streak section shows the **repair**: a person returning after a gap sees the gap and is offered a
freeze to spend on it, as an action they take. A record is not a next action, so none of this takes
the accent.

---

## Wave 5: the first minute, and getting in

**9. Onboarding.** Its job: produce one real habit the person typed, in **at most three decisions**.
It is not a tour, not a quiz and not a preference survey. The three: what do you want to keep doing,
when does it happen, may we remind you. It **reuses wave 3's input** rather than inventing a second
one, so the flow and the form are one surface. Notification permission is asked after the habit
exists. **There is no paywall anywhere in it.** The last step hands over to Hoje with that habit
already on it and Astra's first line above it. This is the one place the delight budget applies, once,
at the end.

**10. Auth.** Its job: get in without friction. Google leading, email beside it, six box code entry
with paste working and `autocomplete` for a one time code, the callback wait, and the error with the
input preserved. Never block paste, never disable zoom. This screen does not explain the product.

---

## Wave 6: settings and the one thing being sold

**11. Perfil.** Its job: change one setting and get out. **Three groups and nothing else.** You: name,
language, timezone, week start, plan. Astra: the daily allowance and what is left of it, proactive
check ins, the daily summary, API keys and MCP. Notifications: reminders, slip alerts, product email.
Everything destructive sits at the bottom under a plain heading rather than disguised as an ordinary
row. A toggle is labelled for its on state. There is no colour scheme picker, no AI memory and no
public profile.

**12. Upgrade.** Its job: say what Pro is in one sentence. That sentence is **Astra without the daily
ceiling**. Show the honest arithmetic, 5 a day against 50 a day, as a comparison rather than a table,
plus three outcomes: the calendar, the periodic retrospective, and Astra noticing things without being
asked. **No feature matrix.** At most three plans, exactly one marked recommended, the same CTA verb
on every tier, and the monthly to annual arithmetic visible. The decline path is as reachable as the
accept path.

---

## Wave 7: the long tail

**13. Celebration.** ONE component, four triggers: a streak milestone, a goal completing, a level up,
and everything due today being done. **Never an individual habit completion.** Under a second,
skippable, never blocking, carrying a static cue as well as motion. Quiet, and no exclamation mark.

**14. Overlay primitives.** Prove the overlay canon once so all 83 callers inherit it: the confirm
dialog, the context menu, the popover, the date and time pickers, the share sheet, the command
palette, and the Android home screen widget at its real size. Content height by default, one scroll
container, the action row never scrolling, focus moving in on open and back to the trigger on close,
and the least destructive action focused in a destructive confirmation.

**15. Static and errors.** About, support, privacy, terms, plus the application error, the not found
screen and the chat error. Every error says how to fix it, in plain language, with one action. No
"Oops".

---

## The surface list, and when it stops being true

`node tools/redesign-coverage.mjs` maps **195 surfaces across 19 groups** and is the list 17 R tickets
cite as authoritative. It validates against the live surface manifest, so it is **correct today**: it
maps what the code actually has.

**It goes stale as the information architecture lands in code, not before.** Do not edit it ahead of
the deletions; it would then disagree with the manifest and fail its own validation. Regenerate it
after each deletion merges. The groups that shrink or disappear:

* `R12-screen-insights` (6 surfaces) goes to zero. The route is cut.
* `R4-motion-celebration` (18) collapses toward one component with four triggers.
* `R2-primitive-shell` (8) loses the desktop stats rail and gains the composer.
* `R6-screen-goals` (8) loses the create-goal entry and moves inside Progresso.
* `R13-screen-social` is already zero.

**Progresso is not in the list at all**, because it does not exist yet. It absorbs `R9-screen-streak`,
`R10-screen-achievements`, `R12-screen-insights` and the goal surfaces, and it needs its own ticket
before wave 4 draws it.

## After every wave

1. Verify with `DesignSync` `list_files` and read the new document, rather than trusting the report.
2. Pull the wave into the repository so the canvas is never the only copy.
3. Record what landed and what was asked in `RUN-LOG.md`.
4. Run the two tests from the preamble on the finished document, in both directions, and write the
   verdict in the log. A document that passes the mechanical check and fails those two tests is the
   failure this rewrite exists to prevent.
