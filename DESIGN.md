> **At a glance** - the authoritative spec for every Orbit UI surface, including light hover contrast, the native mobile rule, disclosure, label and typed-text handling, the full-screen Astra conversation, the web sidebar Astra row, composer placement, the retained Hoje selection tray, bell rows and Perfil sub-menu ownership; it overrides generic and user-global design defaults.
> - Anchor (D68): spacious, near-black, maximum contrast, warmth in ONE mark. Canvas `#09090B`, ONE colour scheme, ONE accent, **warm orange `#C4530F`**. **No decorative glow, no gradient wash, no Liquid Glass, anywhere.**
> - Identity is carried by the orbital logo mark, the Astra orbital glyph, and ring-shaped indicators. Never by background decoration.
> - Semantic tokens only (`--bg`, `--bg-card`, `--bg-elev`, `--fg-1..4`, `--primary`, `--primary-soft`, `--primary-text`, `--primary-rgb`, `--hairline`, `--scrim`, ...); no raw hex in UI.
> - Scales: type, spacing (enumerated, gated by `local/spacing-scale`), radius, motion. Ships light AND dark, **two variants, not twelve**; mobile-first 412px shell.
> - Tokens live in `apps/web/app/globals.css` + `apps/mobile/lib/theme.ts` + `packages/shared/src/theme/`.
> - **Read `## Information architecture` FIRST.** It says what each surface IS, and it decides whether a surface should exist before any other section decides how it looks.
> - Sections (exact `##` names, so this line is greppable): Information architecture · Identity & anchor · Tokens · Type roles · Layout & spacing · Primitives kit · Overlay · Buttons · Surface rules · Habit list · Listing · States · Voice · Desktop density & orientation · Sub-screen navigation · Motion · Accessibility · Special surfaces · External component sources · Bans · Working model · Enforcement.
> - Read the whole doc before shaping, reviewing, or theming any surface. `## Enforcement` says which rules are gate-backed and which are reviewer judgment.

# Orbit Design System

**Authority note:** this DESIGN.md is authoritative over any generic or user-global design default. Deliberate emoji use (habit emoji wells, celebration heroes) is part of the language and overrides the global anti-emoji rule on those surfaces only.

It is authoritative for **both platforms** (`apps/web`, `apps/mobile`) and for the `orbit-landing-page` mirror. A rule is cross-platform unless it names a platform.

**Authority (D42).** Where this document and the granted canvas disagree below Information architecture and Bans, the drawing wins.

**D42: there are exactly two sources, this document and the granted canvas.**
The twenty-one-screen Claude Design export is committed at
`design/canvas/`, with the design system's 183 token values under
`design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/`.

**Precedence, in this order:**

1. **`## Information architecture` outranks everything**, including every drawing, on whether a
   surface should exist at all and what job it does.
2. **`## Bans` outranks every drawing.** A grant makes an export authoritative over prose; it never
   makes one authoritative over a prohibition. A drawing carrying decorative glow, a gradient wash,
   Liquid Glass or any other banned treatment **is the defect**: build without it and file it.
3. **Below those two, the granted drawing wins.** For how a surface looks, measures, spaces, states
   and behaves, a drawing in `design/canvas/` outranks the prose here, and the prose is the defect.
   A number that disagrees with a token under the `tokens/` directory named above is wrong, whatever
   this document says.

Read the drawing for the surface you are building before you read the section here that describes it.

**`design/superseded/reference.html` carries no authority.** Use the granted canvas.

An export without a grant carries no authority. Never build from `design/canvas/superseded/`.

**Canvas precedence:** a `linear-gradient` in `Orbit Calendario.dc.html` is non-authoritative under rule 2. See `#370`.

**Every sentence below changes an implementation choice.** Nothing here is advice.

## Information architecture

Every other section says how a surface looks. **This one says what a surface is for**, and it wins
when the two disagree about whether a surface should exist at all. This decision is recorded as D69 and D70.

### The positioning, written as a test

`BRAND.md` states it: **Orbit is an AI that tracks habits, not a habit tracker with an AI.** Applied
to a screen, that sentence is this test, and it runs before any visual work on that screen:

> Delete Astra from the design. If a person can still start a routine, change one, understand one and
> restart after a miss in the same number of steps, the screen has failed the positioning.

**The inverse is also a failure, and it is the more common one.** Routing a fast, deterministic
action through the assistant to make the AI look central makes the product worse for the person it is
for. A design that fails either direction is wrong. Both tests are applied, never one.

### Astra is a layer with a front door, never a destination

**Astra has no route, no Android tab and no bubble.** The wide web sidebar's Astra row opens
its conversation as a layer; that row is navigation chrome, not a fifth destination.

1. **The front door** is ONE persistent one-line composer on Hoje in the compact shell
   (Android at every width, web below 1024), and the sidebar Astra row on wide web.
   **One set of 3 to 6 suggestion chips built from live state**, never from a static list, sits
   above the conversation input: what is overdue, which streak is at risk, which habit has no goal.
   The empty state adds no opener chips; the daily limit shows none. Chips hug their labels in
   one scroll row, never ellipsized, with the next chip peeking at its edge.
   Habit detail keeps its own composer at every width, with its habit chips in one scroll row.
2. **The layer** is an inline AI affordance on every object it can improve. Schedule, breakdown,
   emoji, reschedule and goal link are all **proposals a person accepts or edits**, never silent
   writes.
3. **The conversation opens full screen at every width**, with its own header, thread, live chips
   and composer. It is not a navigation destination and it never earns an Android tab.
4. **Astra speaks first.** Proactive check-ins are part of the architecture, not a preference buried
   in settings. See **The proactive line** below.

**The remit is curated.** Astra owns habits, sub-habits, checklists, tags, goals, calendar, schedule,
notifications, metrics, feature explanation, and read-only record rows for API keys, profile, plan,
and referral. Key rows show name, prefix, dates, and state. Plan rows describe the current plan
without prices or upgrade actions. **Billing management, API-key management and account deletion
are not reachable from the chat surface.** API-key management and account deletion are the only two
step-up operations in the product and are settings a person taps once. Billing is not a step-up
operation because the Stripe customer portal authenticates the person itself. It remains a provider
handoff from the Subscription flow under Profile. An assistant that can sell a subscription
contradicts the voice pillar "describe, never sell". API-key management and account deletion stay
available on the MCP surface, where an external
client asks for them deliberately.

### The shell

| platform | navigation | Astra |
|---|---|---|
| **mobile** | bottom tab bar, **four** destinations: Hoje, Calendário, Progresso, Perfil | composer above the tab bar, on Hoje only |
| **web** | sidebar, the same four at 1024 and above; compact tab bar below 1024 | sidebar Astra row on wide web; Hoje composer in the compact shell |

**No navigation drawer and no hamburger on either platform.** Navigation has four destinations.
The wide web Astra row is a button opening a layer with no route. A bottom sheet, menu or dialog
that holds secondary content is not navigation; in the compact shell (Android at every width, web
below 1024) it is the default home for that content. The shell composer stays visible on Hoje in
that compact shell only. Habit detail keeps its own composer at every width.
Calendário, Progresso and Perfil clear the tab bar or the wide column bottom without a composer dock.
Hoje's selection tray stays pinned at both widths while selection is active, with exit, select-all,
delete, log and skip controls. It replaces the compact composer; on wide web it alone occupies
the destination's bottom slot, named `composer` in the shell reference contract. Resting wide Hoje
passes no bottom content. Transient notices keep the separate `notice` slot.

**The conversation opens full screen on both platforms.** In the compact shell it covers the whole
screen, including the tab bar. On wide web the sidebar stays visible and the conversation replaces
the destination's header, scroller and bottom chrome in the centred column, capped at 740, from
its top inset to the viewport bottom. Its header, thread, chips and composer have the same layout
at every width. The header is NavHeader: minimum height 56, start-aligned mono 12/500 title
`Astra`, and a 48 close control with a 20 X. The composer has a top hairline and 16 padding,
aligning its pill with the thread's 16 inset. The empty thread centres the Astra mark, title and
disclosure in `--fg-3`.
Every conversation entry, including the proactive line, the no-habits action and habit detail's
own entry, opens this same layer. Closing it restores the underlying surface and its selection.

**Each composer pins to the bottom of its content column.** The sidebar carries the lockup, search
control, the Astra row directly above Hoje, the four destinations in tab order, the Avisos bell
with its neutral count pill, one filled create action, and the account row.
The Astra row uses destination geometry: minimum height 48, radius 12, 12 inline padding,
12 gap, a 20 Astra glyph and a 14/500 `Astra` label with `translate="no"` in both locales.
The list gap is 4. While the conversation is open, only the Astra row draws the current-position
treatment: `--primary` glyph and `--primary-soft` label. The destination retains
`aria-current="page"` because the route stays unchanged, but draws no current-position treatment.

**The way in must be visible.** In the compact shell the Astra glyph at the leading edge inside
the composer pill is a real button with a hit area at the touch floor, a padded hover and press
fill and a focus ring, labelled `Abrir conversa`. On wide web the sidebar Astra row opens the
conversation. Habit detail's own composer glyph remains an entry at every width.

**Avisos is reachable from every destination.** In the compact shell (Android at every width,
web below 1024), Hoje and Calendário pass a header row with a minimum height of 48 to Shell412.
The Avisos bell is the last control at the trailing edge, with a hit area at the touch floor and
a neutral count pill: absent at zero, capped at 9+, no dot, no accent. Hoje holds the Hoje jump pill
only on another day, then search, options (`dots-vertical`) and the bell. Calendário holds options
and the bell. Progresso and Perfil start with a minimum-height 48 row holding only the bell at the
same trailing edge; that row scrolls with the page and carries no screen title. Avisos does not
repeat the bell. Screen options always use `dots-vertical`.

**Back-to-top belongs only to Hoje**, as a small top-centre pill below its pinned header, separate
from the create FAB. Reselecting the active root tab scrolls that root to the top on every root.

### What each surface IS

The middle column is the surface's whole job. The right column is the thing it is most often mistaken
for, and building that instead is the defect.

| surface | its job | what it is NOT |
|---|---|---|
| **Hoje** | what do I do now | not a dashboard, not a summary, not a feed |
| **Calendário** | where did the time actually go | not a second habit list, not a data view |
| **Progresso** | am I moving | not a trophy cabinet, not a chart gallery |
| **Perfil** | change one setting and get out | not a profile, not a home for anything else |
| **Habit detail** | is this one holding, and change it without leaving | not a read-only record |
| **Habit create and edit** | describe a habit in as few decisions as possible | not a schedule configuration form |
| **Goal** | what a set of habits adds up to | **not an object you create from a menu** |
| **The conversation** | say what you did or what you want, and have it happen | not a transcript, not a help desk |
| **Onboarding** | produce one real habit the person typed. Per the owner’s decision, onboarding ends with the free Pro trial step, or the Orbit Pro paywall for an account not on a trial; this replaces D69 item 17 for that final step only. | not a tour, not a quiz, not a preference survey |
| **Upgrade** | Astra without the daily ceiling | not a feature matrix |
| **Subscription** | understand the current plan and hand billing changes to its provider | not a shell destination or a billing back office |
| **Auth** | get in without friction | not a place to explain the product |
| **Wrapped** | close a period and feel it was worth it | not a report |

### Perfil settings navigation

Perfil starts with the account row, then Preferências, Astra and Notificações. Each entry opens
one sub-screen with a page title and a visible back control returning to Perfil. Every top-level row
carries a 24 leading icon: `User` for the account row, `Crown` for Orbit Pro, `Settings`
for Preferências, `AstraGlyph` for Astra, `Bell` for Notificações. A row title and its value or
description each take one line. The trial end date lives on the Pro screen. Calendar sync opens the Calendários sheet, its one home. The account row
keeps the name and email; the position directly beneath it stays available for Orbit Pro.

Conta owns edit name, data export, usage analytics, fresh start and account deletion, in that order.
Deletion is last and keeps its danger label, confirmation and step-up. Preferências owns timezone,
week start, clock, language, theme and showing general habits on Hoje. Astra owns today's allowance,
feature switches and Pro gates, then API keys and MCP. Notificações owns the current push-device
controls, product email consent and the note that habit reminders live on each habit.

Mais do Orbit stays inline with Orbit Wrapped, Android widget, calendar sync, support and about,
in that order. Calendar sync opens the Calendários sheet, its one home, and keeps its Pro gate.
Mais do Orbit rows carry no descriptions that repeat their titles. Sign out is the final top-level row. Each setting
has one home; the retired Preferências, Avançado and Recursos de IA pages redirect to the new
sub-screens and never carry a second copy.

### The month completion rate has one definition

One client definition is required because no endpoint supplies this window.

**The rate is completions divided by scheduled OCCURRENCES, counting only days that had something
scheduled**, up to and including today in the current month, and the whole month for a past month
because every day in it has been lived.

Not every day in the month, which makes the current month read low until the last day. Not every
elapsed day, which counts days with nothing scheduled as successes. The month response carries
`(Habits, Logs)` and no per day status, so this figure is a client computation and the rule has to live
here rather than in the server.

### The core loop is never mediated

**Marking a habit done is one tap, optimistic, deterministic and offline tolerant.** No model call, no
network wait, no confirmation. This is the single interaction the product may never make slower, and
no future surface may re-route it.

Saying "I did X, Y and Z" to Astra is a **different** interaction with the same outcome, and it does
go through the model as a bulk operation. Both exist. Neither replaces the other.

**Confirmation is decided by reversibility, never by item count.** Bulk log and bulk skip are
reversible and therefore carry no confirmation. Bulk create, bulk delete and anything that removes
data carry a confirmation. **A reversible action without a working undo is not reversible**, so the
gate cannot be dropped before undo exists.

### The proactive line

Astra reaches the person before the person opens the app. The push is a **pointer**, never the only
copy: the same content sits at the top of Hoje, and **the whole line is its action**: one press target with a minimum height of 48, with a padded press and hover fill and no separate link. The sentence is prose: at most 2 lines, with the full text in the conversation. Its accessible name is the visible sentence; the destination goes in the Android hint and the web description. The name is never `Abrir conversa`, which the composer glyph owns. Two consequences are
deliberate. The proactive layer has a visible place to be audited instead of only firing into the
void, and a person who denies notification permission still gets the whole mechanism.

The **periodic retrospective is delivered here**, on a cadence, and has no navigation entry. When
there is nothing worth saying, nothing fires, which is what deletes its empty and no-data states
structurally rather than by designing them.

**The line replaces itself. It never dismisses and it never persists.** The slot
carries the single most relevant thing Astra noticed, and acting on it advances the slot to the next
thing. There is no dismiss control, because the audience is a person who is already overwhelmed and a
dismiss control makes the top of the busiest screen one more chore. There is no persistence either,
because a line whose action the person will not take parks there and stops being read. **When Astra
noticed nothing, the slot is absent**, not empty: the line collapses and Hoje starts at the date.

### Generative blocks

**The assistant almost never answers with plain prose.** A read-only card is a screenshot of the app
pasted into a chat. Every block is interactive.

The first block set, in build order: the **preview** block for anything Astra is about to do, the
**habit list** with in-place logging, the **clarification** block asking one short question with
tappable answers, the **metrics** block, and the **breakdown proposal** with its rows and its
frequency control.

Six rules govern all of them:

1. **Three-way state split.** Business data is server owned and re-fetched. UI state, meaning
   selection, expansion and sort, is client owned and is **never** sent back as though it were data.
   Durable state is declared explicitly.
2. **The client withholds the payload.** A write action's arguments do not reach the block until the
   person approves. The gate is structural, so no prompt can talk past it.
3. **One batch preview, per-item edit, one accept.** Never N separate confirmations. Irreversible rows
   are visually distinguished, the preview never auto-dismisses, and the actions are approve, edit and
   reject rather than a single OK. A partial failure reuses the same per-item rows with a status glyph
   per row.
4. **Text streams, the block arrives whole.** Never animate a block's own reveal, and never gate the
   screen-reader announcement on a visual typing effect.
