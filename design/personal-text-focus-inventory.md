# Expanded personal text focus inventory

**At a glance:** Owners of expanded typed text, their web action boundaries, and the native mobile adapter.

The shared web `PersonalText` owns overflow measurement, the full accessible name,
and a keyboard stop only while an expanded token actually scrolls. A native action
must be a sibling of that scroll region. Collapsed text retains its wrapping and
ellipsis contract. The sidebar account row remains collapsed.

| Surface family | Web owner | Expanded states and action boundary |
| --- | --- | --- |
| Personal radio options | `apps/web/components/ui/select-check.tsx` | Selected enabled option; disclosed disabled option. Radio and disclosure controls are siblings of the scrolling text. |
| Personal list rows | `apps/web/components/ui/list-row.tsx` | Disclosed title, description or value; the account row's expanded value. Native destination or disclosure remains beside the text. |
| Typed text disclosure | `apps/web/components/ui/personal-text-details.tsx` | Inline disclosure separates its button; icon-only disclosure opens a sheet with standalone text. |
| Habit selection rows | `apps/web/components/habits/habit-row.tsx` | Selected title expands through `habit-row-content.tsx`; the selection action keeps its progress and status accessible name. |
| Habit detail heading | `apps/web/components/habits/habit-detail-screen.tsx` | Expanded heading beside its rename button; editing still uses the input. |
| Checklist item labels | `apps/web/components/habits/habit-checklist.tsx` | Disclosed label beside its disclosure button and completion checkbox. |
| Progress top habit | `apps/web/app/(app)/progress/_components/progress-content.tsx` | A habit without a destination discloses beside its button; a habit with an id remains a collapsed destination link. |
| Retrospective top habit | `apps/web/app/(app)/wrapped/_components/wrapped-slide.tsx` | Disclosed heading beside its button, inside the existing motion part. |
| About account fact | `apps/web/app/(app)/about/page.tsx` | Disclosed account value beside its native disclosure button. |
| Personal settings rows | `apps/web/components/ui/settings-row.tsx`, `apps/web/components/ui/settings-group.tsx` | Typed labels disclose beside their native action; trailing controls retain their own pointer and keyboard paths. |
| Support reply email | `apps/web/app/(app)/support/_components/support-reply-email.tsx` | The disclosed reply address scrolls beside its native disclosure button; label, value and hint associations remain. |
| Standalone expanded text | Owners listed below | A separate disclosure or noninteractive heading already owns the text; no native action encloses the scroll region. |

Standalone expanded text owners:

- `apps/web/app/(app)/calendar/page.tsx`
- `apps/web/app/(app)/profile/_components/account-navigation-row.tsx`
- `apps/web/app/(app)/profile/_components/edit-name-sheet.tsx`
- `apps/web/components/calendar-sync/calendar-import-content.tsx`
- `apps/web/components/calendar-sync/calendar-picker-section.tsx`
- `apps/web/components/calendar-sync/calendar-sync-event-row.tsx`
- `apps/web/components/calendar/calendar-entry-details.tsx`
- `apps/web/components/calendar/calendar-day-detail.tsx`
- `apps/web/components/goals/goal-detail-drawer/goal-progress-block.tsx`
- `apps/web/components/shell/composer.tsx`
- `apps/web/components/ui/sheet.tsx`

The corresponding mobile owners use `apps/mobile/components/ui/personal-text.tsx`:
accessible native text with horizontal `ScrollView` for expanded lines. It has no
web keyboard-focusable scroller. Overflow tab stops, DOM action separation and
CSS outline clearance are web platform adapters; they do not change the native
word-boundary or disclosure behavior.
