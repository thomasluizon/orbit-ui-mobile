# The canvas documents

> **At a glance** - the Claude Design canvas, which is THE authority for every redesign surface.
> Twenty-one screens plus the design system tokens, with the native mobile rule and Perfil sub-menu amendments. Build from these. The eleven documents in
> `superseded/` are a record of an earlier pass and are not a target.

## The authority

**Thomas granted this export on 2026-08-25**, which is what gives it authority. `DESIGN.md` records
the grant in its D42 paragraph, and `CLAUDE.md` points here. Without that grant a canvas export
carries nothing, and the eleven in `superseded/` still carry nothing.

**Amendments since the grant, listed so no reader treats the export as byte-identical to it.** An
amendment lands here and in the shipped tokens together, never in one alone, because a canvas token
that disagrees with production is a trap rather than an authority.

| amendment | what changed | why |
|---|---|---|
| Week time grid | Named timed blocks with status rings, per-day any-time chips and +N, natural short weekdays, one today date disc, one hour scroller and opening near now | The owner's report supersedes #1148 and adopts the Google Calendar week pattern. |
| Astra full screen | One conversation layout at every width, with NavHeader, a shared thread, one live chip set and a composer with 16 padding; wide web keeps its sidebar with an Astra row above Hoje and drops the resting Hoje shell composer while retaining the active selection tray in the pinned bottom slot; habit detail keeps its own composer | Astra opens as a layer with no route or Android tab. Compact shells cover the tab bar; wide web replaces the destination column from every Astra entry, including proactive and empty-state actions. The empty disclosure uses `--fg-3` and the close control is 48. App implementation follows in #1295. |
| 2026-10-04 | Dark `--primary-text` uses `#ED773E` and dark `--track-empty` uses `#8B8B8E`, with their widget mirrors | Each is the first rounded byte at constant source OKLCH hue and chroma with higher lightness. Accent text clears 4.518:1 on card-child hover; the empty track clears 3.001:1 on the calendar card and hover inside a sheet. The immediately preceding bytes measure 4.497:1 and 2.993:1. |
| Native mobile rule | Hoje, Habit Detail and Astra Conversation use the attach menu composer; Hoje uses a whole-row proactive action, grouped date controls and top-centre back-to-top; Calendário moves repeat, Google Calendar and legends to disclosure and restructures day rows and figures; Progresso moves its legend to a sheet and long figures to rows; Perfil uses icon-led sub-menu rows; Avisos uses an options menu and root/sidebar bell examples. Habit Detail puts the emoji well, rename and header ring on a controls row above the full-width wrapping title and summary, with 12px metadata gaps and 24px to the strip. Every Progresso tab glyph is layout-dashboard. `native-mobile.js` renders the amended drawing primitives alongside the mirrored export. Composer, Shell412, TabBar, Menu, StatTile, ListRow, SegmentedControl, NavHeader, Badge and HabitRow contracts carry the matching rules | Product labels remain whole, typed text gets full width then two lines, rows grow at 200% text, and secondary content preserves selection in disclosure. Progresso and Perfil bell-only rows scroll. The touch floor follows the shared touch target amendment. |
| Touch targets | `--touch-min` is 48px on web and 48 logical pixels on Android, from shared `TOUCH_TARGET_MIN`; small pills retain their visible geometry and reserve the expanded hit area; month-grid cells use their full column width and at least 44px | Controls stay usable with distinct, non-overlapping targets at compact widths. |
| Perfil sub-menus | The account row opens Conta, followed by Preferências, Astra and Notificações; Mais do Orbit and sign out stay inline | Grouped navigation replaces the five-heading page so a setting is found without scrolling past every group. |
| #1288 | Calendário shares one centred navigation row across all four views; span titles are borderless mono controls that return to today, and Agenda rows carry a time or no-time value, a status ring and entry details | Agenda keeps day order stable, lists no-time habits before timed habits and builds the today heading from one localized template. |
| #1107 | `Orbit Pro`: outcomes move into each tier card, and loaded cards hug their content | The owner's decision puts the four Pro outcomes on each tier and removes the separate outcomes list. Price-loading reservations belong only to the loading state. |
| Hoje composer | A one-line pill with inside Astra glyph, input, + menu and send appears on Hoje and habit detail; Hoje chips move into the conversation and habit detail chips stay in one scroll row; Calendário, Progresso and Perfil clear the bottom | The front door stays visible on Hoje and habit detail. An open conversation and disclosure preserve state. |
| Onboarding final Pro step | Onboarding ends with the free Pro trial step, or the Orbit Pro paywall for an account not on a trial; paid Pro finishes normally | The owner’s decision replaces D69 item 17 and the Onboarding drawing’s no-plan and no-price rules for that final step only. |
| Light transparent hover | `--p-l-hover` uses `rgba(9,9,11,0.11)`; supporting text under the fill uses `fg-2` | The step measures 1.271:1 over white and 1.276:1 over the canvas. |
| Light empty track | `--p-l-track-empty` uses `#7E7E82`; `--status-empty` retains this neutral at rest and under hover | Constant OKLCH hue and chroma with lower lightness clears 3.036:1 on canvas hover, 3.180:1 on card-child hover and 3.052:1 on canvas selection, while staying between `fg-3` and `fg-4`. |
| Light accent and status text | `--primary-text` uses `#A63A00`, `--status-overdue` and its text role use `#7D5700`, and `--status-bad-text` uses `#C00000`; only `fg-3` promotes to `fg-2` under light hover | Lower source OKLCH lightness with fixed hue and chroma before gamut-clamping and byte-rounding. Worst-stack well-hover ratios are 4.522:1 orange, 4.510:1 amber and 4.502:1 red; canvas-hover ratios are 4.887:1, 4.874:1 and 4.865:1. |
| Opaque control hover | Added `--bg-hover-opaque`: dark reuses `--p-hover`, light uses `--p-l-hover-opaque` at `rgba(9,9,11,0.11)` | Layered over the resting elevated fill, the hover step measures 1.477:1 dark and 1.271:1 light, clearing the 1.25:1 floor. |
| 2026-09-29 | `Orbit Entrar` and `Orbit Verificacao` centre their compact columns with equal vertical padding | The owner's phone layout decision places both sign-in steps between the safe areas. |
| 2026-09-29 | `Orbit Wrapped`: period line and weekday note from `fg-4` to `fg-3` | Both lines are text, and `fg-4` only clears the non-text floor on the canvas. `fg-3` clears the text floor. |
| 2026-09-28 | Calendário uses one centred column at both widths, with the view selector in the header and a 24px day-card inset | The owner's layout decision replaces the split and sheet composition. |
| 2026-09-28 | Removed the naming note from both locales of `Orbit Sobre` | The note describes an internal writing rule rather than information a person needs on Sobre. |
| 2026-09-11 | Added dark `--primary-text` at `#E16D33` and light at `#B64900`, then moved the Android widget streak figure to it | The widget streak is rationed accent text on a raised surface. `--primary` measured 4.057:1 on the dark card and 3.680:1 on its well, below the 4.5 text floor. The raised-surface pair measures 4.510:1 dark and 4.509:1 light on its worst surface. |
| 2026-09-10 | Corrected dark `--track-empty` to `#7A7A7D` and light to `#7F7F83`, then kept `--status-empty` bound to it | The first values measured only canvas and replacement hover. These clear the reachable selection and card-child hover stacks after range endpoints were reduced to one tint, while preserving the neutral ramp. |
| 2026-09-10 | Light `--p-l-overdue` from `#946A00` to `#886100` | The old value missed the 4.5 text floor on the light well, on hover, and on the 10 percent overdue tint the session-expiry warning paints text on. The new value measures 4.91, 4.73 and 4.70 on those, and 4.95 on the widget well, preserving the OKLCH hue and its 36.3 degree separation from the accent. |
| 2026-09-09 | `--p-hover` dark, alpha `.14` to `.13` | `--fg-3` measured 4.39 on the hovered surface, under the 4.5 text floor. `.13` is the only value that also keeps the hover step above the 1.25:1 minimum. Closed limit 2 in the design-system readme. |
| 2026-09-09 | `Orbit Avisos`: unread-row body, timestamp and target from `fg-3`/`fg-4` to `fg-2`, and the target icon to `fg-3` | The unread row is a hover CHILD inside a card, so its hover surface composites to `#313133`. There `fg-3` measures 4.03 and `fg-4` 1.98, under the 4.5 text and 3.0 graphic floors. `fg-2` measures 7.86. Both platforms already shipped `fg-2` text; the drawing had not moved with them. |