5. **A stale block says so.** When the record's `updatedAt` is newer than the block's snapshot, the
   block states it and offers a refresh.
6. **Announcements are card-scoped.** The message list is an ARIA feed, each block's own state change
   lives in a `polite` live region local to that block, and `aria-busy` is set on the feed for the
   duration of a batch operation.

Rules 5 and 6 have no published precedent anywhere. They are Orbit's, and they are stated here because
the alternative is that every block invents its own answer.

### The proposed state

**A value the machine inferred looks different from a value the person entered**, until it is accepted
or edited. This is the tenth state, and it applies in the create form, in a reschedule proposal, and
in every generative block.

It renders as the same field or row at `--fg-3` with an inset **dashed** hairline, and it resolves to
the normal state the instant the person accepts or edits it. **It never takes the accent**: a proposal
is not one of the four accent roles, and it is certainly not what is next. No new hue, no new radius,
no new family, no glow.

### A derived value is not a proposed value

**There is no eleventh state, and this is why.** A goal with linked habits derives its progress from
their real logs. That value is neither typed by the person nor proposed by the machine: it is never
accepted and never edited, it recomputes. Rendering it in `proposed` would say "the machine guessed,
confirm it", which is the opposite of "this is your real logs and you cannot type over them".

**A derived value renders exactly like a typed one**, at full weight, in normal tokens, because it is
real. Two things change instead:

1. **It carries no edit control.** The manual input for a derived value is **hidden, not disabled**. A
   goal with linked habits has one source of truth, and offering an override beside it recreates the
   drift this architecture removed. The manual input survives only where nothing is linked, for
   example "lose 5 kg", where it is the only source.
2. **The surface names what it is derived from.** A number whose origin is invisible reads as a number
   somebody typed.

### Expressing repetition without the model leaking

**The four internal type names never render, in either locale.** Not "recorrente", not "flexível", not
"tarefa única", not "geral". The domain stores flags; the interface asks a person about their life.

Creation is **one input plus a live preview sentence**. The person types or speaks. The recognised
words are highlighted **inside** the input, so it is visible which words the parser consumed. A plain
sentence beneath states what Orbit understood, for example "3 times a week, any days" or "every Monday
and Thursday at 08:00". Correction is tappable, day pills or a count stepper, never a re-typed syntax.
Exact time, reminders, end date and description sit behind ONE disclosure.

**A parser that cannot resolve a phrase says so and offers the two controls.** It never guesses
silently.

**The form shows an immutable start date, never the mutating next-due date.** Today's "Começar em" is
a moving cursor wearing a fixed label, and it is a structural defect rather than a copy one.

### Surfaces that no longer exist

Designing any of these is the defect, not the omission.

- **The `/insights` route.** Its figures fold into **Progresso**, at most four of them, each answering one question and built from `StatTile`, `ProgressBar` and `ProgressRing`. One granted bar chart shows the shape of the month window above those figures. The streak surface is itself no longer a destination, so it cannot receive them.

**One chart.** Neutral bars per day show completion in Progresso and Astra. This grants one `BarChart`, not a chart gallery.
- **The retrospective's empty, locked and no-data screens.** It is an event now, so they are
  unreachable.
- **Six of the seven celebration overlays.** One component, four triggers: a streak milestone, a goal
  completing, a level up, and everything due today being done. **Never an individual habit
  completion**, which the motion frequency gate already rules out at that frequency.
- **The separate onboarding, tour, feature guide and push prompt.** One system.
- **A create-goal entry in navigation.** A goal is created from a habit, or by asking.
- **The desktop stats rail.** Progresso owns the question it was answering.
- **The narrow conversation beside a destination.** Astra replaces the content column on wide web.
- **The social layer, the colour-scheme picker and AI memory**, per the deletions already decided.
- **The persistent reminder.** Perfil has no switch for an ongoing Android notification with the
  streak and today's progress, and no platform replaces it.

## Identity & anchor (locked)

Orbit is a **spacious, near-black habit tracker with exactly one accent**. Space is the primary hierarchy device. Where a surface step or a hairline would separate two things, use space first.

Identity comes from three things and nothing else:

1. the **orbital logo mark**,
2. the **Astra orbital glyph** (which replaces the sparkle icon),
3. **ring-shaped status and progress indicators**.

**The mark is a planet drawn as a ring with an open centre**, an orbital band crossing in front low and passing behind at the upper right, and a small solid moon above right. That is deliberately not the ProgressRing shape, which is a true circle carrying a coloured sweep over a track, so a logo can never be read as a completion percentage. **The mark carries the accent on exactly one element, its moon, and that is the only non-state use of the accent in the whole system.** Everything else in the mark is `--fg-1`. `design/brand/orbit-mark-accent.svg` ships that treatment, so a surface takes the accent file and never tints the monochrome one itself.

**`design/brand/README.md` is authoritative for the assets.** The two marks are final and merged; this section describes how they are used, not what they are.

**The two are told apart by silhouette, not by a detail.** Orbit is a hollow ring. Astra is a solid letterform, a letter A carrying the same orbital band and the same solid dot. The rule is that short: **a solid letterform is Astra, a hollow ring is Orbit.** Silhouette survives at 16px, which the draft geometry's "circle with a core" did not, and that is why the earlier core rule was retired.

**Asset sizes are enumerated: 16, 48, 128, 512.** The mark is neither type nor an icon, so it answers to neither the type scale nor the 24 icon grid. **At 16 the mark is redrawn natively rather than scaled**, because a stroke scaled down from the 24 grid renders soft, and at 16 it is monochrome `--fg-1` with no accent.

**The wordmark** is Space Grotesk 600 in natural case, `-0.02em`, `--fg-1`, carrying `translate="no"`. The horizontal lockup is a 28px mark, a 12px gap and a 22px wordmark. **The 28 measures the mark and the 12 separates ink from ink, never bounding boxes.** The 1024 art carries wide empty margin, so a literal 28 box draws ink about 8px tall beside a 15.4px cap height and the word swamps the mark; sized on the ink the mark stands 15.04px and the two read as one lockup. The lockup asset's viewBox is its ink, so clear space is the consumer's to add.

It does **not** come from a background gradient, a glow, decorative background orbit arcs, a texture, or a glass material. Hierarchy is bought with space first, then size, weight, and contrast. A surface step or a hairline is the last resort.

**Warmth has exactly one source: the mark.** There is no warm palette, no texture, and no illustration set. If a surface feels cold, the answer is space and type, never a second warm element.

**Quiet decoration is still decoration.** A softened glow, a 0.03-opacity texture, a "subtle" mesh gradient, and a barely-there blur are the same violation as the loud version.

**"Design" means UX and accessibility, not appearance.** Do not read this document as a skin.

**Finish it or delete it. Nothing stays at 60%.**

## Tokens

Canonical CSS lives in `apps/web/app/globals.css`; the mobile equivalent is `createTokensV2` in `apps/mobile/lib/theme.ts`; shared ramp data in `packages/shared/src/theme/`.

**OKLCH is the derivation space. Hex and `rgba()` are the authored notation.** Derive every value in OKLCH, then write the resolved hex or `rgba()` into the token source. Never author an `oklch()` literal in a shared token or a mobile style: `@react-native/normalize-colors` parses `hex`, `rgb`, `rgba`, `hsl`, `hsla` and `hwb`, and has **no `oklch` branch**, so an `oklch()` token is a runtime failure on Android and breaks the parity contract.

**A token carrying alpha cannot be contrast-checked on its own.** Its rendered value depends on what sits behind it. Every alpha token below therefore records the hex it resolves to over the canvas, and any surface that can sit over arbitrary content is authored **opaque**.

### Type

- Families: `--font-sans` **Geist Sans** (UI), `--font-display` **Space Grotesk** (display numerals and hero), `--font-mono` **Geist Mono** (meta and tabular numerals).
- Weights loaded: Geist Sans 400/500/600 · Space Grotesk 500/600 · Geist Mono 400/500. Any other weight is a bug, not a rendering.
- Scale: `--fs-xs 12 / sm 14 / base 16 / md 17 / lg 20 / xl 22 / 2xl 28 / 3xl 34 / 4xl 44 / 5xl 60`.
- **Size floors:** long-form body 16, inputs and menus 14, captions 12. Nothing renders below 12 (see Bans). Below 18, stay at weight 400 or above; weights under 300 do not exist in this system.
- **Emphasis within a role is one weight step up, never a size change.**
- Line-height by role: display 1.05 / heading 1.15 to 1.2 / row 1.35 / body 1.55 / meta 1.4. Unitless values only. **Anything that wraps to 3 or more lines takes at least 1.4**, even in a height-constrained row.
- **Tracking is size-specific.** Large display text takes negative tracking; body sits at 0; small uppercase labels take positive tracking. A single `letter-spacing` value across the scale is wrong somewhere.
- **`font-synthesis: none` on the document root.** Verify first that every required weight loads, because disabling synthesis must never erase emphasis.
- **Apply `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` once on the root**, never per component. Web only.
- Express a typographic feature through its dedicated CSS property, never the raw axis or feature tag: `font-weight` not `font-variation-settings: "wght"`, `font-variant-numeric: tabular-nums` not `font-feature-settings: "tnum" 1`.
- **`text-box: trim-both cap alphabetic` on badges, chips and pill labels**, so text sits optically centred rather than low. Progressive enhancement; unsupported browsers keep the default leading. Web only.
- **Light text on a dark surface is compensated on three axes**: add `0.01em` tracking, add `0.05` to the line-height, and add one weight step where the face needs it. This is the legibility check that the maximum-contrast target requires, and it answers the halation risk the direction ADR recorded.

**There is no serif.** D68 decision 9 resolves to "cut". Three families is the whole system.
A warm surface gets its warmth from space, size and the mark, never from a second face.

### Spacing (base 4)

**The scale is these ten values and nothing else**:

```
0  4  8  12  16  24  32  48  64  96
```

It drops 20, 28, 40 and 56, which are the values the 1,436 existing violations cluster around, so there is less to choose wrongly between, and its jumps widen at the top to serve the spacious direction.

**The rule the values satisfy: the gap between two groups is at least 2x the gap within a group.** 8 inside a group means 16 or more between groups. Uniform gaps everywhere are the tell of no decision. This is the mechanical grounding the scale has.

**12 and 24 survive** because those are the measured control clearances below.

**Two padding roles sit on top of the scale**, because a card that hugs its text reads as cramped no matter how correct the gaps around it are:

| role | value |
|---|---|
| card and panel padding | **24** |
| list-row padding | **16** |

| between | clearance |
|---|---|
| adjacent bordered or filled controls | 12 |
| around borderless text and icon controls | 24 |
| unrelated control groups | 24 or more, and at least 2x the intra-group gap |

A spacing value outside the chosen set is a defect. The set is enumerated rather than described as "a multiple of 4" because a machine has to check it.

Negative values are legal only at the negation of a scale step, and only where a negative offset is genuinely the layout.

**What the scale governs:** `margin` and `padding` (every side, every logical and React Native variant), `gap` / `rowGap` / `columnGap`, and the positional insets. It governs them in a Tailwind utility, a Tailwind arbitrary value, a JSX inline `style={{ }}` object, and a React Native `StyleSheet.create` object.

**What the scale does not govern:** `width` and `height`. Those are component dimensions and answer to the primitives kit.

Mechanics: use a flex or grid container with `gap-*`. **Never `space-x-*` / `space-y-*`, and never a margin for sibling spacing.**

**The named exemptions, these three and nothing else:**

| name | what it covers | why |
|---|---|---|
| `pill-button-geometry` | the locked size table in `packages/shared/src/theme/button.ts` | A primitive's internal geometry, frozen as shared data. **The exemption is scoped to that one file.** |
| `hairline-inset` | `±1` on a positional inset only | Aligning to a 1px hairline is a rendering fact, not a spacing decision. |
| `explicit-allow` | values passed to the rule's `allow` option | The loud escape hatch. Adding one is a diff to the lint config. |

**Units: px everywhere, for parity.** React Native has no `rem`. Two web-only exceptions are sanctioned platform adapters: media-query breakpoints and the `max-width` of a text container may use `rem`, so both respond to the reader's base font size.

### Dark mode (the primary theme, byte-exact)

Every value is derived in OKLCH against the canvas and measured. Do not eyeball a replacement.

```
--bg              #09090B                     /* canvas. oklch(0.141 0.004 285.8). White on it 19.90:1 */
--bg-card         rgba(250,250,250,0.04)      /* THE card -> #131315 */
--bg-field        rgba(250,250,250,0.06)      /* field, OTP fill -> #171719 */
--bg-well         rgba(250,250,250,0.08)      /* emoji wells, icon squares -> #1C1C1E */
--bg-elev         #1C1C1E                     /* OPAQUE. Overlay panel, menus, popovers */
--bg-elev-2       rgba(250,250,250,0.12)      /* the highest inline step -> #262628 */
--bg-hover        rgba(250,250,250,0.13)      /* THE hover surface -> #28282A. 1.26:1 against the resting card */
--bg-hover-opaque rgba(250,250,250,0.13)      /* overlay on an opaque control -> #39393B over elev. 1.477:1 step */
--bg-sunk         rgba(0,0,0,0.28)            /* recessed wells -> #060608 */
--hairline        rgba(255,255,255,0.08)      /* separator: divides content */
--border-control  rgba(255,255,255,0.08)      /* border: encloses a control. Same value today, separate role */
--hairline-ghost  rgba(255,255,255,0.10)
--hairline-strong rgba(255,255,255,0.16)
--fg-1 #F4F4F6   /* 18.11:1 */   --fg-2 #C9C9CC   /* 12.04:1 */
--fg-3 #8F8F93   /*  6.18:1 */   --fg-4 #5D5D60   /*  3.03:1, clears the 3:1 non-text floor */
--track-empty     #8B8B8E                     /* empty UI track. 3.001:1 on card-child hover inside a sheet */
--primary         #C4530F                     /* fill and graphic ONLY. hue 45. White on it clears 4.5 */
--primary-soft    #C85716                     /* accent TEXT on the canvas */
--primary-text    #ED773E                     /* accent TEXT on raised surfaces. 4.518:1 on card-child hover */
--primary-pressed #A24716                     /* the fill, 16% toward the canvas */
--primary-hover   #B74E12                     /* the fill, 6% toward the canvas. It DARKENS, see below */
--primary-rgb     196,83,15
--primary-dim     #261611                     /* the fill at 18% over the canvas */
--fg-on-primary   #FFFFFF                     /* always white: the fill is dark in both modes */
--status-done     var(--fg-1)                 /* UNBOUND from the accent. The brightest neutral */
--status-empty    var(--track-empty)          /* ring track. 3.001:1 on the worst surface */
--status-frozen   var(--fg-2)                 /* NEUTRAL. See the note below */
--status-overdue  #FE9A00                     /* 9.32:1, hue 65.4 */
--status-bad      #FB2C36                     /* 5.23:1, hue 25.4 */
--status-bad-text #FF7970                     /* 4.51:1 on an elevated menu-item hover, hue 25.8 */
--fg-on-bad       #020618      --fg-on-overdue #020618
--selection-bg    the fill at alpha 0.32
--scrim           rgba(0,0,0,0.55)            /* THE overlay backdrop. Theme-independent */
```

**The accent fill darkens on hover, and it has to.** `--primary-hover` was `#CD6939`, the fill mixed
12 percent toward white. White on `#CD6939` is **3.70:1**, under the 4.5 text
floor, on the primary button, which always carries a white label. The fill itself is only **4.57:1**
with white, so there is no headroom to lighten it by any amount. The hover therefore moves the other
way, `#B74E12`, and the ladder reads monotonically: rest **4.57**, hover **5.11**, pressed **6.09**.
The hover step must preserve the 4.5 text floor.

**The canvas is near-black, not pure black.** `#09090B` is the measured Pierre value; Linear sits at `#08090a`. White on `#09090B` is 19.90:1 against 21.00:1 on pure black, so the contrast cost is 5% and the halation cost is real. Maximum contrast is a floor plus a legibility check, never "as much as possible".

