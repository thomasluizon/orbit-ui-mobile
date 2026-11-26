import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { repositoryRoot } from '../test-support/repository-root'

interface LedgerSide { file: string; fragment: string; control: string }

const ledger: readonly { row: string; web: LedgerSide; android: LedgerSide }[] = [
  {
    row: '1 Log and unlog from the row check and from the detail',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'unlogs only the viewed historical occurrence', control: "screen.getByTestId('unlog-h-1')" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'unlogs only the viewed historical occurrence', control: 'habitCard?.props.actions.onUnlog()' },
  },
  {
    row: '2 Skip from the row menu and from the tray',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'skips immediately from the recurring row menu', control: "name: 'habits.actions.skip'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'skips a recurring habit immediately', control: 'skipItem.props.onPress()' },
  },
  {
    row: '3 Check and uncheck a checklist item, and reset the checklist',
    web: { file: 'apps/web/__tests__/components/habits/habit-checklist.test.tsx', fragment: 'calls onToggle when checkbox is clicked', control: "getAllByRole('checkbox')" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-checklist.test.tsx', fragment: 'checks the actual item body exactly once without reordering', control: "node.props.accessibilityLabel === 'First item'" },
  },
  {
    row: '4 Log the habit after the last checklist item, with one question in a sheet',
    web: { file: 'apps/web/__tests__/components/habits/habit-question-prompts.test.tsx', fragment: 'asks the checklist question after the last item', control: "getByRole('dialog', { name: 'habits.checklistCompleteQuestion' })" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-question-prompts.test.tsx', fragment: 'asks the checklist question after the last item', control: 'press(answers(tree)[1]!)' },
  },
  {
    row: '5 Log or skip the parent after the last child, with the ancestor choices',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'offers one %s chain with only the nearest ancestor selected', control: 'getByTestId(`${mode}-child`)' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'keeps higher ancestors unselected when a queued %s confirmation replays', control: "pressConfirm(tree, 'chat.pendingOp.action.applyChanges')" },
  },
  {
    row: '6 Row menu with each of its nine actions',
    web: { file: 'apps/web/__tests__/components/habits/habit-row.test.tsx', fragment: 'matches the drawn menu for an overdue parent on a free plan', control: "name: 'habits.actions.more'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-row.test.tsx', fragment: 'matches the drawn menu for an overdue parent on a free plan', control: 'findByType(Menu.Content)' },
  },
  {
    row: '7 Next reminder on the row',
    web: { file: 'apps/web/__tests__/components/habits/habit-row-metadata.test.tsx', fragment: 'shows only the supplied next reminder instant in %s', control: "'Next at 04:00'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-row-metadata.test.tsx', fragment: 'shows only the supplied next reminder instant in %s', control: "'Next at 04:00'" },
  },
  {
    row: '8 Expand and collapse a parent, expand all and collapse all',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'links disclosure panels through keyboard expansion without changing selection', control: "getByRole('button', { name: 'common.collapse' })" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'expands and collapses child rows without changing selection', control: 'disclosure().props.onPress()' },
  },
  {
    row: '9 Drag to reorder, and its keyboard path',
    web: { file: 'apps/web/__tests__/components/habits/habit-list.test.tsx', fragment: 'retains grandchild depth through keyboard reorder and completion in %s', control: "key: 'ArrowDown', altKey: true" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-list.test.tsx', fragment: 'submits reordered positions on drag end', control: 'draggableList.props.onDragEnd' },
  },
  {
    row: '10 Bulk select with its tray actions, the move limit and the read-only notice',
    web: { file: 'apps/web/__tests__/components/habits/selection-tray.test.tsx', fragment: 'fires the bulk handlers when actions are clicked with a selection', control: "name: 'habits.bulkBar.delete'" },
    android: { file: 'apps/mobile/__tests__/components/habits/selection-tray.test.tsx', fragment: 'fires the action handlers when pressed with a selection', control: "findButtonByLabel(tree, 'Delete selected')" },
  },
  {
    row: '11 Bulk delete confirm',
    web: { file: 'apps/web/__tests__/app/today-overlays.test.tsx', fragment: 'keeps Today visible during each first chunk load and preserves the overlay actions', control: "name: 'habits.bulkDeleteConfirm'" },
    android: { file: 'apps/mobile/__tests__/screens/today-bulk-actions.test.tsx', fragment: 'keeps the delete confirmation and selection after an offline refusal, then retries online', control: 'press(mocks.modalProps?.onConfirmBulkDelete)' },
  },
  {
    row: '12 Move under a parent: search, pick a destination, current parent, confirm, retry',
    web: { file: 'apps/web/__tests__/components/habits/move-parent-overlay.test.tsx', fragment: 'clears a picker search after successful confirmation before reopening', control: "getByPlaceholderText('habits.moveParent.searchPlaceholder')" },
    android: { file: 'apps/mobile/__tests__/components/habit-list/move-parent-dialog.test.tsx', fragment: 'clears a picker search after successful confirmation before reopening', control: "includes('habits.moveParent.confirm')" },
  },
  {
    row: '13 List options: search, refresh, hide or show completed, select',
    web: { file: 'apps/web/__tests__/app/today-page.test.tsx', fragment: 'renders the Portuguese list options labels and glyphs in both list states', control: 'name: labels.listOptions' },
    android: { file: 'apps/mobile/__tests__/components/today/today-date-control.test.tsx', fragment: 'renders the Portuguese list options labels and glyphs in both list states', control: 'button(renderer, labels.listOptions)' },
  },
  {
    row: '14 View switch: Today, All, General',
    web: { file: 'apps/web/__tests__/components/today/habit-view-switch.test.tsx', fragment: 'checks General after two consecutive ArrowRight presses from Today', control: "getByRole('radio', { name: label, checked: true })" },
    android: { file: 'apps/mobile/__tests__/components/today/habit-view-switch.test.tsx', fragment: 'keeps every view natively focusable and checks each destination once', control: "node.props.accessibilityRole === 'radio'" },
  },
  {
    row: '15 Date pager, day strip, go to today',
    web: { file: 'apps/web/__tests__/components/today/today-date-return.test.tsx', fragment: 'returns through the date label by click, Enter and Space in %s', control: 'messages.dates.goToToday' },
    android: { file: 'apps/mobile/__tests__/components/today/today-date-control.test.tsx', fragment: 'returns through the centred label only when away from today, today=%s', control: "findByProps({ testID: 'today-date-row' })" },
  },
  {
    row: '16 The Orbit line: proactive item, returning line, offline line, open the conversation',
    web: { file: 'apps/web/__tests__/components/today/today-orbit-line.test.tsx', fragment: 'shows Descansando and a first person reason while offline, and the press still opens the conversation', control: "name: 'todayOrbit.guided.offline'" },
    android: { file: 'apps/mobile/__tests__/components/today/today-orbit-line.test.tsx', fragment: 'shows Descansando and a first person reason offline, and the press opens the conversation', control: 'row(tree).props.onPress' },
  },
  {
    row: '17 AI summary: free prompt, upgrade, loading, error, retry',
    web: { file: 'apps/web/__tests__/components/today/today-ai-summary.test.tsx', fragment: 'retries an error and prevents repeated retries during a pending request', control: "name: 'summary.error'" },
    android: { file: 'apps/mobile/__tests__/components/today/today-ai-summary.test.tsx', fragment: 'retries errors and disables repeat requests while fetching', control: "press(tree, 'summary.error')" },
  },
  {
    row: '18 Setup checklist card: progress, complete, dismiss, dismiss error',
    web: { file: 'apps/web/__tests__/components/today/setup-checklist-card.test.tsx', fragment: 'shows a persistence error and allows retry after a failed dismissal', control: 'name: en.today.setupChecklist.dismiss' },
    android: { file: 'apps/mobile/__tests__/components/today/setup-checklist-card.test.tsx', fragment: 'shows a persistence error and allows retry after a failed dismissal', control: 'dismissButtons()[0]!.props.onPress' },
  },
  {
    row: '19 Empty states: no habits, nothing open, all done, load error with retry',
    web: { file: 'apps/web/__tests__/app/today-page.test.tsx', fragment: 'keeps the all-done upcoming action active below the instance horizon', control: "name: 'See upcoming'" },
    android: { file: 'apps/mobile/__tests__/screens/today-screen.test.tsx', fragment: 'keeps the all-done upcoming action active below the instance horizon', control: "'UpcomingAction'" },
  },
  {
    row: '20 Offline create refusal',
    web: { file: 'apps/web/__tests__/app/today-page.test.tsx', fragment: 'explains an offline empty-list create request beside the action', control: "name: 'Create manually'" },
    android: { file: 'apps/mobile/__tests__/components/habits/guided-habit-modals.test.tsx', fragment: 'queues a create made offline once and opens the result dialog from the optimistic record', control: 'expect(state.create).toHaveBeenCalledTimes(1)' },
  },
  {
    row: '21 Sub-habit drill: back, progress, show completed, add sub-habit, retry',
    web: { file: 'apps/web/__tests__/components/habits/habit-drill.test.tsx', fragment: 'and preserves the back action', control: "name: 'common.back'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-drill.test.tsx', fragment: 'and preserves the back action', control: 'pressTextControl(back)' },
  },
  {
    row: '22 Celebration panel and daily streak moment: close, badge tooltip',
    web: { file: 'apps/web/__tests__/components/gamification/celebration-panel.test.tsx', fragment: 'keeps the daily moment while its close button has focus', control: "name: 'celebration.close:{}'" },
    android: { file: 'apps/mobile/__tests__/components/gamification/celebration-panel.test.tsx', fragment: 'retains the actual %s queue item and native panel until exit finishes', control: "accessibilityLabel: 'celebration.close:{}'" },
  },
  {
    row: '23 Detail: log and unlog on a date, the unavailable-date notice, the read-only notices',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'reconciles an explicit-date log and unlog across the mounted detail', control: "getByRole('button', { name: 'unlog' })" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'reconciles an explicit-date log and unlog across the mounted detail', control: "testID: 'header-log'" },
  },
  {
    row: '24 Detail: month history, the last thirty days, longest streak, monthly rate',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'moves to an older history month without', control: "name: 'previousMonth'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'moves to an older history month without', control: "label === 'habits.detail.previousMonth'" },
  },
  {
    row: '25 Detail: description view and copy',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'copies the full description from habit details', control: "name: 'habits.detail.copyDescription'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'copies the full description from habit details', control: "accessibilityLabel === 'habits.detail.copyDescription'" },
  },
  {
    row: '26 Detail: schedule and end date reads',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-fields.test.tsx', fragment: 'keeps schedule and end date read-only and opens linked goal details', control: "name: 'Read books'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-fields.test.tsx', fragment: 'retains schedule, end date and linked goal navigation without draft controls', control: "row.props.title === 'Read books'" },
  },
  {
    row: '27 Detail: reminders, next reminder, taken at with its correction',
    web: { file: 'apps/web/__tests__/components/habits/repeat-reminder-detail.test.tsx', fragment: 'shows server next time and corrects a dose using the reminder instant across midnight', control: "name: 'Use reminder time'" },
    android: { file: 'apps/mobile/__tests__/components/habits/repeat-reminder-detail.test.tsx', fragment: 'shows supplied next time and corrects a dose with the reminder instant across midnight', control: "press(tree.root, 'Use reminder time')" },
  },
  {
    row: '28 Detail: review this habit with the AI from the Orbit line row',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-orbit-line.test.tsx', fragment: 'states how many of the last 7 days the habit was done, with Orbit at 48, and opens the review conversation', control: "name: 'habits.detail.orbit.lastSevenDays:5'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-orbit-line.test.tsx', fragment: 'states how many of the last 7 days the habit was done, with Orbit at 48, and opens the review conversation', control: 'row(tree)[0]!.props.onPress' },
  },
  {
    row: '29 Detail: the slipping line and the reschedule offer',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'keeps the proposal announcement mounted when loading finishes', control: "getByRole('group', { name: 'habits.form.proposedByOrbit' })" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'moves the Orbit of the suggest date button while a retry with a kept error runs', control: "pressPillButton(tree.root, 'habits.reschedule.suggestDate')" },
  },
  {
    row: '30 Detail: children, add sub-habit',
    web: { file: 'apps/web/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided create flow from Add sub-habit on habit detail', control: 'name: messages.habits.detail.addSubHabit' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided create flow from Add sub-habit on habit detail', control: 'tap(tree, messages.habits.detail.addSubHabit)' },
  },
  {
    row: '31 Detail: more details, started on',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows the API start date %s in the detail row with legacy timestamp compatibility', control: "getByText('habits.detail.startedOn')" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows the API start date %s in the detail row with legacy timestamp compatibility', control: 'node.type === DateRow' },
  },
  {
    row: '32 Detail: the edit pencil opens the guided flow',
    web: { file: 'apps/web/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided edit flow on its summary from the pencil of habit detail', control: 'name: messages.habits.editHabit' },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-edit-entries.test.tsx', fragment: 'opens the guided edit flow on its summary from the pencil of habit detail', control: 'tap(tree, messages.habits.editHabit)' },
  },
  {
    row: '33 Detail: delete with confirm, then the result dialog',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows the deleted result dialog when the delete has already removed the detail query', control: "name: 'habits.detail.delete'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'shows the deleted result dialog when the delete has already removed the detail query', control: "title: 'habits.detail.delete'" },
  },
  {
    row: '34 Detail: loading, load error with retry, log error, checklist error, delete error',
    web: { file: 'apps/web/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'distinguishes an absent child from unavailable day habits and restores completion after retry', control: "name: 'habits.detail.retry'" },
    android: { file: 'apps/mobile/__tests__/components/habits/habit-detail-screen.test.tsx', fragment: 'writes the load error in the first person', control: "testID: 'load-error'" },
  },
  {
    row: '35 Open the conversation from Hoje',
    web: { file: 'apps/web/__tests__/components/shell/orbit-button.test.tsx', fragment: 'opens the conversation from the keyboard', control: 'openButton()' },
    android: { file: 'apps/mobile/__tests__/components/shell/orbit-button.test.tsx', fragment: 'opens the conversation on tap and carries its accessible name', control: "host('orbit-button').props.onPress" },
  },
  {
    row: '36 Open the conversation from the sidebar row on wide web',
    web: { file: 'apps/web/__tests__/components/shell/orbit-shell-navigation.test.tsx', fragment: 'owns one conversation entry row, named by its action, before the four destinations with collapsed=%s', control: "name: 'Falar com o Orbit'" },
    android: { file: 'apps/mobile/__tests__/components/shell/orbit-button.test.tsx', fragment: 'opens the conversation on tap and carries its accessible name', control: "host('orbit-button').props.onPress" },
  },
  {
    row: '37 Close the conversation',
    web: { file: 'apps/web/__tests__/components/chat/conversation-header.test.tsx', fragment: 'closes the conversation from one trailing control, with no back control', control: "name: 'common.closeConversation'" },
    android: { file: 'apps/mobile/__tests__/components/chat/conversation-header.test.tsx', fragment: 'closes the conversation from one trailing control, with no back control', control: "accessibilityLabel === 'common.closeConversation'" },
  },
  {
    row: '38 Type, send, clear and paste in the composer',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'sends a nonblank value once', control: 'name: words.send' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'sends a nonblank value once', control: 'byLabel(tree.root, words.send)' },
  },
  {
    row: '39 Voice record',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'replaces suggestions with recording status and a stop control', control: 'name: voiceWords.stop' },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'replaces suggestions with recording status and a stop control', control: 'byLabel(tree.root, voiceWords.stop)' },
  },
  {
    row: '40 Attach an image or a file, preview, remove, size and read errors',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'names, distinguishes, and removes each attachment independently', control: "attachWords.remove('notes.txt')" },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'names, distinguishes, and removes each attachment independently', control: "testID: 'composer-attachment-tray'" },
  },
  {
    row: '41 Queue up to 3 messages, send or remove a queued one, stop a reply',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'shows removable queued rows, manual sends and a separate stop control in both languages', control: "queue.removeLabel('Second request')" },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'shows removable queued rows, manual sends and a separate stop control in both languages', control: 'onRemove' },
  },
  {
    row: '42 Retry a failed send',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'retries the restored draft from Enter without a new send, and sends an edited draft', control: "userEvent.keyboard('{Enter}')" },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'retries the restored draft from a keyboard submit without a new send, and sends an edited draft', control: 'onSubmitEditing' },
  },
  {
    row: '43 Expand and collapse the composer: ruling 9 keeps the outcome of #2108, so the composer has no collapse control',
    web: { file: 'apps/web/__tests__/components/shell/composer-suggestions-geometry.test.tsx', fragment: 'spans the full composer content width with no collapse control beside it', control: '[data-composer-disclosure], [data-composer-collapse-row]' },
    android: { file: 'apps/mobile/__tests__/components/chat/conversation-composer.test.tsx', fragment: 'renders the suggestion strip with no collapse control beside it', control: "'shell.composer.collapse'" },
  },
  {
    row: '44 Usage for the day or the week, the limit reason, the offline reason',
    web: { file: 'apps/web/__tests__/components/shell/composer.test.tsx', fragment: 'renders only the limit reason above disabled controls without an accent send', control: "getByText('limit sentinel')" },
    android: { file: 'apps/mobile/__tests__/components/shell/composer.test.tsx', fragment: 'fills the daily notice with neutral tabular usage or the exhausted reason', control: "testID: 'composer-usage'" },
  },
  {
    row: '45 Ideas library: open, back, search, clear search, categories, select',
    web: { file: 'apps/web/__tests__/components/chat/prompt-library.test.tsx', fragment: 'focuses the heading, and returns on Escape with the draft and trigger focus', control: "name: 'Browse ideas'" },
    android: { file: 'apps/mobile/__tests__/components/chat/prompt-library.test.tsx', fragment: 'opens from both entries, returns on Android back, and retains the draft', control: "'Ver ideias'" },
  },
  {
    row: '46 Empty thread: title, browse ideas, AI disclosure',
    web: { file: 'apps/web/__tests__/components/chat/chat-empty-state.test.tsx', fragment: 'renders the title and disclosure without an opener prompt or chip', control: "getByText('chat.empty.title')" },
    android: { file: 'apps/mobile/__tests__/components/chat/chat-empty-state.test.tsx', fragment: 'renders only the mark, title and disclosure with habits $habits', control: "toContain('chat.empty.title')" },
  },
  {
    row: '47 Pending reply dots and the work status with its tool steps',
    web: { file: 'apps/web/__tests__/components/chat/conversation-account-scope.test.tsx', fragment: 'collapses two tool steps on the finished message', control: "name: '2 steps'" },
    android: { file: 'apps/mobile/__tests__/screens/chat-screen.test.tsx', fragment: 'collapses two tool steps on the finished message', control: 'press(disclosure)' },
  },
  {
    row: '48 Question, choice, pick list, clarification: select, free text, submit',
    web: { file: 'apps/web/__tests__/components/chat/question-block.test.tsx', fragment: 'formats slider limits, selection, announcements and the submitted summary in pt-BR', control: '{ name: pt.chat.choice.submit }' },
    android: { file: 'apps/mobile/__tests__/components/chat/question-block.test.tsx', fragment: 'formats Android slider limits, selection, announcements and submitted summary in pt-BR', control: 'await submit()' },
  },
  {
    row: '49 Plan block and answer block',
    web: { file: 'apps/web/__tests__/components/chat/plan-block.test.tsx', fragment: 'announces later running steps on a restored plan without replaying its saved activity', control: '[data-plan-announcement]' },
    android: { file: 'apps/mobile/__tests__/components/chat/plan-block-style.test.tsx', fragment: 'announces later running steps on a restored plan without replaying its saved activity', control: "testID === 'plan-announcement'" },
  },
  {
    row: '50 Change preview: approve, reject, edit a field, apply all, conflict warning, expired state',
    web: { file: 'apps/web/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'keeps %s on the whole grouped operation', control: "name: 'Create 5 habits'" },
    android: { file: 'apps/mobile/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'keeps %s on the whole grouped operation', control: "press(tree, 'Create 5 habits')" },
  },
  {
    row: '51 Step-up for a sensitive change: code entry, confirm, cancel',
    web: { file: 'apps/web/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'hands step up to a sheet, verifies the code, and executes', control: "name: 'chat.operation.stepUpAction'" },
    android: { file: 'apps/mobile/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'hands step up to a sheet, verifies the code, and executes', control: "press(tree, 'chat.operation.stepUpAction')" },
  },
  {
    row: '52 Operation outcomes with a status per item on a partial failure',
    web: { file: 'apps/web/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'shows each failed row of a restored compact batch', control: 'name: en.common.retry' },
    android: { file: 'apps/mobile/__tests__/components/chat/pending-operation-card.test.tsx', fragment: 'shows each failed row of a restored compact batch', control: 'press(tree, en.common.retry)' },
  },
  {
    row: '53 Breakdown suggestion and habit suggestions: edit, preview, accept',
    web: { file: 'apps/web/__tests__/components/chat/breakdown-suggestion.test.tsx', fragment: 'withholds the batch until the approval sheet is confirmed', control: "name: 'chat.preview.approve'" },
    android: { file: 'apps/mobile/__tests__/components/chat/breakdown-suggestion.test.tsx', fragment: 'withholds the batch until the approval sheet is confirmed', control: "press(tree, 'chat.preview.approve')" },
  },
  {
    row: '54 Read cards and their copy control',
    web: { file: 'apps/web/__tests__/components/chat/account-rows-card.test.tsx', fragment: 'swaps the copy icon through CopyStateIcon with scale, opacity and blur on the shared fast duration', control: "name: 'chat.account.copy'" },
    android: { file: 'apps/mobile/__tests__/components/chat/account-rows-card.test.tsx', fragment: 'swaps the copy icon through CopyStateIcon with scale, opacity and blur on the shared fast duration', control: "accessibilityLabel: 'chat.account.copy'" },
  },
  {
    row: '55 Action chips, follow-up chips, proactive action, offers, links',
    web: { file: 'apps/web/__tests__/components/chat/action-chips.test.tsx', fragment: 'opens a successful navigable result', control: "name: 'chat.action.open'" },
    android: { file: 'apps/mobile/__tests__/components/chat/action-chips.test.tsx', fragment: 'opens a successful navigable result', control: "findByType('Button')" },
  },
  {
    row: '56 Delete the conversation, with confirm',
    web: { file: 'apps/web/__tests__/components/chat/conversation-history.test.tsx', fragment: 'requires confirmation before clearing a thread on delete %s', control: "name: 'chat.conversation.delete'" },
    android: { file: 'apps/mobile/__tests__/components/chat/conversation-history.test.tsx', fragment: 'asks before deleting and clears the id on %s', control: "button('chat.conversation.delete')" },
  },
  {
    row: '57 Stale block notice and live block refresh',
    web: { file: 'apps/web/__tests__/components/chat/read-blocks.test.tsx', fragment: 'keeps a failed stale refresh actionable and replaces the snapshot on retry', control: 'name: en.blockFrame.refresh' },
    android: { file: 'apps/mobile/__tests__/components/chat/read-blocks.test.tsx', fragment: 'keeps a failed stale refresh actionable and replaces the snapshot on retry', control: 'press(tree, en.blockFrame.refresh)' },
  },
]

interface TitledBlock { title: string; block: string }

function calleeRoot(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression) || ts.isCallExpression(expression)) return calleeRoot(expression.expression)
  return null
}

function titledBlocks(file: string, source: string): TitledBlock[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: TitledBlock[] = []
  const visit = (node: ts.Node) => {
    const title = ts.isCallExpression(node) ? node.arguments[0] : undefined
    if (ts.isCallExpression(node) && ['it', 'test'].includes(calleeRoot(node.expression) ?? '') && title) {
      if (ts.isStringLiteralLike(title)) found.push({ title: title.text, block: node.getText() })
      else if (ts.isTemplateExpression(title)) found.push({ title: title.getText().slice(1, -1), block: node.getText() })
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

function unreachedControl(row: string, side: LedgerSide, source: string): string | null {
  const blocks = titledBlocks(side.file, source).filter((candidate) => candidate.title.includes(side.fragment))
  if (blocks.length === 0) return `row ${row}: no test titled "${side.fragment}" in ${side.file}`
  if (!blocks.some((candidate) => candidate.block.includes(side.control))) return `row ${row}: the test "${side.fragment}" in ${side.file} does not reach the control ${side.control}`
  return null
}

describe.each(ledger)('row $row', ({ row, web, android }) => {
  it.each([['web', web], ['Android', android]] as const)('keeps the %s test that reaches the control', (_platform, test) => {
    const path = join(repositoryRoot, test.file)
    expect(existsSync(path)).toBe(true)
    expect(unreachedControl(row, test, readFileSync(path, 'utf8'))).toBeNull()
  })
})

describe('the ledger check', () => {
  const fixture = "it('opens the sheet', () => { press(openButton) })\nit.each([1, 2])('closes the sheet %s', () => { press(closeButton) })"
  const side: LedgerSide = { file: 'fixture.test.tsx', fragment: 'opens the sheet', control: 'press(openButton)' }

  it('accepts a row whose named test block holds its control', () => {
    expect(unreachedControl('fixture', side, fixture)).toBeNull()
    expect(unreachedControl('fixture', { ...side, fragment: 'closes the sheet', control: 'press(closeButton)' }, fixture)).toBeNull()
  })

  it('fails a row whose test holds the title but not the control, even when another test holds it', () => {
    const failure = unreachedControl('fixture row', { ...side, control: 'press(closeButton)' }, fixture)
    expect(failure).toContain('fixture row')
    expect(failure).toContain('does not reach the control press(closeButton)')
  })

  it('fails a row whose title no test carries', () => {
    expect(unreachedControl('fixture row', { ...side, fragment: 'missing title' }, fixture)).toContain('no test titled')
  })
})
