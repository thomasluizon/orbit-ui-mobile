import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { formatAPIDate } from '@orbit/shared/utils'
import {
  makeHabitDetail as makeDetail,
  makeHabitDetailScopedChild as makeScopedChild,
  makeHabitDetailScopedParent as makeScopedParent,
  makeLoggedGeneralHabitDetailChild as makeLoggedGeneralChild,
} from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { useChatStore } from '@/stores/chat-store'

const mocks = vi.hoisted(() => ({
  logs: [] as HabitLog[],
  metrics: {} as HabitMetrics,
  detail: null as HabitDetail | null,
  detailLoading: false,
  detailError: false,
  refetch: vi.fn(),
  allHabits: new Map<string, NormalizedHabit>(),
  scopedHabits: new Map<string, NormalizedHabit>(),
  log: vi.fn(),
  update: vi.fn(),
  checklist: vi.fn(),
  deleteHabit: vi.fn(),
  showError: vi.fn(),
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  history: [] as { path: string; selectedDate: string }[],
  hasProAccess: true,
  suggestion: null as null | {
    frequencyUnit: 'Day'
    frequencyQuantity: number
    dueDate: string
    dueTime: null
    days: string[]
    rationale: string
  },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === 'loggedAt') return `${values?.date}, logged at ${values?.time}`
    if (key === 'habits.detail.askAstraSeedDefault') return `${key}:${JSON.stringify({ title: values?.title })}`
    return key
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.routerBack, push: mocks.routerPush, replace: mocks.routerReplace }),
}))

vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: mocks.detail, isLoading: mocks.detailLoading, isError: mocks.detailError, refetch: mocks.refetch }),
  useHabitLogs: () => ({ data: mocks.logs }),
  useHabitMetrics: () => ({ data: mocks.metrics, isLoading: false }),
  useHabits: (filters: { dateFrom?: string }) => ({ data: { habitsById: filters.dateFrom ? mocks.scopedHabits : mocks.allHabits, topLevelHabits: [] }, isLoading: false, isError: false }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: mocks.log, mutateAsync: mocks.log }),
  useUpdateHabit: () => ({ mutate: mocks.update, mutateAsync: mocks.update, isPending: false }),
  useUpdateChecklist: () => ({ mutate: mocks.checklist, mutateAsync: mocks.checklist }),
  useDeleteHabit: () => ({ mutate: mocks.deleteHabit, mutateAsync: mocks.deleteHabit }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      aiMessagesLimit: 20,
      aiMessagesUsed: 0,
      hasProAccess: mocks.hasProAccess,
      language: 'en',
      weekStartDay: 1,
    },
  }),
}))

vi.mock('@/hooks/use-reschedule-suggestion', () => ({
  useRescheduleSuggestion: () => ({ suggestion: mocks.suggestion, error: null }),
}))

vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => <main>{header}{children}</main>,
}))
vi.mock('@/components/ui/app-bar', () => ({
  AppBar: ({ onBack }: { onBack: () => void }) => <button type="button" aria-label="screen-back" onClick={onBack} />,
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, title, onConfirm }: { open: boolean; title: string; onConfirm: () => void }) => open
    ? <button type="button" data-testid={`confirm-${title}`} onClick={onConfirm}>{title}</button>
    : null,
}))
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ message, action }: { message: string; action: React.ReactNode }) => <div role="alert">{message}{action}</div>,
}))
vi.mock('@/components/ui/proposed', () => ({ Proposed: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ label }: { label: string }) => <div>{label}</div> }))
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) => (
    <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} />
  ),
}))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({ title, description, value, trailing, onClick }: { title: string; description?: string; value?: string; trailing?: React.ReactNode; onClick?: () => void }) => onClick
    ? <button type="button" data-testid={`list-row-${title}`} data-description={description} data-value={value} onClick={onClick}>{title}{trailing}</button>
    : <div data-testid={`list-row-${title}`} data-description={description} data-value={value}>{title}{trailing}</div>,
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, disabled, label, onClick }: { children?: React.ReactNode; disabled?: boolean; label?: string; onClick?: () => void }) => <button type="button" disabled={disabled} aria-label={label} onClick={onClick}>{children}</button>,
}))
vi.mock('@/components/ui/stat-tile', () => ({
  StatTile: ({ label, value }: { label: string; value: string }) => <output data-testid={`stat-${label}`}>{value}</output>,
}))
vi.mock('@/components/dates/day-cell', () => ({
  DayCell: ({ day, outcome, outsideMonth, label }: { day: number; outcome: string; outsideMonth: boolean; label: string }) => <span aria-label={label} data-testid={`history-day-${day}-${outsideMonth ? 'outside' : 'inside'}`}>{outcome}</span>,
}))
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: () => null }))
vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: ({ selectedGoalIds, atGoalLimit, onToggleGoal }: { selectedGoalIds: string[]; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }) => <button type="button" data-testid="goal-linking-field" data-goal-limit={atGoalLimit} onClick={() => onToggleGoal(atGoalLimit ? selectedGoalIds[0]! : 'goal-2')} />,
}))
vi.mock('@/components/ui/time-field', () => ({
  TimeField: ({ label, value, onChange, onClear }: { label: string; value: Time24 | ''; onChange: (value: Time24) => void; onClear: () => void }) => (
    <div>
      <input aria-label={label} value={value} onChange={(event) => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) onChange(event.target.value as Time24) }} />
      <button type="button" onClick={onClear}>clear-time</button>
    </div>
  ),
}))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({
  ReminderSection: ({ onReminderTimesChange, onToggleReminder }: { onReminderTimesChange: (offsets: number[]) => void; onToggleReminder: () => void }) => <div data-testid="offset-reminders"><button type="button" onClick={() => onReminderTimesChange([30])}>set-offset</button><button type="button" onClick={onToggleReminder}>toggle-offsets</button></div>,
}))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({
  ScheduledReminderSection: ({ onSetScheduledReminders, onToggleReminder }: { onSetScheduledReminders: (scheduled: { when: 'same_day'; time: string }[]) => void; onToggleReminder: () => void }) => <div data-testid="scheduled-reminders"><button type="button" onClick={() => onSetScheduledReminders([{ when: 'same_day', time: '08:00' }])}>set-scheduled</button><button type="button" onClick={() => onSetScheduledReminders([])}>remove-scheduled</button><button type="button" onClick={onToggleReminder}>toggle-scheduled</button></div>,
}))
vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ interactive, editable, onToggle, onClear }: { interactive: boolean; editable: boolean; onToggle: (index: number) => void; onClear: () => void }) => (
    <div data-testid="habit-checklist" data-interactive={interactive} data-editable={editable}>
      <button type="button" onClick={() => onToggle(0)}>toggle-checklist</button>
      <button type="button" onClick={onClear}>clear-checklist</button>
    </div>
  ),
}))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))
vi.mock('@/components/habits/habit-log-button', () => ({
  HabitLogButton: ({ label, logged, onPress }: { label: string; logged: boolean; onPress: () => void }) => <button type="button" aria-label={label} data-logged={logged} onClick={onPress}>{label}</button>,
}))
vi.mock('@/components/habits/habit-row', () => ({
  HabitRow: ({ habit, state, canLog, readOnly, actions }: { habit: NormalizedHabit; state: string; canLog: boolean; readOnly: boolean; actions: { onLog: () => void; onUnlog: () => void; onDetail: () => void; onDelete: () => void } }) => (
    <div>
      <button
        type="button"
        data-testid={`child-${habit.id}`}
        data-state={state}
        data-can-log={canLog}
        data-read-only={readOnly}
        aria-label={state === 'done' ? 'unlog-child' : 'log-child'}
        onClick={state === 'done' ? actions.onUnlog : actions.onLog}
      >
        {habit.title}
      </button>
      <button type="button" aria-label={`open-${habit.id}`} onClick={actions.onDetail} />
      <button type="button" aria-label={`delete-${habit.id}`} onClick={actions.onDelete} />
    </div>
  ),
}))