**The neutral ramp is effectively hueless and stays that way.** Every neutral carries chroma at or below 0.006, which is below the nameable threshold, and holds one hue end to end. A ramp that does not lean on the accent hue does not have to be re-derived the next time the accent moves, so an accent change does not force a neutral-ramp change.

**`--status-frozen` is retired as a hue.** The old `#00D3F3` sits 12.0 degrees from the new accent, inside the 15-degree band where two hues read as one colour, so streak-freeze and done would have looked like the same state. **Frozen renders as a neutral chip plus the snowflake glyph, on a DAY and never on a habit.** This removes a colour from the system, and the no-colour-only rule already required the glyph.

**`--status-done` is the second status neutralised, on the same precedent.** It was `var(--primary)`, so the brand colour and the completed state were one byte. Three rules in this document already forbade that: derivation rule 6's 15-degree separation, the accent note's "a static element rendered in the accent is as misleading as an interactive one rendered neutral", and "fill exactly one action per view", which a six-habit list with four done broke six times over. **Done now renders as an `--fg-1` disc with a filled check.** The neutral status ranking is done `--fg-1`, frozen `--fg-2`, skip `--fg-3`, empty `--track-empty`, so all four neutral statuses can share one column and stay distinguishable.

### Light mode (MANDATORY, ships with every surface)

Light is first-class and dark is primary. After the scheme collapse the matrix is **two variants**.

```
--bg #FAFAFA · --bg-card #FFFFFF (opaque white cards) · --bg-elev #FFFFFF · --bg-elev-2 #FFFFFF
--bg-field #FFFFFF · --bg-well rgba(9,9,11,0.04)
--bg-sunk rgba(9,9,11,0.04)
--bg-hover rgba(9,9,11,0.11) /* #E4E4E4 over white, 1.271:1 step; #DFDFE0 over canvas, 1.276:1 step */
--bg-hover-opaque rgba(9,9,11,0.11) /* overlay on an opaque control -> #E4E4E4 over white. 1.271:1 step */
--status-done var(--fg-1) · empty var(--track-empty) · frozen var(--fg-2)
--status-overdue #7D5700   /* 6.219:1 on canvas, 4.510:1 on well hover. White on it 6.491:1 */
--status-bad     #E7000B   /* 4.57:1 on #FAFAFA, hue 28.5 */
--status-bad-text #C00000  /* 4.502:1 on well hover, 5.407:1 on a status-bad tint inside a card */
--fg-on-bad      #FFFFFF   /* 4.77:1 on the fill */
--fg-on-overdue  #FFFFFF   /* 6.491:1 on the fill */
--hairline rgba(9,9,11,0.08) · --border-control rgba(9,9,11,0.08)
--hairline-ghost rgba(9,9,11,0.10) · --hairline-strong rgba(9,9,11,0.16)
--fg-1 #1A1A1D  /* 16.64:1 */   --fg-2 #424247  /*  9.57:1 */
--fg-3 #68686D  /*  5.31:1 */   --fg-4 #89898D  /*  3.34:1 */
--track-empty    #7E7E82   /* empty UI track. 3.036:1 on canvas hover */
--primary        #C4530F   /* light mode takes the SAME dark fill, with white on it */
--primary-soft   #C15109   /* derived against #FAFAFA, not against the canvas */
--primary-text   #A63A00   /* accent text on raised surfaces. 4.522:1 on well hover */
--primary-dim    #F4DDD3   /* the fill at 18% over #FAFAFA. fg-1 on it 13.34:1, fg-2 7.67:1 */
--fg-on-primary  #FFFFFF
--selection-bg   the fill at alpha 0.18
```

**Only `--primary-dim` moves. `--primary`, `--primary-pressed`, `--primary-hover` and
`--fg-on-primary` are mode-independent**, because the fill is dark and its label is white in both
variants, so nothing about a white page changes how that button should darken. `--primary-dim` is
different in kind: it is a mix **with the canvas**, so leaving it unrepointed gave light mode the
dark-mode value `#261611`, a near-black wash painted onto a white card.
A selected `PlanCard` must use the light-mode value.

**The two status hues darken in light mode to clear their reachable surfaces.** The
fill and graphic token `--status-bad` uses `#E7000B`; its text role uses `#C00000`.
`--status-overdue` and its text role use `#7D5700`. Their light text values are derived by
lowering only OKLCH lightness with constant source hue and chroma, then gamut-clamping and
rounding to sRGB bytes. The resulting overdue hue is 79.2 degrees, 34.4 degrees from the
44.8-degree fill accent; destructive text is 29.2 degrees, 15.6 degrees from that accent.
Both clear derivation rule 6. Light `--fg-on-overdue` is `#FFFFFF`, which measures
6.491:1 on the overdue fill.

### Measured contrast, with the remaining limits closed

Contrast is measured against every reachable surface in the ladder, including raised surfaces. The widget card and widget well are the flattened surfaces produced by
`apps/mobile/scripts/generate-widget-colors.ts`. `text` uses the 4.5 floor and `graphic` uses 3.0.
Every scope below is derived from those floors and the measured ratios.

<!-- surface-scope:start -->
| on | role | scope | canvas | card | field | well | elev-2 | hover | overlay | widget card | widget well |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dark `--fg-1` | text + graphic | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well; graphic: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 18.112 | 16.893 | 16.298 | 15.490 | 13.751 | 13.395 | 15.490 | 16.893 | 15.321 |
| light `--fg-1` | text + graphic | text: canvas, card, well, hover, widget card, widget well; graphic: canvas, card, well, hover, widget card, widget well | 16.636 | 17.364 | - | 15.236 | - | 13.038 | - | 17.364 | 15.383 |
| dark `--fg-2` | text + graphic | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well; graphic: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 12.042 | 11.231 | 10.835 | 10.298 | 9.142 | 8.906 | 10.298 | 11.231 | 10.186 |
| light `--fg-2` | text + graphic | text: canvas, card, well, hover, widget card, widget well; graphic: canvas, card, well, hover, widget card, widget well | 9.572 | 9.991 | - | 8.767 | - | 7.502 | - | 9.991 | 8.851 |
| dark `--fg-3` | text + graphic | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well; graphic: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 6.175 | 5.760 | 5.557 | 5.281 | 4.688 | 4.567 | 5.281 | 5.760 | 5.224 |
| light `--fg-3` | text + graphic | text: canvas, card, well, widget card, widget well; graphic: canvas, card, well, hover, widget card, widget well | 5.309 | 5.542 | - | 4.863 | - | 4.161 | - | 5.542 | 4.909 |
| dark `--fg-4` | graphic | graphic: canvas | 3.032 | 2.828 | 2.728 | 2.593 | 2.302 | 2.242 | 2.593 | 2.828 | 2.565 |
| light `--fg-4` | graphic | graphic: canvas, card, well, widget card, widget well | 3.338 | 3.485 | - | 3.058 | - | 2.617 | - | 3.485 | 3.087 |
| dark `--track-empty` | graphic | graphic: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 5.856 | 5.462 | 5.270 | 5.008 | 4.446 | 4.331 | 5.008 | 5.462 | 4.954 |
| light `--track-empty` | graphic | graphic: canvas, card, well, hover, widget card, widget well | 3.874 | 4.043 | - | 3.548 | - | 3.036 | - | 4.043 | 3.582 |
| dark `--primary-soft` | text | text: canvas | 4.577 | 4.269 | 4.118 | 3.914 | 3.475 | 3.385 | 3.914 | 4.269 | 3.871 |
| light `--primary-soft` | text | text: canvas, card, widget card | 4.523 | 4.721 | - | 4.142 | - | 3.545 | - | 4.721 | 4.182 |
| dark `--primary-text` | text | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 6.925 | 6.459 | 6.231 | 5.922 | 5.257 | 5.121 | 5.922 | 6.459 | 5.858 |
| light `--primary-text` | text | text: canvas, card, well, hover, widget card, widget well | 6.235 | 6.508 | - | 5.711 | - | 4.887 | - | 6.508 | 5.766 |
| dark `--status-bad-text` | text | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 7.788 | 7.264 | 7.008 | 6.661 | 5.913 | 5.760 | 6.661 | 7.264 | 6.588 |
| light `--status-bad-text` | text | text: canvas, card, well, hover, widget card, widget well | 6.207 | 6.479 | - | 5.685 | - | 4.865 | - | 6.479 | 5.740 |
<!-- surface-scope:end -->

**`--primary-soft` is canvas only, and that closes its row by role.** Use
`--primary-text` for rationed accent text on a card, field, well, elevated panel or hover fill.
The light `#A63A00` value measures 4.522:1 on its worst stack, well hover. Where accent is not
deliberately rationed, emphasis on a raised surface stays a weight step rather than a hue.

**Contrast rule: light overdue text.** `#7D5700` measures 6.219:1 on the canvas,
6.491:1 on the card, 5.696:1 on the well, 4.874:1 on canvas hover and 4.510:1 on well hover.
It clears 5.750:1 on the widget well and 5.407:1 on the 10 percent overdue tint used by
session-expiry warnings. Overdue text keeps its amber role under hover and press.

**Contrast rule: `--status-bad-text` on every surface its consumers reach.** The fill and
graphic token stays `#FB2C36` dark and `#E7000B` light. Dark text uses `#FF7970`, which measures
4.511:1 on the pressed destructive menu item over `--bg-elev`. Light text uses `#C00000`, which
measures 4.502:1 on well hover and 5.407:1 on the 10.2 percent `--status-bad` warning tint inside
a card. Destructive labels keep their red role under hover and press.

**Light accent and status text are solved at the token.** Lower only the source OKLCH L
channel, retain source hue and chroma, then gamut-clamp and byte-round. The first passing
bytes are `#A63A00`, `#7D5700` and `#C00000`; their immediately preceding bytes `#A63B00`,
`#7E5700` and `#C10000` measure 4.494:1, 4.489:1 and 4.465:1 on well hover. The shared tests
cover canvas, card and well at rest; canvas, card, well, overlay, replacement and card-child
hover; selection over canvas and card; and the widget card and well.

The roles split at language: words such as labels, errors and helper lines use
`--status-bad-text`; surfaces, borders, rings and non-language glyphs use `--status-bad`. When one
component contains both, its glyph and words take separate colors. The shared theme test inventories
every direct fill-token reference and asserts the mixed warning glyphs take an explicit fill role, so
a new text consumer cannot silently reuse the fill role and a glyph cannot inherit the text role.

**Contrast rule: `--fg-4` is an empty graphic only on the canvas, dark and light.** `--fg-4` measured 2.24 to 2.84 across dark raised surfaces and 2.94 on light hover, below
the 3.0 non-text floor. `--fg-4` stays unchanged; use the dedicated `--track-empty`
neutral, derived at constant OKLCH hue and chroma from `--fg-4` in each mode. Consumers also reach a hover child
inside a card and selection tint over both the canvas and a card. Range endpoints now apply that
selection tint once, at the range slot, while the cell keeps its primary selected ring.

Dark `#8B8B8E` measures 5.856 on canvas, 5.462 on card, 5.008 on well or overlay, 4.331 on a
replacement hover, 3.821 on a hover child inside a card, 3.001 on a card-child hover inside a sheet,
4.188 on selection over canvas, 3.847 on selection over card, 5.462 on the widget card and 4.954
on the widget well. Light `#7E7E82`
measures 3.874 on canvas, 4.043 on card or overlay, 3.548 on well, 3.036 on replacement hover,
3.180 on a hover child inside a card, 3.052 on selection over canvas, 3.169 on selection over card,
4.043 on the widget card and 3.582 on the widget well. It is the first rounded byte along the
constant OKLCH hue and chroma of `#7F7F83` that clears the stronger light canvas hover.
No empty-track consumer sits on `--bg-field`
or `--bg-elev-2`, and none combines selection with a well, so those candidate stacks are
unreachable rather than derivation inputs. `--status-empty` resolves through the empty-track role
at rest and under hover.
The five-step card ranking remains distinct: dark 16.89, 11.23, 5.76, 5.46 and 2.83; light 17.36,
9.99, 5.54, 4.04 and 3.48 for done, frozen, skip, empty and `--fg-4`.

**Contrast rule: `--fg-3` on a hovered surface, dark.** `--bg-hover` uses alpha 0.13. The text floor and hover-step floor bound it from opposite sides:

| alpha | hover surface | step above `--bg-card` | `--fg-3` on it |
|---|---|---|---|
| 0.14 | `#2B2B2C` | 1.312 | **4.39**, under the 4.5 text floor |
| **0.13** | **`#28282A`** | **1.261** | **4.57** |
| 0.12 | `#262628` | **1.229**, under the 1.25 hover-step rule below | 4.69 |

**Contrast rule: light hover foregrounds.** The ink overlay uses alpha 0.11. Supporting text on interactive rows takes `--fg-2`; it measures 7.502:1 over the canvas and 7.858:1 over white. `--fg-3` measures 4.161:1 and 4.358:1 on those fills, below the text floor. Only `--fg-3` is promoted to `--fg-2` under a light hover or press. Accent and status text keep their own colour because their light values clear 4.5:1 on every light hover stack. Hover fills sit below text and graphics.

**Three hover stacks exist, and they measure differently. Read the paint order, not the token.**

1. **Replacement, the normal case.** One element carries `--bg-card` at rest and `--bg-hover` on
   hover. CSS `background-color` and React Native `backgroundColor` swap the value; neither
   composites. The stack is `--bg` under `--bg-hover`, `#28282A`, and `--fg-3` measures **4.57**.
2. **Child over parent, one shipped case.** A hover child painted inside a card wrapper composites:
   `--bg` under `--bg-card` under `--bg-hover`, `#313133`. `--fg-3` measures **4.03** there and does
   NOT clear the text floor. The unread notification row is that case, on both platforms: the
   wrapper carries `--bg-card` and the inner control hovers.

3. **Layer over an opaque control.** Keep the resting fill and composite `--bg-hover-opaque`
   (`bgHoverOpaque` on Android) above it. Dark uses the existing hover value, alpha 0.13 over
   `--bg-elev`, resolving to `#39393B` with a **1.477:1** hover step. Light uses ink alpha 0.11
   over white, resolving to `#E4E4E4` with a **1.271:1** step. Alpha 0.10 rounds to `#E6E6E7`
   and measures only 1.247:1. Text on the opaque hover layer takes `--fg-2` or lighter:
   `--fg-2` measures **6.974:1 dark** and **7.858:1 light**; dark `--fg-3` falls below 4.5.

**On a hover child inside a card, supporting text is `--fg-2` or lighter.** `--fg-2` measures 7.86 on that
stack, `--fg-1` 11.82. The unread notification row already obeys this. Prefer replacement when you
build a new hover surface; compositing costs a whole neutral step and buys nothing.

0.12 was also the exact value of `--bg-elev-2`, which the hover rule below forbids on its own.

**The granted canvas carries the same value.** `design/canvas/_ds/.../tokens/colors.css` holds the
authoritative token, so it moved to 0.13 in the same change, its readme records limit 2 as closed,
and `design/canvas/README.md` lists the amendment. A canvas token that disagrees with the shipped
one is a trap, not an authority, so the two never move apart.

**Dark is not light reversed.** Reversal is the starting point. Vividness comes down, the dark end needs more separation than the light end, and every pair is remeasured, because contrast is not symmetric.

**One switching mechanism.** A class (or the mobile mode value) is the switch, and `prefers-color-scheme` only sets the initial value. Never let a media query own some tokens and a class own others.

### The accent: warm orange `#C4530F`, granted

**Granted accent: warm orange `#C4530F`, hue 45.** Rose `#BF4D8A` is **retired**, and
emerald is also excluded. There is one accent and no shortlist.

The treatment is **a dark fill with white on it**, in both modes. `--primary` is the lightest value at
which white still clears 4.5 on it, so `--fg-on-primary` is always `#FFFFFF`. The light-fill
alternative, a bright fill carrying the canvas ink, was rendered and rejected by looking.

