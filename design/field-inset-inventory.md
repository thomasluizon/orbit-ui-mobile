# Field inset inventory

## At a glance

Every concrete text control and input-producing primitive or wrapper in the web and mobile app source is listed below. Values are inline padding inside the control border; a real native border adds its width to the glyph position. The browser uses inset shadows for most field borders. Placeholder and typed text share the same control padding unless a mirror is explicitly identified.

## Drawn families

| Family | Drawn inline inset | Source and composition |
|---|---:|---|
| Standard Input, form-input, AppTextInput, BottomSheetAppTextInput, goal FieldWell | 16 | Granted design-system Input; minimum height 54. Busca, move-parent, emoji, tag, goal and time-zone searches inherit this family. Tag and goal search keep their keyboard-aware native wrapper with exact Input padding and minimum height. |
| Composer | 8 | The #1607 amendment in `design/canvas/README.md` retains pill padding 4 and input padding 8. Text starts at 12 in conversation, or 4 plus the measured glyph-and-name entry width plus 8 on compact Hoje and habit detail. Entry and trailing controls keep the 48 target minimum. Native positioned placeholder and measurement text use logical start/end 8. |
| Sentence / multiline Input | 16 | Granted Habit Create sentence field and design-system multiline Input. Habit phrase overlays match the textarea/TextInput padding. |
| Other inline add, template name, tag editor, custom reminder, chat record filter and breakdown edit | 12 | Granted Habit Create, Habit Detail and Astra inline wells. Checklist add rows use the standard Input family. |
| Checklist item edit | 8 with drag grip; 12 without grip | Granted Habit Create checklist. Both shipped editors always include their grip; their add rows use the standard Input inset of 16. |
| Numbered subhabit row | 8 after index | Granted Habit Create compound row. Input padding is 0; the row provides leading padding and an 8 gap after its 16-wide index. |
| Habit title edit | 16 | Existing full editor Input; the detail reading heading is static and the named pencil opens this field. |
| Calendar month | 16 inline, 8 block | `design/canvas/Orbit Calendario.dc.html`, month disclosure. The shipped month selector uses picker buttons on both platforms, not a text input; no month text control exists to measure. |
| OTP | Centred digit | Design-system OTP cells. The input captures keystrokes invisibly; the visible digit is centred, so no inline inset applies. |
| Attachment pickers | No drawn glyph | Hidden file inputs are listed for completeness and excluded from text geometry. |

## Habit title accessories

Habit title mirror and editable controls retain 16 inline insets. Their symmetric block insets
are at least 12 and expand to centre the first line within the standard 54 minimum height.
The emoji square uses this single-line field height at the current text scale; wrapped titles
retain the same square and both trailing actions centre on the first line. Feedback below the
row does not enter this geometry. Paired Vitest geometry cases cover 360 and 412 at scales 1 and 2.

## Checklist add surfaces

The checklist add row uses the shared Input and a separate ghost small icon-only PillButton with an 8 gap in each owning composition:

| Surface | Owner |
| --- | --- |
| Web habit create and edit, More details | `apps/web/components/habits/habit-form-fields.tsx` |
| Android habit create and edit, More details | `apps/mobile/components/habits/habit-form-fields.tsx` |

Habit detail has no checklist add row: its pencil opens the edit modal, which composes the same form fields.

Both checklist implementations retain empty, populated, typed, disabled and at-capacity states, localized names and keyboard additions. Geometry coverage includes narrow and wide widths, both themes and both locales on web; native Vitest inspects the actual shared control styles and behavior.

## Code inventory

Paths are repository-relative. Repeated rows are separate controls within one owner. Standard entries name call sites as well as the actual input producers, so a caller cannot hide behind an audited primitive. The table holds each text element (`input`, `textarea`, `TextInput` and the typed adapters) and each call site of `Input`, `AppTextInput`, `BottomSheetAppTextInput`, `FieldWell`, `PickerList`, `TimeField`, `OtpInput` and `CommandInput` in the app source outside tests. A checkbox input is not a text control.

