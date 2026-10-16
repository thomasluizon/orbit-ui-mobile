# Progresso surfaces

**At a glance:** the overview and three pushed details share one information architecture on web
and Android. The Progresso amendment in `DESIGN.md` and `design/canvas/README.md` owns the grouping.

| Surface | Web owner | Android owner | Retained content and actions |
|---|---|---|---|
| Overview, `/progress` | `apps/web/app/(app)/progress/page.tsx` | `apps/mobile/app/(tabs)/progress.tsx` | One neutral completion chart, completion rate, active days, best weekday, most consistent habit and its destination or full-name disclosure; three sub-menu rows; Avisos |
| Sequência, `/progress/streak` | `apps/web/app/(app)/progress/streak/page.tsx` | `apps/mobile/app/progress/streak.tsx` | Current and longest streak, fourteen days, tier, frozen and covered-day notices, legend sheet, freeze bank and ceiling, monthly usage, next-freeze bar, protected dates, gap and repair confirmation, repair failures and capacity notice |
| Metas, `/progress/goals` | `apps/web/app/(app)/progress/goals/page.tsx` | `apps/mobile/app/progress/goals.tsx` | Create sheet, status filter, clear filter, drag and accessible reordering, goal status and progress, inline detail, linked habits, history, editing, manual progress, completion, reopening, abandonment and deletion |
| Conquistas, `/progress/achievements` | `apps/web/app/(app)/progress/achievements/page.tsx` | `apps/mobile/app/progress/achievements.tsx` | Level, title, XP and next-level bar, visible achievement categories, earned states and individual progress; social categories remain hidden |

The implementation lives in each platform's `progress-content.tsx`, with a `progress-subscreen.tsx`
frame for pushed details. The shared `progress-navigation.ts` defines the three entries.
Each entry is one tap from the overview, including while its summary is unavailable. The
Conquistas row names level and XP in its supporting line. No additional settings or explanatory
controls live on the overview.

| State | Overview | Sequência | Metas | Conquistas |
|---|---|---|---|---|
| Loading | Chart and figure placeholders; entries remain available | Account placeholders, then reserved day-strip and freeze geometry while history loads | Goal placeholders | Level and achievement placeholders |
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