**What choosing hue 45 cost, recorded because it is the kind of thing that gets re-litigated.** Warm
orange has the tightest separation of any candidate considered: 20 degrees from `--status-bad` in dark
mode. It only clears because `--status-done` was unbound from the accent, which removed the frequent
adjacency of a done ring beside an overdue chip. It also forced `--status-overdue` off `#B45B00` in
light mode, because that value sat 9.8 degrees away. Both consequences are already applied above.

**Emerald was discarded** because green binds the brand to a success verdict rather than to a state,
and it places Orbit in the green-checkmark habit-tracker slot `BRAND.md` names as a positioning
failure.

**Four roles, four floors, and every candidate clears all four:**

| token | role | floor |
|---|---|---|
| `--primary` | **fill and graphic only, and only for what is NEXT**: CTA background, FAB, progress toward an unfinished goal, level bar, active tab, active nav | `--fg-on-primary` on it >= 4.5 **and** it on canvas >= 3.0 |
| `--primary-soft` | **accent text only**: an accent-coloured word, link, or numeral on the canvas | it on canvas >= 4.5 |
| `--primary-text` | **rationed accent text on raised surfaces** | it on every reachable raised surface >= 4.5 |
| `--fg-on-primary` | whatever sits on the fill | 4.5 on the fill |

**One fill treatment: a dark fill with white on it.** `--primary` is the lightest value at which white still clears 4.5 on it, and `--fg-on-primary` is always `#FFFFFF`.

Consequences that hold either way:

- **`--primary` is never small text on the canvas.** Use `--primary-soft` for an accent word, even where the two resolve to the same byte.
- **A selected state may carry the accent on its glyph and label**, because selection is a live position rather than a finished one. **Completion is not selection**: a done row never takes the accent.
- A future accent change re-measures all four floors. It never eyeballs them.

**Accent rationing.** The accent takes exactly **four roles**, and nothing outside them. The list is stated as roles rather than as components, because a component list reads as exhaustive and then silently contradicts the primitives table.

| role | where it lands |
|---|---|
| **The next action** | the primary CTA, the FAB, an empty state's one filled action |
| **Current position** | the active tab, active nav, a selected card or option including its tint and ring, a focused field's ring |
| **Progress toward something unfinished** | a progress bar or ring that has not completed |
| **Identity** | one element inside the logo mark, and only there |

**It never marks completion.** A progress ring at 100% goes neutral and a done row is neutral. A streak total is normally a record rather than a next action; the Android home-screen widget is the explicit exception, where its one rationed accent use is the streak figure and `--primary-text` keeps that numeral legible on the raised card. It is **never** decorative on a card, a row, a border, a heading, a static badge or chip, or an icon that is not communicating state. **Fill exactly one action per view.** Put the colour on the background, not the label: a filled button reads as primary, accent-coloured text on a neutral button reads as a link.

**One colour, one meaning, in both directions.** Treat two hues within 15 degrees as the same colour. A status hue inside that band of the accent must move or be retired. Equally, an interactive element rendered neutral is as misleading as a static element rendered in the accent.

**Fixing a failing contrast ratio: move the OKLCH L channel only.** Chroma has negligible effect on contrast, so hold C and H and the colour stays recognisably itself. Remeasure after every change; never assume a fix landed.

### Derivation rules

1. **Alpha tokens are constants.** The surface ladder and the hairlines are white-alpha on dark and ink-alpha on light. They inherit tint optically from the canvas beneath. This is what makes the ladder cost nothing.
2. **The ladder steps must be two visible surfaces.** Adjacent steps sit at least 0.02 alpha apart. The pre-D68 ladder ran 0.04 / 0.05 / 0.06 / 0.06, and `#151517` against `#171719` is not a step.
3. **Any surface that can sit over arbitrary content is authored opaque**, never as an alpha value. That is `--bg-elev`: the overlay panel, menus and popovers.
4. **Opaque neutrals re-derive in OKLCH**: lock C per token, hold one hue across the ramp, and step L evenly in perceived lightness.
5. **Both ends stop short of pure black and pure white.** Neither can carry hue.
6. **Status colours are fixed per mode**, are never accent-tinted, and each stays more than 15 degrees from the accent hue. **`--status-done` is inside this rule, not an exception to it.** It was `var(--primary)`, which is zero degrees from the accent, and that was the same defect that retired `--status-frozen`.
7. **Primary-derived tints** come from `--primary-rgb` (web) and `tintFromPrimary()` (mobile). Never hardcode an accent `rgba` in a component.
8. **`color-scheme: light dark` is declared on the web document root**, with a matching `theme-color` meta. Web only.
9. **`prefers-contrast: more` is a token-override layer, not a third variant.** Override only the tokens that carry the contrast: raise the surface ladder toward solid, give controls a defined border, and widen each foreground gap by at least 15 points of perceived lightness. Then remeasure against the preferred APCA thresholds. Widening without remeasuring is not a fix.
10. **Suppress transitions during a theme flip.** Inject `*,*::before,*::after{transition:none !important}`, force a synchronous style flush, then remove it on the next frame. Without it every colour transition fires at once and the switch smears.

### Shape, shadow, motion, icons

- Radii, enumerated: **0 / 8 / 12 / 16 / 20 / 28**, pill 999. Cards and habit panels 20, wells 12, fields 12, chips and badges 8, overlay panel **28 top radius**, CTAs pill.
- **The app and store icon radius is set by the platform mask** (the iOS superellipse, the Android adaptive mask) and is the one radius outside this scale. It never appears on a UI surface.
- **The pill radius means interactive.** Radius 999 is reserved for something you can press. A static element never wears it, because a non-clickable shape identical to the buttons beside it collects dead clicks. Badges and status chips use radius 8.
- **Nested rounded surfaces use concentric radii: outer = inner + padding.** A parent and its inset child never share a radius. Where the padding exceeds 24, treat the layers as separate surfaces and choose each radius independently.
- Shadows: sh-1 `0 1px 2px rgba(0,0,0,.20)`, sh-2 `0 4px 16px rgba(0,0,0,.28)`, sh-3 `0 12px 40px rgba(0,0,0,.45)`. **There is no glow.** Shadows model occlusion under a lifted surface and never carry a hue.
- **Shadows are for elevation, borders are for structure.** Replace a border that only faked depth with a shadow. Keep a border that divides content or marks a state: dividers, table boundaries, input outlines, selected and focus states.
- **On dark, the 1px ring does the work.** Layered depth shadows are barely visible on a near-black canvas, so a lifted surface reads from its inset hairline plus the scrim beneath it. Reserve sh-2 and sh-3 for surfaces genuinely floating over a scrim.
- **Images carry a 1px outline** at `rgba(255,255,255,0.10)` on dark and `rgba(0,0,0,0.10)` on light, with `outline-offset: -1px` so the ring hugs the corner radius. Never a tinted neutral, which reads as dirt on the image edge, and never `border`, which changes layout.
- Motion: `--ease-standard cubic-bezier(0.2,0,0,1)`, `--ease-out cubic-bezier(0.16,1,0.3,1)`, `--ease-in` for exits. Movement durations 160/220/280; hover durations 240 for a control and 380 for a surface. Transform and opacity only for movement. Full governance in **Motion**.

#### Icons

- **Tabler**, always through the per-platform barrel `@/components/ui/icons`. Never a direct `@tabler/*` or `lucide-*` import: the barrel wraps Tabler to one prop shape so a future set swap is one file. `no-restricted-imports` enforces this.
- **Sizes are the set's native grid: 16, 20, 24. The default is 24.** Tabler is drawn on a 24 grid (`width="24" height="24"`), so an off-grid size such as 22 renders with fractional scaling and looks soft. Inline with text, size to about 1em to 1.25em so the pair scales together.
- **Stroke matches the optical weight of the adjacent text**, on the 24 grid: `1.5` beside 400-weight text at 14 to 16, `2` beside 500 and 600, `2.5` beside 700 or an emphasised standalone glyph. Tabler's own default is 2. One stroke strategy per surface; never mix icon sets on one toolbar.
- **One SVG, recoloured per state.** Icons use `currentColor` and take their states from colour and opacity, never from separate assets. Strip any hardcoded `fill` on import.
- **Outline is the default; fill marks the active state.** Use the pair to communicate state, not interchangeably.
- **Every icon is legible at 16.** Test at the smallest size it renders. Prefer a simplified glyph for small contexts over scaled-down detail.
- **Align optically, not geometrically.** Icons with directional or asymmetric mass need a 1 to 2px nudge off mathematical centre. For a pill with a trailing icon, the icon-side padding is the text-side padding minus 2.
- **Under RTL, flip only direction-dependent glyphs**: navigation chevrons and arrows, text-block glyphs, send-style glyphs. Never flip logos, checkmarks, physical objects, or media playback controls.
- Hit targets: 48 minimum, 56 comfortable. See **Accessibility**.

## Type roles

Use the semantic roles, not raw sizes.

**thomasluizon/orbit-tickets#421: the Pro drawing's type pairs are named roles.**
`display-heading` is Space Grotesk 500, -0.02em, fg-1: 28px/1.18 in the compact
shell and 34px/1.15 wide. `allowance` is Space Grotesk 600, -0.02em, fg-1, tabular:
34px/1.05 compact and 44px/1.02 wide. These values come from
`design/canvas/Orbit Pro.dc.html` lines 37, 48, 131 and 142.
Both roles retain the upgrade screen's existing `sm` boundary: 40rem on web,
640 logical pixels on mobile. The drawing names compact and wide presentations without a
transition width; preserving the existing boundary is the implementation mapping.
Shared `responsiveTypeRoles` owns the pairs; web exposes `t-display-heading` and
`t-allowance`, and mobile resolves them through `responsiveTypeStyle` as window width changes.
The existing `t-display` role is unchanged; migrating its other consumers is a separate decision.

The price-loading composition keeps the drawn settings placeholder rows and reserves the
height the loaded tier cards occupy, including annual, monthly and coupon content, so the
price response does not shift the layout.

| Role | Family | Size/Weight | Line-height | Tracking | Colour |
|---|---|---|---|---|---|
| hero | Space Grotesk | 60/600 | 1.05 | -0.025em | fg-1 |
| display | Space Grotesk | 44/600 | 1.05 | -0.02em | fg-1 |
| h1 | Geist Sans | 28/600 | 1.15 | -0.015em | fg-1 |
| h2 | Geist Sans | 22/500 | 1.20 | -0.01em | fg-1 |
| row | Geist Sans | 17/400 | 1.35 | 0 | fg-1 |
| body | Geist Sans | 16/400 | 1.55 | 0 | fg-1 |
| secondary | Geist Sans | 14/400 | 1.55 | +0.005em | fg-2 |
| meta | Geist Mono | 12/400 | 1.40 | +0.02em, tabular | fg-3 |
| eyebrow | Geist Mono | 12/500 | 1.20 | +0.08em, UPPERCASE | fg-3 |
| num | Space Grotesk | inherit/500 | 1 | 0, tabular | fg-1 |
| num-xl | Space Grotesk | 44/600 | 1 | -0.02em, tabular | fg-1 |

**A visual type role is not a semantic level.** `display`, `h1` and `h2` are looks; `<h1>` and `<h2>` are structure. Choose them independently, do not skip heading levels, and keep one `h1` per surface. Never pick a heading element for its default size.

**Heading sizes descend with level.** A subordinate heading never renders more prominently than its parent. A heading is never smaller than body text unless it is deliberately a label-style overline.

**Tabular numerals on any value that changes.** A timer, a counter, a streak count and a price all shift layout as they update.

**Text stays selectable**, including chrome. Use `user-select: none` only on a specific drag or gesture surface.

### Measure and wrapping

- **Cap body and prose measure at 45 to 75 characters, target about 65ch.** A paragraph never spans the full container. Tune line-height with the measure: a wider line needs more leading.
- **Break an unbroken token only when running prose cannot otherwise fit.** Paragraphs, links and inline code use `overflow-wrap: anywhere`. Labels, row titles, tile captions and headings never break inside a word; a label that does not fit is a copy or layout defect.
- `text-wrap: balance` on headings, `text-wrap: pretty` on body and description copy. Skip both in long-form. **Never hand-break with `<br>`.**
- **App-authored headings stay on one line at the default text size.** Test both locales at every compact width; shorten copy, restructure the layout or move secondary content to disclosure. Never shrink the text to make it fit. Large accessibility text follows the large-text rule in **Voice**.
- **Ration eyebrows: at most one per three sections, hero included.** An eyebrow labels a section, it never enumerates one. Numbered meta-labels are banned outright.
- **Person-typed and Google-provided text gets the full row width first**: habit names, event titles and emails own the headline, with time, source and other metadata beneath. If the headline still does not fit, wrap only between words to at most two lines, then use an ellipsis. An unbroken token (an email, a URL, a code or a word longer than the row) never breaks inside itself: it stays on its line and ends in an ellipsis. Keep the full text one tap away in the row's destination or expanded state and in its accessible name. Habit detail rename headings remain unclamped: words wrap and oversized tokens ellipsize without scrolling, with the full title in the rename input. Running prose, such as a paragraph or a sentence in a message, keeps `overflow-wrap: anywhere` as its last resort. App-authored labels never truncate.
- **Text aligns to the start edge.** Numbers in a table align to the trailing edge. Justified text does not exist in this interface.
- **Underlines take their metrics from the font**: `text-underline-position: from-font` and `text-decoration-thickness: from-font`, with `text-decoration-skip-ink: auto`. Only colour animates reliably on a real underline; build any other animated underline as its own element.

## Layout & spacing

- **In the compact shell (Android at every width, web below 1024), a screen shows one primary task.** Name it before building. Filters, sync status, legends, attachments and per-item extras go behind one visible, labelled entry into a sheet or menu. Each view keeps one primary view switch inline (for example Mês, Semana, Período, Agenda). Each group gets 24 of space from the next. Before a new element joins a compact screen, answer: what does the person lose if it leaves?
- **Row heights are minimum heights, never fixed heights.** Rows grow with text size; every screen works at 200% text without clipping or overlap. At the default text size, restructure labels into separate rows or move controls to disclosure instead of wrapping or shrinking them; at large accessibility text a label may wrap inside the taller row, as the large-text rule in **Voice** says.
- **Disclosure preserves selection.** Closing a sheet or menu keeps the selected date, view mode, scroll position and draft.

