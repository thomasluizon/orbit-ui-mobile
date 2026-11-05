> **At a glance** - input surfaces outside the habit and goal flows, their web and Android owners, their status under the form rule and the remaining surfaces.

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
| API key creation | `components/profile/profile-api-keys.tsx` | `components/profile/profile-api-keys.tsx` | The name asks where the key goes. Set expiry? is a field-placement disclosure that reveals the UTC expiry question. A retained expiry draft opens it. An invalid hidden expiry opens it with its correction. A hidden expiry keeps its draft and still reaches the request, as the timing sheet does. The scope field asks what the key can access |
| Support | `app/(app)/support/_components/support-form.tsx` | `app/support.tsx` | The subject question comes first. The message question appears after an answer, for a restored message, or with its own error. Validation order, focus and draft storage do not change |
| Fresh start confirmation | `app/(app)/profile/_components/fresh-start-modal.tsx` | `app/(tabs)/profile/_components/fresh-start-modal.tsx` | One question tells the person to type ORBIT. The separate instruction that said the same is gone |

## Retained without change

| Surface | Web owner | Android owner | Reason |
|---|---|---|---|
| Perfil switches: undated tasks, Astra features, read-only key, device notifications, product email | `profile-preferences-content.tsx`, `profile-astra-content.tsx`, `profile-api-keys.tsx`, `push-devices-row.tsx`, `marketing-consent-section.tsx` | the matching Android owners | **Voice** labels a settings toggle for its ON state. A switch row is a setting, not a question |
| Calendar automatic sync and day detail habits switch | `components/calendar/calendar-sync-boundary.tsx`, `calendar-day-detail.tsx` | `app/(tabs)/calendar/_components/` mirrors | Settings toggles under the same rule |
| Calendar event and entry search | `components/calendar/calendar-day-events.tsx`, `calendar-entry-details.tsx` | `app/(tabs)/calendar/_components/` mirrors | **Forms** sanctions search fields. They appear only above 20 events or 8 entries |
| Calendar import selection | `components/calendar-sync/*` | `components/calendar-sync/*` | A selection list with select all, not a form question |
| Delete account | `app/(app)/profile/_components/delete-account-modal.tsx` | `app/(tabs)/profile/_components/delete-account-modal.tsx` | It has no field of its own; its step-up code is converted above |

## Remaining

These surfaces still use system labels or show their fields at one level. Each needs its own round.

| Surface | Web owner | Android owner |
|---|---|---|
| Astra structured preview fields and question controls | `components/chat/structured-preview-field.tsx`, `question-controls.tsx`, `answer-block.tsx`, `preview-item-title.tsx`, `packages/shared/src/chat/pending-operation-card.ts` labels | `components/chat/` mirrors |
| Astra cards with inputs | `components/chat/record-list-card.tsx`, `breakdown-suggestion.tsx`, `habit-suggestions-card.tsx`, `prompt-library.tsx` | `components/chat/` mirrors |
| Onboarding | `components/onboarding/onboarding-welcome.tsx`, `onboarding-create-habit.tsx` | `components/onboarding/` mirrors |
| Share card | `components/share/share-card-sheet.tsx` | `components/share/share-card-sheet.tsx` |
| Hoje search and the search screen | `app/(app)/today-page-view.tsx` | `app/(tabs)/index.tsx`, `app/search.tsx` |
| Move parent | `components/habits/habit-list/move-parent-overlay.tsx` | `components/habit-list/move-parent-dialog.tsx` |

## Verification

- `packages/shared/src/__tests__/input-question-copy.test.ts` proves each converted label is a question in both locales and that the replaced system labels are gone.
- `packages/shared/src/__tests__/profile-preferences.test.ts` proves the picker question keys and the single week-start note.
- Web `__tests__/components/profile/input-question-geometry.test.tsx` measures the expiry question target and hover fill on the field column edge, and the 24px step to the revealed support message, at 320 and 1280px, 100% and 200% text, both locales and both themes, in Vitest Chromium.
- Android `__tests__/components/profile/input-question-geometry.test.tsx` measures the expiry question target and fill on the field edge and an unclamped title at the same matrix.
- Level behaviour: web `profile-api-keys-account-scope.test.tsx` and `pages/support.test.tsx`; Android `profile-api-keys-count.test.tsx` and `screens/support-screen.test.tsx`; both `fresh-start-modal.test.tsx` files.
