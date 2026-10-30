# Expanded personal text focus inventory

**At a glance:** Owners of expanded typed text, their web action boundaries, and the native mobile adapter.

The shared web `PersonalText` owns overflow measurement, the full accessible name,
and a keyboard stop only while an expanded token actually scrolls. A native action
must be a sibling of that scroll region. Collapsed text retains its wrapping and
ellipsis contract. The sidebar account row remains collapsed.
The Perfil account navigation row stays collapsed with one control; Conta owns
the expanded name and email in `profile/_components/profile-account-content.tsx`
on both platforms.

| Surface family | Web owner | Expanded states and action boundary |
| --- | --- | --- |
| Personal radio options | `apps/web/components/ui/select-check.tsx` | Selected enabled option; disclosed disabled option. Radio and disclosure controls are siblings of the scrolling text. |
| Personal list rows | `apps/web/components/ui/list-row.tsx` | Disclosed title, description or value; the account row's expanded value. A disclosure remains beside scrolling text; collapsed destination text stays inside its native link. |
| Astra preview titles | `apps/web/components/chat/preview-item-title.tsx` | Editable pending names open Input. Every other title reveals the full name on activation; PersonalTextAction keeps the native title control beside scrolling expanded text. Android mirrors expansion through PersonalText and returns accessibility focus after inline editing. |
| Typed text disclosure | `apps/web/components/ui/personal-text-details.tsx` | Inline disclosure separates its button; icon-only disclosure opens a sheet with standalone text. |
| Typed sheet headings | `apps/web/components/ui/sheet.tsx` | Fitting titles remain plain headings. Only measured truncation adds a disclosure button, with the full accessible name and expanded state. Full text remains in the separate sheet body. Android mirrors the conditional role and press fill. |
| Habit selection rows | `apps/web/components/habits/habit-row.tsx` | Selected title expands through `habit-row-content.tsx`; the selection action keeps its progress and status accessible name. |
| Habit detail heading | `apps/web/components/habits/habit-detail-screen.tsx` | Unclamped reading heading; words wrap and oversized tokens ellipsize without scrolling. The one named pencil opens the full title input. |
| Checklist item labels | `apps/web/components/habits/habit-checklist.tsx` | Fully wrapping label with no line clamp or disclosure; body completion and checkbox are sibling actions. |
| Progress top habit | `apps/web/app/(app)/progress/_components/progress-content.tsx` | A habit without a destination discloses beside its button; a habit with an id remains a collapsed destination link. |
| Retrospective top habit | `apps/web/app/(app)/wrapped/_components/wrapped-slide.tsx` | Disclosed heading beside its button, inside the existing motion part. |
| About account fact | `apps/web/app/(app)/about/page.tsx` | Disclosed account value beside its native disclosure button. |
| Personal settings rows | `apps/web/components/ui/list-row.tsx`, `apps/web/components/ui/settings-group.tsx` | Typed labels disclose beside their native action; trailing controls retain their own pointer and keyboard paths. |
| Support reply email | `apps/web/app/(app)/support/_components/support-reply-email.tsx` | The disclosed reply address scrolls beside its native disclosure button; label, value and hint associations remain. |
| Standalone expanded text | Owners listed below | A separate disclosure or noninteractive heading already owns the text; no native action encloses the scroll region. |

Standalone expanded text owners:

- `apps/web/app/(app)/calendar/page.tsx`
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
accessible native text with horizontal `ScrollView` for expanded lines. Unclamped headings wrap between words without scrolling and ellipsize oversized tokens. It has no
web keyboard-focusable scroller. Overflow tab stops, DOM action separation and
CSS outline clearance are web platform adapters; they do not change the native
word-boundary or disclosure behavior.

## Overflow-only disclosure consumers

`PersonalTextDetails` renders plain text until its collapsed text overflows. Web
measures vertical overflow, horizontal overflow and ellipsized word spans, and
rechecks on element resize, initial font readiness and subsequent font loads.
Native text reports unclamped `onTextLayout` lines. Single-line names and long
unbroken tokens use the same measurement path. Expanded inline text keeps a hidden,
inaccessible collapsed measurement so reflow can remove a disclosure that no
longer reveals anything. Measurement never adds a keyboard stop.

Every consumer below has a web and mobile owner. Names remain eligible for
conditional disclosure because their length is person-controlled. Generated log
dates in `record-list-card.tsx` use plain `PersonalText`.

| Consumer family | Owners | Measurement owner |
| --- | --- | --- |
| Goal titles and linked habit names | `chat/goal-list-card.tsx` | Inline details |
| Insight habit names | `chat/period-insight-card.tsx` | Inline details |
| Top habit figures | `chat/metrics-card.tsx` | Inline details |
| Operation targets and action names | `chat/operation-outcomes.tsx`, `chat/action-chips.tsx` | Inline details |
| Suggested habit names | `chat/breakdown-suggestion.tsx` | Inline details |
| Record titles | `chat/record-list-card.tsx` | Inline details; generated log dates stay plain |
| Connected workspace name | `profile/notion-connection-sheet.tsx` | Inline details |
| Tags and selected goal names | `habits/habit-detail-screen.tsx`, `habits/habit-form-fields/tag-picker-field.tsx`, `habits/goal-linking-field.tsx` | Single-line inline details |
| Block titles | `ui/block-frame.tsx` | The visible heading reports overflow to its sibling icon control |
| Picker names | `ui/picker-row.tsx` | The visible toggle label reports overflow to its sibling icon control |
| Checklist template names | `habits/checklist-templates.tsx` | Each visible load label reports overflow independently |
| Drill heading | Web `habits/habit-list/habit-drill.tsx`, mobile `habit-list/habit-drill.tsx` | The visible heading reports overflow to its sibling icon control |
| Search names | Web `command/command-row.tsx`, mobile `search/search-results.tsx` | The visible result label reports overflow to its sibling icon control |
| Sheet titles | `ui/sheet.tsx` | The collapsed heading reports overflow through PersonalText, including while the body shows the full title. Resize and title changes remove disclosure when the heading fits. Notification details, personal text details, API key confirmations and the sheet disclosures in breakdown suggestions, one small step and pending operation cards share this owner. Web has no native title tooltip; padded feedback hugs the title box and keeps one inset focus indicator clear of Close. |