- **A card is not a layout primitive.** Group with space and alignment first. A card earns its place only when its content is a genuinely separable, actionable object. This is the upstream rule that stops eight identical rectangles.
- **Group with space, not lines**, in this order: negative space, then a background shape when a group must read as one unit, then a separator line as a last resort for dense data. When a separator is genuinely earned, keep it quiet, and **never pair it with a large gap: the gap already did the job**.
- **Keep controls distinct from content, in both directions.** An interactive element carries a background, a border, or a consistent control zone. A static element never wears control styling.
- **Name one focal element per view before building.** Make it win by size, weight, contrast and surrounding space, and demote everything else deliberately. Only one element animates prominently at a time.
- **At any decision point keep simultaneously-considered options at 4 or fewer.** Top-level nav 5 or fewer, form fields 4 or fewer per visual group, 1 primary plus 1 to 2 secondary actions with the rest in a menu. 5 to 7 needs grouping or progressive disclosure; 8 or more is a defect.
- **Give flex and grid children `min-width: 0`** so long unbroken content shrinks instead of blowing out the track. **Never put a fixed width or a fixed height on a text container**; use `max-width`, and `min-height` where a floor is needed. Prose and descriptions may wrap. An app-authored label never wraps and never ends in an ellipsis: see **Labels at compact width**. Plan for substantial pt-BR growth rather than one universal percentage.
- **Align to shared edges.** Every stray edge reads as noise. Use one spacing step per level of subordination.
- **Order by importance.** The most important content sits near the top and the leading edge. Within a row, identifying content leads and metadata and actions trail. Think in leading and trailing, never left and right, and use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`) for anything direction-dependent.
- **Hint at hidden content.** Progressive disclosure needs a visible affordance: a row of content-hugging chips shows at least 16px of the item cut by the scroll edge and hides at least 16px of it, choosing the gap from the spacing scale. Other scroll rows let the next item peek 16 to 32px past the scroll edge. A disclosure control whose label states what is hidden is an alternative.
- **Align shared elements across side-by-side cards to the same Y** and pin each card's CTA to its bottom, so the buttons form one line.
- **Build multi-column layouts with CSS Grid**, never flexbox percentage math. Prefer container queries so a component adapts to its column rather than the viewport. Web only.
- **Structural hacks are banned:** a negative margin undoing a parent's padding, an escape-hatch `calc()`, and absolute positioning used to dodge layout flow.
- **Respect `env(safe-area-inset-*)` on fixed elements**, using `max(<base>, env(...))`, and ship `viewport-fit=cover`.
- **Content bleeds, controls float.** Backgrounds and media may reach the viewport edge; controls and text stay inside the layout margins and safe areas.
- **Breakpoints come from the content, not from device presets.** Hold the expanded layout while it genuinely fits and collapse late. Test the smallest and largest sizes first.
- **Never park a critical action where it can be clipped**: the bottom of a resizable pane, below the fold of a fixed-height overlay, behind the keyboard. If an overlay's body scrolls, its action row does not.
- **A sidebar uses the same background as the canvas.** A hairline is the only separation it earns. Web only.

## Primitives kit

Web in `apps/web/components/`, mobile mirror in `apps/mobile/components/`: same name, same props, same behaviour.

**Expose component state as `data-*` attributes** so styling and tests hook onto state rather than class names. A boolean attribute is present or absent, never `"false"`. An enumerated attribute carries a string value.

| Primitive | Key specs | Web | Mobile |
|---|---|---|---|
| NavHeader | Object views: minimum height 56px, start-aligned sentence-case Geist Mono 12/500 title with no tracking, back chevron 24/2.0, right slot help / close / share | `ui/app-bar.tsx` | `ui/app-bar.tsx` |
| PageHeader | Pushed pages: 8px row gap, 8px top and bottom padding, 8px start and 16px end padding, hairline below; ghost back button 48px with arrow-left 20; start-aligned sentence-case title at `--fs-lg`/500 on one line, never truncated. Avisos adds an options button (`dots-vertical`) at the trailing end of the first row; its menu holds 'mark all read' and 'clear all' (with a confirmation). Avisos shows no bell, because it is the destination. Drawn in Orbit Busca, Sobre, Pro, Assinatura and Avisos. | `ui/page-header.tsx` | `ui/page-header.tsx` |
| Pager | caller-controlled segments and back/forward controls, unavailable handlers disable controls, closing action replaces forward | `ui/pager.tsx` | `ui/pager.tsx` |
| SegmentedControl | 2 to 4 views of one subject, selected neutral surface with current-position ring, caller words, whole-control and option disabled states. In the compact shell it is the last line of its screen header group (never above the header), spans the content column, centred, with equal segments; each label is one word on one line at 320; it never wraps and never truncates | `ui/segmented-control.tsx` | `ui/segmented-control.tsx` |
| SectionTitle | Geist Sans 20/500 -0.01em, optional mono uppercase eyebrow, fixed scale spacing, no action slot | `ui/section-label.tsx` | `ui/section-label.tsx` |
| ListRow | minimum height `--row-h-compact` (52) for one line or `--row-h` (68) for two lines; rows grow at larger text sizes; icon 24/1.5 in a 28px slot, title Geist Sans 17/400 on one line, desc 14 fg-3 on one line or absent, value fg-3 + trailing chevron 24 fg-3; when title and value do not fit one line at 320, the value moves to the supporting line; in one group every row has an icon or none does; **draws no rule of its own**; 16 inline inset and one trailing edge for every body part, 12 block padding; in a padded column the content shares the column edge and an outset fill and hit area reach 16 beyond it, danger icon = status-bad and danger title = status-bad-text | `ui/list-row.tsx` | `ui/list-row.tsx` |
| SettingsGroup | the only owner of row separation: a hairline *between* adjacent rows, never after the last | `ui/settings-group.tsx` | `ui/settings-group.tsx` |
| Switch | a labelled switch renders as a ListRow whose whole body toggles it; 48x28 pill, 22px thumb, on = primary / off = `--track-empty` | `ui/switch.tsx` | `ui/switch.tsx` |
| Radio/RadioRow | 24px, selected = primary fill + 9px dot, else inset 2px `--track-empty` ring | `ui/select-check.tsx` | `ui/select-check.tsx` |
| Badge | **radius 8 chip, never a pill**, Geist Mono 12/500 +0.06em sentence case, `text-box` trimmed; variants solid / outline. The solid badge uses `--bg-well` fill with `--fg-1` text meeting 4.5:1 contrast in both themes. | `ui/badge.tsx` | same |
| PillButton | pill CTA, radius 999, 5 variants x 2 sizes off shared `BUTTON_SIZES`. Full canon in **Buttons** | `ui/pill-button.tsx` | `ui/pill-button.tsx` |
| StatTile | radius 20, `--bg-card` + inset hairline ring, padding 16 in the compact shell, value Space Grotesk 22/600 tabular on one line, label 14/20 fg-2 on one line, never clamped and never broken inside a word. A row holds only as many tiles as keep every label on one line at 320 in pt-BR, at most 3. A long value (a weekday, a habit name) uses its short form or becomes a list row. A plain figure row with no tile chrome is preferred where the figures are not separable objects | `ui/stat-tile.tsx` | same |
| TierCard (composed) | radius 20, selected = `--primary-dim` tint + inset 1.5px primary ring; price Space Grotesk 22/600 | `upgrade/plan-selection.tsx` | same |
| InfoCard | radius 20, borderless tonal aside, **one tone**: `--bg-elev` with an fg-3 icon. There is no accent variant, because a static informational card is not one of the four accent roles | `ui/info-card.tsx` | same |
| Input | min-height 54, radius 12, `--bg-field` + inset `--border-control`, **visible persistent label** 14/500 fg-2, single line or multiline | `ui/input.tsx` | `ui/input.tsx` |
| OtpInput | 6 boxes over one real input, radius 12, `--bg-field`, active inset 2px primary, Geist Mono 26/500, `type="text" inputmode="numeric"`, `autocomplete="one-time-code"`, `spellcheck="false"`. Paste of a whole code MUST work | `ui/otp-input.tsx` | `ui/otp-input.tsx` |
| Checkbox | 24px neutral completion box, error ring, distinct disabled and loading states, button or paint-only span | `ui/checkbox.tsx` | `ui/checkbox.tsx` |
| CheckRow | whole-row checkbox hit target, required label, error replaces description, trailing mono value | `ui/check-row.tsx` | `ui/check-row.tsx` |
| TimeField | min-height 54, radius 12, 24-hour wire value with `h23` or `h12` presentation | `ui/time-field.tsx` | `ui/time-field.tsx` |
| DateRow | formatted immutable date and optional reason, with no control role, focus or chevron | `ui/date-row.tsx` | `ui/date-row.tsx` |
| Composer | a one-line pill at rest, minimum height 56 (`--touch-comfy`): the Astra glyph button at the leading edge inside (Hoje in the compact shell and habit detail at every width), one input, an attach `+` icon button, and one filled send action at the trailing edge, hit areas adjacent. Photo, document and voice open from the `+` Menu, which follows the Menu width rule. The input grows to 5 lines, then scrolls inside. Recording shows the timer and a visible stop; transcribing shows a one-line status; attachments show as a tray inside the container; at limit and offline show the reason and recovery above the pill; retry takes the send position. The top rule stays. State exposed without class hooks | `shell/composer.tsx` | `shell/composer.tsx` |
| Overlay | see **Overlay** | `ui/sheet.tsx` | `ui/sheet.tsx` |
| Toast | brief confirmation and undo only; stable live region; timed confirmation uses a 5000ms minimum; undo stays available until dismissed; done uses `--status-done`; actionable errors and sync failures stay in a persistent surface | `ui/toast.tsx` | `ui/app-toast.tsx` |
| Skeleton | one accessible busy unit shaped as habit row / settings row / stat tile / grid; opacity pulse only | `ui/skeleton.tsx` | same |
| TabBar | caller-owned items and words, one current position, top hairline on opaque canvas, 80 tall above the gesture inset: a 56x32 indicator that carries the press and hover fill around icon 24 (active filled primary / inactive outline fg-3 1.5), 4 of space, label 12/500 on a 16 line, one line (active primary-soft / inactive fg-3), the block centred with 14 above and below; navigation only; a tap on the active item scrolls it to the top; create belongs to the shell | `navigation/bottom-tab-bar.tsx` | `navigation/bottom-tab-bar.tsx` |
| EmptyState | required title, one action; 96px real `OrbitMark`, `--fg-1`, no arc and no accent. An Astra-owned region takes `AstraGlyph` instead | `ui/empty-state.tsx` | same |
| ErrorState | one caller-owned message and one optional text action; no code, severity or detail slot | `ui/error-state.tsx` | same |
| CapacityNotice | neutral limit message, optional explanatory body and one action; never `--status-bad` | `ui/capacity-notice.tsx` | same |
| ProgressBar | 8px pill track `--track-empty`, primary fill | `ui/progress-bar.tsx` | same |
| ProgressRing | thin band, primary sweep on a `--track-empty` track | right rail / Today | same |
| BarChart | 96px neutral bars, one adjustable control, readout and first/last dates | `ui/bar-chart.tsx` | `ui/bar-chart.tsx` |
| DayStrip | compact horizontal history, habit and account scopes, caller-owned labels and words; done and active are neutral, frozen uses a neutral snowflake, missed is outlined, not scheduled is a well, and only today uses primary | `dates/day-strip.tsx` | `dates/day-strip.tsx` |
| DayCell | full-column month-grid target, minimum height 44px, tabular day number, read-only by default; `scheduled={0}` derives not scheduled, counts derive none, partial, or full, partial uses the exact fraction, full is neutral, and only today or selected uses primary position treatment | `dates/day-cell.tsx` | `dates/day-cell.tsx` |
| MonthGrid | semantic month group with caller-owned weekday labels, column count derived from those labels, and no header when the label list is empty | `dates/month-grid.tsx` | `dates/month-grid.tsx` |
| EventRow | read-only timed or all-day event row with required title and optional source; time and all-day label are mutually exclusive | `dates/event-row.tsx` | `dates/event-row.tsx` |
| HabitRow | inside a tonal panel: 46px emoji well radius 12 `--bg-well`, name Geist Sans 16/500, meta 12 fg-3, trailing 30px status ring (done `--status-done` filled with a filled check, empty `--status-empty` track, overdue `--status-overdue` ring, bad habit `--status-bad`, read-only dimmed and not tappable, parent a done-over-total ring). **Never frozen and never skipped**, see the habit list rules. Per-row overflow menu | `habits/habit-row.tsx` | `habits/habit-row.tsx` |
| BlockFrame | the container every generative block inherits: five states, header count from `items.length`, one pinned action row, block scoped polite live region, no entrance animation | `ui/block-frame.tsx` | `ui/block-frame.tsx` |
| Proposed | the tenth state wrapper: `--fg-3` inside an inset dashed hairline, radius 12 field / 8 row / 20 block, never the accent | `ui/proposed.tsx` | `ui/proposed.tsx` |

## Overlay

One primitive covers the drawer, sheet, dialog and modal. It presents as a bottom sheet below the `sm` breakpoint and as a centred dialog at `sm` and above. **83 callers inherit whatever this primitive gets wrong**, which is why the rules below are mechanical.

### The library, per platform

| platform | library | version and contract |
|---|---|---|
| **web** | **`@base-ui/react`**, `Dialog` from the `./dialog` subpath | 1.7.0, MIT, `github.com/mui/base-ui`, peer `react ^19` |
| **mobile** | **`@lodev09/react-native-true-sheet`** | 3.11.3, already installed |

**Web rationale.** The primitive is `ui/sheet.tsx`, built on Base UI's `Dialog`. It replaced `app-overlay.tsx`, which hand-rolled the backdrop, the focus trap, the body-scroll lock, the overlay stack and the portal in one 375-line component carrying a `no-giant-component` deferral. That component rendered `<dialog open>` rather than calling `showModal()`, so it got none of the platform's free behaviour and rebuilt the trap, the background inertness and the Escape handling by hand, then needed `z-[9999]` because it never entered the top layer. Base UI supplies all of that behind one `modal` prop, which is code standard 11 applied exactly.

It also deleted `apps/web/lib/overlay-stack.ts` and two defects with it: the `z-[9999]` that violated this document's own arbitrary-z-index ban, and a grabber with no gesture handler, so web drag-to-dismiss was decorative and nothing was lost by not replacing it. Anatomy: `Dialog.Root` (`open`, `modal`, `disablePointerDismissal`, `onOpenChangeComplete`), `Portal`, `Backdrop`, `Viewport`, `Popup`, `Title`, `Close`. Note the peer dependency `@date-fns/tz ^1.2.0`, which `apps/web` does not yet have; `date-fns ^4.4.0` is already present.

**Mobile rationale.** The library is not the defect, the wrapper is. TrueSheet handles detents, scroll coordination, the dimmed backdrop, the keyboard and the Android back button natively. `@gorhom/bottom-sheet` stays banned by `local/no-gorhom-sheet`, because its `present()` and portal no-op on the New Architecture in release builds. **Never navigate in the same tick as closing a sheet.**

**The 83 callers were migrated in R1 (`#42`).** Both platforms now expose one close path: take `{ sheetRef, closeSheet }` from `useSheetHost()`, pass `ref={sheetRef}`, and call `closeSheet()` or `closeSheet(action)`. `onClose` fires only from the completed dismissal, so a caller never flips the open state directly.

**One exception, and only one.** An account replacement under a running tab hides the previous
account's overlay immediately, without an exit transition. Most owners reset their open flag through
`useAccountScopedState`. `CreateHabitModal` gates its rendered sheet by account generation before
its owner closes the flag. The exit would keep the previous account's content visible. Nothing else
may flip the flag.

Android wide sheets stay bottom-attached to the centred shell column with TrueSheet's `maxContentWidth` and `anchor: 'center'`. TrueSheet ignores `presentation` on Android and supports `detached` only on web, so web keeps its centred dialog at `sm` and above as a platform adapter.

### Sizing

- **An overlay is content-height by default.** It grows to its content and stops.
- **A fixed detent is allowed only where the content is genuinely long, and never as the default.** The mobile primitive opens on the `'auto'` detent so a short sheet takes only the height it needs; the older `['50%','80%']` default opened a short sheet with a third of the panel empty.
- An overlay never exceeds 85% of the viewport height. Past that it is a screen, not an overlay.

### Scroll ownership

- **Exactly one page-level scroll container per overlay, owned by the primitive.**
- **A caller never nests its own scroll container inside a scrollable sheet**, except for the bounded TimeField columns below. TrueSheet's native `scrollable` stays off while the primitive owns the body scroller.
- **An overlay never opens scrolled away from its own first line.**
- `overscroll-behavior: contain` on the scroll container, so scrolling inside never scrolls the page behind it.

**TimeField is the one sanctioned nested-scroll exception.** Its hour, minute and optional
day-period columns scroll only their own values. Each column has a bounded viewport, capped at
220px and shrinking with the space left by the sheet header, body padding and pinned footer.
The primitive's `boundedBody` option owns that allocation and keeps the page-level body scroller.
Columns must not transfer scrolling to the body: web uses `overscroll-behavior: contain`, and
Android disables nested scrolling on each column and wraps its viewport in a local gesture-handler
root with a native scroll handler that activates on touch-down and disallows interruption.
TrueSheet yields the claimed stream before the first move, keeping drags with the column in
either direction. Simultaneous option tap handlers preserve selection and reject drags, while
the radio controls retain keyboard and accessibility activation. Scroll indicators expose the
remaining values.

Render tests on both platforms must prove that the selected values open fully in view and every
value remains reachable in short, narrow windows. Done stays in the pinned footer, cancellation
discards the draft, and localized hour-cycle selection and keyboard entry keep their existing
contract. No other caller gains a nested scroller from this exception.

### Anatomy

Grabber (mobile presentation only) · header (title, optional description, close) · body (the single scroll container) · footer (actions, pinned, never scrolling with the body) · safe-area and keyboard insets on both.

