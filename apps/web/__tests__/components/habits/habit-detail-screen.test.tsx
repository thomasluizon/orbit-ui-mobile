import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

const mocks = vi.hoisted(() => ({
  logs: [] as HabitLog[],
  metrics: {} as HabitMetrics,
  detail: null as HabitDetail | null,
  scopedHabits: new Map<string, NormalizedHabit>(),
  log: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: mocks.detail, isLoading: false, isError: false, refetch: vi.fn() }),
  useHabitLogs: () => ({ data: mocks.logs }),
  useHabitMetrics: () => ({ data: mocks.metrics, isLoading: false }),
  useHabits: () => ({ data: { habitsById: mocks.scopedHabits } }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: mocks.log }),
  useUpdateHabit: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateChecklist: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteHabit: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      aiMessagesLimit: 20,
      aiMessagesUsed: 0,
      hasProAccess: true,
      language: 'en',
      weekStartDay: 1,
    },
  }),
}))

vi.mock('@/hooks/use-reschedule-suggestion', () => ({
  useRescheduleSuggestion: () => ({ suggestion: null, error: null }),
}))

vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => <main>{header}{children}</main>,
}))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))
vi.mock('@/components/ui/error-state', () => ({ ErrorState: () => null }))
vi.mock('@/components/ui/proposed', () => ({ Proposed: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }))
vi.mock('@/components/ui/switch', () => ({ Switch: () => null }))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, disabled, label, onClick }: { children?: React.ReactNode; disabled?: boolean; label?: string; onClick?: () => void }) => <button type="button" disabled={disabled} aria-label={label} onClick={onClick}>{children}</button>,
}))
vi.mock('@/components/ui/stat-tile', () => ({
  StatTile: ({ label, value }: { label: string; value: string }) => <output data-testid={`stat-${label}`}>{value}</output>,
}))
vi.mock('@/components/dates/day-cell', () => ({
  DayCell: ({ day, outcome, outsideMonth }: { day: number; outcome: string; outsideMonth: boolean }) => <span data-testid={`history-day-${day}-${outsideMonth ? 'outside' : 'inside'}`}>{outcome}</span>,
}))
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: () => null }))
vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: () => null }))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))
vi.mock('@/components/habits/habit-log-button', () => ({
  HabitLogButton: ({ label, logged, onPress }: { label: string; logged: boolean; onPress: () => void }) => <button type="button" aria-label={label} data-logged={logged} onClick={onPress}>{label}</button>,
}))
vi.mock('@/components/habits/habit-row', () => ({
  HabitRow: ({ habit, state, canLog, readOnly, actions }: { habit: NormalizedHabit; state: string; canLog: boolean; readOnly: boolean; actions: { onLog: () => void; onUnlog: () => void } }) => (
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

describe('HabitDetailScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 12))
    mocks.detail = makeDetail()
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
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reconciles an explicit-date log and unlog across the mounted detail', () => {
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
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'unlog' })).toHaveAttribute('data-logged', 'true')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('full')
    expect(screen.getByTestId('stat-totalCompletions')).toHaveTextContent('3')

    fireEvent.click(screen.getByRole('button', { name: 'unlog' }))
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'log' })).toHaveAttribute('data-logged', 'false')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('none')
    expect(screen.getByTestId('stat-totalCompletions')).toHaveTextContent('2')
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
})
