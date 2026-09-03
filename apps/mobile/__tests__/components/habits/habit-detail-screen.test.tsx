import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { flushQueuedMutations } from '@/lib/offline-mutations'
import { clear as clearOfflineQueue, getAll as getQueuedMutations } from '@/lib/offline-queue'
import { useChatStore } from '@/stores/chat-store'

const TestRenderer = require('react-test-renderer')

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
  setStorage: vi.fn(),
  history: [] as { path: string; selectedDate: string }[],
  hasProAccess: true,
  focusEffect: null as null | (() => void | (() => void)),
  suggestion: null as null | {
    frequencyUnit: 'Day'
    frequencyQuantity: number
    dueDate: string
    dueTime: null
    days: string[]
    rationale: string
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === 'habits.detail.loggedAt') return `${values?.date}, logged at ${values?.time}`
      if (key === 'habits.detail.askAstraSeedDefault') return `${key}:${JSON.stringify({ title: values?.title })}`
      return key
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ back: mocks.routerBack, push: mocks.routerPush, replace: mocks.routerReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    mocks.focusEffect = callback
    React.useEffect(callback, [callback])
  },
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

interface OfflineQueueRow {
  id: string
  timestamp: number
  type: string
  endpoint: string
  method: string
  payload: string
  retries: number
  max_retries: number
  meta: string | null
}