Every sheet footer on web and Android applies the action-row rule in **Buttons** through `ActionRow`: trailing, label-hugging `sm` actions, with the ghost dismissal before the filled action when paired.

**The sheet primitive owns the body's outer padding on both platforms:** 8px at the top,
24px horizontally and 24px at the bottom. Callers add only spacing between their content groups,
never a second outer inset or a trailing spacer. A card or row inside the body keeps its own
internal padding. Header padding is 16px top, 24px horizontally and 8px bottom; the pinned action
row uses 16px top, 24px horizontally and 24px bottom. Safe-area clearance and mobile footer
reservation belong to the primitive separately from this content padding.

**Fixed-column date grids keep all seven 44px targets inside the body.** The date picker requests
a 308px minimum body width. The primitive reduces only that body's horizontal inset as the panel
narrows below 356px, stepping down the spacing scale (24, 16, 12, 8, 4) to the largest inset that
still fits the grid, and restores 24px when space permits. The top and bottom padding, header and
footer stay canonical. This stepped inset applies on both platforms;
ordinary sheet content keeps its 24px horizontal inset at every supported width.

**The panel is `--bg-elev`, authored opaque.** An overlay sits over arbitrary content, so a translucent panel cannot have its text contrast checked. The backdrop is `--scrim`. Radius 28 at the top on mobile presentation, 20 all round at `sm` and above.

### Dismissal contract

- Escape, backdrop press, the close button and Android back all route through one `requestDismiss(reason)` path. Escape dismisses whatever opened last.
- A dirty form blocks interactive dismissal and routes to a confirm instead. It never discards silently.
- On open, set the background `inert`, then move focus into the panel. **For a destructive confirmation, focus the least destructive action.**
- On close, restore focus to the trigger. If the trigger is gone, move focus to the nearest logical container.
- The scrim is a control, not decoration, so it keeps its pointer events.

### States

All eight, by name: default · hover · focus · active · disabled · loading · error · empty. The canvas draws the overlay at **both short content and long content** in `design/canvas/Orbit Sobreposicoes.dc.html`, so the sizing and scroll rules are visible rather than described.

## Buttons

`PillButton` is the one pill CTA. Its geometry is shared data in `packages/shared/src/theme/button.ts` so the two mirrors cannot drift.

- **Variants:** `primary` (accent fill, `--fg-on-primary` text, no glow), `secondary` (fg-1 fill, canvas text), `ghost` (transparent, inset 1.5px hairline-strong ring), `destructive` (status-bad fill), `caution` (status-overdue fill). `ConfirmDialog` builds its action row from `PillButton`, never a hand-rolled pill.
- **Sizes:** `sm` is the default for every pill. Explicit `md` is reserved for the single primary action that ends a flow: a form submit, a Wrapped player action, or the full-width action of a mobile overlay. At most one `md` pill renders per view. A size keeps its visible height plus horizontal padding plus label, icon and gap. Small pills extend their hit area to 48px around their existing visible box. Keep the visible edges and action-row gaps unchanged; give clipping or native hit-testing parents room for the extension, and never overlap another target. Never hand-tune per call.
- **Action rows:** two or more pills acting on the same section render through one `ActionRow`, in one size, on one line at the trailing edge with a 12px gap. Ghost actions precede the filled action. Wrap only when the row cannot fit, and retain the trailing edge on every wrapped line. Sheet footers apply this same rule.
- **Per-item actions:** an action on one list item belongs in that row's own trailing action slot, never in a pill stacked under the item.
- **Width, hug by default.** A lone CTA in a wide container caps at about 360px and never spans a desktop content column. Full-width is sanctioned ONLY in: the single primary action of a mobile overlay, a form submit at or below the mobile breakpoint, and a full-screen empty-state primary CTA.
- **Empty-state actions** follow the same action-row rule and hug their labels.
- **Labels are verb-first and 1 to 2 words.** Strip words the surrounding title already carries. A confirmation button repeats the consequence, so the dialog is answerable without reading the body: "Delete habit", never "Yes".
- **One label per CTA intent per surface, and the name survives the whole flow.**
- **Keep submit enabled until the request starts**, then disable with a spinner and **keep the original label**, because the label is what tells assistive tech which button is busy.
- **Icons: a leading glyph where it aids recognition**, sized and gapped from the size token, with the icon-side padding 2px tighter. An icon-only pill MUST carry a localized accessible label.
- **Press feedback:** `scale(0.96)` on pointer-down over 150ms, `ease-out`, via a CSS transition so a release mid-press returns smoothly. A `static` prop disables it where motion would distract.

## Surface rules

- **Translucency ladder on dark:** 0.04 card / 0.06 field / 0.08 well / 0.12 elev-2, white-alpha over the canvas. Surfaces stack by alpha, not by lighter hexes.
- **Opaque white cards on light.** Never translucent.
- **Inset 1px hairline rings instead of borders.**
- **No opaque card-on-card on dark, and never a translucent surface stacked on another translucent surface.** Legibility collapses.
- **D34, one separation device per boundary.** Separation uses exactly ONE of a surface step, a hairline, or space. Never two. Space is the default choice among the three.
- **Separator and border are separate roles**, even though `--hairline` and `--border-control` carry the same value today. A separator divides content; a border encloses a control. They diverge the first time inputs are restyled.
- **Separation is the container's job, never the row's.** A row cannot know whether it is last, so a row that draws its own rule trails one into a section break. Never stack two hairlines.
- **Blur and glass are never a default or a decoration.** Orbit's ladder is an alpha ladder, not a blur ladder. An animated blur stays at 8px or less, short, one-time, and never on a large surface.
- **Do not use flat grey text on a translucent surface.** The whole dark ladder is translucency, so secondary text on a card takes the next weight step up rather than a dimmer colour.

## Habit list

- **Every top-level habit lives on its own tonal panel:** `--bg-card` plus an inset `--hairline-ghost` ring, radius 20. Single-row for a simple habit, multi-row for a family on ONE panel.
- **Panel row height matches across kinds.** A single-row panel is sized to the same row height as a family's parent row.
- The panel is the quietest step so the `--bg-well` emoji squares inside it read as the lighter elevation.
- **Two levels inline, then drill in.** One fg-3 chevron column expands a top-level parent in place and opens the drill anywhere else. The drill head carries a round back button, the parent's name and a mono done count; deeper than one level, a home row returns to all habits.
- **Sub-habit rows:** indent, smaller well, dimmer text. **Zero connector or tree lines.**
- **The per-row overflow menu stays.**
- **Habit emoji render in full colour.**
- **There is no habit colour system. Colour-as-data is dead**. D30's curated palette of about 8 habit colours and D31's monochrome emoji tinted by that colour are both **rejected**, not deferred. Reason: the accent is rationed to exactly four roles and every status is already unbound from it and rendered in neutrals, so adding 8 more meaning-bearing colours reopens the "the accent does six jobs on one screen" defect this redesign exists to close. A habit is told apart by its emoji, its name and its ring, and by nothing else.
- **A row's status lives in its trailing ring, and never in the accent.** Done is an `--fg-1` disc with a filled check; empty is an `--status-empty` track; overdue takes `--status-overdue`; a bad habit takes `--status-bad`. A day the person cannot log renders the dot dimmed and not tappable, and a parent renders a done-over-total ring instead of a dot. The accent enters this column only on progress toward something unfinished.
- **A habit row is never frozen and never skipped**. `StreakFreeze` is `(UserId, UsedOnDate)`, so a freeze marks a **day** for a **user** and `Habit` carries no freeze member at all. Frozen renders on the streak day strip inside Progresso and nowhere else. Skipping advances the schedule, so the row leaves the day rather than taking a status; only a flexible habit even writes a log row for it. `--status-frozen` therefore serves the day strip only, and `--status-skip` binds to no habit-row state. No new surface may use it.
- **Never animate the habit list's data while the user is reading or acting on it.**

## Listing

How a collection renders at every size. This is checkable, not a taste call.

| count | rendering |
|---|---|
| **0** | The empty state: the `OrbitMark` at 96px, one line naming what belongs here, one primary CTA. An Astra-owned empty state uses `AstraGlyph`. Never a blank region and never bare text. |
| **1** | The normal row treatment. Never a special "only one" layout. |
| **few (2 to 7)** | The normal list. No pagination, no search, no count. |
| **many (8 to 20)** | The normal list plus a count in `meta`. Add search only if the item names are user-authored. |
| **too many (21 or more)** | Virtualize or paginate, and show a persistent filter or search. **Never let a wrapping pill row carry it**: the checklist-template pills break at 15 today, and that is the defect this rule exists to stop. |

A collection whose item count can exceed 20 declares its "too many" behaviour before it ships.

## States

**Every component ships its full state set before it is done: default, hover, focus, active, disabled, loading, error, empty, at capacity.** A missing state is an unfinished interface, not a follow-up.

**Anything that can carry an inferred value ships a tenth state, `proposed`.** Its rules live in `## Information architecture`. A form field, a row or a block that renders a machine-suggested value identically to a typed one is a defect, because the person cannot tell what they decided from what was decided for them.

**Every data surface ships the loading / empty / error triad.**

- **Loading:** a skeleton for any operation expected to exceed about 300ms. Below that, show nothing rather than a flashing spinner. The skeleton is **shaped like the final layout** and occupies the final dimensions, so nothing shifts when data lands. Set `aria-busy="true"` on the updating region.
- **Empty:** a composed invitation to act. It says what this place is and how to fill it, with one clear next action. A search or filter empty state names the query and offers an exit. **Never park persistent information in an empty state**; it disappears the moment content exists.
- **Error:** see **Voice**.
- **Disabled:** use native `disabled` when a control is genuinely unavailable. Use `aria-disabled="true"` only when the control must stay focusable and discoverable, and then block activation in the handler and explain why nearby. Never set both. A natively disabled control cannot carry a tooltip, so the reason goes in visible text beside it.
- **At capacity (the ninth state):** the surface has reached a real boundary, for example a plan limit or a list ceiling. **A boundary is not an error**: it uses neutral tokens, never `--status-bad`. It states the limit and the one action that changes it, and it carries **no upgrade call to action**.

## Voice

**Pillars.** Calm. No shame language on a missed day. No exclamation on success. Quiet celebration. Describe, never sell. "ADHD-friendly" is allowed; "treats ADHD" is never.

**pt-BR register: "você", plain and warm, never corporate and never slang.** Address the reader directly. "Orbit" and "Astra" are never translated, and both carry `translate="no"` so auto-translation cannot garble them.

**Tone flexes with the stakes:** warm on success, onboarding and empty states; neutral on routine actions and settings; calm and plain on errors and destructive confirmations; serious and explicit on data loss.

**The six Pierre rules**, extracted mechanically:

1. **The product speaks in the first person.** Astra speaks: "Me diz o que você fez hoje. Eu registro."
2. **Short question, short answer.**
3. **A supporting line explains the MECHANISM, never restates the promise.** Every word is new.
4. **Genuinely colloquial** where pt-BR allows it. Never "otimize", never "potencialize".
5. **Zero exclamation marks.** Confidence, not euphoria.
6. **A CTA is a plain verb.** "Começar grátis", never "Comece sua jornada".

### Rules

- **Strings stay short:** 1 to 2 words on buttons, chips, tabs and labels. Sentences live only in body, description and empty-state copy.
- **Labels at compact width.** A tab or segment label is one word. A tile caption fits its measured column (about 90 at 320 for three columns). Write pt-BR first. Every app-authored label holds one line with no ellipsis at 320, 360, 384 and 412, in both locales, at font scale 1.0.
- **Large accessibility text.** Above Android font scale 1.3 or web text zoom 130%, up to 200%, an app-authored label may wrap to more lines inside a taller row. It never ends in an ellipsis and is never clipped, and its icon and trailing control align to the first line. Keeping one line there would mean clipping or shrinking text the person asked to be large.
- **Say it once.** No header restating the intro beneath it. Each element does exactly one job.
- **Ban supporting copy by default.** Do not add a subtitle, a helper line, or a descriptive sentence beneath a heading, a label, a card, or a settings row. Prefer one concise, self-explanatory heading. Add supporting copy only when the owner asks for it, or when it genuinely prevents a misunderstanding or an error, and **never** to restate the heading above it. **The form-field carve-out is explicit and survives unchanged:** an input still carries a visible, persistent label, and its helper text still lives in the markup, per "a placeholder is never a field's only label" in **Accessibility**. The two rules are not in conflict, because a field label is not supporting copy.
- **Name every control by what the person controls**, never by how the system is built.
- **A settings toggle is labelled for its ON state.** "Send read receipts", never "Don't send read receipts". Link directly to a referenced setting rather than describing the path to it.
- **One capitalization policy per element type.** Sentence case is the default. **Store copy in natural case and control presentation with `text-transform`.** Never type UPPERCASE into a string.
- **A multi-step flow uses one vocabulary.** Pick "Continue" or "Next" and keep it.
- **Link text carries standalone meaning.** "Read the billing docs", never "Click here" or a bare "Learn more".
- **Errors say how to fix, next to where it broke.** Plain language, active voice, no blame, no humour, no bare code, no "Oops". Phrase hints positively and show them before the mistake. A validation error never clears the input. If the same error keeps firing, redesign the interaction rather than rewording it.
- **Reserve confirmation dialogs for genuinely destructive, irreversible actions.** A confirmation names the specific action and its consequence, never "Are you sure?".
- **Never invent precise-looking numbers.** A figure comes from real data, is explicitly marked mock in the markup, or does not ship.
- **Never build a sentence by concatenating fragments around a variable.** Word order changes per language. Use full templated strings with pluralization.
- **Match the verb to the input device**: "tap" on mobile, "click" on web with a pointer, "select" when both are possible.
- **No em dash and no en dash** anywhere in copy, code, or this document. Use a comma, a period, or a hyphen.

### The banned-word set

Enumerated and greppable, so `/deslop` can execute it over 2,905 i18n keys without a taste call. Each entry declares its scope. **microcopy** = i18n string values. **long-form** = the landing page, ADRs and store copy. **both** = everywhere.

| # | pattern | scope |
|---|---|---|
| 1 | `!` on a success, completion or celebration string | both |
| 2 | "It's not X. It's Y." and every binary-contrast frame | long-form |
| 3 | "not just X, but Y" | long-form |
| 4 | Throat-clearing openers: "In today's world", "Let's face it", "The truth is" | long-form |
| 5 | Faux-insight setups: "What nobody tells you", "Here's the thing" | long-form |
| 6 | Colon reveals in a heading: "One habit: everything changes" | long-form |
| 7 | Importance puffery: "crucial", "pivotal", "vital", "essential", "game-changing" | both |
| 8 | "delve", "leverage" (verb), "harness", "unlock", "elevate", "empower", "supercharge", "seamless", "robust", "cutting-edge", "revolutionary" | both |
| 9 | Weasel attribution: "experts agree", "studies show", "science says" | both |
| 10 | Fake-strong verbs where a plain one exists: "utilize" for use, "commence" for start | both |
| 11 | Synonym cycling for one product noun across a surface | both |
| 12 | Negative listing: "no fluff, no gimmicks, no nonsense" | long-form |
| 13 | Dramatic one-word fragmentation: "Simple. Powerful. Yours." | long-form |
| 14 | Mechanical rule of three in a single sentence | long-form |
| 15 | Title-case headings | both |
| 16 | Boldface used for emphasis inside running body copy | long-form |
| 17 | Em dash and en dash | both |
| 18 | "Oops", "Uh oh", "Whoops" | both |
| 19 | "Are you sure?" as a confirmation body | microcopy |
| 20 | "Click here", "Read more", bare "Learn more" | both |
| 21 | "the user" in reader-facing copy | both |
| 22 | "otimize", "potencialize", "maximize" (pt-BR) | both |
| 23 | "Comece sua jornada" and journey framing | both |
| 24 | A descriptive subtitle restating the heading above it | both |
| 25 | "treats ADHD", "cures", "fixes your brain" | both |

**The structural tells do not apply to UI microcopy.** A button label has no narrative shape. Scope explicitly stating the theme, dialogue used for philosophical debate, and flat event escalation to long-form only.

