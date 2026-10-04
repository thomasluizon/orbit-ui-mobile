# Field inset inventory

## At a glance

Every concrete text control and input-producing primitive or wrapper in the web and mobile app source is listed below. Values are inline padding inside the control border; a real native border adds its width to the glyph position. The browser uses inset shadows for most field borders. Placeholder and typed text share the same control padding unless a mirror is explicitly identified.

## Drawn families

| Family | Drawn inline inset | Source and composition |
|---|---:|---|
| Standard Input, form-input, AppTextInput, BottomSheetAppTextInput, goal FieldWell | 16 | Granted design-system Input; minimum height 54. Busca, move-parent, emoji, tag, goal and time-zone searches inherit this family. Tag and goal search keep their keyboard-aware native wrapper with exact Input padding and minimum height. |
| Composer | 8 | `design/canvas/native-mobile.js`, textarea padding `4px 8px`. Pill padding 4 yields text start 12 in conversation and 60 with the 48 glyph control on Hoje and habit detail. The trailing controls retain 48 targets. Native positioned placeholder and measurement text use logical start/end 8. |
| Sentence / multiline Input | 16 | Granted Habit Create sentence field and design-system multiline Input. Habit phrase overlays match the textarea/TextInput padding. |
| Inline add, template name, tag editor, custom reminder, detail quantity, chat record filter and breakdown edit | 12 | Granted Habit Create, Habit Detail and Astra inline wells. |
| Checklist item edit | 8 with drag grip; 12 without grip | Granted Habit Create checklist. Both shipped editors always include their grip; their add rows use 12. |
| Numbered subhabit row | 8 after index | Granted Habit Create compound row. Input padding is 0; the row provides leading padding and an 8 gap after its 16-wide index. |
| Habit heading rename | 0 | Unboxed title aligned with the reading heading, rather than a field well. |
| Calendar month | 16 inline, 8 block | `design/canvas/Orbit Calendario.dc.html`, month disclosure. The shipped month selector uses picker buttons on both platforms, not a text input; no month text control exists to measure. |
| OTP | Centred digit | Design-system OTP cells. The input captures keystrokes invisibly; the visible digit is centred, so no inline inset applies. |
| Attachment pickers | No drawn glyph | Hidden file inputs are listed for completeness and excluded from text geometry. |

## Code inventory

Paths are repository-relative. Repeated rows are separate controls within one owner. Standard entries name call sites as well as the actual input producers, so a caller cannot hide behind an audited primitive. The buffered wrapper has no current callers.

