# Progresso surfaces

**At a glance:** the overview and three pushed details share one information architecture on web
and Android. The Progresso amendment in `DESIGN.md` and `design/canvas/README.md` owns the grouping.

| Surface | Web owner | Android owner | Retained content and actions |
|---|---|---|---|
| Overview, `/progress` | `apps/web/app/(app)/progress/page.tsx` | `apps/mobile/app/(tabs)/progress.tsx` | One neutral completion chart, completion rate, active days, best weekday, most consistent habit and its destination or full-name disclosure; three sub-menu rows; Avisos |
| Sequência, `/progress/streak` | `apps/web/app/(app)/progress/streak/page.tsx` | `apps/mobile/app/progress/streak.tsx` | Current and longest streak, fourteen days, tier, frozen and covered-day notices, named legend, freeze bank and ceiling, monthly usage, next-freeze bar, protected dates, gap and repair confirmation, repair failures and capacity notice |
| Metas, `/progress/goals` | `apps/web/app/(app)/progress/goals/page.tsx` | `apps/mobile/app/progress/goals.tsx` | Create sheet, status filter, clear filter, drag and accessible reordering, goal status and progress, inline detail, linked habits, history, editing, manual progress, completion, reopening, abandonment and deletion |
| Conquistas, `/progress/achievements` | `apps/web/app/(app)/progress/achievements/page.tsx` | `apps/mobile/app/progress/achievements.tsx` | Level, title, XP and next-level bar, visible achievement categories, earned states and individual progress; social categories remain hidden |

Each platform's `progress-content.tsx` routes the four screens and owns Metas. The overview lives in
`progress-overview.tsx` and `progress-window.tsx`, Sequência in `progress-streak.tsx`, Conquistas in
`progress-achievements.tsx`, and `progress-subscreen.tsx` frames the pushed details. The shared `progress-navigation.ts` defines the three entries.
Each entry is one tap from the overview, including while its summary is unavailable. The
Conquistas row names level and XP in its supporting line. No additional settings or explanatory
controls live on the overview.

| State | Overview | Sequência | Metas | Conquistas |
|---|---|---|---|---|
| Loading | Chart and figure placeholders; entries remain available | Account placeholders, then the reserved day strip and disabled Freezes entry while history loads | Goal placeholders | Level and achievement placeholders |
| Empty | Invitation to start a habit; entries remain available | Zero streak, neutral days and protected-days empty line | Invitation to create a goal; filtered empty state clears the filter | Level and XP remain above the achievement empty invitation |
| Error | Local summary retry; entries remain available | Account, gamification, history and repair recovery in their owning regions | Goal loading and reorder recovery | Account and gamification retry |
| Locked or capacity | Summary's Pro boundary | Freeze Pro boundary, empty or full bank, unaffordable and expired repairs | Existing creation and linked-habit limits | Existing Pro boundary |
| Navigation | Three direct links | Visible back to Progresso and platform back | Visible back to Progresso; goal detail returns to its filtered list | Visible back to Progresso and platform back |

All four routes keep the 740px centred content cap and 16px content inset. Pushed Android
screens retain safe-area and shell end clearance. Small actions keep their intrinsic width.

Verification owners are the web `progress.test.tsx`, `progress-layout-fixtures.test.tsx` and
route-context tests; Android `progress-screen.test.tsx`, achievement geometry and protected-route
tests; and the Progresso cases in `apps/web/e2e/layout/`. Hermetic Chromium overview cases cover
412px, 840px and 1352px in both locales. The layout workflow owns the end-to-end cases.

## Existing entry points

Saved `/streak`, `/goals` and `/achievements` links open their matching Progresso details.
Android system intents preserve the incoming query and fragment. Web redirects keep the query
through the framework redirect table and leave fragment handling with the browser.
Streak notifications carrying `/progress` retain their production meaning and open Sequência;
Wrapped notifications retain their separate period-aware route. Notifications carrying the new
detail routes are accepted directly. Other retired insights and retrospective notifications open
the overview, preserving their query and fragment.

The Orbit streak card opens Sequência. The Orbit goal-list action opens Metas;
the gamification feature-explanation link opens Conquistas. Root navigation and general progress
summaries continue to open the overview.

The achievement grid geometry belongs to Conquistas. Its readable 260px minimum, uniform tracks,
wrapping earned chip, first-render columns, live resizing and enlarged Android text follow
`design/progress-grid-surfaces.md`. Goal widths are measured on Metas, and window stat rows on
the overview, so each geometry case mounts the composition that actually owns it.

## Streak summary and freeze details

The current streak figure, fourteen-day strip and one labelled Freezes or Congelamentos row
occupy the same blocks while history loads and after every freeze-bank response. The entry is
disabled while the history is unavailable. Its single-line trailing value uses the bank’s
count / capacity format in every loaded state, including repair. Loading hides the value
without removing its geometry. The value uses the row’s secondary foreground, including
its focus, hover and press promotion; the disabled chevron keeps the non-text contrast floor. Both platforms place the longest streak, tier, inline named legend,
bank figures, earning bar, protected dates and frozen, covered-day, capacity and repair notices
inside the shared sheet. The bank may omit its earning row at capacity inside that sheet.
The existing repair confirmation, read-back, retry and account replacement behavior is retained.
The sheet owns scrolling for long protected-day lists and restores focus to its entry on dismissal.