const offlineMocks = vi.hoisted(() => {
  const rows = new Map<string, OfflineQueueRow>()
  const serverLoggedHabits = new Set<string>()
  let online = false

  const apiClient = vi.fn((endpoint: string) => {
    const habitId = endpoint.match(/^\/api\/habits\/([^/]+)\/log$/)?.[1]
    if (habitId) {
      if (serverLoggedHabits.has(habitId)) serverLoggedHabits.delete(habitId)
      else serverLoggedHabits.add(habitId)
    }
    return Promise.resolve(null)
  })

  return {
    rows,
    serverLoggedHabits,
    apiClient,
    isOnline: () => online,
    setOnline: (value: boolean) => {
      online = value
    },
  }
})

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: vi.fn(),
    getAllSync: <T,>(sql: string) => {
      if (sql.startsWith('PRAGMA table_info')) return [{ name: 'meta' }] as T[]
      if (sql.startsWith('SELECT * FROM mutation_queue')) {
        return Array.from(offlineMocks.rows.values())
          .sort((first, second) => first.timestamp - second.timestamp) as T[]
      }
      return [] as T[]
    },
    runSync: (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('INSERT OR REPLACE INTO mutation_queue')) {
        const [id, timestamp, type, endpoint, method, payload, retries, maxRetries, meta] = params
        offlineMocks.rows.set(String(id), {
          id: String(id),
          timestamp: Number(timestamp),
          type: String(type),
          endpoint: String(endpoint),
          method: String(method),
          payload: String(payload),
          retries: Number(retries),
          max_retries: Number(maxRetries),
          meta: typeof meta === 'string' ? meta : null,
        })
        return
      }
      if (sql === 'DELETE FROM mutation_queue') {
        offlineMocks.rows.clear()
        return
      }
      if (sql.startsWith('DELETE FROM mutation_queue WHERE id = ?')) {
        offlineMocks.rows.delete(String(params[0]))
      }
    },
    getFirstSync: <T,>(sql: string) => (
      sql.startsWith('SELECT COUNT(*) as cnt')
        ? { cnt: offlineMocks.rows.size } as T
        : null as T
    ),
    withTransactionSync: (task: () => void) => task(),
  }),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: offlineMocks.apiClient }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: mocks.setStorage },
}))
vi.mock('@/lib/offline-runtime', () => ({
  getCurrentConnectivity: () => Promise.resolve(offlineMocks.isOnline()),
}))
vi.mock('@/lib/query-client', () => ({
  persistQueryCache: () => Promise.resolve(),
  queryClient: { invalidateQueries: () => Promise.resolve() },
}))
vi.mock('@/lib/offline-state', () => ({
  clearOfflineEntity: () => Promise.resolve(),
  getResolvedEntityId: (_entityType: string, id: string) => Promise.resolve(id),
  markOfflineTombstone: () => Promise.resolve(),
  resolveOfflineEntity: () => Promise.resolve(),
  setOfflineEntityStatus: () => Promise.resolve(),
  upsertOfflineEntity: () => Promise.resolve(),
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
vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => React.createElement('FlowShell', null, header, children),
}))
vi.mock('@/components/ui/app-bar', () => ({
  AppBar: ({ onBack }: { onBack: () => void }) => React.createElement('AppBar', { testID: 'screen-back', onBack }),
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, title, onConfirm }: { open: boolean; title: string; onConfirm: () => void }) => open
    ? React.createElement('ConfirmSheet', { testID: `confirm-${title}`, title, onConfirm })
    : null,
}))
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ message, action }: { message: string; action: React.ReactNode }) => React.createElement('ErrorState', { testID: 'load-error', message }, action),
}))
vi.mock('@/components/ui/proposed', () => ({ Proposed: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }))
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ label }: { label: string }) => React.createElement('Skeleton', { label }),
}))
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => React.createElement('Switch', { testID: 'slip-alert-switch', checked, onChange }),
}))
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
  ListRow: ({ title, description, value, trailing, onClick }: { title: string; description?: string; value?: string; trailing?: React.ReactNode; onClick?: () => void }) => React.createElement('ListRow', { title, description, value, onClick }, trailing),
}))
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, disabled, label, onClick }: { children?: React.ReactNode; disabled?: boolean; label?: string; onClick?: () => void }) => React.createElement('PillButton', { disabled, label, onClick }, children),
}))
vi.mock('@/components/ui/stat-tile', () => ({
  StatTile: ({ label, value }: { label: string; value: string }) => React.createElement('StatTile', { testID: `stat-${label}`, value }),
}))
vi.mock('@/components/dates/day-cell', () => ({
  DayCell: ({ day, outcome, outsideMonth, label }: { day: number; outcome: string; outsideMonth: boolean; label: string }) => React.createElement('DayCell', { testID: `history-day-${day}-${outsideMonth ? 'outside' : 'inside'}`, outcome, accessibilityLabel: label }),
}))
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: () => null }))
vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children }: { children: React.ReactNode }) => React.createElement('MonthGrid', null, children),
}))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: ({ selectedGoalIds, atGoalLimit, onToggleGoal }: { selectedGoalIds: string[]; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }) => React.createElement('GoalLinkingField', { testID: 'goal-linking-field', atGoalLimit, onToggleGoal: () => onToggleGoal(atGoalLimit ? selectedGoalIds[0]! : 'goal-2') }),
}))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({
  ReminderSection: ({ onReminderTimesChange, onToggleReminder }: { onReminderTimesChange: (offsets: number[]) => void; onToggleReminder: () => void }) => React.createElement('ReminderSection', { testID: 'offset-reminders', onReminderTimesChange, onToggleReminder }),
}))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({
  ScheduledReminderSection: ({ onSetScheduledReminders, onToggleReminder }: { onSetScheduledReminders: (scheduled: { when: 'same_day'; time: string }[]) => void; onToggleReminder: () => void }) => React.createElement('ScheduledReminderSection', { testID: 'scheduled-reminders', onSetScheduledReminders, onRemoveScheduledReminders: () => onSetScheduledReminders([]), onToggleReminder }),
}))
vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ interactive, editable, onToggle, onClear }: { interactive: boolean; editable: boolean; onToggle: (index: number) => void; onClear: () => void }) => React.createElement('HabitChecklist', { testID: 'habit-checklist', interactive, editable, onToggle, onClear }),
}))
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