| Owner | Line | Control | Family | Drawn padding |
|---|---:|---|---|---|
| `apps/mobile/app/(tabs)/calendar/_components/calendar-day-events.tsx` | 50 | `Input` | standard | 16 |
| `apps/mobile/app/(tabs)/calendar/_components/calendar-entry-details.tsx` | 29 | `Input` | standard | 16 |
| `apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx` | 107 | `AppTextInput` | standard | 16 |
| `apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx` | 300 | `AppTextInput` | standard | 16 |
| `apps/mobile/app/search.tsx` | 59 | `Input` | standard | 16 |
| `apps/mobile/app/support.tsx` | 181 | `Input` | standard | 16 |
| `apps/mobile/components/auth/email-step.tsx` | 38 | `Input` | standard | 16 |
| `apps/mobile/components/chat/breakdown-suggestion.tsx` | 26 | `TextInput` | inline add | 12 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 37 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 47 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 110 | `Input` | standard | 16 |
| `apps/mobile/components/chat/pending-operation-card.tsx` | 123 | `Input` | standard | 16 |
| `apps/mobile/components/chat/record-list-card.tsx` | 107 | `TextInput` | inline add | 12 |
| `apps/mobile/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 40 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 62 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/goals/edit-goal-modal.tsx` | 192 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habit-list/move-parent-dialog.tsx` | 158 | `Input` | standard | 16 |
| `apps/mobile/components/habits/checklist-templates.tsx` | 131 | `BottomSheetAppTextInput` | inline add | 12 |
| `apps/mobile/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 37 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 58 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/create-goal-from-habit-sheet.tsx` | 199 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/create-habit-modal/sub-habit-editor.tsx` | 58 | `BottomSheetAppTextInput` | subhabit | 0; 8 after index |
| `apps/mobile/components/habits/goal-linking-field.tsx` | 70 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/habit-checklist.tsx` | 119 | `BottomSheetAppTextInput` | checklist edit | 8 with grip |
| `apps/mobile/components/habits/habit-checklist.tsx` | 225 | `BottomSheetAppTextInput` | inline add | 12 |
| `apps/mobile/components/habits/habit-detail-fields.tsx` | 78 | `TextInput` | inline add | 12 |
| `apps/mobile/components/habits/habit-detail-fields.tsx` | 144 | `Input` | standard | 16 |
| `apps/mobile/components/habits/habit-detail-screen.tsx` | 187 | `TextInput` | heading | 0; title alignment |
| `apps/mobile/components/habits/habit-form-fields/buffered-sheet-input.tsx` | 68 | `BottomSheetAppTextInput` | forwarder | 16 default; caller style forwarded |
| `apps/mobile/components/habits/habit-form-fields/habit-emoji-selector.tsx` | 108 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/habit-form-fields/habit-understanding.tsx` | 68 | `TextInput` | sentence | 16 |
| `apps/mobile/components/habits/habit-form-fields/reminder-section.tsx` | 198 | `BottomSheetAppTextInput` | inline add | 12 |
| `apps/mobile/components/habits/habit-form-fields/tag-editor-row.tsx` | 37 | `BottomSheetAppTextInput` | inline add | 12 |
| `apps/mobile/components/habits/habit-form-fields/tag-picker-field.tsx` | 60 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/habits/habit-form-fields.tsx` | 482 | `Input` | standard | 16 |
| `apps/mobile/components/onboarding/onboarding-welcome.tsx` | 21 | `Input` | standard | 16 |
| `apps/mobile/components/profile/preferences-sections.tsx` | 100 | `BottomSheetAppTextInput` | standard | 16 |
| `apps/mobile/components/profile/profile-api-keys.tsx` | 133 | `Input` | standard | 16 |
| `apps/mobile/components/shell/composer.tsx` | 257 | `TextInput` | composer | 8 |
| `apps/mobile/components/ui/app-text-input.tsx` | 72 | `TextInput` | standard | 16 |
| `apps/mobile/components/ui/bottom-sheet-app-text-input.tsx` | 98 | `TextInput` | standard | 16 |
| `apps/mobile/components/ui/input.tsx` | 32 | `TextInput` | standard | 16 |
| `apps/mobile/components/ui/otp-input.tsx` | 43 | `TextInput` | otp | centred |
| `apps/mobile/components/ui/time-field.tsx` | 234 | `TextInput` | time | 16 |
| `apps/web/app/(app)/layout.tsx` | 376 | `input` | file | glyphless |
| `apps/web/app/(app)/layout.tsx` | 383 | `input` | file | glyphless |
| `apps/web/app/(app)/preferences/_components/preference-picker-sheet.tsx` | 85 | `input` | standard | 16 |
| `apps/web/app/(app)/profile/_components/edit-name-sheet.tsx` | 93 | `Input` | standard | 16 |
| `apps/web/app/(app)/profile/_components/fresh-start-modal.tsx` | 353 | `Input` | standard | 16 |
| `apps/web/app/(app)/support/_components/support-form.tsx` | 127 | `Input` | standard | 16 |
| `apps/web/app/(auth)/login/email-step.tsx` | 33 | `Input` | standard | 16 |
| `apps/web/components/calendar/calendar-day-events.tsx` | 48 | `Input` | standard | 16 |
| `apps/web/components/calendar/calendar-entry-details.tsx` | 26 | `Input` | standard | 16 |
| `apps/web/components/chat/breakdown-suggestion.tsx` | 30 | `input` | inline add | 12 |
| `apps/web/components/chat/pending-operation-card.tsx` | 38 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 48 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 98 | `Input` | standard | 16 |
| `apps/web/components/chat/pending-operation-card.tsx` | 111 | `Input` | standard | 16 |
| `apps/web/components/chat/record-list-card.tsx` | 90 | `input` | inline add | 12 |
| `apps/web/components/command/command-menu-chrome.tsx` | 83 | `CommandInput` | search | 16 |
| `apps/web/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 32 | `FieldWell` | standard | 16 |
| `apps/web/components/goals/edit-goal-modal/edit-goal-target-fields.tsx` | 44 | `FieldWell` | standard | 16 |
| `apps/web/components/goals/edit-goal-modal.tsx` | 186 | `FieldWell` | standard | 16 |
| `apps/web/components/goals/field-well.tsx` | 46 | `input` | standard | 16 |
| `apps/web/components/habits/checklist-templates.tsx` | 100 | `input` | inline add | 12 |
| `apps/web/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 27 | `FieldWell` | standard | 16 |
| `apps/web/components/habits/create-goal-from-habit/goal-target-fields.tsx` | 38 | `FieldWell` | standard | 16 |
| `apps/web/components/habits/create-goal-from-habit-sheet.tsx` | 239 | `FieldWell` | standard | 16 |
| `apps/web/components/habits/create-habit-modal/sub-habit-editor.tsx` | 42 | `input` | subhabit | 0; 8 after index |
| `apps/web/components/habits/goal-linking-field.tsx` | 64 | `input` | standard | 16 |
| `apps/web/components/habits/habit-checklist.tsx` | 331 | `input` | checklist edit | 8 with grip |
| `apps/web/components/habits/habit-checklist.tsx` | 431 | `input` | inline add | 12 |
| `apps/web/components/habits/habit-detail-fields.tsx` | 71 | `input` | inline add | 12 |
| `apps/web/components/habits/habit-detail-fields.tsx` | 140 | `Input` | standard | 16 |
| `apps/web/components/habits/habit-detail-screen.tsx` | 187 | `input` | heading | 0; title alignment |
| `apps/web/components/habits/habit-form-fields/habit-emoji-selector.tsx` | 87 | `input` | standard | 16 |
| `apps/web/components/habits/habit-form-fields/habit-understanding.tsx` | 60 | `textarea` | sentence | 16 |
| `apps/web/components/habits/habit-form-fields/reminder-section.tsx` | 173 | `input` | inline add | 12 |
| `apps/web/components/habits/habit-form-fields/tag-editor-row.tsx` | 29 | `input` | inline add | 12 |
| `apps/web/components/habits/habit-form-fields/tag-picker-field.tsx` | 78 | `input` | standard | 16 |
| `apps/web/components/habits/habit-form-fields.tsx` | 533 | `Input` | standard | 16 |
| `apps/web/components/habits/habit-list/move-parent-overlay.tsx` | 145 | `Input` | standard | 16 |
| `apps/web/components/onboarding/onboarding-welcome.tsx` | 24 | `Input` | standard | 16 |
| `apps/web/components/profile/profile-api-keys.tsx` | 129 | `Input` | standard | 16 |
| `apps/web/components/shell/composer.tsx` | 246 | `textarea` | composer | 8 |
| `apps/web/components/ui/input.tsx` | 47 | `textarea` | standard | 16 |
| `apps/web/components/ui/input.tsx` | 48 | `input` | standard | 16 |
| `apps/web/components/ui/otp-input.tsx` | 38 | `input` | otp | centred |
| `apps/web/components/ui/time-field.tsx` | 141 | `input` | time | 16 |

## Verification boundary

Native composer styles and mounted Yoga geometry cover both directions and compact widths. Web Vitest Chromium measures placeholder and typed glyphs, padding focus and ten-word wrapping. The layout guard measures all visible fields on its swept pages against this inventory; a temporary styled mirror exposes the input text to a first-character Range because native input text is not a selectable DOM text node. Actual device glyph rasterization, screen-reader interaction and layout workflow execution remain outside worker verification.
