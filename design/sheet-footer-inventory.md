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

## Focus clearance

The shared sheet owns visibility of a restored body control. Web focus restoration suppresses
native scrolling, so the body reveals the full focused control on focus and after control or
viewport resizing. It moves only its own scroll position and leaves visible controls in place.
Focus inside a nested portal or the pinned actions does not scroll the underlying body.
Switching to a virtualized body disconnects the ordinary body's focus observer.

Android restores native focus through TrueSheet. React Native's ScrollView reveals that focused
child within its viewport, so the viewport ends above the measured footer. The footer reserve
sits outside the ordinary scroller, keeping both short-content sizing and native focus clearance.
The bounded TimeField body uses the same reduced viewport. Virtualized bodies retain their
existing allocation, with the footer reserve outside the child list's viewport.

The consumer audit includes every Sheet mount under both apps' app and components trees:
ordinary bodies with and without actions, nested confirmations and pickers, explicit initial and
final focus targets, the bounded time picker, and virtualized date, year, tag and goal pickers.
No caller supplies its own footer clearance. These owners also cover loading, validation, saving,
notices and action removal through the measured primitive slots.

Web unit cases exercise real nested-sheet focus restoration against supplied geometry, control
growth, viewport shrinkage, visible controls, footer focus and virtualized ownership. Native cases
cover footer measurements, safe-area insets, short windows, large text, keyboard offsets and
virtualized allocation. Rendered web geometry remains with the existing expanded-radio-text
Chromium cases; native font rendering and assistive technology require device verification.