## Desktop density & orientation

- At the desktop breakpoint, content composes **horizontally** where the surface calls for it. Calendário keeps one centred column inside the 740px content cap.
- **The main content column caps at about 740px and is centred.**
- **The right stats rail is deleted** (D69). Progresso owns the question it was answering, and two surfaces competing to summarise is what made it read as raw. The full-screen conversation replaces the destination in the centred content column on wide web.
- **Sidebar:** grounded at the bottom with the account chip and a create button above it, on the canvas background with a hairline as its only separation.
- Primary app sections are one click away in the desktop sidebar.
- **Never hide core functionality at a breakpoint**, and keep one information architecture across every context. Adapt the layout, not the feature set.
- **Match a feature's flow shape to its neighbours**, not just its surface.
- **In the compact shell, a sheet or menu is the first home for secondary content.** Keep one visible, labelled entry for it. A menu or sheet closes before the next sheet opens; a confirmation dialog over a sheet stays allowed, per the Overlay dismissal contract. At wide width, inline progressive disclosure comes first.
- **Do not overload the entry point.** The first screenful is a table of contents, not the whole book.

### The allowed shell divergences, enumerated

Exactly these three, and nothing more. Everything below the shell stays parity-bound.

1. Navigation chrome: sidebar with its Astra row (wide web) versus the four-tab bar (compact web and Android).
2. The command palette and keyboard shortcuts.
3. Hover affordances on that shell chrome.

**The desktop stats rail was the fourth and is deleted** (D69). The list got shorter, which is the
only direction it is allowed to move without a decision.

The conversation opens full screen on both platforms, so it is not a divergence.

**Any new divergence found during canvas work comes back as a request, never as a judgement call.**

### Stacking

One semantic z-index scale, shared across both platforms. Overlays stack on a named tier, never a hand-picked number.

Six tiers ascend: `dropdown` (1000) < `sticky` (1100) < `modalBackdrop` (1200) < `modal` (1300) < `toast` (1600) < `tooltip` (1700). Plus two carve-outs:

- **`celebration` (1500)** sits just below `toast`.
- **`tourSpotlight` (1400)** sits above `modal`, because a tour points AT modals.

Local sibling stacking stays local: `z-[1..9]` or `zIndex: 1..9`. The one banned thing is the arms-race literal.

## Sub-screen navigation

Every sub-screen shows a visible back affordance, on both platforms and at every breakpoint. Hardware or browser back is never the only way out.

**Wayfinding.** Every screen answers: where am I, where can I go, what is there, and how do I get out.

**On a client-side route change**, update `document.title` to the new context (most specific first) and move focus to the new view's `h1` (given `tabindex="-1"`) or to `main`. Restore scroll position on back and forward navigation; scroll to top on forward navigation. Web only.

## Motion

Motion is governed on two axes: **whether** to animate, then **how**. The first axis subtracts. **This section carries verbatim from the pre-D68 spec (D68 decision 11). Spacious argues for less motion, not different rules.**

### Whether (the gate)

**Gate every animation on frequency.**

| frequency | budget |
|---|---|
| 100+/day (keyboard shortcuts, command palette, core nav, habit toggling) | **none, ever** |
| tens/day | near-imperceptible or none |
| occasional (modals, sheets, drawers, toasts, settings) | the standard scale below |
| rare / first-run (onboarding, milestone, celebration) | the only place the delight budget lives |

**Every animation must name its purpose from this closed list:** feedback · spatial consistency · state indication · preventing a jarring change · explanation · delight (rare/first-run tier only). **If you cannot name it, delete it.**

**Never animate data the user is trying to read or act on.**

**When motion is wrong, fix it in this order and stop at the earliest move that works:** (1) delete, (2) reduce, (3) fix the easing, (4) fix origin or physicality, (5) make it interruptible, (6) move it to the GPU, (7) make timing asymmetric, (8) polish. **Deleting outranks tuning.**

**Delight amplifies, never blocks.** Under about 1 second total, never delaying core functionality, always skippable, and rationed to earned moments.

**Motion is never the only feedback channel.** Every animated state change also carries a static cue: a colour change, an icon swap, or a label.

**A high-frequency interaction gets instant feedback or an `opacity` / `background-color` transition of 150ms or less.** Never a full entrance on a hover or a keystroke.

### Hover, and why it is not governed by the frequency gate

**A clickable thing with no hover state is a defect.** A hover transition is feedback, not decoration, so the frequency gate does not suppress it: the gate subtracts animations that play at you, and a hover state answers you. Every interactive element carries one.

**A hover reads slower than a press.** The durations below are deliberately longer than the movement scale: a press is a confirmation and wants to be immediate, while a hover is an invitation and wants to arrive. Use the durations below.

| target | duration | what changes |
|---|---|---|
| a surface (row, card, panel, list item) | **380ms** | background goes to `--bg-hover`, and its hairline to `--hairline-strong` |
| a control (button, chip, segmented control, icon button) | **240ms** | fill or label colour only |
| a web text field | **240ms** | inset perimeter ring moves from `--border-control` to `--hairline-strong` |
| a link | **380ms** | colour, plus an underline scaling from the leading edge |

Web text fields keep the hover transition on the base perimeter rule, behind
`@media (hover: hover) and (pointer: fine)`. Disabled fields and fields holding focus do not
hover. Focus takes the inset 2px `--primary` ring immediately. Validation rings keep their
error treatment. An autofilled `Input` keeps its overlay perimeter unchanged on hover.
The OTP cells share the real input's hover and disabled state; focus leaves only the active
cell with the focus ring. A field wrapper suppresses hover over its interactive buttons.

Neutral control hover, press and focus fills use `--bg-hover` (`bgHover` on Android), clipped to the
control's own shape at its own radius. **The fill never touches its content**: it extends at least 8
past the content on the inline axis and at least 4 on the block axis. Text that needs a fill is a
control and takes a control's shape. Primary-filled actions use `--primary-hover` on hover and
`--primary-pressed` (`primaryPressed` on Android) on press. Press fills remain visible beside scale
feedback, including when reduced motion suppresses the scale.
A control with an opaque resting fill layers `--bg-hover-opaque` over that fill; dark resolves
to `--bg-hover`, and light uses the stronger opaque-control hover value.

- **Hover is its own surface role and is never borrowed from the elevation ladder.** The ladder's steps are sized for stacking, not for being seen against one particular resting surface. `--bg-elev` against a resting `--bg-card` is **1.09:1**, which reads as nothing on a near-black canvas; `--bg-hover` is **1.26:1** , which reads. **A hover step must clear 1.25:1 against the surface it replaces.** If a role has no token, add the token rather than borrowing one whose value looks right today.
- **Only an interactive surface gets a hover state.** A static card that lights up under the pointer advertises a click that does nothing. This is the "controls distinct from content" rule read in the other direction, and it is the more common half to get wrong.
- **A container suppresses its own hover while the pointer is on an interactive descendant.** Otherwise a button inside a card lights both, and the pointer appears to be in two places at once. On web, `:hover:not(:has(button:hover, a:hover, [role="button"]:hover))`.
- **Declare the transition on the base rule, never inside `:hover`.** A transition declared inside `:hover` applies on the way in and not on the way out, so the state arrives smoothly and snaps away. That single mistake is most of what makes an interface feel cheap.
- **Hover moves exactly one step.** One surface level, one colour step. Two simultaneous changes read as a different component, not the same one under a pointer.
- **Hover never uses `transform`.** Transform belongs to press. A card that lifts on hover is the SaaS-template tell.
- **Name the properties.** Never `transition: all`.
- **Gate hover behind `@media (hover: hover) and (pointer: fine)`**, so a touch tap does not latch a hover state that then sticks until the next tap elsewhere.
- **Easing is `--ease-standard` in both directions** for a colour change. Reserve `--ease-out` for anything that moves.

### How

- **Transform and opacity only**, named explicitly. Durations 160 / 220 / 280.
- **Use CSS transitions for interactive state changes** so they retarget mid-flight. Reserve keyframes for one-shot staged sequences.
- **Quiet motion travels 10 to 20px, not 40px.** Shorten the distance before weakening the easing.
- **Motion must be interruptible.** Retarget from the element's live presentation value on interrupt, and never lock out input while a transition runs.
- **Never animate an entrance from `scale(0)`.** Enter at `scale(0.95)` plus `opacity: 0`.
- **Exits are faster and softer than entrances** (about 75% of the entrance duration), using a small fixed translate.
- **Mirror `exit` against `initial`.** A reversible transition exits along the path it entered.
- **Easing by direction:** entrances ease out, exits ease in, view and mode transitions ease in-out, state changes use `--ease-standard`.
- **Linear easing is reserved for honest time representation** (progress bars, loading, scrub).
- **Springs are critically damped, damping ratio 1.0, response 0.3 to 0.4s, no overshoot.** There is no bounce and no elastic curve in Orbit. This is a deliberate hardening of the source rule, which permits a bounce on momentum-carrying gestures; Orbit does not.
- **Trigger-anchored overlays** scale from their trigger via `transform-origin`, never from centre. Modals stay centred.
- **Directional slides are reserved for hierarchical navigation** and ordered sequences. Lateral navigation cross-fades or does not animate.
- **Press feedback** is `scale(0.96)` on pointer-down, never on release, and stays continuous for the whole duration of a drag or sheet gesture.
- **Respond on pointer-down, not on release.** Audit every debounce, artificial timer and transition wait on the input path.
- **Gate hover-triggered motion behind `@media (hover: hover) and (pointer: fine)`.** Web only.
- **Stagger group entrances 30 to 80ms per item**, cap the total at about 500ms, and never block interaction while it plays. Do not stagger a routine, high-frequency interaction.
- **`AnimatePresence mode="wait"` nearly doubles perceived duration.** Halve each element's duration when using it. Use `mode="popLayout"` for lists.
- **Use `initial={false}` so a stateful element does not animate its default state on first render**, and verify a full refresh still looks right; do not apply it where the component relies on `initial` for a genuine first-time entrance.
- **An icon state swap cross-fades** at `opacity` 0 to 1, `scale` 0.25 to 1, `blur` 4px to 0, with `bounce: 0`. Import from `motion/react`, which is what this repo installs.
- **Pause looping animations when their element is off-screen.**
- **SVG `stroke-dashoffset` ring and progress sweeps are sanctioned.** Derive `stroke-dasharray` from `path.getTotalLength()` at runtime; never hardcode the dash length.
- **Transition only what changes.** Always name exact properties. Never `transition: all`.
- **Use `will-change` sparingly**, only for `transform`, `opacity` and `filter`, and only when you observe first-frame stutter.

### Scroll reveals

- **A reveal never gates content visibility.** The pre-reveal state IS the visible state.
- **A scroll reveal fires once per element** and never replays on scroll-back.
- **Whole-section fade-and-rise on scroll is a slop tell, not choreography.** Never add page-load choreography.

## Accessibility

The floor is **WCAG 2.2 Level AA**, and **WCAG is the gate while APCA is the tiebreaker above it**. **Automated testing covers only 30 to 50% of issues:** an axe or Lighthouse pass is an instrument reading, never a conformance verdict. Keyboard and screen-reader checks stay manual.

**The test matrix is keyed `route-or-journey x state x viewport x input-or-AT mode`.** Cover authenticated, empty, populated, loading, success, validation-error, permission-error, dialog, menu, disclosure and toast states where they exist. For axe, select all five tags, because they are incremental: `wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa`.

| requirement | WCAG 2 AA | APCA preferred |
|---|---|---|
| Body text | 4.5:1 | Lc 90 |
| Large text (24px, or 18.5px bold) | 3:1 | Lc 60 |
| Non-text UI and graphics | 3:1 | Lc 30 |

### Perception

- **Never encode state or meaning in colour alone.** Every status must also be carried by an icon, a shape, a text label, or a position.
- **Non-text UI elements meet 3:1 against their adjacent surface.** `--track-empty` is derived to clear this floor on its worst permitted surface. `--fg-4` is canvas-only when used as a graphic.
- **Measure the pair that actually renders**, not the page background, and remeasure in both modes. A pair that passes in light can fail in dark.
- **Honour `prefers-reduced-transparency`** (raise surface opacity toward solid) and **`prefers-contrast: more`** (see derivation rule 9). The whole dark ladder is white-alpha translucency, so reduced-transparency is directly load-bearing.
- **Never ship a full-viewport moving background, a slow oscillation near 0.2 Hz, or an abrupt light/dark brightness jump.**
- **Person-typed and Google-provided text gets the full row width first**: habit names, event titles and emails own the headline, with time, source and other metadata beneath. If the headline still does not fit, wrap only between words to at most two lines, then use an ellipsis. An unbroken token (an email, a URL, a code or a word longer than the row) never breaks inside itself: it stays on its line and ends in an ellipsis. Keep the full text one tap away in the row's destination or expanded state and in its accessible name. Habit detail rename headings remain unclamped: words wrap and oversized tokens ellipsize without scrolling, with the full title in the rename input. Running prose, such as a paragraph or a sentence in a message, keeps `overflow-wrap: anywhere` as its last resort. App-authored labels never truncate.

### Keyboard and focus

- **Style controls with `:focus-visible`, never bare `:focus`.** Prefer the browser's own indicator with `outline-offset: 2px`, because it adapts to platform and forced-colours settings. Use a custom 2px ring from the accent token only where the design requires it, and only after inspecting the whole perimeter against every adjacent colour it crosses. **No surface may contain a keyboard trap.**
- **A non-control focus target draws no focus indicator.** A heading or container focused for wayfinding keeps programmatic focus and announcements without an outline or shadow ring. Every focusable control keeps exactly one indicator following its shape, with clearance from its content, including controls with `tabindex="-1"`.
- **Never remove a control's focus outline** without shipping a visible replacement in the same rule. In `forced-colors: active`, keep the default adjustment or use a system colour; never freeze the authored colour.
- **Use `:focus-within`** when a wrapper should light up while an inner input has focus.
- **Web `Input` autofill uses the typed field fill.** Paint `--bg-field` over an opaque surface base through stacked inset shadows on the control: `--bg` on the canvas, `--bg-card` over `--bg` on a card, and `--bg-sheet` inside a sheet. A card inside a sheet uses `--bg-card` over `--bg-sheet`. The existing overlay owns the single visible perimeter at rest, on focus and on error. Check both ring edges against their adjacent colours in both modes. Keep native system colours in forced-colours mode.
- **Every pointer interaction needs a keyboard path**, following the ARIA APG patterns: Escape closes overlays, arrow keys move within composite widgets, Tab moves between widgets, Enter and Space activate. Only `tabindex="0"` and `tabindex="-1"`, never a positive value. Composite widgets use roving tabindex.
- **Provide a "Skip to main content" link as the first focusable element on the web shell**, and give in-page anchor targets `scroll-margin-top`. Web only.
- **The WCAG 2.5.8 AA baseline is a 24x24 CSS-pixel target. Orbit's product floor is higher: **48 minimum, 56 comfortable**, from shared `TOUCH_TARGET_MIN` and `--touch-min`. Month-grid cells are the exception: they fill the column width and stay at least 44px high, because seven 48px columns do not fit at 320px.** Reach it by expanding with an absolutely-positioned pseudo-element on the wrapping label or button, never on the input itself, and never by growing the visible box. Keep visible control geometry unchanged. Give clipping or native hit-testing parents room for the extension and keep neighboring targets distinct.
- **Never let two hit areas overlap.** Shrink the expansion until they do not.
- **A decorative layer gets `pointer-events: none` and `aria-hidden="true"`**, so it never swallows clicks meant for the control beneath. A scrim that dismisses on click is a control and keeps its pointer events.
- **Add `touch-action: manipulation`** to interactive elements to remove the double-tap delay, and `touch-action: none` scoped to a surface implementing its own gestures. Set `-webkit-tap-highlight-color` to match the design.
- **Never make functionality reachable only through hover.**

### Semantics