### Week time grid surface inventory

| Paired web and Android surface | Contract and evidence |
|---|---|
| Semana page and week wrapper | Fill the height below the header with one hour scroll owner; 1352x726, 1100x726 and 412x640 cases at font scale 1; 1352x726 and 1100x726 also at font scale 2. The weekday header and any-time lane pin only while together they occupy at most half the hour viewport; larger panes scroll with the hours. |
| Weekday header | Natural short names, pinned with the lane only while their pane fits within half the hour viewport, one today date disc, day selection and clearance from calendar options. |
| Any-time gutter and per-day lanes | Empty, one, two and three-or-more habits; named 28 chips inside separate 48 targets and +N day disclosure; long words and unbroken tokens. |
| Timed blocks | Two-line names, status ring, bad mark and time; concurrent and adjacent lanes, transparent future blocks and full-name disclosure. |
| Hours and position | Every hour labelled, aligned gutter, horizontal columns, now in today's column and upper third on opening, earlier morning for another week and trailing space at 200% text. |
| Entry and day disclosures | Existing CalendarEntryDetails and day sheets retained; complete titles, selection and scroll preservation, localized copy and loading, empty and error states. |
| Drawing and specification | Amended calendar drawing, views note, TimeGrid contract, scroll ownership and docs registry; crowded Chromium unit geometry and CI page layout cases. |

