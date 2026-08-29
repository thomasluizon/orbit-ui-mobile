import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  logs: [] as HabitLog[],
  metrics: {} as HabitMetrics,
  detail: null as HabitDetail | null,
  scopedHabits: new Map<string, NormalizedHabit>(),
  log: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('expo-router', () => ({
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
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children }: { children: React.ReactNode }) => React.createElement('FlowShell', null, children),
}))
vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))
vi.mock('@/components/ui/error-state', () => ({ ErrorState: () => null }))
vi.mock('@/components/ui/proposed', () => ({ Proposed: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }))
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }))
vi.mock('@/components/ui/switch', () => ({ Switch: () => null }))
vi.mock('@/components/ui/icons', () => ({
  Calendar: () => null,
  ChevronDown: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  ListTree: () => null,
  Plus: () => null,
  Trash2: () => null,
}))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({ title }: { title: string }) => React.createElement('ListRow', { title }),
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children }: { children?: React.ReactNode }) => React.createElement('PillButton', null, children),
}))
vi.mock('@/components/ui/stat-tile', () => ({
  StatTile: ({ label, value }: { label: string; value: string }) => React.createElement('StatTile', { testID: `stat-${label}`, value }),
}))
vi.mock('@/components/dates/day-cell', () => ({
  DayCell: ({ day, outcome, outsideMonth }: { day: number; outcome: string; outsideMonth: boolean }) => React.createElement('DayCell', { testID: `history-day-${day}-${outsideMonth ? 'outside' : 'inside'}`, outcome }),
}))
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: () => null }))
vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children }: { children: React.ReactNode }) => React.createElement('MonthGrid', null, children),
}))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: () => null }))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))
vi.mock('@/components/habits/habit-form-fields/styles', () => ({ createStyles: () => ({}) }))
vi.mock('@/components/habits/habit-log-button', () => ({
  HabitLogButton: ({ label, logged, onPress }: { label: string; logged: boolean; onPress: () => void }) => React.createElement('HabitLogButton', { testID: 'header-log', label, logged, onPress }),
}))
vi.mock('@/components/habits/habit-row', () => ({
  HabitRow: ({ habit, selectedDate, readOnly, actions }: { habit: NormalizedHabit; selectedDate: Date; readOnly: boolean; actions: { onLog: () => void; onUnlog: () => void } }) => React.createElement('HabitRow', {
    testID: `child-${habit.id}`,
    state: habit.isCompleted ? 'done' : 'empty',
    action: habit.isCompleted ? 'unlog' : 'log',
    selectedDate: formatAPIDate(selectedDate),
    readOnly,
    actions,
  }),
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
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(false)
    expect(tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.outcome).toBe('none')
    expect(tree!.root.findByProps({ testID: 'stat-habits.detail.totalCompletions' }).props.value).toBe('2')

    TestRenderer.act(() => {
      tree!.root.findByProps({ testID: 'header-log' }).props.onPress()
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(true)
    expect(tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.outcome).toBe('full')
    expect(tree!.root.findByProps({ testID: 'stat-habits.detail.totalCompletions' }).props.value).toBe('3')

    TestRenderer.act(() => {
      tree!.root.findByProps({ testID: 'header-log' }).props.onPress()
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(false)
    expect(tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.outcome).toBe('none')
    expect(tree!.root.findByProps({ testID: 'stat-habits.detail.totalCompletions' }).props.value).toBe('2')
  })

  it('uses the selected date for recurring child completion and mutations', () => {
    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-29'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-29" />)
    })
    expect(tree!.root.findByProps({ testID: 'child-child-1' }).props.state).toBe('done')

    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-28'))
    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const historicalChild = tree!.root.findByProps({ testID: 'child-child-1' })
    expect(historicalChild.props.state).toBe('done')
    historicalChild.props.actions.onUnlog()
    expect(mocks.log).toHaveBeenLastCalledWith({
      habitId: 'child-1',
      date: '2026-08-28',
      intent: 'unlog',
    })
  })

  it.each(['2026-08-29', '2026-08-28'])(
    'renders a logged general child done and unlogs it on %s',
    (date) => {
      mocks.scopedHabits.set('child-1', makeLoggedGeneralChild())
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => {
        tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date={date} />)
      })

      const child = tree!.root.findByProps({ testID: 'child-child-1' })
      expect(child.props.state).toBe('done')
      expect(child.props.action).toBe('unlog')
      expect(child.props.readOnly).toBe(false)

      child.props.actions.onUnlog()
      expect(mocks.log).toHaveBeenLastCalledWith({ habitId: 'child-1', date, intent: 'unlog' })
    },
  )
})