describe('HabitDetailScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 12))
    clearOfflineQueue()
    offlineMocks.serverLoggedHabits.clear()
    offlineMocks.setOnline(false)
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
    mocks.setStorage.mockReset()
    mocks.setStorage.mockResolvedValue(undefined)
    mocks.history = []
    mocks.hasProAccess = true
    mocks.suggestion = null
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows loading feedback and a retry action after a load failure', () => {
    mocks.detailLoading = true
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />)
    })

    expect(tree!.root.findAllByType('Skeleton').map((node: { props: { label: string } }) => node.props.label)).toEqual([
      'habits.detail.loading',
      'habits.detail.loading',
      'habits.detail.loading',
    ])

    mocks.detailLoading = false
    mocks.detailError = true
    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="habit-1" />)
    })

    expect(tree!.root.findByProps({ testID: 'load-error' }).props.message).toBe('habits.detail.loadError')
    TestRenderer.act(() => {
      tree!.root.findByType('PillButton').props.onClick()
    })
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('shows authoritative tags and linked goals and opens the selected goal', () => {
    mocks.allHabits.set('habit-1', makeScopedParent())
    mocks.scopedHabits.set('habit-1', makeScopedParent())
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    expect(tree!.root.findAll((node: { props: { children?: unknown } }) => node.props.children === 'Focus').length).toBeGreaterThan(0)
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => {
      disclosure!.props.onPress()
    })
    TestRenderer.act(() => {
      tree!.root.findByProps({ title: 'habits.detail.linkedGoals' }).props.onClick()
    })

    expect(tree!.root.findByProps({ testID: 'goal-linking-field' })).toBeDefined()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('restores an empty rename and returns to the selected day', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.onPress()
    })
    const input = tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' })
    TestRenderer.act(() => {
      input.props.onChangeText('   ')
    })
    await TestRenderer.act(async () => {
      input.props.onBlur()
      await Promise.resolve()
    })

    expect(tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.value).toBeUndefined()
    expect(mocks.update).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      tree!.root.findByProps({ testID: 'screen-back' }).props.onBack()
    })
    expect(mocks.routerReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)',
      params: { date: '2026-08-28' },
    })
  })

  it('moves to an older history month without the removed history note', () => {
    mocks.detail = { ...makeDetail(), createdAtUtc: '2025-01-01T12:00:00Z' }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    const previousMonth = tree!.root.findAllByType('PillButton')
      .find((node: { props: { label?: string } }) => node.props.label === 'habits.detail.previousMonth')
    TestRenderer.act(() => {
      for (let index = 0; index < 13; index += 1) previousMonth!.props.onClick()
    })

    expect(tree!.root.findAll((node: { props: { children?: unknown } }) => node.props.children === 'July 2025').length).toBeGreaterThan(0)
    expect(tree!.root.findAll((node: { props: { children?: unknown } }) => node.props.children === 'habits.detail.olderHistoryUnavailable')).toHaveLength(0)
  })

  it('pops child then parent history back to Today without duplicating the parent', () => {
    mocks.history = [
      { path: '/?date=2026-08-28', selectedDate: '2026-08-28' },
      { path: '/habits/parent-1?date=2026-08-28&from=today', selectedDate: '2026-08-28' },
      { path: '/habits/child-1?date=2026-08-28&parent=parent-1&from=today', selectedDate: '2026-08-28' },
    ]
    mocks.routerBack.mockImplementation(() => { mocks.history.pop() })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="parent-1" fromToday />,
      )
    })

    TestRenderer.act(() => tree!.root.findByProps({ testID: 'screen-back' }).props.onBack())
    expect(mocks.history.map((entry) => entry.path)).toEqual([
      '/?date=2026-08-28',
      '/habits/parent-1?date=2026-08-28&from=today',
    ])

    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="parent-1" date="2026-08-28" fromToday />)
    })
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'screen-back' }).props.onBack())

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
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(false)
    expect(tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.outcome).toBe('none')
    expect(tree!.root.findAllByProps({ testID: 'stat-habits.detail.totalCompletions' })).toHaveLength(0)

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'header-log' }).props.onPress()
      await Promise.resolve()
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(true)
    expect(tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.outcome).toBe('full')

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'header-log' }).props.onPress()
      await Promise.resolve()
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(false)
    expect(tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.outcome).toBe('none')
  })

  it('keeps a remounted offline detail aligned with the retained first intent', async () => {
    mocks.log.mockImplementation(async ({ habitId, date, intent }: {
      habitId: string
      date: string
      intent: 'log' | 'unlog'
    }) => {
      const response = await performQueuedApiMutation({
        type: 'logHabit',
        scope: 'habits',
        endpoint: `/api/habits/${habitId}/log`,
        method: 'POST',
        payload: { date },
        entityType: 'habit',
        targetEntityId: habitId,
        dedupeKey: `habit-toggle:${habitId}:${date}`,
      })
      mocks.logs = intent === 'log'
        ? [...mocks.logs, { id: 'optimistic', date, value: 1, createdAtUtc: `${date}T12:00:00Z` }]
        : mocks.logs.filter((entry) => entry.date !== date)
      return response
    })

    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => tree!.root.findByProps({ testID: 'header-log' }).props.onPress())
    await vi.waitFor(() => expect(mocks.log).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mocks.logs.some((entry) => entry.date === '2026-08-28')).toBe(true))
    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(true)

    TestRenderer.act(() => tree!.unmount())
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'header-log' }).props.onPress())
    await Promise.resolve()
    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    expect(mocks.log).toHaveBeenCalledOnce()
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(true)
    expect(getQueuedMutations()).toHaveLength(1)

    const retained = await performQueuedApiMutation({
      type: 'logHabit',
      scope: 'habits',
      endpoint: '/api/habits/habit-1/log',
      method: 'POST',
      payload: { date: '2026-08-28' },
      entityType: 'habit',
      targetEntityId: 'habit-1',
      dedupeKey: 'habit-toggle:habit-1:2026-08-28',
    })
    expect(retained).toMatchObject({ retained: true })
    expect(getQueuedMutations()).toHaveLength(1)

    offlineMocks.setOnline(true)
    await flushQueuedMutations()

    expect(offlineMocks.serverLoggedHabits).toEqual(new Set(['habit-1']))
    expect(getQueuedMutations()).toEqual([])
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.logged).toBe(true)
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

  it('announces full dates for logged and unlogged history cells and keeps the log time', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    const loggedLabel = tree!.root.findByProps({ testID: 'history-day-26-inside' }).props.accessibilityLabel
    const unloggedLabel = tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.accessibilityLabel
    const loggedTime = new Date('2026-08-26T12:00:00Z').toLocaleTimeString('en', {
      hour: 'numeric',
      minute: '2-digit',
    })
    expect(loggedLabel).toContain('Wednesday, August 26, 2026')
    expect(loggedLabel).toContain(loggedTime)
    expect(unloggedLabel).toBe('Friday, August 28, 2026')
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

  it('renames an unscoped habit without sending Pro or goal state', () => {
    mocks.hasProAccess = false
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.onPress()
    })
    const input = tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' })
    TestRenderer.act(() => {
      input.props.onChangeText('Read daily')
    })
    TestRenderer.act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.onSubmitEditing()
    })

    expect(mocks.update).toHaveBeenCalledOnce()
    const request = mocks.update.mock.calls[0]![0].data
    expect(request.title).toBe('Read daily')
    expect(request).not.toHaveProperty('slipAlertEnabled')
    expect(request).not.toHaveProperty('goalIds')
  })

  it('opens the schedule editor inline without opening the full editor', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.schedule' }).props.onClick())

    expect(tree!.root.findByProps({ accessibilityLabel: 'habits.form.frequencyRequired' })).toBeDefined()
    expect(tree!.root.findAllByType('EditHabitModal')).toHaveLength(0)
  })

  it('shows reminder offsets before schedule and edits them inline', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    const reminderRow = tree!.root.findByProps({ title: 'habits.detail.reminders' })
    expect(reminderRow.props.value).toBe('habits.detail.noValue')
    const detailRows = tree!.root.findAllByType('ListRow')
    const detailTitles = detailRows.map((row: { props: { title: string } }) => row.props.title)
    expect(detailTitles.indexOf('habits.detail.reminders')).toBeLessThan(
      detailTitles.indexOf('habits.detail.schedule'),
    )

    TestRenderer.act(() => reminderRow.props.onClick())
    const scheduled = tree!.root.findByProps({ testID: 'scheduled-reminders' })
    expect(scheduled).toBeDefined()
    TestRenderer.act(() => scheduled.props.onSetScheduledReminders([{ when: 'same_day', time: '08:00' }]))
    TestRenderer.act(() => scheduled.props.onToggleReminder())
    expect(mocks.update).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      tree!.root.findAllByType('PillButton').find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'common.save')!.props.onClick()
      await Promise.resolve()
    })
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ reminderEnabled: true, scheduledReminders: [{ when: 'same_day', time: '08:00' }] })

    mocks.detail = {
      ...makeDetail(),
      reminderEnabled: true,
      reminderTimes: [10, 30],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    }
    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(tree!.root.findByProps({ title: 'habits.detail.reminders' }).props.value).toBe('habits.form.reminder10min, habits.form.reminder30min, 08:00')
  })

  it('keeps the five content blocks in one column and discloses avoid-only fields', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const rendered = JSON.stringify(tree!.toJSON())
    const orderedLabels = [
      'Read',
      'habits.detail.lastThirtyDays',
      'habits.detail.history',
      'habits.detail.checklist',
      'habits.detail.moreDetails',
    ]
    const positions = orderedLabels.map((label) => rendered.indexOf(label))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((first, second) => first - second))
    expect(tree!.root.findAllByProps({ title: 'habits.detail.slipAlert' })).toHaveLength(0)

    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    expect(tree!.root.findByProps({ testID: 'habit-checklist' }).props).toMatchObject({ interactive: true, editable: false })
    TestRenderer.act(() => disclosure!.props.onPress())
    expect(disclosure!.props.accessibilityState).toEqual({ expanded: true })
    expect(tree!.root.findByProps({ testID: 'habit-checklist' }).props).toMatchObject({ interactive: false, editable: true })
    TestRenderer.act(() => disclosure!.props.onPress())

    mocks.detail = { ...makeDetail(), isBadHabit: true }
    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const closedDisclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => closedDisclosure!.props.onPress())
    expect(tree!.root.findByProps({ title: 'habits.detail.slipAlert' })).toBeDefined()
  })

  it('persists each inline detail editor through its dedicated patch', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00', description: 'Old note', endDate: '2026-09-30' }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => disclosure!.props.onPress())

    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.linkedGoals' }).props.onClick())
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'goal-linking-field' }).props.onToggleGoal('goal-2'))
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ goalIds: ['goal-2'] })
    mocks.update.mockClear()

    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.reminders' }).props.onClick())
    const reminders = tree!.root.findByProps({ testID: 'offset-reminders' })
    TestRenderer.act(() => reminders.props.onReminderTimesChange([30]))
    TestRenderer.act(() => reminders.props.onToggleReminder())
    expect(mocks.update).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      tree!.root.findAllByType('PillButton').find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'common.save')!.props.onClick()
      await Promise.resolve()
    })
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ reminderEnabled: true, reminderTimes: [30] })

    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.schedule' }).props.onClick())
    TestRenderer.act(() => tree!.root.findByProps({ accessibilityLabel: 'habits.form.frequencyRequired' }).props.onChangeText('3'))
    await TestRenderer.act(async () => {
      tree!.root.findAllByType('PillButton').find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'common.save')!.props.onClick()
      await Promise.resolve()
    })
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 3 })

    for (const [title, value, expected] of [
      ['habits.detail.time', ' 10:15 ', { dueTime: '10:15' }],
      ['habits.detail.description', ' Better note ', { description: 'Better note' }],
      ['habits.detail.endDate', ' ', { endDate: null }],
    ] as const) {
      TestRenderer.act(() => tree!.root.findByProps({ title }).props.onClick())
      TestRenderer.act(() => tree!.root.findAllByType('TextInput')[0]!.props.onChangeText(value))
      await TestRenderer.act(async () => {
        tree!.root.findAllByType('PillButton').find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'common.save')!.props.onClick()
        await Promise.resolve()
      })
      expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject(expected)
    }
  })

  it('validates reminder drafts before mutation', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.reminders' }).props.onClick())
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'scheduled-reminders' }).props.onToggleReminder())
    TestRenderer.act(() => tree!.root.findAllByType('PillButton').find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'common.save')!.props.onClick())

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.reminderMinimumOne')

    TestRenderer.act(() => tree!.root.findByProps({ testID: 'scheduled-reminders' }).props.onSetScheduledReminders([{ when: 'same_day', time: '08:00' }]))
    await TestRenderer.act(async () => {
      tree!.root.findAllByType('PillButton').find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'common.save')!.props.onClick()
      await Promise.resolve()
    })
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
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.reminders' }).props.onClick())

    expect(tree!.root.findByProps({ testID: 'offset-reminders' })).toBeDefined()
    const scheduled = tree!.root.findByProps({ testID: 'scheduled-reminders' })
    TestRenderer.act(() => scheduled.props.onRemoveScheduledReminders())
    await TestRenderer.act(async () => {
      tree!.root.findAllByType('PillButton').find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'common.save')!.props.onClick()
      await Promise.resolve()
    })
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [],
    })
  })

  it('sends slip alert state only from the explicit switch action', () => {
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    expect(tree!.root.findByProps({ title: 'habits.detail.slipAlert' }).props.description).toBe('habits.detail.slipAlertDescription')
    const slipAlert = tree!.root.findByProps({ testID: 'slip-alert-switch' })
    TestRenderer.act(() => slipAlert.props.onChange(true))

    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ slipAlertEnabled: true })
    expect(mocks.update.mock.calls[0]![0].data).not.toHaveProperty('goalIds')
  })

  it('keeps the title editor open and reports an update failure', async () => {
    mocks.update.mockRejectedValueOnce(new Error('update failed'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.onPress()
    })
    TestRenderer.act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.onChangeText('Read daily')
    })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.onSubmitEditing()
      await Promise.resolve()
    })

    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.updateError')
    expect(tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' }).props.value).toBe('Read daily')
  })

  it('contains and reports a log failure', async () => {
    mocks.log.mockRejectedValueOnce(new Error('log failed'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'header-log' }).props.onPress()
      await Promise.resolve()
    })

    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.logError')
  })

  it('contains and reports a checklist failure', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockRejectedValueOnce(new Error('checklist failed'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'habit-checklist' }).props.onToggle(0)
      await Promise.resolve()
    })

    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.checklistError')
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.checklistCompleteTitle' })).toHaveLength(0)
  })

  it('offers to log the habit after its last checklist item is completed', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    mocks.log.mockResolvedValueOnce(undefined)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'habit-checklist' }).props.onToggle(0)
      await Promise.resolve()
    })

    expect(mocks.checklist).toHaveBeenCalledWith({
      habitId: 'habit-1',
      items: [{ text: 'First', isChecked: true }],
    })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.checklistCompleteTitle' }).props.onConfirm()
      await Promise.resolve()
    })

    expect(mocks.log).toHaveBeenCalledWith({
      habitId: 'habit-1',
      date: '2026-08-28',
      intent: 'log',
    })
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.checklistCompleteTitle' })).toHaveLength(0)
  })

  it('clears a checklist only after confirmation', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ testID: 'habit-checklist' }).props.onClear()
    })
    expect(mocks.checklist).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.checklistClearTitle' }).props.onConfirm()
      await Promise.resolve()
    })

    expect(mocks.checklist).toHaveBeenCalledOnce()
    expect(mocks.checklist).toHaveBeenCalledWith({ habitId: 'habit-1', items: [] })
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.checklistClearTitle' })).toHaveLength(0)
  })

  it('deletes a sub habit without leaving the parent detail', async () => {
    mocks.deleteHabit.mockResolvedValueOnce(undefined)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onDelete()
    })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.deleteConfirmTitle' }).props.onConfirm()
      await Promise.resolve()
    })

    expect(mocks.deleteHabit).toHaveBeenCalledWith('child-1')
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.deleteConfirmTitle' })).toHaveLength(0)
    expect(mocks.routerReplace).not.toHaveBeenCalled()
  })

  it('deletes the habit and returns to the selected day', async () => {
    mocks.deleteHabit.mockResolvedValueOnce(undefined)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ title: 'habits.detail.delete' }).props.onClick()
    })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.deleteConfirmTitle' }).props.onConfirm()
      await Promise.resolve()
    })

    expect(mocks.deleteHabit).toHaveBeenCalledWith('habit-1')
    expect(mocks.routerReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)',
      params: { date: '2026-08-28' },
    })
  })

  it('puts the grounded Astra seed in the persistent composer', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    expect(useChatStore.getState().contextualSuggestion).toEqual({
      id: 'habit-habit-1',
      label: 'habits.detail.askAstra',
      prompt: 'habits.detail.askAstraSeedDefault:{"title":"Read"}',
    })
    expect(tree!.root.findAllByProps({ title: 'habits.detail.askAstra' })).toHaveLength(0)
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
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-29" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean } } }) => node.props.accessibilityState?.expanded === false)[0]
    TestRenderer.act(() => disclosure!.props.onPress())

    expect(tree!.root.findByProps({ title: 'habits.detail.linkedGoals' }).props.value).toBe('10')
    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.linkedGoals' }).props.onClick())
    const goalField = tree!.root.findByProps({ testID: 'goal-linking-field' })
    expect(goalField.props.atGoalLimit).toBe(true)
    TestRenderer.act(() => goalField.props.onToggleGoal())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      goalIds: linkedGoals.slice(1).map((goal) => goal.id),
    })

    const slipAlert = tree!.root.findByProps({ testID: 'slip-alert-switch' })
    expect(slipAlert.props.checked).toBe(true)
    TestRenderer.act(() => slipAlert.props.onChange(false))
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ slipAlertEnabled: false })
  })

  it('restores the parent Astra suggestion after leaving a child detail', () => {
    let parentTree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      parentTree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const parentFocus = mocks.focusEffect
    if (!parentFocus) throw new Error('Expected parent focus effect')

    mocks.detail = { ...makeDetail(), id: 'child-1', title: 'Child' }
    let childTree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      childTree = TestRenderer.create(<HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="habit-1" />)
    })
    expect(useChatStore.getState().contextualSuggestion?.id).toBe('habit-child-1')

    TestRenderer.act(() => childTree!.unmount())
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
    TestRenderer.act(() => { parentFocus() })
    expect(useChatStore.getState().contextualSuggestion?.id).toBe('habit-habit-1')
    parentTree!.unmount()
  })

  it('sends free users from the slipping block to upgrade', () => {
    mocks.hasProAccess = false
    mocks.logs = []
    mocks.metrics = { ...mocks.metrics, currentStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 40, lastCompletedDate: '2026-08-20' }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ title: 'habits.detail.slipping' }).props.onClick()
    })

    expect(mocks.routerPush).toHaveBeenCalledWith('/upgrade')
  })

  it('keeps delete confirmation open and reports a delete failure', async () => {
    mocks.deleteHabit.mockRejectedValueOnce(new Error('delete failed'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    TestRenderer.act(() => {
      tree!.root.findByProps({ title: 'habits.detail.delete' }).props.onClick()
    })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.deleteConfirmTitle' }).props.onConfirm()
      await Promise.resolve()
    })

    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.deleteError')
    expect(tree!.root.findByProps({ testID: 'confirm-habits.deleteConfirmTitle' })).toBeDefined()
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
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const accept = tree!.root.findAllByType('PillButton')
      .find((node: { props: { children?: React.ReactNode } }) => node.props.children === 'habits.detail.rescheduleAccept')

    await TestRenderer.act(async () => {
      accept!.props.onClick()
      await Promise.resolve()
    })

    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.rescheduleWriteError')
    expect(accept).toBeDefined()
  })
})