describe('HabitDetailScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 12))
    mocks.detail = makeDetail()
    mocks.detailLoading = false
    mocks.detailError = false
    mocks.logs = [
      { id: 'older-1', date: '2026-08-26', value: 1, createdAtUtc: '2026-08-26T12:00:00Z' },
      { id: 'older-2', date: '2026-08-27', value: 1, createdAtUtc: '2026-08-27T12:00:00Z' },
    ]
    mocks.metrics = {
      currentStreak: 2,
      longestStreak: 4,
      weeklyCompletionRate: 80,
      monthlyCompletionRate: 75,
      totalCompletions: 2,
      lastCompletedDate: '2026-08-27',
    }
    mocks.allHabits = new Map([['habit-1', { ...makeScopedParent(), tags: [], linkedGoals: [], instances: [] }]])
    mocks.scopedHabits = new Map()
    mocks.log.mockReset()
    mocks.update.mockReset()
    mocks.checklist.mockReset()
    mocks.deleteHabit.mockReset()
    mocks.showError.mockReset()
    mocks.refetch.mockReset()
    mocks.routerBack.mockReset()
    mocks.routerPush.mockReset()
    mocks.routerReplace.mockReset()
    mocks.history = []
    mocks.hasProAccess = true
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
    mocks.suggestion = null
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows loading feedback and a retry action after a load failure', () => {
    mocks.detailLoading = true
    const view = render(<HabitDetailScreen habitId="habit-1" />)

    expect(screen.getAllByText('habits.detail.loading')).toHaveLength(3)

    mocks.detailLoading = false
    mocks.detailError = true
    view.rerender(<HabitDetailScreen habitId="habit-1" />)

    expect(screen.getByRole('alert')).toHaveTextContent('habits.detail.loadError')
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.retry' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('shows authoritative tags and moves linked goals into the inline details', () => {
    mocks.allHabits.set('habit-1', makeScopedParent())
    mocks.scopedHabits.set('habit-1', makeScopedParent())
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    expect(screen.getByText('Focus')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByTestId('list-row-habits.detail.linkedGoals')).toHaveAttribute('data-value', '1')
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    expect(screen.getByTestId('goal-linking-field')).toBeInTheDocument()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('preserves authoritative relationship state for an off-schedule habit', () => {
    const linkedGoals = Array.from({ length: 10 }, (_, index) => ({ id: `goal-${index + 1}`, title: `Goal ${index + 1}` }))
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    mocks.allHabits.set('habit-1', {
      ...makeScopedParent(),
      isBadHabit: true,
      linkedGoals,
      slipAlertEnabled: true,
    })

    render(<HabitDetailScreen habitId="habit-1" date="2026-08-29" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))

    expect(screen.getByTestId('list-row-habits.detail.linkedGoals')).toHaveAttribute('data-value', '10')
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    expect(screen.getByTestId('goal-linking-field')).toHaveAttribute('data-goal-limit', 'true')
    fireEvent.click(screen.getByTestId('goal-linking-field'))
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      goalIds: linkedGoals.slice(1).map((goal) => goal.id),
    })

    const slipAlert = screen.getByRole('switch', { name: 'habits.detail.slipAlert' })
    expect(slipAlert).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(slipAlert)
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ slipAlertEnabled: false })
  })

  it('keeps a general habit existing goal links after the first toggle', () => {
    mocks.detail = { ...makeDetail(), isGeneral: true }
    mocks.allHabits.clear()
    mocks.scopedHabits.set('habit-1', {
      ...makeScopedParent(),
      isGeneral: true,
      linkedGoals: [{ id: 'goal-1', title: 'Read more books' }],
    })
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    fireEvent.click(screen.getByTestId('goal-linking-field'))

    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      goalIds: ['goal-1', 'goal-2'],
    })
  })

  it('restores an empty rename and returns to the selected day', async () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    await act(async () => Promise.resolve())

    expect(screen.queryByRole('textbox', { name: 'rename' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'screen-back' }))
    expect(mocks.routerPush).toHaveBeenCalledWith('/?date=2026-08-28')
  })

  it('moves to an older history month without rendering the removed history note', () => {
    mocks.detail = { ...makeDetail(), createdAtUtc: '2025-01-01T12:00:00Z' }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    const previousMonth = screen.getByRole('button', { name: 'previousMonth' })
    for (let index = 0; index < 13; index += 1) fireEvent.click(previousMonth)

    expect(screen.getByText('July 2025')).toBeInTheDocument()
    expect(screen.queryByText('olderHistoryUnavailable')).not.toBeInTheDocument()
  })

  it('pops child then parent history back to Today without duplicating the parent', () => {
    mocks.history = [
      { path: '/?date=2026-08-28', selectedDate: '2026-08-28' },
      { path: '/habits/parent-1?date=2026-08-28&from=today', selectedDate: '2026-08-28' },
      { path: '/habits/child-1?date=2026-08-28&parent=parent-1&from=today', selectedDate: '2026-08-28' },
    ]
    mocks.routerBack.mockImplementation(() => { mocks.history.pop() })
    const view = render(
      <HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="parent-1" fromToday />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'screen-back' }))
    expect(mocks.history.map((entry) => entry.path)).toEqual([
      '/?date=2026-08-28',
      '/habits/parent-1?date=2026-08-28&from=today',
    ])

    view.rerender(<HabitDetailScreen habitId="parent-1" date="2026-08-28" fromToday />)
    fireEvent.click(screen.getByRole('button', { name: 'screen-back' }))

    expect(mocks.history).toEqual([
      { path: '/?date=2026-08-28', selectedDate: '2026-08-28' },
    ])
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('reconciles an explicit-date log and unlog across the mounted detail', async () => {
    mocks.log.mockImplementation(({ date }: { habitId: string; date: string }) => {
      const existing = mocks.logs.some((entry) => entry.date === date)
      mocks.logs = existing
        ? mocks.logs.filter((entry) => entry.date !== date)
        : [...mocks.logs, { id: 'selected', date, value: 1, createdAtUtc: `${date}T12:00:00Z` }]
      mocks.metrics = { ...mocks.metrics, totalCompletions: existing ? 2 : 3 }
    })
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    expect(screen.getByRole('button', { name: 'log' })).toHaveAttribute('data-logged', 'false')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('none')
    expect(screen.queryByTestId('stat-totalCompletions')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'log' }))
    await act(async () => Promise.resolve())
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'unlog' })).toHaveAttribute('data-logged', 'true')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('full')

    fireEvent.click(screen.getByRole('button', { name: 'unlog' }))
    await act(async () => Promise.resolve())
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'log' })).toHaveAttribute('data-logged', 'false')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('none')
  })

  it('guards a repeated detail toggle while the accepted write is unfinalized', async () => {
    let releaseWrite: (() => void) | undefined
    mocks.log.mockReturnValue(new Promise<void>((resolve) => {
      releaseWrite = resolve
    }))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'log' }))
    fireEvent.click(screen.getByRole('button', { name: 'log' }))

    expect(mocks.log).toHaveBeenCalledOnce()
    await act(async () => {
      releaseWrite?.()
      await Promise.resolve()
    })
  })

  it('uses the selected date for recurring child completion and mutations', () => {
    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-29'))
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-29" />)
    expect(screen.getByTestId('child-child-1')).toHaveAttribute('data-state', 'done')

    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-28'))
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByTestId('child-child-1')).toHaveAttribute('data-state', 'done')
    fireEvent.click(screen.getByTestId('child-child-1'))
    expect(mocks.log).toHaveBeenLastCalledWith({ habitId: 'child-1', date: '2026-08-28' })
  })

  it('announces full dates for logged and unlogged history cells and keeps the log time', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    const loggedCell = screen.getByTestId('history-day-26-inside')
    const unloggedCell = screen.getByTestId('history-day-28-inside')
    const loggedTime = new Date('2026-08-26T12:00:00Z').toLocaleTimeString('en', {
      hour: 'numeric',
      minute: '2-digit',
    })
    expect(loggedCell).toHaveAccessibleName(/Wednesday, August 26, 2026/)
    expect(loggedCell.getAttribute('aria-label')).toContain(loggedTime)
    expect(unloggedCell).toHaveAccessibleName('Friday, August 28, 2026')
  })

  it.each(['2026-08-29', '2026-08-28'])(
    'renders a logged general child done and unlogs it on %s',
    (date) => {
      mocks.scopedHabits.set('child-1', makeLoggedGeneralChild())
      render(<HabitDetailScreen habitId="habit-1" date={date} />)

      const child = screen.getByRole('button', { name: 'unlog-child' })
      expect(child).toHaveAttribute('data-state', 'done')
      expect(child).toHaveAttribute('data-can-log', 'true')
      expect(child).toHaveAttribute('data-read-only', 'false')

      fireEvent.click(child)
      expect(mocks.log).toHaveBeenLastCalledWith({ habitId: 'child-1', date })
    },
  )

  it('renames an unscoped habit without sending Pro or goal state', () => {
    mocks.hasProAccess = false
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: 'Read daily' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.update).toHaveBeenCalledOnce()
    const request = mocks.update.mock.calls[0]![0].data
    expect(request.title).toBe('Read daily')
    expect(request).not.toHaveProperty('slipAlertEnabled')
    expect(request).not.toHaveProperty('goalIds')
  })

  it('opens the schedule editor inline without opening the full editor', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.schedule' }))

    expect(screen.getByRole('spinbutton', { name: 'habits.form.frequencyRequired' })).toBeInTheDocument()
    expect(screen.queryByTestId('edit-habit-modal')).not.toBeInTheDocument()
  })

  it('shows reminder offsets before schedule and edits them inline', async () => {
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    const reminderRow = screen.getByTestId('list-row-habits.detail.reminders')
    expect(reminderRow).toHaveAttribute('data-value', 'habits.detail.noValue')
    const detailRows = Array.from(reminderRow.parentElement!.children)
    expect(detailRows.indexOf(reminderRow)).toBeLessThan(
      detailRows.indexOf(screen.getByTestId('list-row-habits.detail.schedule')),
    )

    fireEvent.click(reminderRow)
    expect(screen.getByTestId('scheduled-reminders')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'set-scheduled' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle-scheduled' }))
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ reminderEnabled: true, scheduledReminders: [{ when: 'same_day', time: '08:00' }] })

    mocks.detail = {
      ...makeDetail(),
      reminderEnabled: true,
      reminderTimes: [10, 30],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    }
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByTestId('list-row-habits.detail.reminders')).toHaveAttribute('data-value', 'habits.form.reminder10min, habits.form.reminder30min, 08:00')
  })

  it('keeps the five content blocks in one column and discloses avoid-only fields', () => {
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const main = document.querySelector('main')
    if (!main) throw new Error('Expected the habit detail main surface')
    const blocks = Array.from(main.children).filter((element) => (
      element.tagName === 'HEADER' || element.tagName === 'SECTION'
    ))

    expect(blocks.map((element) => element.tagName)).toEqual([
      'HEADER',
      'SECTION',
      'SECTION',
      'SECTION',
      'SECTION',
    ])
    expect(blocks.slice(1).map((element) => element.textContent)).toEqual([
      expect.stringContaining('habits.detail.lastThirtyDays'),
      expect.stringContaining('history'),
      expect.stringContaining('habits.detail.checklist'),
      expect.stringContaining('habits.detail.moreDetails'),
    ])
    expect(screen.queryByTestId('list-row-habits.detail.slipAlert')).toBeNull()

    const disclosure = screen.getByRole('button', { name: 'habits.detail.moreDetails' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('habit-checklist')).toHaveAttribute('data-interactive', 'true')
    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('habit-checklist')).toHaveAttribute('data-editable', 'true')
    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')

    mocks.detail = { ...makeDetail(), isBadHabit: true }
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByTestId('list-row-habits.detail.slipAlert')).toBeInTheDocument()
  })

  it('persists each inline detail editor through its dedicated patch', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00', description: 'Old note', endDate: '2026-09-30' }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))

    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    fireEvent.click(screen.getByTestId('goal-linking-field'))
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ goalIds: ['goal-2'] })
    mocks.update.mockClear()

    fireEvent.click(screen.getByTestId('list-row-habits.detail.reminders'))
    fireEvent.click(screen.getByRole('button', { name: 'set-offset' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle-offsets' }))
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ reminderEnabled: true, reminderTimes: [30] })

    fireEvent.click(screen.getByTestId('list-row-habits.detail.schedule'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequencyRequired' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'habits.detail.schedule' }), { target: { value: 'Week' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 3, days: [] })

    fireEvent.click(screen.getByTestId('list-row-habits.detail.time'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '10:15' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ dueTime: '10:15', dueEndTime: null })

    fireEvent.click(screen.getByTestId('list-row-habits.detail.description'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' Better note ' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ description: 'Better note' })

    fireEvent.click(screen.getByTestId('list-row-habits.detail.endDate'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ endDate: null })
  })

  it('validates reminder drafts before mutation', async () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByTestId('list-row-habits.detail.reminders'))
    fireEvent.click(screen.getByRole('button', { name: 'toggle-scheduled' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.reminderMinimumOne')

    fireEvent.click(screen.getByRole('button', { name: 'set-scheduled' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      reminderEnabled: true,
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    })
  })

  it('edits stored scheduled reminders beside due-time offsets', async () => {
    mocks.detail = {
      ...makeDetail(),
      dueTime: '09:00',
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByTestId('list-row-habits.detail.reminders'))

    expect(screen.getByTestId('offset-reminders')).toBeInTheDocument()
    expect(screen.getByTestId('scheduled-reminders')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'remove-scheduled' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [],
    })
  })

  it('sends slip alert state only from the explicit switch action', () => {
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByTestId('list-row-habits.detail.slipAlert')).toHaveAttribute('data-description', 'habits.detail.slipAlertDescription')
    fireEvent.click(screen.getByRole('switch', { name: 'habits.detail.slipAlert' }))

    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ slipAlertEnabled: true })
    expect(mocks.update.mock.calls[0]![0].data).not.toHaveProperty('goalIds')
  })

  it('keeps the title editor open and reports an update failure', async () => {
    mocks.update.mockRejectedValueOnce(new Error('update failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: 'Read daily' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.updateError')
    expect(screen.getByRole('textbox', { name: 'rename' })).toHaveValue('Read daily')
  })

  it('contains and reports a log failure', async () => {
    mocks.log.mockRejectedValueOnce(new Error('log failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'log' }))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.logError')
  })

  it('contains and reports a checklist failure', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockRejectedValueOnce(new Error('checklist failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle-checklist' }))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.checklistError')
    expect(screen.queryByTestId('confirm-habits.checklistCompleteTitle')).not.toBeInTheDocument()
  })

  it('offers to log the habit after its last checklist item is completed', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    mocks.log.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle-checklist' }))
    await act(async () => Promise.resolve())

    expect(mocks.checklist).toHaveBeenCalledWith({
      habitId: 'habit-1',
      items: [{ text: 'First', isChecked: true }],
    })
    fireEvent.click(screen.getByTestId('confirm-habits.checklistCompleteTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'habit-1', date: '2026-08-28' })
    expect(screen.queryByTestId('confirm-habits.checklistCompleteTitle')).not.toBeInTheDocument()
  })

  it('clears a checklist only after confirmation', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'clear-checklist' }))
    expect(mocks.checklist).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('confirm-habits.checklistClearTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.checklist).toHaveBeenCalledOnce()
    expect(mocks.checklist).toHaveBeenCalledWith({ habitId: 'habit-1', items: [] })
    expect(screen.queryByTestId('confirm-habits.checklistClearTitle')).not.toBeInTheDocument()
  })

  it('deletes a sub habit without leaving the parent detail', async () => {
    mocks.deleteHabit.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'delete-child-1' }))
    fireEvent.click(screen.getByTestId('confirm-habits.deleteConfirmTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.deleteHabit).toHaveBeenCalledWith('child-1')
    expect(screen.queryByTestId('confirm-habits.deleteConfirmTitle')).not.toBeInTheDocument()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('deletes the habit and returns to the selected day', async () => {
    mocks.deleteHabit.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.delete' }))
    fireEvent.click(screen.getByTestId('confirm-habits.deleteConfirmTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.deleteHabit).toHaveBeenCalledWith('habit-1')
    expect(mocks.routerPush).toHaveBeenCalledWith('/?date=2026-08-28')
  })

  it('puts the grounded Astra seed in the persistent composer', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    expect(useChatStore.getState().contextualSuggestion).toEqual({
      id: 'habit-habit-1',
      label: 'habits.detail.askAstra',
      prompt: 'habits.detail.askAstraSeedDefault:{"title":"Read"}',
    })
    expect(screen.queryByRole('button', { name: 'habits.detail.askAstra' })).not.toBeInTheDocument()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('keeps delete confirmation open and reports a delete failure', async () => {
    mocks.deleteHabit.mockRejectedValueOnce(new Error('delete failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.delete' }))
    fireEvent.click(screen.getByTestId('confirm-habits.deleteConfirmTitle'))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.deleteError')
    expect(screen.getByTestId('confirm-habits.deleteConfirmTitle')).toBeInTheDocument()
  })

  it('contains and reports a reschedule failure', async () => {
    mocks.logs = []
    mocks.metrics = { ...mocks.metrics, currentStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 40, lastCompletedDate: '2026-08-20' }
    mocks.suggestion = {
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: '2026-08-30',
      dueTime: null,
      days: [],
      rationale: 'Try tomorrow',
    }
    mocks.update.mockRejectedValueOnce(new Error('reschedule failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'rescheduleAccept' }))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('rescheduleWriteError')
    expect(screen.getByRole('button', { name: 'rescheduleAccept' })).toBeInTheDocument()
  })
})