The unit geometry fixtures include crowded lanes and long titles. Whole-page layout and real native
rendering remain verification boundaries: the layout workflow owns page evidence, and the unit
screen tests verify native scroll ownership without an emulator.

**Precedence is a ladder, defined in `DESIGN.md` D42.** `## Information architecture` outranks every
drawing on whether a surface should exist. `## Bans` outranks every drawing, so a granted export
never authorises a banned value. **Below those two the drawing wins**, over `DESIGN.md` prose, a
ticket body, and this file. `DESIGN.md` remains the written spec and the place mechanical rules are
enforced, but a drawing here outranks a sentence there (D42).

Each `.dc.html` is **one screen as one interactive document**, not a picture of a screen. It carries
a control bar with four axes, mode, width, state and locale, and renders the whole matrix from one
build.

| document | screen |
|---|---|
| `Orbit Hoje.dc.html` | Hoje, the habit list, the core loop |
| `Orbit Calendario.dc.html` | calendário, the month grid, the day cell and the event row |
| `Orbit Progresso.dc.html` | progresso, and the goals that live inside it |
| `Orbit Perfil.dc.html` | perfil and settings |
| `Orbit Habit Create.dc.html` | criar hábito |
| `Orbit Habit Detail.dc.html` | one habit, its history and its actions |
| `Orbit Astra Conversation.dc.html` | the full-screen Astra conversation and the web sidebar Astra row |
| `Orbit Wrapped.dc.html` | Wrapped, its cover and its pager |
| `Orbit Onboarding.dc.html` | onboarding |
| `Orbit Entrar.dc.html` | entrar |
| `Orbit Verificacao.dc.html` | the code entry |
| `Orbit Assinatura.dc.html` | assinatura |
| `Orbit Pro.dc.html` | the Pro surface |
| `Orbit Avisos.dc.html` | avisos, the notification surface |
| `Orbit Busca.dc.html` | busca |
| `Orbit Celebracao.dc.html` | the celebration set |
| `Orbit Estados.dc.html` | the shared state set |
| `Orbit Offline.dc.html` | the offline surface |
| `Orbit Sobre.dc.html` | sobre |
| `Orbit Sobreposicoes.dc.html` | the overlay set |
| `Orbit Widget Android.dc.html` | the Android home screen widget |

