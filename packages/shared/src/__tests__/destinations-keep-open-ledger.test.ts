import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repositoryRoot } from '../test-support/repository-root'

/**
 * Each row is a field or an action of Hoje, habit detail or the conversation, with one test per platform.
 * A fragment is a literal test title, or an assertion line, that reaches the control.
 * Android saves a new habit offline (row 20) and has no sidebar (row 36), so those rows keep the nearest Android test.
 */
const ledger: readonly {
  row: string
  web: { file: string; fragment: string }
  android: { file: string; fragment: string }
}[] = [
  {
    row: '1 Log and unlog from the row check and from the detail',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'unlogs only the viewed historical occurrence' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'unlogs only the viewed historical occurrence' },
  },
  {
    row: '2 Skip from the row menu and from the tray',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'skips immediately from the recurring row menu' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'skips a recurring habit immediately' },
  },
  {
    row: '3 Check and uncheck a checklist item, and reset the checklist',
    web: { file: 'apps/web/__tests__/components/habits/habit-checklist.test.tsx', fragment: 'calls onToggle when checkbox is clicked' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-checklist.test.tsx', fragment: 'checks the actual item body exactly once without reordering' },
  },
  {
    row: '4 Log the habit after the last checklist item, with one question in a sheet',
    web: { file: 'apps/web/__tests__/components/habits/habit-question-prompts.test.tsx', fragment: 'asks the checklist question after the last item' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-question-prompts.test.tsx', fragment: 'asks the checklist question after the last item' },
  },
  {
    row: '5 Log or skip the parent after the last child, with the ancestor choices',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'offers one %s chain with only the nearest ancestor selected' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'offers one %s chain with only the nearest ancestor selected' },
  },
  {
    row: '6 Row menu with each of its nine actions',
    web: { file: 'apps/web/__tests__/components/habits/habit-row.test.tsx', fragment: 'matches the drawn menu for an overdue parent on a free plan' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-row.test.tsx', fragment: 'matches the drawn menu for an overdue parent on a free plan' },
  },
  {
    row: '7 Next reminder on the row',
    web: { file: 'apps/web/__tests__/components/habits/habit-row-metadata.test.tsx', fragment: 'shows only the supplied next reminder instant in %s' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-row-metadata.test.tsx', fragment: 'shows only the supplied next reminder instant in %s' },
  },
  {
    row: '8 Expand and collapse a parent, expand all and collapse all',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'links disclosure panels through keyboard expansion without changing selection' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'expands and collapses child rows without changing selection' },
  },
  {
    row: '9 Drag to reorder, and its keyboard path',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'retains grandchild depth through keyboard reorder and completion in %s' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'submits reordered positions on drag end' },
  },
  {
    row: '10 Bulk select with its tray actions, the move limit and the read-only notice',
    web: { file: 'apps/web/__tests__/components/habits/selection-tray.test.tsx', fragment: 'fires the bulk handlers when actions are clicked with a selection' },
    android: { file: 'apps/mobile/__tests__/components/habits/selection-tray.test.tsx', fragment: 'fires the action handlers when pressed with a selection' },
  },
  {
    row: '11 Bulk delete confirm',
    web: { file: 'apps/web/__tests__/app/today-overlays.test.tsx', fragment: "getByRole('button', { name: 'habits.bulkDeleteConfirm' })" },
    android: { file: 'apps/mobile/__tests__/screens/today-bulk-actions.test.tsx', fragment: 'keeps the delete confirmation and selection after an offline refusal, then retries online' },
  },
  {
    row: '12 Move under a parent: search, pick a destination, current parent, confirm, retry',
    web: { file: 'apps/web/__tests__/components/habits/move-parent-overlay.test.tsx', fragment: 'clears a picker search after successful confirmation before reopening' },
    android: { file: 'apps/mobile/__tests__/components/habit-list/move-parent-dialog.test.tsx', fragment: 'clears a picker search after successful confirmation before reopening' },
  },
  {
    row: '13 List options: search, refresh, hide or show completed, select',
    web: { file: 'apps/web/__tests__/app/today-page.test.tsx', fragment: 'renders the Portuguese list options labels and glyphs in both list states' },
    android: { file: 'apps/mobile/__tests__/components/today/today-date-control.test.tsx', fragment: 'renders the Portuguese list options labels and glyphs in both list states' },
  },
  {
    row: '14 View switch: Today, All, General',
    web: { file: 'apps/web/__tests__/components/today/habit-view-switch.test.tsx', fragment: 'checks General after two consecutive ArrowRight presses from Today' },
    android: { file: 'apps/mobile/__tests__/components/today/habit-view-switch.test.tsx', fragment: 'keeps every view natively focusable and checks each destination once' },
  },
  {
    row: '15 Date pager, day strip, go to today',
    web: { file: 'apps/web/__tests__/components/today/today-date-return.test.tsx', fragment: 'returns through the date label by click, Enter and Space in %s' },
    android: { file: 'apps/mobile/__tests__/components/today/today-date-control.test.tsx', fragment: 'returns through the centred label only when away from today, today=%s' },
  },
  {
    row: '16 The Orbit line: proactive item, returning line, offline line, open the conversation',
    web: { file: 'apps/web/__tests__/components/today/today-orbit-line.test.tsx', fragment: 'shows Descansando and a first person reason while offline, and the press still opens the conversation' },
    android: { file: 'apps/mobile/__tests__/components/today/today-orbit-line.test.tsx', fragment: 'shows Descansando and a first person reason offline, and the press opens the conversation' },
  },
  {
    row: '17 AI summary: free prompt, upgrade, loading, error, retry',
    web: { file: 'apps/web/__tests__/components/today/today-ai-summary.test.tsx', fragment: 'retries an error and prevents repeated retries during a pending request' },
    android: { file: 'apps/mobile/__tests__/components/today/today-ai-summary.test.tsx', fragment: 'retries errors and disables repeat requests while fetching' },
  },
  {
    row: '18 Setup checklist card: progress, complete, dismiss, dismiss error',
    web: { file: 'apps/web/__tests__/components/today/setup-checklist-card.test.tsx', fragment: 'shows a persistence error and allows retry after a failed dismissal' },
    android: { file: 'apps/mobile/__tests__/components/today/setup-checklist-card.test.tsx', fragment: 'shows a persistence error and allows retry after a failed dismissal' },
  },
  {
    row: '19 Empty states: no habits, nothing open, all done, load error with retry',
    web: { file: 'apps/web/__tests__/app/today-page.test.tsx', fragment: 'keeps the all-done upcoming action active below the instance horizon' },
    android: { file: 'apps/mobile/__tests__/screens/today-screen.test.tsx', fragment: 'keeps the all-done upcoming action active below the instance horizon' },
  },
  {
    row: '20 Offline create refusal',
    web: { file: 'apps/web/__tests__/app/today-page.test.tsx', fragment: 'explains an offline empty-list create request beside the action' },
    android: { file: 'apps/mobile/__tests__/components/habits/guided-habit-modals.test.tsx', fragment: 'queues a create made offline once and opens the result dialog from the optimistic record' },
  },
  {
    row: '21 Sub-habit drill: back, progress, show completed, add sub-habit, retry',
    web: { file: 'apps/web/__tests__/components/habits/habit-drill.test.tsx', fragment: 'and preserves the back action' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-drill.test.tsx', fragment: 'and preserves the back action' },
  },
  {
    row: '22 Celebration panel and daily streak moment: close, badge tooltip',
    web: { file: 'apps/web/__tests__/components/gamification/celebration-panel.test.tsx', fragment: 'keeps the daily moment while its close button has focus' },
    android: { file: 'apps/mobile/__tests__/components/gamification/celebration-panel.test.tsx', fragment: 'keeps the daily moment while its close button has focus' },
  },
  {
    row: '23 Detail: log and unlog on a date, the unavailable-date notice, the read-only notices',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'reconciles an explicit-date log and unlog across the mounted detail' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'reconciles an explicit-date log and unlog across the mounted detail' },
  },
  {
    row: '24 Detail: month history, the last thirty days, longest streak, monthly rate',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'moves to an older history month without' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'moves to an older history month without' },
  },
  {
    row: '25 Detail: description view and copy',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'copies the full description from habit details' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'copies the full description from habit details' },
  },
  {
    row: '26 Detail: schedule and end date reads',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-fields.test.tsx', fragment: 'keeps schedule and end date read-only and opens linked goal details' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-fields.test.tsx', fragment: 'retains schedule, end date and linked goal navigation without draft controls' },
  },
  {
    row: '27 Detail: reminders, next reminder, taken at with its correction',
    web: { file: 'apps/web/__tests__/components/habits/repeat-reminder-detail.test.tsx', fragment: 'shows server next time and corrects a dose using the reminder instant across midnight' },
    android: { file: 'apps/mobile/__tests__/components/habits/repeat-reminder-detail.test.tsx', fragment: 'shows supplied next time and corrects a dose with the reminder instant across midnight' },
  },
  {
    row: '28 Detail: review this habit with the AI from the Orbit line row',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-orbit-line.test.tsx', fragment: 'states how many of the last 7 days the habit was done, with Orbit at 48, and opens the review conversation' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-orbit-line.test.tsx', fragment: 'states how many of the last 7 days the habit was done, with Orbit at 48, and opens the review conversation' },
  },
  {
    row: '29 Detail: the slipping line and the reschedule offer',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows a rescue only for an older overdue habit and handles request states' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows a rescue only for an older overdue habit and handles request states' },
  },
  {
    row: '30 Detail: children, add sub-habit',
    web: { file: 'apps/web/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided create flow from Add sub-habit on habit detail' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided create flow from Add sub-habit on habit detail' },
  },
  {
    row: '31 Detail: more details, started on',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows the API start date %s in the detail row with legacy timestamp compatibility' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows the API start date %s in the detail row with legacy timestamp compatibility' },
  },
  {
    row: '32 Detail: the edit pencil opens the guided flow',
    web: { file: 'apps/web/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided edit flow on its summary from the pencil of habit detail' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided edit flow on its summary from the pencil of habit detail' },
  },
  {
    row: '33 Detail: delete with confirm, then the result dialog',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'deletes the habit and returns to the selected day' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'deletes the habit and returns to the selected day' },
  },
  {
    row: '34 Detail: loading, load error with retry, log error, checklist error, delete error',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows loading feedback and a retry action after a load failure' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows loading feedback and a retry action after a load failure' },
  },
  {
    row: '35 Open the conversation from Hoje',
    web: { file: 'apps/web/__tests__/components/shell/astra-button.test.tsx', fragment: 'opens the conversation from the keyboard' },
    android: { file: 'apps/mobile/__tests__/components/shell/astra-button.test.tsx', fragment: 'opens the conversation on tap and carries its accessible name' },
  },
  {
    row: '36 Open the conversation from the sidebar row on wide web',
    web: { file: 'apps/web/__tests__/components/shell/astra-shell-navigation.test.tsx', fragment: 'owns one conversation entry row, named by its action, before the four destinations with collapsed=%s' },
    android: { file: 'apps/mobile/__tests__/components/shell/astra-button.test.tsx', fragment: 'opens the conversation on tap and carries its accessible name' },
  },
  {
    row: '37 Close the conversation',
    web: { file: 'apps/web/__tests__/components/chat/conversation-header.test.tsx', fragment: 'closes the conversation from one trailing control, with no back control' },
    android: { file: 'apps/mobile/__tests__/components/chat/conversation-header.test.tsx', fragment: 'closes the conversation from one trailing control, with no back control' },
  },
  {
    row: '38 Type, send, clear and paste in the composer',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'sends a nonblank value once' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'sends a nonblank value once' },
  },
  {
    row: '39 Voice record',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'replaces suggestions with recording status and a stop control' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'replaces suggestions with recording status and a stop control' },
  },
  {
    row: '40 Attach an image or a file, preview, remove, size and read errors',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'names, distinguishes, and removes each attachment independently' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'names, distinguishes, and removes each attachment independently' },
  },
  {
    row: '41 Queue up to 3 messages, send or remove a queued one, stop a reply',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'shows removable queued rows, manual sends and a separate stop control in both languages' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'shows removable queued rows, manual sends and a separate stop control in both languages' },
  },
  {
    row: '42 Retry a failed send',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'retries the restored draft from Enter without a new send, and sends an edited draft' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'retries the restored draft from a keyboard submit without a new send, and sends an edited draft' },
  },
  {
    row: '43 Expand and collapse the composer: ruling 9 keeps the outcome of #2108, so the composer has no collapse control',
    web: { file: 'apps/web/__tests__/components/shell/composer-suggestions-geometry.test.tsx', fragment: 'spans the full composer content width with no collapse control beside it' },
    android: { file: 'apps/mobile/__tests__/components/chat/conversation-composer.test.tsx', fragment: 'renders the suggestion strip with no collapse control beside it' },
  },
  {
    row: '44 Usage for the day or the week, the limit reason, the offline reason',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'renders only the limit reason above disabled controls without an accent send' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'fills the daily notice with neutral tabular usage or the exhausted reason' },
  },
  {
    row: '45 Ideas library: open, back, search, clear search, categories, select',
    web: { file: 'apps/web/__tests__/components/chat/prompt-library.test.tsx', fragment: 'focuses the heading, and returns on Escape with the draft and trigger focus' },
    android: { file: 'apps/mobile/__tests__/components/chat/prompt-library.test.tsx', fragment: 'opens from both entries, returns on Android back, and retains the draft' },
  },
  {
    row: '46 Empty thread: title, browse ideas, AI disclosure',
    web: { file: 'apps/web/__tests__/components/chat/chat-empty-state.test.tsx', fragment: 'renders the title and disclosure without an opener prompt or chip' },
    android: { file: 'apps/mobile/__tests__/components/chat/chat-empty-state.test.tsx', fragment: 'renders only the mark, title and disclosure with habits $habits' },
  },
  {
    row: '47 Pending reply dots and the work status with its tool steps',
    web: { file: 'apps/web/__tests__/components/chat/conversation-account-scope.test.tsx', fragment: 'collapses two tool steps on the finished message' },
    android: { file: 'apps/mobile/__tests__/screens/chat-screen.test.tsx', fragment: 'collapses two tool steps on the finished message' },
  },
  {
    row: '48 Question, choice, pick list, clarification: select, free text, submit',
    web: { file: 'apps/web/__tests__/components/chat/question-block.test.tsx', fragment: 'round trips every typed answer through the owning registry, then locks and shows the chosen values' },
    android: { file: 'apps/mobile/__tests__/components/chat/question-block.test.tsx', fragment: 'submits every typed value once, including false and zero, and locks with chosen answers' },
  },
  {
    row: '49 Plan block and answer block',
    web: { file: 'apps/web/__tests__/components/chat/plan-block.test.tsx', fragment: 'announces later running steps on a restored plan without replaying its saved activity' },
    android: { file: 'apps/mobile/__tests__/components/chat/plan-block-style.test.tsx', fragment: 'announces later running steps on a restored plan without replaying its saved activity' },
  },
  {
    row: '50 Change preview: approve, reject, edit a field, apply all, conflict warning, expired state',
    web: { file: 'apps/web/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'keeps %s on the whole grouped operation' },
    android: { file: 'apps/mobile/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'keeps %s on the whole grouped operation' },
  },
  {
    row: '51 Step-up for a sensitive change: code entry, confirm, cancel',
    web: { file: 'apps/web/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'hands step up to a sheet, verifies the code, and executes' },
    android: { file: 'apps/mobile/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'hands step up to a sheet, verifies the code, and executes' },
  },
  {
    row: '52 Operation outcomes with a status per item on a partial failure',
    web: { file: 'apps/web/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'shows each failed row of a restored compact batch' },
    android: { file: 'apps/mobile/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'shows each failed row of a restored compact batch' },
  },
  {
    row: '53 Breakdown suggestion and habit suggestions: edit, preview, accept',
    web: { file: 'apps/web/__tests__/components/chat/breakdown-suggestion.test.tsx', fragment: 'withholds the batch until the approval sheet is confirmed' },
    android: { file: 'apps/mobile/__tests__/components/chat/breakdown-suggestion.test.tsx', fragment: 'withholds the batch until the approval sheet is confirmed' },
  },
  {
    row: '54 Read cards and their copy control',
    web: { file: 'apps/web/__tests__/components/chat/account-rows-card.test.tsx', fragment: 'swaps the copy icon through CopyStateIcon with scale, opacity and blur on the shared fast duration' },
    android: { file: 'apps/mobile/__tests__/components/chat/account-rows-card.test.tsx', fragment: 'swaps the copy icon through CopyStateIcon with scale, opacity and blur on the shared fast duration' },
  },
  {
    row: '55 Action chips, follow-up chips, proactive action, offers, links',
    web: { file: 'apps/web/__tests__/components/chat/action-chips.test.tsx', fragment: 'opens a successful navigable result' },
    android: { file: 'apps/mobile/__tests__/components/chat/action-chips.test.tsx', fragment: 'opens a successful navigable result' },
  },
  {
    row: '56 Delete the conversation, with confirm',
    web: { file: 'apps/web/__tests__/components/chat/conversation-history.test.tsx', fragment: 'requires confirmation before clearing a thread on delete %s' },
    android: { file: 'apps/mobile/__tests__/components/chat/conversation-history.test.tsx', fragment: 'asks before deleting and clears the id on %s' },
  },
  {
    row: '57 Stale block notice and live block refresh',
    web: { file: 'apps/web/__tests__/components/chat/read-blocks.test.tsx', fragment: 'keeps a failed stale refresh actionable and replaces the snapshot on retry' },
    android: { file: 'apps/mobile/__tests__/components/chat/read-blocks.test.tsx', fragment: 'keeps a failed stale refresh actionable and replaces the snapshot on retry' },
  },
]

describe.each(ledger)('row $row', ({ web, android }) => {
  it.each([['web', web], ['Android', android]] as const)('keeps the %s test that reaches the control', (_platform, test) => {
    const path = join(repositoryRoot, test.file)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain(test.fragment)
  })
})