The overview keeps Metas on its separate detail route. A hermetic Chromium Vitest mounts the real
streak owner and measures a following heading at its bottom across the freeze-state matrix in both
locales. Android checks identical summary block styles and sheet ownership for the same responses.
The existing streak loading layout case measures the actual summary bottom and header; its
execution remains with the layout workflow. Metas is a separate route with no streak response dependency.

| Summary surface | States verified on web and Android |
|---|---|
| Disabled entry and reserved trailing value | Loading, both themes, disabled chevron contrast |
| Loaded bank count | Ordinary, empty, full, one or many protected days, frozen today, manual and automatic coverage |
| Repair count and details entry | Available, empty, partial, capped and unavailable repair; repair confirmation remains in the sheet |
| Capacity sheet | Full bank, no earning row and no upgrade action |

## Focused Orbit level and achievements

The paired `components/gamification/level-summary.tsx` and `achievement-tile.tsx` own both
Conquistas and the negotiated `components/chat/gamification-card.tsx` composition. Extraction
preserves the existing level row, XP bar, achievement card, earned disc and progress geometry.
The chat block shows only present source sections and the complete returned catalogue. It keeps
an empty catalogue distinct from an unrequested one, and never reads live profile hooks to replace
a saved answer. The related Conquistas action uses the established shared surface mapping.

The shared read session owns signed refresh, account replacement, duplicate-press protection,
unmount and late-response rejection. The dedicated endpoint retains the original include flags
and absolute scope; it has no paging request. A failed refresh retains the snapshot and its retry.
Web and Android read-block tests cover the three source selections, empty catalogues, both
locales, signed refresh and stale recovery. Existing Progresso and achievement geometry tests
continue to own the extracted components. The eval projects the same visible headings, level,
XP, achievement copy, earned state and progress instead of hidden source metadata.

The paired `components/gamification/streak-figure.tsx` owns the unchanged current-streak figure
on Sequência and in focused Orbit reads. `gamification-streak.tsx` composes that figure with
DayStrip and the existing read-only FreezeBank only when the streak source is present. The saved
query date anchors the strip and protected dates; live hooks cannot replace the snapshot.
Streak-only answers use the frame heading; combined answers add a separate streak heading.
The eval projects the same figures, days and freeze facts. Paired read-block tests cover both
streak selections, absence for level and achievements, and replacement through signed refresh.

## Orbit answers, then the person asks the next thing

The flag `orbit_guided_flows` turns this form on for the overview and Sequência on both platforms.
With the flag off, each screen renders the form above. Conquistas keeps its structure either way.

| Surface | Web owner | Android owner |
|---|---|---|
| Overview | `_components/guided-progress-overview.tsx` | `components/progress/guided-progress-overview.tsx` |
| Sequência | `_components/guided-streak-section.tsx` | `components/progress/guided-streak-section.tsx` |
| Repair flow | `_components/streak-repair-flow.tsx` in the sub-screen layer | `components/progress/streak-repair-flow.tsx` in a full-screen modal |
| Sub-screen error | `_components/progress-surface-error.tsx` | `components/progress/progress-surface-error.tsx` |

The overview draws one live Orbit at 96, or 128 at 1024 and above, centred above one line. The
shared `resolveProgressOrbitLine` picks the line from the 30-day read the screen already makes:
the active days, the selected day, the return after a gap, or the empty window. The line is
absent while the window loads, fails or sits behind the Pro gate, and Orbit stays in Parado.
A gap is the one `getReturningIntervalBetween` rule that Hoje also reads. The section headings
are the questions `Como foram seus 30 dias?` and `O que você quer ver?`.

A press on a bar changes the line to that day, and Orbit looks at the bar. The same bar again,
or a press outside the chart, returns the default line. No request starts. The readout moves on
the selection preset and the line cross-fades on the micro duration. A figure that changed since
the last visit on this device rolls once on the slow duration. The UI store keeps the seen
figures, and a first visit rolls nothing. Reduced motion keeps each of these still.

Sequência draws Orbit at 48 beside one fact: the streak and the days to the next freeze, only the
streak at a full bank, or the gap sentence in a gap. The repair action and the unavailable,
partial and capped cases stay on the screen. The Freezes sheet keeps every figure, the legend and
the bank-full notice, and it opens on one sentence about what a freeze does. The repair is a one-question flow with the `streak_repair` flow id. It sends
the same request as the confirm, keeps each error inside the flow, and closes with the result
dialog that states the count the server returned.

Verification owners are the web `progress-guided.test.tsx` and `progress-guided-geometry.test.tsx`,
the Android `progress-guided.test.tsx`, `progress-guided-centre-geometry.test.tsx` and
`progress-guided-label-fit.test.ts`, and the shared `progress-orbit-line.test.ts` and
`progress-figures.test.ts`.