### Pro plan-card surfaces

1. `/upgrade` on web and Android: the free and trial pitch, including the last trial day,
   annual or monthly selection, coupon arithmetic and checkout pending or failed.
2. The final onboarding paywall on web and Android: the same annual and monthly cards,
   with price loading, price failure, retry and offline states shared with `/upgrade`.
3. The final onboarding trial step on web and Android: the pitch and 5 against 50 comparison,
   with outcomes owned by purchasable tier cards rather than a standalone pitch list.

Both card owners cover loaded prices, loading reservations, absent prices, retry and offline
states in English and Brazilian Portuguese. Card geometry covers compact and desktop widths.

## The design system, under `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/`

`_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/` holds the **183 authoritative token values**. A number typed into a component that
disagrees with a token here is wrong, whatever any document says.

| file | what it fixes |
|---|---|
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/colors.css` | the surface ladder, the foreground ramp, the one accent and the status set |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/spacing.css` | exactly ten values: 0 4 8 12 16 24 32 48 64 96. **20, 28, 40 and 56 must not appear** |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/shape.css` | the radius scale, the shadows and the motion durations. Radius 999 means interactive |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/typography.css` | three families and a closed size set: 12 14 16 17 20 22 28 34 44 60 |
| `.../tokens/fonts.css`, `.../tokens/base.css` | the font faces, repointed at the tracked binaries in `design/brand/fonts/`, and the reset |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/styles.css` | the shared component styles |
| `_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/_ds_manifest.json` | the inventory: 41 component names with their canvas source paths, and 36 guideline cards with a one-line summary each |

**A component in the manifest is a promoted primitive. A component that appears only inside a screen
is drawn inline there**, and the screen is its reference. Both are equally binding.

**A guideline-card subtitle names a component and summarises it in one line. It is an index entry, not
a specification.** The Actions card says only "Button variants and the FAB, dark and light", while the
screens deliver the variants, sizes, states and measurements. The binding specification of any
component is: the token values, `styles.css`, and every screen that draws it, with the screen named in
its ticket as the reference. Read those, not the subtitle.

## What is deliberately not committed

* **The font binaries.** `design/brand/fonts/` already carries them.
* **`support.js`**, the canvas runtime. It is vendor code and its em dashes fail the repository dash
  gate.
* **`_ds_bundle.js`**, which is compiled output carrying no readable component source.
* **`_adherence.oxlintrc.json`**, the canvas's own lint config. Nothing here consumes it, and its
  messages carry em dashes the dash gate rejects.

### Reading them, and rendering them

**Reading works from a checkout.** The markup is plain HTML with a `{{ }}` template layer, each
screen carries a prose report block explaining its own decisions, and every stylesheet link resolves
against the design-system tree committed beside them. That is what an implementer needs and it is why this
export is here.

**Rendering does not work from a checkout, by design.** Each document also pulls `support.js` and
`_ds/<uuid>/_ds_bundle.js`, and neither is committed. To see one rendered, export the project archive
from Claude Design and open it there, or drop those two files beside these. The font binaries are
already tracked: `tokens/fonts.css` resolves into `design/brand/fonts/`, so nothing needs copying.

The `_ds/<uuid>/` directory keeps the export's own UUID name because the screens link through it.
Flattening it silently breaks every stylesheet reference.

### The component contracts

`_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/components/` holds **48 `.d.ts` prop contracts**, at the exact
paths the manifest names and the redesign tickets cite. They are pulled from the design-system project
itself, because the downloadable archive omits them.

**These are the reference an implementer builds against, and they are not binding yet.** Nothing
imports them and they sit in no `tsconfig` include, so today they are inert reference material.

**Moving a group into `packages/shared/src/contracts/` is necessary but it is not sufficient.** A
declaration in an included folder still binds nothing until a component imports it and is typed by
it. `#351` goes first and is the only ticket that edits `packages/shared/package.json`; each porting
ticket then makes its own group binding by having both platforms' components consume it.

