import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

const mocks = vi.hoisted(() => ({
  logs: [] as HabitLog[],
  metrics: {} as HabitMetrics,
  detail: null as HabitDetail | null,
  detailLoading: false,
  detailError: false,
  refetch: vi.fn(),
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
  useHabits: () => ({ data: { habitsById: mocks.scopedHabits, topLevelHabits: [] } }),
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
  ListRow: ({ title, trailing, onClick }: { title: string; trailing?: React.ReactNode; onClick?: () => void }) => onClick
    ? <button type="button" onClick={onClick}>{title}{trailing}</button>
    : <div>{title}{trailing}</div>,
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
vi.mock('@/components/habits/edit-habit-modal', () => ({
  EditHabitModal: ({ open, relationshipFieldsLoaded }: { open: boolean; relationshipFieldsLoaded: boolean }) => (
    <div data-testid="edit-habit-modal" data-open={open} data-relationship-fields-loaded={relationshipFieldsLoaded} />
  ),
}))
vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ onToggle, onClear }: { onToggle: (index: number) => void; onClear: () => void }) => (
    <div>
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

function makeChild(): HabitDetail['children'][number] {
  return {
    id: 'child-1',
    title: 'Recurring child',
    description: null,
    emoji: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2026-08-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    children: [],
  }
}

function makeDetail(): HabitDetail {
  return {
    ...makeChild(),
    id: 'habit-1',
    title: 'Read',
    createdAtUtc: '2026-08-01T12:00:00Z',
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    children: [makeChild()],
  }
}

function makeScopedChild(date: string): NormalizedHabit {
  return {
    ...makeChild(),
    createdAtUtc: '2026-08-01T12:00:00Z',
    parentId: 'habit-1',
    scheduledDates: [date],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    isLoggedInRange: true,
    linkedGoals: [],
    instances: [{ date, status: 'Completed', logId: 'child-log' }],
    searchMatches: null,
  }
}

function makeLoggedGeneralChild(): NormalizedHabit {
  return {
    ...makeScopedChild('2026-08-29'),
    title: 'General child',
    frequencyUnit: null,
    frequencyQuantity: null,
    isCompleted: true,
    isGeneral: true,
    scheduledDates: [],
    isLoggedInRange: false,
    instances: [],
  }
}

function makeScopedParent(): NormalizedHabit {
  return {
    ...makeScopedChild('2026-08-28'),
    id: 'habit-1',
    title: 'Read',
    parentId: null,
    tags: [{ id: 'tag-1', name: 'Focus', color: '#123456' }],
    linkedGoals: [{ id: 'goal-1', title: 'Read more books' }],
  }
}

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

  it('shows authoritative tags and linked goals and opens the selected goal', () => {
    mocks.scopedHabits.set('habit-1', makeScopedParent())
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    expect(screen.getByText('Focus')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Read more books' }))

    expect(mocks.routerPush).toHaveBeenCalledWith('/goals/goal-1')
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

  it('moves to an older history month and explains unavailable history', () => {
    mocks.detail = { ...makeDetail(), createdAtUtc: '2025-01-01T12:00:00Z' }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    const previousMonth = screen.getByRole('button', { name: 'previousMonth' })
    for (let index = 0; index < 13; index += 1) fireEvent.click(previousMonth)

    expect(screen.getByText('July 2025')).toBeInTheDocument()
    expect(screen.getByText('olderHistoryUnavailable')).toBeInTheDocument()
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
    expect(screen.getByTestId('stat-totalCompletions')).toHaveTextContent('2')

    fireEvent.click(screen.getByRole('button', { name: 'log' }))
    await act(async () => Promise.resolve())
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'unlog' })).toHaveAttribute('data-logged', 'true')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('full')
    expect(screen.getByTestId('stat-totalCompletions')).toHaveTextContent('3')

    fireEvent.click(screen.getByRole('button', { name: 'unlog' }))
    await act(async () => Promise.resolve())
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'log' })).toHaveAttribute('data-logged', 'false')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('none')
    expect(screen.getByTestId('stat-totalCompletions')).toHaveTextContent('2')
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

  it('opens the full editor without treating an off-schedule relationship snapshot as loaded', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.schedule' }))

    expect(screen.getByTestId('edit-habit-modal')).toHaveAttribute('data-open', 'true')
    expect(screen.getByTestId('edit-habit-modal')).toHaveAttribute(
      'data-relationship-fields-loaded',
      'false',
    )
  })

  it('sends slip alert state only from the explicit switch action', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
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

  it('opens Astra with a draft grounded in the current habit', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.askAstra' }))

    expect(localStorage.getItem('orbit-chat-draft')).toBe('habits.detail.askAstraSeedDefault:{"title":"Read"}')
    expect(mocks.routerPush).toHaveBeenCalledWith('/chat')
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