| Owner | Line | Control | Family | Drawn padding |
|---|---:|---|---|---|
| `apps/mobile/app/(tabs)/calendar/_components/calendar-day-events.tsx` | 50 | `Input` | standard | 16 |
| `apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx` | 32 | `Input` | standard | 16 |
| `apps/mobile/app/(tabs)/index.tsx` | 68 | `Input` | standard | 16 |
| `apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx` | 115 | `AppTextInput` | standard | 16 |
| `apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx` | 293 | `AppTextInput` | standard | 16 |
| `apps/mobile/app/search.tsx` | 64 | `Input` | standard | 16 |
| `apps/mobile/app/step-up.tsx` | 422 | `OtpInput` | otp | centred |
| `apps/mobile/app/support.tsx` | 190 | `Input` | standard | 16 |
| `apps/mobile/components/auth/code-step.tsx` | 72 | `OtpInput` | otp | centred |
| `apps/mobile/components/auth/email-step.tsx` | 44 | `Input` | standard | 16 |
| `apps/mobile/components/chat/answer-block.tsx` | 41 | `Input` | standard | 16 |
| `apps/mobile/components/chat/breakdown-suggestion.tsx` | 33 | `TypedTextInput` | inline add | 12 |
| `apps/mobile/components/chat/habit-suggestions-card.tsx` | 68 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 44 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 52 | `TimeField` | time | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 54 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 138 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 155 | `TimeField` | time | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 157 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 216 | `OtpInput` | otp | centred |
| `apps/mobile/components/chat/preview-item-title.tsx` | 30 | `Input` | standard | 16 |
| `apps/mobile/components/chat/prompt-library.tsx` | 75 | `Input` | standard | 16 |
| `apps/mobile/components/chat/question-controls.tsx` | 59 | `Input` | standard | 16 |
| `apps/mobile/components/chat/record-list-card.tsx` | 114 | `TypedTextInput` | inline add | 12 |
| `apps/mobile/components/chat/structured-preview-field.tsx` | 25 | `TimeField` | time | 16 |
| `apps/mobile/components/chat/structured-preview-field.tsx` | 26 | `Input` | standard | 16 |
| `apps/mobile/components/goals/create-goal-sheet.tsx` | 32 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/goals/edit-goal-modal.tsx` | 199 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 40 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 62 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/goals/goal-detail-drawer/goal-progress-form.tsx` | 50 | `Input` | standard | 16 |
| `apps/mobile/components/goals/goal-detail-drawer/goal-progress-form.tsx` | 51 | `Input` | standard | 16 |
| `apps/mobile/components/goals/goal-habits-field.tsx` | 46 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habit-list/move-parent-dialog.tsx` | 178 | `Input` | standard | 16 |
| `apps/mobile/components/habits/checklist-templates.tsx` | 154 | `BottomSheetAppTextInput` | inline add | 12 |
| `apps/mobile/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 42 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 65 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/create-habit-modal/sub-habit-editor.tsx` | 61 | `BottomSheetAppTextInput` | subhabit | 0; 8 after index |
| `apps/mobile/components/habits/goal-linking-field.tsx` | 47 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/habit-checklist.tsx` | 110 | `BottomSheetAppTextInput` | checklist edit | 8 with grip |
| `apps/mobile/components/habits/habit-checklist.tsx` | 198 | `Input` | standard inline add | 16 |
| `apps/mobile/components/habits/habit-form-fields.tsx` | 477 | `Input` | standard | 16 |
| `apps/mobile/components/habits/habit-form-fields/habit-date-field.tsx` | 104 | `Input` | standard | 16 |
| `apps/mobile/components/habits/habit-form-fields/habit-emoji-selector.tsx` | 147 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/habit-form-fields/habit-schedule-fields.tsx` | 45 | `Input` | standard | 16 |
| `apps/mobile/components/habits/habit-form-fields/habit-timing-field.tsx` | 63 | `TimeField` | time | 16 |
| `apps/mobile/components/habits/habit-form-fields/habit-timing-field.tsx` | 66 | `TimeField` | time | 16 |
| `apps/mobile/components/habits/habit-form-fields/habit-understanding.tsx` | 118 | `TypedTextInput` | sentence | 16 |
| `apps/mobile/components/habits/habit-form-fields/reminder-section.tsx` | 155 | `BottomSheetAppTextInput` | inline add | 12 |
| `apps/mobile/components/habits/habit-form-fields/repeat-reminder-section.tsx` | 51 | `TimeField` | time | 16 |
| `apps/mobile/components/habits/habit-form-fields/repeat-reminder-section.tsx` | 54 | `TimeField` | time | 16 |
| `apps/mobile/components/habits/habit-form-fields/repeat-reminder-section.tsx` | 55 | `TimeField` | time | 16 |
| `apps/mobile/components/habits/habit-form-fields/scheduled-reminder-section.tsx` | 153 | `TimeField` | time | 16 |
| `apps/mobile/components/habits/habit-form-fields/tag-editor-row.tsx` | 54 | `BottomSheetAppTextInput` | inline add | 12 |
| `apps/mobile/components/habits/habit-form-fields/tag-picker-field.tsx` | 73 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/repeat-reminder-detail.tsx` | 70 | `TimeField` | time | 16 |
| `apps/mobile/components/onboarding/onboarding-create-habit.tsx` | 98 | `TimeField` | time | 16 |
| `apps/mobile/components/onboarding/onboarding-welcome.tsx` | 22 | `Input` | standard | 16 |
| `apps/mobile/components/profile/preferences-sections.tsx` | 95 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/profile/profile-api-keys.tsx` | 203 | `Input` | standard | 16 |
| `apps/mobile/components/profile/profile-api-keys.tsx` | 219 | `Input` | standard | 16 |
| `apps/mobile/components/profile/profile-api-keys.tsx` | 235 | `Input` | standard | 16 |
| `apps/mobile/components/shell/composer.tsx` | 327 | `TypedTextInput` | composer | 8 |
| `apps/mobile/components/ui/app-text-input.tsx` | 53 | `TypedTextInput` | standard | 16 |
| `apps/mobile/components/ui/bottom-sheet-app-text-input.tsx` | 83 | `TypedTextInput` | standard | 16 |
| `apps/mobile/components/ui/input.tsx` | 43 | `TypedTextInput` | standard | 16 |
| `apps/mobile/components/ui/otp-input.tsx` | 49 | `TypedTextInput` | otp | centred |
| `apps/mobile/components/ui/time-field.tsx` | 231 | `TypedTextInput` | time | 16 |
| `apps/mobile/components/ui/typed-text-input.tsx` | 30 | `TextInput` | foreground adapter | caller-owned |
| `apps/web/app/(app)/layout.tsx` | 382 | `input` | file | glyphless |
| `apps/web/app/(app)/layout.tsx` | 389 | `input` | file | glyphless |
| `apps/web/app/(app)/preferences/_components/preference-picker-sheet.tsx` | 89 | `input` | standard | 16 |
| `apps/web/app/(app)/profile/_components/edit-name-sheet.tsx` | 103 | `Input` | standard | 16 |
| `apps/web/app/(app)/profile/_components/fresh-start-modal.tsx` | 344 | `Input` | standard | 16 |
| `apps/web/app/(app)/support/_components/support-form.tsx` | 130 | `Input` | standard | 16 |
| `apps/web/app/(app)/today-page-view.tsx` | 59 | `Input` | standard | 16 |
| `apps/web/app/(auth)/login/code-step.tsx` | 58 | `OtpInput` | otp | centred |
| `apps/web/app/(auth)/login/email-step.tsx` | 39 | `Input` | standard | 16 |
| `apps/web/app/step-up/step-up-screen.tsx` | 435 | `OtpInput` | otp | centred |
| `apps/web/components/calendar/calendar-day-events.tsx` | 48 | `Input` | standard | 16 |
| `apps/web/components/calendar/calendar-entry-details.tsx` | 32 | `Input` | standard | 16 |
| `apps/web/components/chat/answer-block.tsx` | 42 | `Input` | standard | 16 |
| `apps/web/components/chat/breakdown-suggestion.tsx` | 32 | `input` | inline add | 12 |
| `apps/web/components/chat/habit-suggestions-card.tsx` | 55 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 47 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 55 | `TimeField` | time | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 57 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 126 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 143 | `TimeField` | time | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 145 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 204 | `OtpInput` | otp | centred |
| `apps/web/components/chat/preview-item-title.tsx` | 20 | `Input` | standard | 16 |
| `apps/web/components/chat/prompt-library.tsx` | 56 | `Input` | standard | 16 |
| `apps/web/components/chat/question-controls.tsx` | 47 | `Input` | standard | 16 |
| `apps/web/components/chat/record-list-card.tsx` | 97 | `input` | inline add | 12 |
| `apps/web/components/chat/structured-preview-field.tsx` | 19 | `TimeField` | time | 16 |
| `apps/web/components/chat/structured-preview-field.tsx` | 20 | `Input` | standard | 16 |
| `apps/web/components/command/command-menu-chrome.tsx` | 77 | `CommandInput` | search | 16 |
| `apps/web/components/goals/create-goal-sheet.tsx` | 61 | `FieldWell` | standard | 16 |
| `apps/web/components/goals/edit-goal-modal.tsx` | 193 | `FieldWell` | standard | 16 |
| `apps/web/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 32 | `FieldWell` | standard | 16 |
| `apps/web/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 44 | `FieldWell` | standard | 16 |
| `apps/web/components/goals/field-well.tsx` | 46 | `input` | standard | 16 |
| `apps/web/components/goals/goal-detail-drawer/goal-progress-form.tsx` | 49 | `Input` | standard | 16 |
| `apps/web/components/goals/goal-detail-drawer/goal-progress-form.tsx` | 50 | `Input` | standard | 16 |
| `apps/web/components/goals/goal-habits-field.tsx` | 36 | `PickerList` | standard | 16 |
| `apps/web/components/habits/checklist-templates.tsx` | 111 | `input` | inline add | 12 |
| `apps/web/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 33 | `FieldWell` | standard | 16 |
| `apps/web/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 46 | `FieldWell` | standard | 16 |
| `apps/web/components/habits/create-habit-modal/sub-habit-editor.tsx` | 47 | `input` | subhabit | 0; 8 after index |
| `apps/web/components/habits/goal-linking-field.tsx` | 57 | `PickerList` | standard | 16 |
| `apps/web/components/habits/habit-checklist.tsx` | 327 | `input` | checklist edit | 8 with grip |
| `apps/web/components/habits/habit-checklist.tsx` | 405 | `Input` | standard inline add | 16 |
| `apps/web/components/habits/habit-form-fields.tsx` | 450 | `Input` | standard | 16 |
| `apps/web/components/habits/habit-form-fields/habit-date-field.tsx` | 92 | `Input` | standard | 16 |
| `apps/web/components/habits/habit-form-fields/habit-emoji-selector.tsx` | 145 | `input` | standard | 16 |
| `apps/web/components/habits/habit-form-fields/habit-schedule-fields.tsx` | 34 | `Input` | standard | 16 |
| `apps/web/components/habits/habit-form-fields/habit-timing-field.tsx` | 59 | `TimeField` | time | 16 |
| `apps/web/components/habits/habit-form-fields/habit-timing-field.tsx` | 62 | `TimeField` | time | 16 |
| `apps/web/components/habits/habit-form-fields/habit-understanding.tsx` | 111 | `TypedTextarea` | sentence | 16 |
| `apps/web/components/habits/habit-form-fields/reminder-section.tsx` | 136 | `input` | inline add | 12 |
| `apps/web/components/habits/habit-form-fields/repeat-reminder-section.tsx` | 45 | `TimeField` | time | 16 |
| `apps/web/components/habits/habit-form-fields/repeat-reminder-section.tsx` | 48 | `TimeField` | time | 16 |
| `apps/web/components/habits/habit-form-fields/repeat-reminder-section.tsx` | 49 | `TimeField` | time | 16 |
| `apps/web/components/habits/habit-form-fields/scheduled-reminder-section.tsx` | 112 | `TimeField` | time | 16 |
| `apps/web/components/habits/habit-form-fields/tag-editor-row.tsx` | 44 | `input` | inline add | 12 |
| `apps/web/components/habits/habit-form-fields/tag-picker-field.tsx` | 77 | `PickerList` | standard | 16 |
| `apps/web/components/habits/habit-list/move-parent-overlay.tsx` | 145 | `Input` | standard | 16 |
| `apps/web/components/habits/repeat-reminder-detail.tsx` | 65 | `TimeField` | time | 16 |
| `apps/web/components/onboarding/onboarding-create-habit.tsx` | 130 | `TimeField` | time | 16 |
| `apps/web/components/onboarding/onboarding-welcome.tsx` | 25 | `Input` | standard | 16 |
| `apps/web/components/profile/profile-api-keys.tsx` | 195 | `Input` | standard | 16 |
| `apps/web/components/profile/profile-api-keys.tsx` | 211 | `Input` | standard | 16 |
| `apps/web/components/profile/profile-api-keys.tsx` | 227 | `Input` | standard | 16 |
| `apps/web/components/shell/composer.tsx` | 391 | `TypedTextarea` | composer | 8 |
| `apps/web/components/ui/input.tsx` | 52 | `TypedTextarea` | standard | 16 |
| `apps/web/components/ui/input.tsx` | 53 | `input` | standard | 16 |
| `apps/web/components/ui/otp-input.tsx` | 44 | `input` | otp | centred |
| `apps/web/components/ui/picker-list.tsx` | 54 | `input` | standard | 16 |
| `apps/web/components/ui/time-field.tsx` | 134 | `input` | time | 16 |
| `apps/web/components/ui/typed-textarea.tsx` | 8 | `textarea` | foreground adapter | caller-owned |

## Typed foreground ownership

Visible native text controls use `TypedTextInput`, which applies `fg1` after caller styles in both themes. `Input`, `AppTextInput` and `BottomSheetAppTextInput` compose it. The hidden OTP capture remains a native input; its visible digits use the foreground token.

| Surface | Native owner | Web owner | Foreground path |
| --- | --- | --- | --- |
| Habit create and edit name | `habits/habit-form-fields/habit-understanding.tsx` | same relative component | Native `TypedTextInput`, web `TypedTextarea`; mirrors retain consumed-word backgrounds and underlines, while the editable controls draw foreground letters and placeholders. Native consumed spans use `hairlineStrong` foreground to paint Android underlines beneath the editable glyphs; web uses an independent inset shadow with transparent mirror glyphs |
| Habit detail title editing | `habits/habit-form-fields/habit-understanding.tsx` | same relative component | Existing full editor foreground and padding; the read heading has no input |
| Checklist add and description | `habits/habit-form-fields.tsx` | same relative components | Shared `Input` in both single-line and multiline modes |
| Checklist and subhabit edit | `habits/habit-checklist.tsx`, `habits/create-habit-modal/sub-habit-editor.tsx` | same relative components | Native `BottomSheetAppTextInput`, web input with `--fg-1` |
| Astra and shell composers | `shell/composer.tsx` | same relative component | Native `TypedTextInput`, web `TypedTextarea` |
| Astra record filter and breakdown rename | `chat/record-list-card.tsx`, `chat/breakdown-suggestion.tsx` | same relative components | Native `TypedTextInput`, web input with `--fg-1` |
| Search and move-parent search | `app/search.tsx`, `habit-list/move-parent-dialog.tsx` | `app/(app)/search/page.tsx`, `habits/habit-list/move-parent-overlay.tsx` | Shared `Input` |
| Goal title, target and unit | `goals/edit-goal-modal.tsx`, `goals/edit-goal-modal/edit-goal-target-fields.tsx`, `goals/create-goal-sheet.tsx`, `habits/create-goal-from-habit/goal-target-fields.tsx` | same relative components | Native `BottomSheetAppTextInput`, web `FieldWell` with `--fg-1` |
| Profile name and reset confirmation | `app/(tabs)/profile/_components/edit-name-sheet.tsx`, `fresh-start-modal.tsx` | `app/(app)/profile/_components/edit-name-sheet.tsx`, `fresh-start-modal.tsx` | Native `AppTextInput`, web `Input` |
| Profile time-zone search and key name | `profile/preferences-sections.tsx`, `profile/profile-api-keys.tsx` | preferences picker and `profile/profile-api-keys.tsx` | Native `BottomSheetAppTextInput` or `Input`, web explicit `--fg-1` |
| Virtualized picker search | No additional native producer | `ui/picker-list.tsx` | Web `form-input` resolves to `--fg-1` |
| Emoji, tag, goal and reminder fields | Habit form field owners listed above | Mirrored habit form field owners | Native `BottomSheetAppTextInput` or `TypedTextInput`, web explicit `--fg-1` |
| Time entry | `ui/time-field.tsx` | same relative component | Native `TypedTextInput`, web explicit `--fg-1` |
| Habit create and edit start and end time | `habits/habit-form-fields.tsx` via `ui/time-field.tsx` | same relative components | Both fields use the time-entry family with inline padding 16 and typed foreground `fg1` / `--fg-1`. End time becomes editable after a start time is entered; removing the start clears the end time. |

## Verification boundary

Native composer styles and mounted Yoga geometry cover both directions and compact widths. Web Vitest Chromium measures placeholder and typed glyphs, padding focus and ten-word wrapping. The layout guard measures all visible fields on its swept pages against this inventory, locating each by its accessible name or stable attribute. Habit time coverage enters a start time before measuring the enabled end-time field, including its typed foreground. A temporary styled mirror exposes the input text to a first-character Range because native input text is not a selectable DOM text node. Actual device glyph rasterization, screen-reader interaction and layout workflow execution remain outside worker verification.

## Habit type and date groups

Both habit form owners place type radios before the title, then the date phrase Input and DateField
before the details disclosure. Input retains its standard inline padding and persistent When label;
DateField retains its own inset and separate calendar target. Proposed and validation states use
the same owners. Native date text may wrap above the large-text threshold. The type group uses
RadioRow and its existing first-line control alignment. `habit-form-surfaces.md` names the mode,
request and retained-capability boundaries.

Habit detail removes its inline title, quantity, time and description editors. The complete pencil editor retains the form controls and checklist item insets above; detail facts contain no text input.