**Two things do not port straight across, and a porting ticket has to reconcile both.**

*The handler name.* These contracts are drawn for the canvas's own React, so they say `onClick`. Web
matches that, because it renders DOM. Mobile does not: `apps/mobile` is React Native and its
components take `onPress`. So a single shared declaration cannot type both platforms unchanged. The
handler name is a platform adapter under the parity rule, the same way the storage and styling layers
are, so the split is allowed; what is not allowed is the two sides drifting on anything below it.

*The `any`s.* Every one of the 48 contracts uses `any`, 94 times in total, for node-typed slots like
`children`, `trailing` and `control`. That is fine while these files are inert reference material,
and it stops being fine the moment a group moves: `packages/shared/eslint.config.mjs` turns
`@typescript-eslint/no-explicit-any` off only for test files, so a contract landing as ordinary
source under `src/contracts/` is linted like any other source and a verbatim copy fails. Porting a
group means giving each node-typed slot a real type, not carrying `any` across and suppressing it.

They are written to survive that move, which is why the canvas held its rules across three drawing
sessions and prose did not:

* `StatTile` discriminates on `state`, so an empty tile cannot accept `value` and can never render a `0`
  that reads as a real measurement.
* `Columns` has no date, start, interval or ordering prop at all, so a category set cannot become a time
  axis whose gaps carry meaning.
* `Button` accepts only visible text on its ordinary path. Passing a glyph or any other opaque node
  requires `iconOnly: true` and the word in `label`, the same guarantee `Fab.label` and
  `NavHeader.backLabel` already carry.
* `Sheet.open` accepts only the literal `true`, so a kept-and-toggled instance does not compile.
* `StepUp` has no `children` and no node-typed prop, so a credential field cannot be nested into it.
* `Toast` is four discriminated kinds; `lost` cannot be constructed without both what was lost and the
  way back.

**Where a screen and a contract disagree, the contract is the stricter artifact and the screen is a
prototype.** A `.dc.html` is never type-checked, so several screens omit a word a contract requires:
`StatTile`'s `loadingLabel` and `BlockFrame`'s `staleMessage` are both drawn without them. Build to
the contract and supply the word. The two places where the drawing and the contract genuinely
conflict are filed as tickets rather than settled here.

The matching `.jsx` implementations and `.prompt.md` files stay in the project and are not mirrored
here: the contract is what an implementer builds against, and the canvas's own React source is not the
app's.

`CanvasControls` is deliberately absent. It is the canvas review bar, chrome for the drawing tool
rather than a product surface.

## Calendário Agenda amendment surfaces

1. The shared Mês, Semana, Período and Agenda navigation, including paging, the current-span action, the disabled next range and the month picker, on web and Android.
2. Agenda day headings and populated, loading and empty lists, with clock-formatted values, no-time values, ordered rows and status marks, on both platforms.
3. The Mês selected-day card, with the same day order and complete today-title template, on both platforms.
4. The Agenda entry-details sheet, preserving full habit text, time and status on both platforms.
5. The granted Calendário drawing at both widths, including shared navigation and the Agenda details disclosure.

## `superseded/`

Eleven documents from the pass that predates the information architecture (2026-08-16). They reskin
the app that existed and draw a habit tracker with a chat tab, so **every one of them contradicts
`DESIGN.md` section `## Information architecture`**. They are kept as a record of what the canvas
produces when the prompt describes the screen that exists instead of the job the screen does.

They live in their own folder rather than beside the authority because prose asking an implementer to
ignore a file in front of them is not a control. `Orbit Insights.dc.html` was deleted on 2026-08-16
with the `/insights` route.
