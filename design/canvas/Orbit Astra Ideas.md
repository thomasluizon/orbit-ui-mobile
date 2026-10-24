# Astra Ideas composition

Active bounded amendment for #1611. This drawing replaces the text-only Ideas amendment.
DESIGN.md Information architecture and Bans retain precedence. The conversation drawing retains
its authority outside this library.

## Phone and wide composition

```text
conversation column, centred, maximum 740
┌──────────────────────────────────────────────┐
│ Back to conversation          Ideas          │ AppBar, heading focus
│ Search ideas                                 │ visible persistent label
│ [Start]  Remember  Batch  Restart  Understand… │ one independent scroll strip
├──────────────────────────────────────────────┤
│ For you now                                  │ only supplied live suggestions
│   supplied icon  supplied label              │ unframed single target
│   Astra glyph                                │ current request callback
│                                              │ 24 between groups
│ ┌──────────────────────────────────────────┐ │ 16 screen gutter
│ │ Sun  Plan my morning                      │ │ inline 24 icon, 12 text gap
│ │ Astra glyph                              │ │ plain attribution, 12 above
│ └──────────────────────────────────────────┘ │ radius 20 neutral card
│                                              │ 12 between cards
│ ┌──────────────────────────────────────────┐ │ 16 record inset
│ │ Target  Turn a goal into habits           │ │ 17/400 row title
│ │         Turn my goal of {goal} into       │ │ 4 title/example gap
│ │         small habits.                    │ │ 14/400 secondary prose
│ └──────────────────────────────────────────┘ │ slot cue, no request attribution
│                                              │ remaining catalog order
│                      Previous ideas  More    │ only when pages exist
└──────────────────────────────────────────────┘
```

The diagram is a structure drawing. Exact product words come from the localized
`chat.templates.*` leaves and `chat.title`; no diagram wording creates new copy. The independently
reviewed pt-BR title-fit amendments are `afterWeek.label`: `Voltar após semana difícil` and
`findTime.label`: `Encaixar um hábito`. Both prompts and all English leaves retain their bytes. At wide widths
both platforms keep this one-column arrangement in the existing 740 allocation. A second column
is optional only after every title fits both locales at its resulting allocation. No second
column is introduced by this amendment.

The sole result scroller contains the live group, category regions and paging. Back, search and
the category strip remain outside it. Each catalog card is one button with no nested CTA, group
panel, icon tile, separator, decorative mark or accent. Its neutral fill swaps across the complete
radius-20 shape on interaction; one inset focus perimeter stays clear of content. Targets are at
least 48. Supplied live icons remain intact; absent icons use one neutral Lightbulb. Functional
icons are hidden from assistive technology beside their action label.

## Content and intent

`PROMPT_PRESENTATION` in the shared catalog records the independently approved complete 36-ID
icon mapping. It changes no catalog ID, category, label key, prompt key, order or page boundary.
Examples appear only on goalHabits, habitReminder, smallSteps, setReminder, changeReminder,
moveToday, logMany, tagGroup, pauseMany, smallerHabit, easierTime and findTime. They reuse the
normal ICU translation result. Localized braced slot words receive quiet neutral emphasis;
selection still receives the exact original translated prompt and its original slot offsets.
Empty example content adds no line or gap.

Complete prompts and the current live producer invoke Astra through their existing owners, so
one plain 20px glyph identifies her within the action without repeating the brand name. Slots only
prepare input and carry no request attribution. This composition changes no allowance, request,
preview or confirmation policy.

## State compositions

| State | Composition and preserved action |
|---|---|
| Selected category | Active chip names the sole catalog region. Omit its repeated visible heading; retain the accessible region name. All six permitted category choices and original order remain. |
| Populated live | Compact For you now group precedes catalog cards, using actual supplied labels, optional icons and callbacks. Empty live content adds no group or frame. |
| Mixed search | Keep the entered query and one category strip. Hide live actions. Keep category headings above matches, eight ideas per page, in catalog order. Clearing restores the permitted selected category and live context. |
| No matches | Existing query-specific status and Clear search, with no empty card or new explanation. |
| Offline, limit, busy | Existing neutral reason above the controls; disable exactly the template and live actions. Search, chips, paging and Back remain available. |
| Web load failure | Existing AppBar, error and Retry view. Keep the mounted thread and draft; Back and reopening remain available. No additional loading flash. |
| 200% text | One column of growing cards. Titles wrap between words; prose and slot cues remain readable. Icons align to the first title line, with no clamp or fixed text height. The result scroller retains the last action and pages in short windows. |
| Return | Complete prompts send once; slots select their first localized placeholder. Existing drafts and pending ideas remain with the composer owner. Escape and Android back recover the entry focus. |

Both locales and themes use these same owners. Browser-free component tests cover callbacks,
filtering, prompt bytes and draft retention. Vitest Chromium measures web text and paint; native
component and Yoga checks establish structure and allocation only. Real Android text, TalkBack,
motion and carrying-build acceptance remain separate verification boundaries.