- **Reach for semantic HTML before ARIA.** `<a href>` navigates, `<button>` acts, `<div onClick>` is never either. No ARIA is better than bad ARIA. Web only.
- **Every interactive element has an accessible name.** Precedence: `aria-labelledby`, then `aria-label`, then the native label, then `title`. Prefer visible text.
- **The visible label must appear inside the accessible name** (WCAG 2.5.3), or voice-control users cannot activate what they can read.
- **Mark a purely decorative icon `aria-hidden="true"` and `focusable="false"`**, and never put `aria-hidden` on or above a focusable element. A meaningful standalone SVG takes `role="img"` plus a label.
- **Hide a habit emoji beside its own habit name from assistive technology on web and mobile.** If the emoji adds meaning the adjacent text does not repeat, give it an accessible name.
- **Expandable controls carry `aria-expanded` and `aria-controls`.**
- **Alt text by purpose:** decorative takes `alt=""` (present, never missing), informative describes the meaning, functional describes the action.
- **Expose one visible `main` landmark**, label repeated landmarks, and keep headings forming a coherent outline.
- **When text is split into per-word spans for animation**, set the sentence as `aria-label` on the parent and `aria-hidden="true"` on every fragment, and never split a link or a button.

### Forms

- **A placeholder is never a field's only label.** Every input carries a visible, persistent label; the placeholder carries the format example. Label and control share one hit target. The drawings sanction three fields without a visible label: the composer, search fields and inline add rows. Each carries a placeholder that says what to do and an accessible name with the same words. Disabled composer states carry their reason above the pill and omit a state placeholder when it does not fit the text slot.
- **Style a native input's placeholder with `::placeholder`.** Never simulate one with a positioned span.
- **A field's error is linked with `aria-describedby`, the field carries `aria-invalid`, and required state is announced.** Errors render inline beside the field with an icon or text, never a red border alone. On submit, focus the first invalid field.
- **Accept free text and validate after.** Never block typing or filter characters as the user types. Trim before validating.
- **Never block paste** in an `input` or `textarea`. The 6-box OTP primitive is the canonical exposure.
- **Add `autocomplete` with a meaningful `name`**, plus the correct `type` and `inputmode`. `one-time-code` for OTP, `current-password` and `new-password` for auth. Disable `spellcheck` on emails, codes and usernames.
- **Never lose typed input to a re-render**, and warn on unsaved changes before navigation.
- **Keep input text at 16px minimum on mobile web viewports** so iOS Safari does not zoom on focus, via `text-base sm:text-sm`. Web only.
- **Never disable zoom**, and keep every web surface usable at 200% zoom and reflowing at 320px width with vertical scrolling only. Genuinely two-dimensional content scrolls inside its own container. Web only.

### Announcements

Work down this list and stop at the first match: focus already moves there, so nothing is needed; tied to a control, so use `aria-describedby`; non-urgent and untied, so use a polite `role="status"`; urgent and untied, so use `role="alert"`.

- **Render the live region empty and stable before updating its text.** A region inserted together with its content is announced inconsistently.
- **Default to polite.** Overusing `assertive` interrupts whatever the reader was on.
- **Toasts carry brief confirmation and undo only.** Actionable errors and sync failures stay in a persistent surface. Never move focus to a toast. Undo remains until dismissed; a timed confirmation uses a 5 second floor and pauses on hover or focus.
- **Anything moving, blinking or updating automatically for more than 5 seconds needs a visible pause control.**
- **Under reduced motion**, replace slides, scales and parallax with opacity cross-fades, kill autoplay, and start carousels paused. Keep spinners, progress, instant state changes and brief press feedback. Wrap motion in `@media (prefers-reduced-motion: no-preference)` so it is opt-in; where a global kill switch is the only option, use `0.01ms` rather than `none` so `transitionend` still fires.
- **The `.sr-only` pattern uses 1px boxes, not zero**, with `clip-path: inset(50%)` and `white-space: nowrap`. Never `display: none`.
- **If audio feedback is ever added:** sound never replaces visual feedback, ships behind an explicit off toggle, defaults subtle, and is suppressed under `prefers-reduced-motion`.

## Special surfaces

**Paywall.** At most 3 plans. Mark exactly one recommended and style it with the composed TierCard selected treatment. Write bullets as outcomes, not feature names, 3 to 6 visible per plan. Keep the CTA verb identical across every tier. Pair the monthly/annual toggle with an explicit savings callout: the arithmetic is visible, never implied.

**Landing hero (`orbit-landing-page`).** A 3-second message gate: the headline and CTA are readable within 3 seconds, with no visual treatment between the visitor and the offer. If a treatment competes, reduce the treatment, not the copy.

**Landing reference galleries.** `saaspo.com` and `saasframe.io` are recorded references for **landing and marketing surfaces only**, and for the shape of a spec rather than its content. **Never cite either for a product surface.** Marketing calm is not product density.

## External component sources

`beautifului.dev` (MIT) is an accepted source of AI-native primitives, and its record table, tool chips, streaming text and insight cards are the intended inputs to the Astra surfaces. **A component may be adopted as-is only while it passes this document and the repo gates.** As-is ends the moment a token, a glow, a gradient, a glass material, or an off-scale radius violates the canon: at that point it is a starting point to be re-tokenised, not a drop-in.

The same test governs any future external component, from any source. Nothing enters the codebase because it looked right on someone else's canvas.

## Bans

- **The internal Astra risk class never renders to the person.** The owner's "Every Astra write shows a preview the person approves first" decision keeps risk as an internal input to irreversible marks and destructive confirmation.
- **No decorative glow.** Not on the CTA, not on the FAB, not anywhere. A softened glow is still a glow.
- **No gradient wash.** No gradient borders, no gradient text, no mesh, no bloom, no scanlines, no film grain, no "subtle texture".
- **No Liquid Glass.** No glass material, no frosted chrome as a look, no translucent panel stacked on a translucent panel.
- **No sparkle icon** as an AI or default marker. Identity is the Astra glyph.
- **No interactive element without a hover state**, and no hover state that uses `transform` or that declares its transition inside `:hover`.
- **No pill used as a CTA outside `PillButton`**, and no pill in a hero. The pill radius means interactive; a static element uses radius 8.
- **No default component-library theme and no default white accent** on any surface, marketing included.
- **No decorative background orbit arcs.**
- No accent outside the rationed list.
- **No habit colour palette and no colour-as-data.** A habit does not carry a colour field in the interface.
- No coloured side-stripe border.
- No raw `--slate-*` references. Semantic tokens only.
- No hardcoded accent `rgba`. Tints come from `--primary-rgb` / `tintFromPrimary`.
- No `oklch()` literal in a shared token or a mobile style.
- No off-scale shadow, and never a hand-rolled `box-shadow` heavier than the token.
- No opaque card-on-card on dark. No borders-as-borders where the kit uses inset rings. No stacked hairlines.
- No off-scale spacing value outside the chosen set and the three named exemptions. No `space-x-*` / `space-y-*`. No margins for sibling spacing.
- No `transition-all`. Animate `transform` and `opacity` only, named explicitly.
- No bounce or elastic easing. No spring overshoot.
- No `h-screen`. Use `min-h-dvh`.
- No structural hacks.
- No arbitrary z-index. Overlays stack on the semantic scale.
- No off-grid icon size. The set is 16 / 20 / 24.
- **No new font families, radii, or colours outside this spec.** Geist Sans, Space Grotesk and Geist Mono. There is no fourth family and no serif.
- No per-component theme branches. The two modes resolve through tokens only.
- No em dashes and no en dashes. No UPPERCASE typed into a string.
- No `<br>` to hand-break copy.
- No text button where a universal glyph exists; no icon-only control without an accessible label.
- No full-bleed pill CTAs outside the **Buttons** allowlist.
- No ad-hoc raw pill button, no hand-tuned button height or padding.
- No fabricated numbers in a shipped UI.
- No numeric design score.

- **No app-authored label, title, caption, chip, tab, segment or button text that wraps or ends in an ellipsis**, in either locale, at 320, 360, 384 or 412, at the default text size; at large accessibility text a label may wrap but never ellipsizes or clips. Person-typed and Google-provided text follows the full-width, two-line rule in Type roles.
- **No hover, press or focus fill that touches its content.**
- **No screen-level setting, sync status or legend inline on a destination root in the compact shell.** It lives in a sheet or menu with one visible entry. The one primary view switch of a view is exempt.
- **No two floating controls in one screen position, no floating control that covers content at the end of a scroll, and no back-to-top control outside Hoje.**
- **No inline link inside a sentence as a row's only action.** The row is the action.
- **No rendered text below 12.**

## Working model

1. **Context** - state the screen's job in one sentence.
2. **Anchor** - already chosen: **spacious, near-black, one rationed accent, warmth in the mark**. Do not re-pick the anchor. The accent HUE is the one open question and is settled at grant 1.
3. **Focal element** - name the one element that wins this view, and how. Demote everything else deliberately.
4. **Differentiator** - name the one memorable move for this screen. It must come from the identity carriers, never from added decoration.
5. **System** - use the tokens above. No new colours, families, radii, or spacing values.
6. **Implementation** - outline structure, then build. Then run the three tests below.

**When reviewing, slow the interface down.** Replay motion at 10% speed and walk every state: hover, focus, active, loading, empty. What feels off at 10% is what is subtly wrong at full speed.

### AI-slop test

Before shipping, scan for the tells and delete what you find:

- decoration used as hierarchy: any glow, gradient wash, gradient border, gradient text, mesh, texture, bloom, or "quiet" background effect;
- **a glass or Liquid Glass material, or a frosted panel used as a look;**
- **a sparkle icon used as an AI or default marker;**
- **a pill used as a CTA outside `PillButton`, or any pill in a hero;**
- **a default component-library theme, or a default white accent on a marketing surface;**
- cards in cards, and cards used where spacing would have grouped;
- a coloured side-stripe border on a row or callout;
- connector or tree lines in a hierarchy;
- grey text on coloured backgrounds; rounded-square icon tiles above headings;
- an oversized centred H1 outside a hero context;
- the hero-metric template used as decoration, or any invented precise-looking number;
- a whole-section fade-and-rise scroll reveal, or any page-load choreography;
- an animation whose purpose you cannot name from the closed list;
- a heading and the intro beneath it saying the same thing;
- **a descriptive subtitle beneath a heading, label, card, or settings row that restates it;**
- an eyebrow that enumerates rather than labels.

### Squint test

Blur the surface. Hierarchy and section boundaries must still read, and nothing may jump out harshly. This catches the failure the slop test does not: flatness, and harsh lines.

### Scene-sentence test

Describe the rendered screen in one sentence as if narrating a film scene. If it reads like every other SaaS app, the design is generic. It must name Orbit's character: a near-black canvas with real air around everything, quiet tonal panels, one rationed accent reserved for what is next and never for what is finished, and the orbital ring language carrying the identity. If the only way to make the sentence specific is by describing decoration, the design has failed.

## Enforcement

**Prose is not enforcement.** The rules above split three ways.

The accent bytes and spacing scale are settled. The gate status table below records their enforcement.

**A `local/*` rule ships at `error` with zero violations, or it does not ship.** There is no suppression baseline and no `warn` tier. A rule whose violation set is still open is not ready to land, and recording those violations rather than fixing them turns the gate into a backlog that a constant satisfies forever. The earlier design shipped each rule at `error` over a committed `eslint-suppressions.json` that only had to shrink, and it never did; both baselines and the ratchet that read them are deleted. `tools/check-lint-severity.mjs` backs the required `Lint Severity` context and fails on seven things: an `eslint-suppressions.json` anywhere in the tree, any file a `--suppressions-location` flag names, a `local/*` rule at `warn`, a `local/*` rule at `off` outside the five scoped blocks the tool declares by name, an inventoried ESLint config that is missing, a change to an inventoried config's global ignores or local rule block scopes, and an ESLint config the inventory does not name that carries top-level ignores or a `local/*` rule block. Widening one of those blocks fails too, so the exception list is closed rather than open.

### Gate-backed

| rule (section) | mechanism | status |
|---|---|---|
| The accent split and its three floors (Tokens) | accent-AA token test: white on `--primary` >= 4.5; `--primary` on canvas >= 3.0; `--primary-soft` on canvas >= 4.5; **and `--status-done` is not `--primary`** | **re-baseline now: grant 1 landed** |
| Byte-exact token acceptance | shared unit test on `createTokensV2` plus the resolved web CSS | re-baseline to the two variants |
| No decorative glow (Bans) | `local/no-decorative-glow` | **flip to `error`**, unblocked |
| No gradient wash / gradient text (Bans) | `local/no-raw-gradient` + `local/no-gradient-text` | **flip to `error`** |
| No coloured side-stripe (Bans) | `local/no-side-stripe-border` | keep |
| No bounce or elastic easing (Motion) | `local/no-overshoot-easing` | keep |
| No `space-x-*` / `space-y-*` (Spacing) | `local/no-space-x-y` | **wire on mobile** |
| Off-scale spacing (Spacing) | `local/spacing-scale` | **re-enumerate to the chosen scale**, unblocked |
| No arbitrary z-index (Stacking) | `local/no-arbitrary-zindex` | keep. `app-overlay.tsx:235` was the standing violation, removed with that component in R1 |
| Focus outline never removed bare (A11y) | `local/require-focus-replacement` | **wire on mobile** |
| Never disable zoom (A11y) | `local/no-user-scalable-no` | keep, web only |
| `<div onClick>`, positive `tabIndex` (A11y) | `jsx-a11y` rules at `error` | keep |
| Image alt text (A11y) | `jsx-a11y/alt-text` + `local/no-placeholder-alt` | keep |
| Dialog / Overlay accessible name (A11y) | `local/require-dialog-title` | keep |
| No `will-change` in a static class (Motion) | `local/will-change-discipline` | **wire on mobile** |
| Raw font feature / axis tags (Type) | `local/no-raw-font-feature-tag` | keep |
| No `calc()` percentage widths (Layout) | `local/no-calc-percentage-width` | keep, web only |
| AnimatePresence `exit` + stable keys (Motion) | `local/animate-presence-exit`, `local/animate-presence-stable-key` | keep |
| No em dash or en dash | `tools/check-dashes.mjs` | shipping |
| Banned-word set (Voice) | `tools/check-copy.mjs --check` | **extend to the 25 enumerated entries, with the scope column** |
| No UPPERCASE typed into a string | `tools/check-copy.mjs --check` | shipping |
| No full-bleed pill CTA (Buttons) | `local/no-fullbleed-button` | shipping, web only |
| Control labels stay within 1 to 2 words (Buttons, Copy) | `local/max-button-words` | shipping, both apps |
| Icons only through the barrel | `no-restricted-imports` | shipping |
| No gorhom sheet (Overlay) | `local/no-gorhom-sheet` | keep |
| No `oklch()` in a shared token or mobile style (Tokens) | **new rule** | unblocked |
| No sparkle icon as an AI marker (Bans) | **new rule** | unblocked |
| Off-grid icon size (Icons) | `local/icon-size-grid` | shipping, both apps |
| Pill radius on a static element (Shape) | `local/no-pill-radius-on-static` | shipping, both apps |

### Reviewer-judgment (the `design-reviewer` agent enforces these per diff)

Everything else, and specifically: the 65ch measure, the 2x gap rhythm, concentric radii, optical alignment, "a card is not a layout primitive", one focal element per view, the 4-option ceiling, blur restraint, the frequency gate and the closed purpose list, the motion remediation order, the delight budget, the loading/empty/error triad, the full nine-state set, the listing thresholds, the overlay sizing and scroll-ownership rules, copy naming, "say it once", the supporting-copy ban, error content and placement, confirmation-dialog warrant, eyebrow rationing, the habit-list treatment, the paywall shape, flow-shape parity, colour-as-only-signal, the 3:1 non-text floor, focus management in overlays, reduced-transparency and reduced-contrast handling, and all three shipping tests.

### Not enforceable here

`prefers-reduced-transparency` / `prefers-contrast` handling, the 200% zoom layout, the 320px reflow, keyboard traps, and screen-reader semantics need the **live rendered DOM**. They belong to the proposed a11y baseline-diff CI gate, keyed on the matrix above.
