> **At a glance** - input surfaces outside the habit and goal flows, their web and Android owners and their status under the form rule.

# Input question surfaces

`DESIGN.md` **Layout & spacing** sets the form rule: ask one question first, reveal its follow-up
from the answer, keep interaction paint inside the field column, and keep hidden follow-up drafts.
This inventory comes from the `Input`, `Textarea`, `Switch`, `RadioGroup`, `Select`,
`SegmentedControl`, `TimeField`, `DateField`, `TextInput` and `OtpInput` consumers on both
platforms. The habit and goal flows have their own inventory in `design/habit-form-surfaces.md`.

## Converted

| Surface | Web owner | Android owner | Result |
|---|---|---|---|
| Sign-in email | `app/(auth)/login/email-step.tsx` | `components/auth/email-step.tsx` | The field asks for the email. The code step stays the second level. `name="email"` and `autocomplete` do not change |
| Sign-in code | `app/(auth)/login/code-step.tsx` | `components/auth/code-step.tsx` | The code field asks which code arrived |
| Step-up code | `app/step-up/step-up-screen.tsx`, `components/chat/pending-operation-card.tsx` | `app/step-up.tsx`, `components/chat/pending-operation-card.tsx` | The same code question as sign-in |
| Edit name | `app/(app)/profile/_components/edit-name-sheet.tsx` | `app/(tabs)/profile/_components/edit-name-sheet.tsx` | The field asks how to call the person |
| Time zone, week start, clock and language | `app/(app)/preferences/_components/preference-picker-sheet.tsx` | `components/profile/preferences-sections.tsx` | `buildProfilePickerLabels` gives each sheet one question as its title and radio group name. Perfil rows keep their two-word labels. The language note that repeated its title is gone; the week-start note now states only its effect |
| API key creation | `components/profile/profile-api-keys.tsx` | `components/profile/profile-api-keys.tsx` | The name asks where the key goes. Set expiry? is a field-placement disclosure that controls the region holding the UTC expiry question; the two sit 8 apart, and the groups sit 16 apart. A retained expiry draft opens it. An invalid hidden expiry opens it with its correction. A hidden expiry keeps its draft and still reaches the request, as the timing sheet does. The scope field asks what the key can access |
| Support | `app/(app)/support/_components/support-form.tsx` | `app/support.tsx` | The subject question comes first. The message question appears after an answer, for a restored message, or after a send attempt. It then stays until the form resets, so a focused field never unmounts. Validation order, focus and draft storage do not change |
| Fresh start confirmation | `app/(app)/profile/_components/fresh-start-modal.tsx` | `app/(tabs)/profile/_components/fresh-start-modal.tsx` | The field asks one question. The ORBIT instruction is its hint. On Android the field carries the question and the hint once, and the visible lines are hidden from the screen reader |
| Astra choice and question free text | `components/chat/answer-block.tsx`, `question-controls.tsx` | `components/chat/` mirrors | `chat.choice.freeText` asks whether the person wants to answer in their own words. The block contracts do not change |
| Astra record list filter | `components/chat/record-list-card.tsx` | `components/chat/record-list-card.tsx` | The filter asks what the person is looking for. On web the label sits 8 above the field. Android keeps the filter icon action from the icon-action inventory. The icon is named by its action, Filter list, and only the field asks the question |
| Astra prompt library search and suggestion tweak | `components/chat/prompt-library.tsx`, `habit-suggestions-card.tsx` | `components/chat/` mirrors | Each hidden label is a question. The placeholders do not change |
| Onboarding | `components/onboarding/onboarding-welcome.tsx`, `onboarding-create-habit.tsx` | `components/onboarding/` mirrors | The field asks how the person would tell Astra. The schedule heading asks when. How often? comes first; the period or days question is the next level, 24 below, with its stepper 12 below it; the time question is the last level. Each visible question sits 8 above its control and is hidden from the screen reader, which reads the control name |
| Share card | `components/share/share-card-sheet.tsx` | `components/share/share-card-sheet.tsx` | The period control has a visible question 8 above it |
| Hoje search and the search screen | `app/(app)/today-page-view.tsx`, `app/(app)/search/page.tsx` through `components/command/command-menu-chrome.tsx` | `app/(tabs)/index.tsx`, `app/search.tsx` | Each field is named by the question what the person is looking for. The placeholder stays visible. The Android search screen hides its repeated label, as web does, because the page header names the screen |
| Move parent | `components/habits/habit-list/move-parent-overlay.tsx` | `components/habit-list/move-parent-dialog.tsx` | The search asks which habit. The destination list asks where the habit goes, in place of the Destinations eyebrow. The groups sit 16 apart on both platforms, and the question sits 8 above the list |

