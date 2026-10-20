# Sheet footer surfaces

Every paired footer uses small, intrinsic-width actions aligned to the trailing edge,
with the existing ghost dismissal before the filled action.

| Surface | Web owner | Android owner | States |
|---|---|---|---|
| Confirmation and discard changes | `components/ui/confirm-sheet.tsx` | `components/ui/confirm-sheet.tsx` | Default, inline, destructive, loading, closing |
| Rename | `app/(app)/profile/_components/edit-name-sheet.tsx` | `app/(tabs)/profile/_components/edit-name-sheet.tsx` | Editing, validation error, saving |
| Fresh start | `app/(app)/profile/_components/fresh-start-modal.tsx` | `app/(tabs)/profile/_components/fresh-start-modal.tsx` | Information, confirmation, loading, error |
| Delete account | `app/(app)/profile/_components/delete-account-modal.tsx` | `app/(tabs)/profile/_components/delete-account-modal.tsx` | Online, sending, error; offline has no actions |
| Scoped API key | `components/profile/profile-api-keys.tsx` | `components/profile/profile-api-keys.tsx` | Editing, submitting |
| API key revoke | `components/ui/confirm-sheet.tsx` | `components/ui/confirm-sheet.tsx` | Destructive confirmation |
| API key revealed | `components/profile/profile-api-keys.tsx` | `components/profile/profile-api-keys.tsx` | Single acknowledgement |
| Create habit | `components/habits/create-habit-modal.tsx` | `components/habits/create-habit-modal.tsx` | Habit, sub-habit, submitting |
| Edit habit | `components/habits/edit-habit-modal.tsx` | `components/habits/edit-habit-modal.tsx` | Editing, submitting |
| Create goal from habit | `components/habits/create-goal-from-habit-sheet.tsx` | `components/habits/create-goal-from-habit-sheet.tsx` | Editing, submitting |
| Edit goal | `components/goals/edit-goal-modal.tsx` | `components/goals/edit-goal-modal.tsx` | Editing, submitting |
| Move parent | `components/habits/habit-list/move-parent-overlay.tsx` | `components/habit-list/move-parent-dialog.tsx` | Selecting, submitting |
| Milestone share | `components/milestone-share/milestone-share-prompt.tsx` | `components/milestone-share/milestone-share-prompt.tsx` | Download, native share, sharing, error |
| Marketing consent | `components/marketing-consent/marketing-consent-prompt.tsx` | `components/marketing-consent/marketing-consent-prompt.tsx` | Decline, accept |
| Referral prompt | `components/referral/referral-prompt.tsx` | `components/referral/referral-prompt.tsx` | Later, invite |
| Referral drawer | `components/referral/referral-drawer.tsx` | `components/referral/referral-drawer.tsx` | Cancel, share, error; loading and unavailable have no actions |
| Astra import prompt | `app/(app)/layout.tsx` | `components/onboarding/astra-import-prompt.tsx` | Not now, import |
| Calendar import prompt | `app/(app)/layout.tsx` | `components/onboarding/calendar-import-prompt.tsx` | Later, import |
| Store review prompt | No web store adapter | `components/review-moment/review-moment-sheet.tsx` | Not now, rate |
| Trial expired | `components/ui/trial-expired-modal.tsx` | `components/ui/trial-expired-modal.tsx` | Continue free, subscribe |
| Time picker | `components/ui/time-field.tsx` | `components/ui/time-field.tsx` | Single acknowledgement |
| Calendar import selection | `app/(app)/calendar/page.tsx` | `app/(tabs)/calendar.tsx` | Single import action |
| Reschedule | `components/habits/reschedule-sheet.tsx` | `components/habits/reschedule-sheet.tsx` | Already small and trailing: free, error, accept |
| Version update | Native update adapter | `components/version-update-drawer.tsx` | Already small and trailing: later, update |
| Notification detail | `components/navigation/notification-detail-modal.tsx` | `components/navigation/notification-detail-modal.tsx` | Read, view, delete; intrinsic trailing group |
| Operation editor | `components/chat/pending-operation-card.tsx` | `components/chat/pending-operation-card.tsx` | Already small and trailing: cancel, save |
| Operation step-up confirmation | `components/chat/pending-operation-card.tsx` | `components/chat/pending-operation-card.tsx` | Already small and trailing: cancel, continue |

Single acknowledgement and import footers keep their existing action count and use the
same small, intrinsic-width geometry. Prompt wording and the referral drawer's body
composition remain owned by their separate work orders.