## Retained without change

| Surface | Web owner | Android owner | Reason |
|---|---|---|---|
| Perfil switches: undated tasks, Astra features, read-only key, device notifications, product email | `profile-preferences-content.tsx`, `profile-astra-content.tsx`, `profile-api-keys.tsx`, `push-devices-row.tsx`, `marketing-consent-section.tsx` | the matching Android owners | **Voice** labels a settings toggle for its ON state. A switch row is a setting, not a question |
| Calendar automatic sync and day detail habits switch | `components/calendar/calendar-sync-boundary.tsx`, `calendar-day-detail.tsx` | `app/(tabs)/calendar/_components/` mirrors | Settings toggles under the same rule |
| Calendar event and entry search | `components/calendar/calendar-day-events.tsx`, `calendar-entry-details.tsx` | `app/(tabs)/calendar/_components/` mirrors | **Forms** sanctions search fields. They appear only above 20 events or 8 entries |
| Calendar import selection | `components/calendar-sync/*` | `components/calendar-sync/*` | A selection list with select all, not a form question |
| Delete account | `app/(app)/profile/_components/delete-account-modal.tsx` | `app/(tabs)/profile/_components/delete-account-modal.tsx` | It has no field of its own; its step-up code is converted above |
| Astra structured preview fields and the preview item rename | `components/chat/structured-preview-field.tsx`, `preview-item-title.tsx` | `components/chat/` mirrors | `chat.operation.field.*` names the preview's label and value rows. These labels stay nouns, so the preview never reads a form question as a label |
| Astra breakdown row rename | `components/chat/breakdown-suggestion.tsx` | `components/chat/breakdown-suggestion.tsx` | An inline rename of the visible row, named for the row it edits |

## Verification

- `packages/shared/src/__tests__/input-question-copy.test.ts` proves each converted label is a question in both locales, that the replaced system labels are gone, that no two fields on one screen ask the same question, and that the Set expiry? row stays within two words under the `local/max-button-words` counter.
- `packages/shared/src/__tests__/pending-operation-card-view.test.ts` proves no Astra preview field label ends with a question mark and that the support, API key, step-up and timing preview labels keep their noun text.
- `packages/shared/src/__tests__/profile-preferences.test.ts` proves the picker question keys and the single week-start note.
- Web `__tests__/components/profile/input-question-geometry.test.tsx` measures the expiry question target and hover fill on the field column edge, the 8 and 16 expiry gaps, and the 24px step to the revealed support message. Web `__tests__/components/input-question-surfaces-geometry.test.tsx` measures the onboarding levels and the move parent groups. Both run at 320 and 1280px, 100% and 200% text, both locales and both themes, in Vitest Chromium. `share-card-sheet-geometry.test.tsx` measures the period question gap.
- Android `__tests__/components/profile/input-question-geometry.test.tsx` and `__tests__/components/input-question-surfaces-geometry.test.tsx` measure the same surfaces at the same matrix, and check that the title height applies the text scale once.
- Level and naming behaviour: web `profile-api-keys-account-scope.test.tsx`, `pages/support.test.tsx`, `onboarding-create-habit.test.tsx` and `share-card-sheet.test.tsx`; Android `profile-api-keys-count.test.tsx`, `screens/support-screen.test.tsx`, `onboarding-create-habit.test.tsx` and `share-card-sheet.test.tsx`; both `fresh-start-modal.test.tsx` files.
