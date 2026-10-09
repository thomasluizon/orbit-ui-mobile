import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { expandedTextControls, pressTextControl, expectPersonalTextLayout } from '@/__tests__/support/personal-text'
import { PersonalText } from '@/components/ui/personal-text'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { queryClient, restoreQueryCache, setQueryCacheScope, QUERY_CACHE_VERSION } from '@/lib/query-client'
import { AccessibilityInfo, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native'
import { __setWindowDimensions } from '../../../test-mocks/react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClientError, formatAPIDate, formatLocaleDateTime, isHabitSlipping, normalizeHabitQueryData } from '@orbit/shared/utils'
import type { Time24 } from '@orbit/shared/contracts/forms'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import {
  makeHabitDetail as makeDetail,
  makeHabitScheduleItem,
  makeTaggedNestedHabitScheduleItem,
  makeHabitDetailScopedChild as makeScopedChild,
  makeHabitDetailScopedParent as makeScopedParent,
  makeLoggedGeneralHabitDetailChild as makeLoggedGeneralChild,
} from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit, RescheduleSuggestion } from '@orbit/shared/types/habit'
import { StatusRing } from '@/components/ui/status-ring'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { flushQueuedMutations } from '@/lib/offline-mutations'
import { clear as clearOfflineQueue, getAll as getQueuedMutations } from '@/lib/offline-queue'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { expectPressPaint } from '@/__tests__/support/press-feedback'
import { createTokensV2 } from '@/lib/theme'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const TestRenderer = require('react-test-renderer')

interface TestNode {
  type: unknown
  props: { [key: string]: unknown; children?: unknown; onClick?: () => void }
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  findAllByType: (type: string) => TestNode[]
}

function viewStyle(node: TestNode): ViewStyle {
  return StyleSheet.flatten(node.props.style ?? {})
}

function textsOf(root: TestNode): string[] {
  return root.findAll((node) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' || node.type === 'PillButton')
    .map((node) => [node.props.children].flat().filter((part) => typeof part === 'string').join(''))
}

function findPillButton(root: TestNode, label: string): TestNode | undefined {
  return root.findAllByType('PillButton').find((node) => node.props.children === label)
}

function pressPillButton(root: TestNode, label: string) {
  const onClick = findPillButton(root, label)?.props.onClick
  if (!onClick) throw new Error(`Button not found: ${label}`)
  onClick()
}

function isRescueProposal(node: TestNode): boolean {
  return node.props.label === 'habits.form.proposedByAstra'
}

function openRescueGate() {
  mocks.logs = []
  mocks.metrics = { ...mocks.metrics, currentStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 40, lastCompletedDate: '2026-08-20' }
  mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: true }]])
}

const mocks = vi.hoisted(() => ({
  screenFocused: true,
  realTimeField: false,
  realReminderSections: false,
  realHeaderRing: false,
  logs: [] as HabitLog[],
  metrics: {} as HabitMetrics,
  metricsError: false,
  realMetrics: false,
  getStorage: vi.fn(),
  removeStorage: vi.fn(),
  detail: null as HabitDetail | null,
  detailLoading: false,
  detailError: false,
  refetch: vi.fn(),
  allHabitsError: false,
  allHabitsRefetch: vi.fn(),
  scopedLoading: false,
  scopedError: false,
  scopedRefetch: vi.fn(),
  scopedCompleteDay: false,
  allHabits: new Map<string, NormalizedHabit>(),
  scopedHabits: new Map<string, NormalizedHabit>(),
  scopedHabitsByDate: new Map<string, Map<string, NormalizedHabit>>(),
  scopedRequests: [] as { dateFrom: string; includeOverdue: boolean }[],
  log: vi.fn(),
  update: vi.fn(),
  updatePending: false,
  checklist: vi.fn(),
  deleteHabit: vi.fn(),
  showError: vi.fn(),
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  setStorage: vi.fn(),
  history: [] as { path: string; selectedDate: string }[],
  hasProAccess: true,
  timeZone: 'UTC',
  profileReady: true,
  focusEffect: null as null | (() => void | (() => void)),
  suggestion: null as RescheduleSuggestion | null,
  rescheduleOptions: [] as { enabled: boolean }[],
  rescheduleError: null as Error | null,
  rescheduleRefetch: vi.fn(),
  language: 'en',
  uses24HourClock: undefined as boolean | undefined,
  reducedMotion: false,
  realPressTokens: false,
  realHabitRows: false,
  realListRows: false,
  theme: 'dark',
}))

vi.mock('@/lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/motion')>()),
  usePrefersReducedMotion: () => mocks.reducedMotion,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'habits.detail.slippingLine') return `${key}:${values?.days}:${values?.streak}:${values?.limit}`
      if (key === 'habits.detail.loggedAt') return `${values?.date}, logged at ${values?.time}`
      if (key === 'habits.detail.logDateConfirmMessage') return `${values?.date}: ${values?.name}`
      if (key === 'habits.detail.logDateConfirmUnlogMessage') return `Undo ${values?.name}: ${values?.date}`
      if (key === 'habits.detail.askAstraSeedDefault') return `${key}:${JSON.stringify({ title: values?.title })}`
      if (key === 'habits.detail.calendarLabel') return `Atividade do hábito em ${values?.month}`
      return key
    },
    i18n: { language: mocks.language },
  }),
}))
vi.mock('expo-router', () => ({
  useIsFocused: () => mocks.screenFocused,
  useRouter: () => ({ back: mocks.routerBack, push: mocks.routerPush, replace: mocks.routerReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    mocks.focusEffect = callback
    React.useEffect(callback, [callback])
  },
}))
vi.mock('@/hooks/use-habit-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-habit-queries')>()
  return {
    useHabitDetail: () => ({ data: mocks.detail, isLoading: mocks.detailLoading, isError: mocks.detailError, refetch: mocks.refetch }),
    useHabitLogs: () => ({ data: mocks.logs }),
    useHabitMetrics: (id: string) => mocks.realMetrics ? actual.useHabitMetrics(id) : ({ data: mocks.metrics, isLoading: false, isError: mocks.metricsError }),
    useHabits: (filters: { dateFrom?: string; includeOverdue?: boolean }, options?: { completeDay?: boolean }) => {
      if (filters.dateFrom) {
        mocks.scopedCompleteDay = options?.completeDay ?? false
        mocks.scopedRequests.push({ dateFrom: filters.dateFrom, includeOverdue: filters.includeOverdue === true })
      }
      return { data: filters.dateFrom && mocks.scopedLoading ? undefined : { habitsById: filters.dateFrom ? mocks.scopedHabitsByDate.get(filters.dateFrom) ?? mocks.scopedHabits : mocks.allHabits, topLevelHabits: [] }, isLoading: !!filters.dateFrom && mocks.scopedLoading, isError: filters.dateFrom ? mocks.scopedError : mocks.allHabitsError, refetch: filters.dateFrom ? mocks.scopedRefetch : mocks.allHabitsRefetch }
    },
  }
})
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: mocks.log, mutateAsync: mocks.log }),
  useUpdateHabit: () => ({ mutate: mocks.update, mutateAsync: mocks.update, isPending: mocks.updatePending }),
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

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: true, user: { userId: 'account-a' } }), subscribe: () => () => {} },
}))

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
      if (sql === 'DELETE FROM mutation_queue' || sql.startsWith('DELETE FROM mutation_queue WHERE account_id IS ?')) {
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

vi.mock('@/lib/api-client', () => ({ apiClient: (endpoint: string) => mocks.realMetrics && endpoint.endsWith('/metrics') ? Promise.reject(new Error('metrics request failed')) : offlineMocks.apiClient(endpoint) }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: mocks.setStorage, getItem: mocks.getStorage, removeItem: mocks.removeStorage },
}))
vi.mock('@/lib/offline-runtime', () => ({
  getCurrentConnectivity: () => Promise.resolve(offlineMocks.isOnline()),
}))
vi.mock('@/lib/query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/query-client')>()),
  persistQueryCache: () => Promise.resolve(),
}))
vi.mock('@/lib/offline-state', () => ({
  clearOfflineEntity: () => Promise.resolve(),
  getResolvedEntityId: (_entityType: string, id: string) => Promise.resolve(id),
  markOfflineTombstone: () => Promise.resolve(),
  resolveOfflineEntity: () => Promise.resolve(),
  setOfflineEntityStatus: () => Promise.resolve(),
  upsertOfflineEntity: () => Promise.resolve(),
}))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mocks.profileReady ? {
      aiMessagesLimit: 20,
      aiMessagesUsed: 0,
      hasProAccess: mocks.hasProAccess,
      language: mocks.language,
      uses24HourClock: mocks.uses24HourClock,
      weekStartDay: 1,
      timeZone: mocks.timeZone,
    } : undefined,
  }),
}))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({
  useRescheduleSuggestion: (options: { enabled: boolean }) => {
    mocks.rescheduleOptions.push(options)
    return { suggestion: mocks.suggestion, error: mocks.rescheduleError, refetch: mocks.rescheduleRefetch }
  },
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: (...args: Parameters<typeof actual.createTokensV2>) => mocks.realPressTokens ? actual.createTokensV2(...args) : new Proxy({}, { get: () => '#111111' }),
  }
})
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: mocks.theme, surfaces: { screen: { backgroundColor: '#111111' } } }),
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: ({ size, color }: { size: number; color?: string }) => React.createElement('AstraGlyph', { size, color }) }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, title, message, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) => open
    ? React.createElement('ConfirmSheet', { testID: `confirm-${title}`, title, message, confirmLabel, onConfirm, onCancel })
    : null,
}))
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ message, action }: { message: string; action: React.ReactNode }) => React.createElement('ErrorState', { testID: 'load-error', message }, action),
}))
vi.mock('@/components/ui/proposed', () => ({ Proposed: ({ children, label }: { children: React.ReactNode; label: string }) => React.createElement('Proposed', { label }, children) }))
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ label }: { label: string }) => React.createElement('Skeleton', { label }),
}))
vi.mock('@/components/ui/switch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/ui/switch')>(),
  Switch: ({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) => React.createElement('Switch', { testID: label === 'habits.detail.slipAlert' ? 'slip-alert-switch' : label, checked, onChange }),
}))
vi.mock('@/components/ui/time-field', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/time-field')>()
  return ({
  TimeField: ({ label, value, onChange, onClear, commitTypedClearOnBlur }: React.ComponentProps<typeof actual.TimeField>) => mocks.realTimeField ? <actual.TimeField commitTypedClearOnBlur={commitTypedClearOnBlur} label={label} value={value} onChange={onChange} onClear={onClear} /> : React.createElement('TextInput', {
    accessibilityLabel: label,
    value,
    onChangeText: (next: string) => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next)) onChange(next as Time24) },
    onClear,
  }),
})
})
vi.mock('@/components/ui/list-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/list-row')>()
  return ({
  ListRow: (props: React.ComponentProps<typeof import('@/components/ui/list-row')['ListRow']>) => {
    if (mocks.realListRows) return <actual.ListRow {...props} />
    const { title, description, value, trailing, chevron, onClick, icon, expanded, controls, toggle } = props
    return title === 'habits.detail.askAstra' ? <actual.ListRow title={title} placement="column" onClick={onClick} /> : React.createElement('ListRow', { title, description, value, chevron, onClick, icon: typeof icon === 'string' ? icon : undefined, expanded, controls, toggle },
    toggle ? React.createElement('Switch', { testID: title === 'habits.detail.slipAlert' ? 'slip-alert-switch' : title, label: title, checked: toggle.checked, onChange: toggle.onChange }, React.createElement('Text', {}, title)) : onClick ? React.createElement('Pressable', { accessibilityRole: 'button', accessibilityLabel: title, accessibilityState: { expanded }, onPress: onClick }, React.createElement('Text', {}, title)) : null,
    trailing)
  },
})
})
vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, disabled, label, variant, size, loading, onClick, accessibilityRole }: { children?: React.ReactNode; disabled?: boolean; label?: string; variant?: string; size?: string; loading?: boolean; onClick?: () => void; accessibilityRole?: 'button' | 'link' }) => React.createElement('PillButton', { disabled, label, variant, size, loading, onClick, accessibilityRole }, children),
}))
vi.mock('@/components/ui/stat-tile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/stat-tile')>()),
  StatTile: ({ label, value }: { label: string; value: string }) => React.createElement('StatTile', { testID: `stat-${label}`, value }),
}))
vi.mock('@/components/dates/day-cell', () => ({
  DayCell: ({ day, done, scheduled, outsideMonth, label }: { day: number; done?: number; scheduled?: number; outsideMonth: boolean; label: string }) => {
    const outcome = scheduled === 0 ? 'not-scheduled' : done !== undefined && scheduled !== undefined && done >= scheduled ? 'full' : 'none'
    return React.createElement('DayCell', { testID: `history-day-${day}-${outsideMonth ? 'outside' : 'inside'}`, outcome, accessibilityLabel: label })
  },
}))
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: ({ size, days }: { size: number; days: string[] }) => React.createElement('DayStrip', { testID: 'detail-strip', size, dayCount: days.length }) }))
vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children, label }: { children: React.ReactNode; label: string }) => React.createElement('MonthGrid', { label }, children),
}))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: ({ open }: { open: boolean }) => open ? React.createElement('CreateHabitModal', { testID: 'create-sub-habit' }) : null }))
vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: ({ selectedGoalIds, atGoalLimit, onToggleGoal }: { selectedGoalIds: string[]; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }) => React.createElement('GoalLinkingField', { testID: 'goal-linking-field', atGoalLimit, onToggleGoal: () => onToggleGoal(atGoalLimit ? selectedGoalIds[0]! : 'goal-2') }),
}))
vi.mock('@/hooks/use-reminder-permission', () => ({
  useReminderPermission: (_enabled: boolean, onToggleReminder: () => void) => ({ toggleReminder: onToggleReminder, showNotice: false, openSettings: vi.fn() }),
}))
vi.mock('@/components/habits/habit-form-fields/reminder-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-form-fields/reminder-section')>()
  const mockSection = ({ children, onReminderTimesChange, onToggleReminder }: { children?: React.ReactNode; onReminderTimesChange: (offsets: number[]) => void; onToggleReminder: () => void }) => React.createElement('ReminderSection', { testID: 'offset-reminders', onReminderTimesChange, onToggleReminder }, children)
  return {
    ReminderSection: (props: React.ComponentProps<typeof actual.ReminderSection>) => mocks.realReminderSections ? <actual.ReminderSection {...props} /> : mockSection(props),
  }
})
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-form-fields/scheduled-reminder-section')>()
  const mockSection = ({ onSetScheduledReminders, onToggleReminder }: { onSetScheduledReminders: (scheduled: { when: 'same_day'; time: string }[]) => void; onToggleReminder: () => void }) => React.createElement('ScheduledReminderSection', { testID: 'scheduled-reminders', onSetScheduledReminders, onRemoveScheduledReminders: () => onSetScheduledReminders([]), onToggleReminder })
  return {
    ScheduledReminderSection: (props: React.ComponentProps<typeof actual.ScheduledReminderSection>) => mocks.realReminderSections ? <actual.ScheduledReminderSection {...props} /> : mockSection(props),
  }
})
vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ interactive, editable, onToggle, onClear }: { interactive: boolean; editable: boolean; onToggle: (index: number) => void; onClear: () => void }) => React.createElement('HabitChecklist', { testID: 'habit-checklist', interactive, editable, onToggle, onClear }),
}))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))
vi.mock('@/components/habits/habit-form-fields/styles', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/components/habits/habit-form-fields/styles')>()), createStyles: () => ({}) }))
vi.mock('@/components/habits/habit-log-button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-log-button')>()
  return {
    HabitLogButton: (props: React.ComponentProps<typeof actual.HabitLogButton>) => mocks.realHeaderRing
      ? <actual.HabitLogButton {...props} />
      : React.createElement('HabitLogButton', { testID: 'header-log', ...props }),
  }
})
vi.mock('@/components/habits/habit-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-row')>()
  const mockRow = ({ habit, selectedDate, today, completionReadOnly, completionReason, completionStatusUnavailable, actions }: { habit: NormalizedHabit; selectedDate: Date; today: string; completionReadOnly: boolean; completionReason?: string; completionStatusUnavailable?: boolean; actions: { onLog: () => void; onUnlog: () => void; onDetail: () => void } }) => React.createElement('HabitRow', {
    testID: `child-${habit.id}`,
    state: habit.isCompleted ? 'done' : 'empty',
    action: habit.isCompleted ? 'unlog' : 'log',
    selectedDate: formatAPIDate(selectedDate),
    today,
    completionReadOnly,
    completionReason,
    completionStatusUnavailable,
    actions,
  })
  return { HabitRow: (props: Parameters<typeof mockRow>[0]) => mocks.realHabitRows ? <actual.HabitRow {...props} /> : mockRow(props) }
})

describe('HabitDetailScreen', () => {
  it('keeps child progress in an unlogged bad habit parent header', () => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    mocks.allHabits = normalizeHabitQueryData([makeHabitScheduleItem({ isBadHabit: true })]).habitsById
    mocks.scopedHabits = new Map([
      ['habit-1', { ...makeScopedParent(), isBadHabit: true }],
      ['child-1', makeScopedChild('2026-08-28')],
    ])
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    expect(header.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(100)
    expect(header.findAllByType(StatusRing)).toHaveLength(0)
  })

  it('shows empty, overdue and done status in the leaf header', () => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.detail = { ...makeDetail(), children: [] }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const header = () => tree.root.findByProps({ testID: 'habit-detail-header-row' })
    expect(header().findByType(StatusRing).props.status).toBe('empty')
    expect(header().findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0)

    mocks.scopedHabits.set('habit-1', { ...makeScopedParent(), isOverdue: true })
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    expect(header().findByType(StatusRing).props.status).toBe('overdue')

    mocks.logs = [{ id: 'selected', date: '2026-08-28', value: 1, createdAtUtc: '2026-08-28T12:00:00Z' }]
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    expect(header().findByType(StatusRing).props.status).toBe('done')
  })

  it.each(['absent', 'irrelevant'])('excludes a %s not-scheduled child from the header fraction', (state) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    const child = makeDetail().children[0]!
    mocks.detail = { ...makeDetail(), children: [child, { ...child, id: 'child-2' }] }
    mocks.scopedHabits = new Map([['child-1', makeScopedChild('2026-08-28')]])
    if (state === 'irrelevant') mocks.scopedHabits.set('child-2', {
      ...makeScopedChild('2026-08-29'), id: 'child-2', isLoggedInRange: false, instances: [],
    })
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    expect(header.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(100)
    expect(header.findAllByType(StatusRing)).toHaveLength(0)
  })

  it.each(['loading', 'error'])('shows a status ring while selected day children are %s', (state) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.scopedLoading = state === 'loading'
    mocks.scopedError = state === 'error'
    mocks.scopedHabits = new Map([['child-1', makeScopedChild('2026-08-28')]])
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    expect(header.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0)
    expect(header.findByType(StatusRing).props.status).toBe('empty')
  })

  it.each(['absent', 'irrelevant'])('shows a status ring when all selected day children are %s', (state) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.scopedHabits = new Map()
    if (state === 'irrelevant') mocks.scopedHabits.set('child-1', {
      ...makeScopedChild('2026-08-29'), isLoggedInRange: false, instances: [],
    })
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    expect(header.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0)
    expect(header.findByType(StatusRing).props.status).toBe('empty')
  })

  it.each([0, 1, 2])('shows the selected day fraction for an unlogged parent with %i children done', (done) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    const child = makeDetail().children[0]!
    mocks.detail = { ...makeDetail(), children: [child, { ...child, id: 'child-2' }] }
    mocks.scopedHabits = new Map(mocks.detail.children.map((entry, index) => [entry.id, {
      ...makeScopedChild('2026-08-28'), id: entry.id,
      isLoggedInRange: index < done,
      instances: index < done ? [{ date: '2026-08-28', status: 'Completed', logId: entry.id }] : [],
    }]))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    const ring = header.findByProps({ accessibilityRole: 'progressbar' })
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: done * 50 })
    expect(header.findAllByType(StatusRing)).toHaveLength(0)
    TestRenderer.act(() => { ring.props.onLayout() })
    const paintedCircles = ring.findAllByType('Circle').filter((circle: TestNode) => circle.props.opacity !== 0)
    expect(paintedCircles).toHaveLength(done === 0 ? 1 : 2)

    mocks.logs = [{ id: 'selected', date: '2026-08-28', value: 1, createdAtUtc: '2026-08-28T12:00:00Z' }]
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    expect(header.findByType(StatusRing).props.status).toBe('done')
    expect(header.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0)
  })

  it.each([320, 412, 1280])('shows the full habit title below the controls without a line limit at %s', (width) => {
    __setWindowDimensions({ width, height: 892, scale: 1, fontScale: 1 })
    const title = 'Read a long chapter and discuss the details with the reading group '.repeat(3)
    mocks.detail = { ...makeDetail(), title }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const target = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === title)[0]!
    const visibleTitle = tree.root.findAllByType(PersonalText).find((node: TestNode) => node.props.unclamped && node.props.children === title)!.findAll((node: TestNode) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.children === title)[0]!
    expect(visibleTitle.props.numberOfLines).toBe(1)
    expect(target.findAllByType('ScrollView')).toHaveLength(0)
    const titleStyle = StyleSheet.flatten(visibleTitle.props.style as { fontSize: number; lineHeight: number })
    expect(titleStyle.lineHeight / titleStyle.fontSize).toBeGreaterThanOrEqual(1.4)
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    const copy = header.findAll((node: TestNode) => node.type === 'View' && viewStyle(node).width === '100%')[0]!
    expect(copy.findAll((node: TestNode) => node === visibleTitle)).toHaveLength(1)
    expect(StyleSheet.flatten(header.props.style)).toEqual({ gap: 12 })
    expect(StyleSheet.flatten(copy.props.style)).toEqual({ width: '100%', minWidth: 0, gap: 4 })
    const views = header.findAll((node: TestNode) => node.type === 'View')
    const controls = views.find((node: TestNode) => viewStyle(node).flexDirection === 'row')!
    expect(views.indexOf(controls)).toBeLessThan(views.indexOf(copy))
    expect(controls.findAllByType('HabitLogButton')).toHaveLength(1)
    expect(controls.findAllByType('PillButton').map((node: TestNode) => node.props.label)).toContain('habits.detail.rename')
    expect(controls.findAll((node: TestNode) => node === visibleTitle)).toHaveLength(0)
    expect(copy.findAll((node: TestNode) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.numberOfLines === 1)).toHaveLength(2)
  })

  it.each(['ready', 'loading', 'error'])('keeps a leaf creation row without an empty inside section when day habits are %s', (state) => {
    mocks.detail = { ...makeDetail(), children: [] }
    mocks.scopedLoading = state === 'loading'
    mocks.scopedError = state === 'error'
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const labels = tree.root.findAllByType('Text').map((node: { props: { children?: string } }) => node.props.children)
    expect(labels).not.toContain('habits.detail.inside')
    expect(labels).not.toContain('habits.detail.dayHabitsLoading')
    expect(labels).not.toContain('habits.detail.dayHabitsLoadError')
    expect(tree.root.findAllByProps({ testID: 'detail-children' })).toHaveLength(0)
    TestRenderer.act(() => { tree.root.findByProps({ title: 'habits.detail.addSubHabit' }).props.onClick() })
    expect(tree.root.findByProps({ testID: 'create-sub-habit' })).toBeDefined()
  })

  it.each(['light', 'dark'] as const)('keeps detail child monograms readable through the complete %s paint stack', (mode) => {
    mocks.realPressTokens = true
    mocks.realHabitRows = true
    mocks.theme = mode
    const tokens = createTokensV2('purple', mode)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ backgroundColor: tokens.bg }}><HabitDetailScreen habitId="habit-1" /></View>) })
    const group = tree.root.findByProps({ testID: 'detail-children' })
    const row = group.findByProps({ testID: 'habit-row' })
    const body = () => row.findAll((node: TestNode) => node.type === 'Pressable' && typeof node.props.onPressIn === 'function')[0]!
    const measure = (pressed: boolean) => {
      const monogram = row.findAll((node: TestNode) => node.type === 'Text' && node.props.children === 'R')[0]!
      const well = row.findAll((node: TestNode) => node.type === 'View' && node.props.accessibilityElementsHidden === true)[0]!
      const style = body().props.style as (state: { pressed: boolean }) => ViewStyle[]
      return {
        color: StyleSheet.flatten(monogram.props.style as TextStyle).color as string,
        layers: [
          StyleSheet.flatten(tree.root.findAllByType('View')[0]!.props.style).backgroundColor,
          StyleSheet.flatten(group.props.style as ViewStyle).backgroundColor,
          StyleSheet.flatten(row.props.style as ViewStyle).backgroundColor,
          StyleSheet.flatten(style({ pressed })).backgroundColor ?? 'transparent',
          StyleSheet.flatten(well.props.style as ViewStyle).backgroundColor,
        ].filter((color): color is string => typeof color === 'string' && color !== 'transparent'),
      }
    }
    const resting = measure(false)
    expect(contrastOnSurface(resting.color, resting.layers)).toBeGreaterThanOrEqual(4.5)
    TestRenderer.act(() => { (body().props.onPressIn as () => void)() })
    const pressed = measure(true)
    expect(contrastOnSurface(pressed.color, pressed.layers)).toBeGreaterThanOrEqual(4.5)
    expect(pressed.color).toBe(tokens.fg2)
    TestRenderer.act(() => { (body().props.onPressOut as () => void)() })
    expect(measure(false)).toEqual(resting)
    TestRenderer.act(() => { tree.update(<></>) })
  })

  it('groups a parent label, populated child card and creation row without empty status text', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const section = tree.root.findByProps({ testID: 'detail-children' }).parent
    expect(section.findByProps({ testID: 'child-child-1' })).toBeDefined()
    expect(section.findByProps({ title: 'habits.detail.addSubHabit' })).toBeDefined()
    const labels = section.findAllByType('Text').map((node: { props: { children?: string } }) => node.props.children)
    expect(labels).toContain('habits.detail.inside')
    expect(labels).not.toContain('')
  })

  it('exposes the habit name as the page header instead of the navigation title', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const pageHeaders = tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; accessibilityLabel?: string; children?: React.ReactNode } }) =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === 'header' &&
      (node.props.children === mocks.detail!.title || node.props.children === 'habits.detail.screenTitle'))
    expect(pageHeaders).toHaveLength(1)
    expect(pageHeaders[0]!.props.children).toBe(mocks.detail!.title)
    TestRenderer.act(() => { tree.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === mocks.detail!.title)[0]!.props.onPress() })
    const editingHeaders = tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; children?: React.ReactNode } }) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.children === mocks.detail!.title)
    expect(editingHeaders).toHaveLength(1)
  })
  beforeEach(() => {
    mocks.realHeaderRing = false
    mocks.reducedMotion = false
    mocks.realPressTokens = false
    mocks.realListRows = false
    mocks.realHabitRows = false
    mocks.theme = 'dark'
    mocks.metricsError = false
    mocks.realMetrics = false
    mocks.getStorage.mockReset().mockResolvedValue(null)
    mocks.removeStorage.mockReset().mockResolvedValue(undefined)
    queryClient.clear()
    mocks.realTimeField = false;
    mocks.realReminderSections = false;
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 12))
    clearOfflineQueue()
    offlineMocks.serverLoggedHabits.clear()
    offlineMocks.setOnline(false)
    mocks.detail = makeDetail()
    mocks.detailLoading = false
    mocks.detailError = false
    mocks.allHabitsError = false
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
    mocks.scopedHabitsByDate = new Map()
    mocks.scopedRequests = []
    mocks.log.mockReset()
    mocks.update.mockReset()
    mocks.updatePending = false
    mocks.screenFocused = true
    mocks.checklist.mockReset()
    mocks.deleteHabit.mockReset()
    mocks.showError.mockReset()
    mocks.refetch.mockReset()
    mocks.allHabitsRefetch.mockReset()
    mocks.scopedLoading = false
    mocks.scopedError = false
    mocks.scopedRefetch.mockReset()
    mocks.routerBack.mockReset()
    mocks.routerPush.mockReset()
    mocks.routerReplace.mockReset()
    mocks.setStorage.mockReset()
    mocks.setStorage.mockResolvedValue(undefined)
    mocks.history = []
    mocks.hasProAccess = true
    mocks.timeZone = 'UTC'
    mocks.profileReady = true
    mocks.scopedCompleteDay = false
    mocks.suggestion = null
    mocks.rescheduleOptions = []
    mocks.rescheduleError = null
    mocks.rescheduleRefetch.mockReset()
    mocks.language = 'en'
    mocks.uses24HourClock = undefined
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
  })

  it.each(['valid', 'malformed'])('shows no data on a metrics error with %s cached values', (cached) => {
    if (cached === 'malformed') mocks.metrics = {} as HabitMetrics
    mocks.metricsError = true
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(textsOf(tree.root)).toContain('habits.detail.noDataYet')
    expect(tree.root.findAllByType('StatTile')).toHaveLength(0)
    TestRenderer.act(() => tree.update(<></>))
  })

  it.each([
    { label: 'pre-validation version', version: 2, discarded: true },
    { label: 'current version', version: QUERY_CACHE_VERSION, discarded: false },
  ])('never shows restored malformed metrics after a rejected refetch from $label', async ({ version, discarded }) => {
    await setQueryCacheScope('account-a')
    const producer = await vi.importActual<typeof import('@/lib/query-client')>('@/lib/query-client')
    queryClient.setQueryData(habitKeys.metrics('habit-1'), {}, { updatedAt: 1 })
    await producer.persistQueryCache()
    const snapshot = JSON.parse(mocks.setStorage.mock.lastCall![1] as string)
    snapshot.version = version
    queryClient.clear()
    mocks.getStorage.mockResolvedValue(JSON.stringify(snapshot))
    await restoreQueryCache()
    if (discarded) expect(queryClient.getQueryData(habitKeys.metrics('habit-1'))).toBeUndefined()
    else expect(queryClient.getQueryData(habitKeys.metrics('habit-1'))).toEqual({})

    mocks.realMetrics = true
    queryClient.setQueryDefaults(habitKeys.metrics('habit-1'), { retry: false })
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<QueryClientProvider client={queryClient}><HabitDetailScreen habitId="habit-1" /></QueryClientProvider>)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(queryClient.getQueryState(habitKeys.metrics('habit-1'))?.status).toBe('error')
    expect(textsOf(tree.root)).toContain('habits.detail.noDataYet')
    expect(tree.root.findAllByType('StatTile')).toHaveLength(0)
    TestRenderer.act(() => tree.update(<></>))
  })

  it('owns the details disclosure in ListRow with a leading state glyph', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const row = tree.root.findAllByType('ListRow').find((node: TestNode) => node.props.title === 'habits.detail.moreDetails')!
    expect(row.props).toMatchObject({ icon: 'chevron-right', chevron: false, expanded: false, controls: 'habit-detail-fields' })
    const disclosure = row.findAllByType('Pressable')[0]!
    expect(disclosure.props.accessibilityState).toMatchObject({ expanded: false })
    TestRenderer.act(() => disclosure.props.onPress())
    const opened = tree.root.findAllByType('ListRow').find((node: TestNode) => node.props.title === 'habits.detail.moreDetails')!
    expect(opened.props).toMatchObject({ icon: 'chevron-down', chevron: false, expanded: true })
    expect(opened.findAllByType('Pressable')[0]!.props.accessibilityState).toMatchObject({ expanded: true })
  })

  it('opens Creation controls seeded from the habit in one disclosure', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const disclosure = tree.root.findAllByType('Pressable').find((node: TestNode) => textsOf(node).includes('habits.detail.moreDetails'))!
    TestRenderer.act(() => pressTextControl(disclosure))
    expect(tree.root.findAllByProps({ label: 'habits.form.description' })).not.toHaveLength(0)
    expect(tree.root.findAllByProps({ label: 'habits.form.habitTypeAvoid' })).not.toHaveLength(0)
    expect(tree.root.findAllByProps({ label: 'habits.form.exactTime' })).not.toHaveLength(0)
  })

  it('waits for the account day before querying an unpinned detail', () => {
    mocks.profileReady = false
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(mocks.scopedCompleteDay).toBe(false)
    mocks.profileReady = true
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(mocks.scopedCompleteDay).toBe(true)
  })

  it('does not offer a rescue for a habit created today', () => {
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-29T12:00:00Z' }
    mocks.logs = []
    mocks.metrics = { currentStreak: 0, longestStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 0, totalCompletions: 0, lastCompletedDate: null }
    mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: false }]])
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
    expect(textsOf(tree.root).some((text) => text.startsWith('habits.detail.slippingLine'))).toBe(false)
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)
    mocks.hasProAccess = false
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findAllByProps({ testID: 'rescue-free-card' })).toHaveLength(0)
  })

  it('shows a rescue only for an older overdue habit and handles request states', () => {
    openRescueGate()
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(textsOf(tree.root.findAllByType('Proposed').find(isRescueProposal)!.findByProps({ accessibilityLiveRegion: 'polite' }))).toContain('habits.detail.rescheduleLoading')
    expect(mocks.rescheduleOptions.some((options) => options.enabled)).toBe(true)
    expect(findPillButton(tree.root, 'habits.detail.rescheduleAccept')).toBeUndefined()

    mocks.rescheduleError = createApiClientError(400, { error: 'Not overdue', errorCode: 'HABIT_NOT_OVERDUE' }, 'Failed')
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
    expect(textsOf(tree.root)).not.toContain('habits.detail.slippingLine:9:0:50')

    mocks.rescheduleError = createApiClientError(500, { error: 'Unavailable' }, 'Failed')
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(textsOf(tree.root.findAllByType('Proposed').find(isRescueProposal)!.findByProps({ accessibilityLiveRegion: 'polite' }))).toContain('habits.detail.rescheduleError')
    expect(findPillButton(tree.root, 'habits.detail.rescheduleAccept')).toBeUndefined()
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.detail.retry') })
    expect(mocks.rescheduleRefetch).toHaveBeenCalledOnce()
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.reschedule.dismiss') })
    expect(tree.root.findAllByProps({ children: 'habits.detail.rescheduleError' })).toHaveLength(0)
    expect(textsOf(tree.root)).toContain('habits.detail.slippingLine:9:0:50')
  })

  it.each([
    { isOverdue: false, hasProAccess: true },
    { isOverdue: false, hasProAccess: false },
    { isOverdue: true, hasProAccess: true },
    { isOverdue: true, hasProAccess: false },
  ])('excludes a bad habit logged today from rescue ($isOverdue overdue, $hasProAccess Pro)', ({ isOverdue, hasProAccess }) => {
    openRescueGate()
    mocks.detail = { ...mocks.detail!, isBadHabit: true }
    mocks.logs = [{ id: 'today-slip', date: '2026-08-29', value: 1, createdAtUtc: '2026-08-29T12:00:00Z' }]
    mocks.metrics = { ...mocks.metrics, totalCompletions: 1, lastCompletedDate: '2026-08-29' }
    mocks.scopedHabits = normalizeHabitQueryData([makeHabitScheduleItem({ isBadHabit: true, isOverdue })]).habitsById
    mocks.hasProAccess = hasProAccess
    expect(isHabitSlipping(mocks.detail, mocks.metrics, mocks.logs, new Date(2026, 7, 29), 'UTC')).toBe(true)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(textsOf(tree.root).some((text) => text.startsWith('habits.detail.slippingLine'))).toBe(false)
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
    expect(tree.root.findAllByProps({ testID: 'rescue-free-card' })).toHaveLength(0)
    expect(mocks.rescheduleOptions.length).toBeGreaterThan(0)
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)
  })

  it.each(['initial request', 'retry'])('dismisses a pending proposal during %s for this visit', (requestState) => {
    openRescueGate()
    if (requestState === 'retry') mocks.rescheduleError = createApiClientError(500, { error: 'Unavailable' }, 'Failed')
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    if (requestState === 'retry') {
      TestRenderer.act(() => { pressPillButton(tree.root, 'habits.detail.retry') })
      expect(mocks.rescheduleRefetch).toHaveBeenCalledOnce()
      mocks.rescheduleError = null
      TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    }
    expect(textsOf(tree.root)).toContain('habits.detail.rescheduleLoading')
    const notNow = findPillButton(tree.root, 'habits.reschedule.dismiss')
    expect(notNow).toBeDefined()
    expect(notNow!.props.disabled).toBe(false)
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.reschedule.dismiss') })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
    expect(textsOf(tree.root)).toContain('habits.detail.slippingLine:9:0:50')
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
  })

  it('keeps the proposal announcement mounted when loading finishes', () => {
    openRescueGate()
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const proposal = tree.root.findAllByType('Proposed').find(isRescueProposal)!
    const status = proposal.findByProps({ accessibilityLiveRegion: 'polite' })
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(proposal.findByProps({ accessibilityLiveRegion: 'polite' })).toBe(status)
    expect(textsOf(status)).toContain('Sun, Aug 30')
    expect(textsOf(status)).toContain('Try tomorrow')
    expect(status.findAllByType('PillButton')).toHaveLength(0)
  })

  it('uses the account today overdue schedule on a historical detail', () => {
    openRescueGate()
    mocks.scopedHabitsByDate.set('2026-08-20', new Map([['habit-1', { ...makeScopedParent(), isOverdue: false }]]))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-20" />) })
    expect(mocks.scopedRequests).toContainEqual({ dateFrom: '2026-08-29', includeOverdue: true })
    expect(textsOf(tree.root)).toContain('habits.detail.slippingLine:9:0:50')
    expect(mocks.rescheduleOptions.some((options) => options.enabled)).toBe(true)

    mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: false }]])
    mocks.scopedHabitsByDate.set('2026-08-20', new Map([['habit-1', { ...makeScopedParent(), isOverdue: true }]]))
    mocks.rescheduleOptions = []
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" date="2026-08-20" />) })
    expect(textsOf(tree.root).some((text) => text.startsWith('habits.detail.slippingLine'))).toBe(false)
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)
  })

  it('shows the drawn proposal and puts it away for this visit only', () => {
    openRescueGate()
    mocks.uses24HourClock = true
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-20', dueTime: '07:30:00', days: ['Tuesday', 'Thursday'], rationale: 'Walk before work.' }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const proposal = tree.root.findAllByType('Proposed').find(isRescueProposal)!
    expect(textsOf(proposal)).toEqual([
      'Thu, Aug 20 · 07:30',
      'dates.daysShort.tuesday, dates.daysShort.thursday',
      'Walk before work.',
      'habits.detail.rescheduleFinePrint',
      'habits.reschedule.dismiss',
      'habits.detail.rescheduleAccept',
    ])
    expect(proposal.findAllByType('PillButton').map((button: TestNode) => [button.props.variant, button.props.size])).toEqual([['ghost', 'sm'], ['primary', 'sm']])
    expect(textsOf(tree.root)).not.toContain('habits.detail.slipping')
    expect(textsOf(tree.root)).toContain('habits.detail.slippingLine:9:0:50')

    const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    TestRenderer.act(() => { pressPillButton(proposal, 'habits.reschedule.dismiss') })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
    expect(textsOf(tree.root)).toContain('habits.detail.slippingLine:9:0:50')
    expect(focus).toHaveBeenCalledOnce()
    focus.mockRestore()

    mocks.detail = { ...makeDetail(), id: 'habit-2' }
    mocks.scopedHabits = new Map([['habit-2', { ...makeScopedParent(), id: 'habit-2', isOverdue: true }]])
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-2" />) })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(1)

    mocks.detail = makeDetail()
    mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: true }]])
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(1)
  })

  it('closes the proposal once the plan is used', async () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    mocks.update.mockResolvedValueOnce(undefined)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findByProps({ testID: 'rescue-proposed-schedule' }).props.children).toEqual(['Sun, Aug 30', ''])
    const accept = findPillButton(tree.root, 'habits.detail.rescheduleAccept')!
    expect(accept.props.variant).toBe('primary')
    expect(accept.props.disabled).toBeUndefined()

    await TestRenderer.act(async () => {
      pressPillButton(tree.root, 'habits.detail.rescheduleAccept')
      await Promise.resolve()
    })

    expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({ habitId: 'habit-1', data: { dueDate: '2026-08-30', frequencyUnit: 'Day', frequencyQuantity: 1 } })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('leaves accessibility focus on the new habit when an old plan finishes', async () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    let resolveUpdate!: () => void
    mocks.update.mockReturnValueOnce(new Promise<void>((resolve) => { resolveUpdate = resolve }))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.detail.rescheduleAccept') })
    mocks.detail = { ...makeDetail(), id: 'habit-2' }
    mocks.scopedHabits = new Map([['habit-2', { ...makeScopedParent(), id: 'habit-2', isOverdue: true }]])
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-2" />) })
    const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    await TestRenderer.act(async () => { resolveUpdate(); await Promise.resolve() })
    expect(focus).not.toHaveBeenCalled()
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(1)
    focus.mockRestore()
  })

  it('shows the rescue again when the account changes', () => {
    openRescueGate()
    mocks.hasProAccess = false
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.reschedule.dismiss') })
    expect(tree.root.findAllByProps({ testID: 'rescue-free-card' })).toHaveLength(0)
    TestRenderer.act(() => { advanceAccountGeneration() })
    expect(tree.root.findAllByProps({ testID: 'rescue-free-card' }).length).toBeGreaterThan(0)
  })

  it('does not show an old plan failure on the new habit', async () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    let rejectUpdate!: (error: Error) => void
    mocks.update.mockReturnValueOnce(new Promise<void>((_, reject) => { rejectUpdate = reject }))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.detail.rescheduleAccept') })
    mocks.detail = { ...makeDetail(), id: 'habit-2' }
    mocks.scopedHabits = new Map([['habit-2', { ...makeScopedParent(), id: 'habit-2', isOverdue: true }]])
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-2" />) })
    await TestRenderer.act(async () => { rejectUpdate(new Error('Write failed')); await Promise.resolve() })
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(1)
  })

  it('shows a dismissed rescue again when a retained detail is revisited', () => {
    openRescueGate()
    mocks.hasProAccess = false
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.reschedule.dismiss') })
    mocks.screenFocused = false
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    mocks.screenFocused = true
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findAllByProps({ testID: 'rescue-free-card' }).length).toBeGreaterThan(0)
  })

  it('ignores an old accept after leaving and revisiting the retained detail', async () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    let resolveUpdate!: () => void
    mocks.update.mockReturnValueOnce(new Promise<void>((resolve) => { resolveUpdate = resolve }))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => { pressPillButton(tree.root, 'habits.detail.rescheduleAccept') })
    mocks.screenFocused = false
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    mocks.screenFocused = true
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" />) })
    const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    await TestRenderer.act(async () => { resolveUpdate(); await Promise.resolve() })
    expect(focus).not.toHaveBeenCalled()
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(1)
    focus.mockRestore()
  })

  it('capitalizes only the first letter of the visible month', () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12))
    mocks.language = 'pt-BR'
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree.root.findAllByProps({ children: 'Setembro de 2026' }).length).toBeGreaterThan(0)
    expect(tree.root.findByType('MonthGrid').props.label).toBe('Atividade do hábito em setembro de 2026')
  })

  it('uses the drawn action row endings and a Pro badge on free', () => {
    mocks.hasProAccess = false
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const add = tree.root.findByProps({ title: 'habits.detail.addSubHabit' })
    expect(add.props.chevron).toBe(false)
    expect(add.findByProps({ testID: 'badge-solid' }).findAllByProps({ children: 'habits.detail.proGate' }).length).toBeGreaterThan(0)
    TestRenderer.act(() => { add.props.onClick() })
    expect(mocks.routerPush).toHaveBeenCalledWith('/upgrade')
    expect(tree.root.findByProps({ title: 'habits.detail.delete' }).props.chevron).toBe(false)
  })

  it('returns a direct detail link to Today while the profile loads', () => {
    mocks.profileReady = false
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    expect(tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; children?: React.ReactNode } }) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.children === 'habits.detail.screenTitle')).toHaveLength(1)
    TestRenderer.act(() => { tree.root.findByProps({ accessibilityLabel: 'common.backToToday' }).props.onPress() })
    expect(mocks.routerReplace).toHaveBeenCalledWith({ pathname: '/(tabs)', params: { date: '2026-08-28' } })
    expect(mocks.routerBack).not.toHaveBeenCalled()
  })

  afterEach(() => {
    __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
    vi.useRealTimers()
  })

  it('announces the habit name once on the rename control', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />)
    })

    const title = mocks.detail!.title
    const renameControls = tree!.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; accessibilityLabel?: string } }) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === title)
    expect(renameControls).toHaveLength(1)
    expect(renameControls[0]!.props.accessibilityHint).toBe('habits.detail.rename')
    expect(StyleSheet.flatten(renameControls[0]!.props.style({ pressed: false }))).toMatchObject({ minWidth: 48, minHeight: 48, top: -8, bottom: -8, left: -16, right: -16 })
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
    expect(tree!.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; children?: React.ReactNode } }) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.children === 'habits.detail.screenTitle')).toHaveLength(1)

    mocks.detailLoading = false
    mocks.detailError = true
    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="habit-1" />)
    })

    expect(tree!.root.findByProps({ testID: 'load-error' }).props.message).toBe('habits.detail.loadError')
    expect(tree!.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; children?: React.ReactNode } }) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.children === 'habits.detail.screenTitle')).toHaveLength(1)
    TestRenderer.act(() => {
      tree!.root.findByType('PillButton').props.onClick()
    })
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('distinguishes an absent child from unavailable day habits and restores completion after retry', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(mocks.scopedCompleteDay).toBe(true)
    const child = () => tree!.root.findByProps({ testID: 'child-child-1' })
    expect(child().props.completionReadOnly).toBe(true)
    expect(child().props.completionReason).toBe('calendar.dayCell.notScheduled')
    expect(child().props.completionStatusUnavailable).toBe(true)
    expect(tree!.root.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === 'calendar.dayCell.notScheduled')).toBe(true)

    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-28'))
    mocks.scopedLoading = true
    TestRenderer.act(() => tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />))
    expect(child().props.completionReadOnly).toBe(true)
    expect(child().props.completionReason).toBe('habits.detail.dayHabitsLoading')
    expect(child().props.completionStatusUnavailable).toBe(true)
    expect(tree!.root.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === 'habits.detail.dayHabitsLoading')).toBe(true)
    expect(tree!.root.findByProps({ testID: 'detail-children' }).props.accessibilityState).toEqual({ busy: true })

    mocks.scopedLoading = false
    mocks.scopedError = true
    TestRenderer.act(() => tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />))
    expect(child().props.completionReadOnly).toBe(true)
    expect(child().props.completionReason).toBe('habits.detail.dayHabitsLoadError')
    expect(child().props.completionStatusUnavailable).toBe(true)
    expect(tree!.root.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === 'habits.detail.dayHabitsLoadError')).toBe(true)
    expect(findPillButton(tree!.root, 'habits.detail.retry')!.props.variant).toBe('ghost')
    expect(tree!.root.findAllByType('ListRow').some((node: { props: { title?: string } }) => node.props.title === 'habits.detail.addSubHabit')).toBe(true)
    TestRenderer.act(() => child().props.actions.onDetail())
    expect(mocks.routerPush).toHaveBeenCalledOnce()
    const retry = tree!.root.findAllByType('PillButton').find((node: { props: { children?: string } }) => node.props.children === 'habits.detail.retry')
    TestRenderer.act(() => retry!.props.onClick())
    expect(mocks.scopedRefetch).toHaveBeenCalledOnce()
    expect(mocks.refetch).not.toHaveBeenCalled()
    expect(mocks.allHabitsRefetch).not.toHaveBeenCalled()

    mocks.scopedError = false
    TestRenderer.act(() => tree!.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />))
    expect(child().props.completionReadOnly).toBe(false)
    expect(child().props.completionStatusUnavailable).toBe(false)
    expect(tree!.root.findByProps({ testID: 'detail-children' }).props.accessibilityState).toEqual({ busy: false })
    expect(child().props.completionReason).toBeUndefined()
  })

  it('retries a list-only load failure', () => {
    mocks.allHabitsError = true
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />)
    })

    TestRenderer.act(() => tree!.root.findByType('PillButton').props.onClick())

    expect(mocks.allHabitsRefetch).toHaveBeenCalledOnce()
    expect(mocks.refetch).not.toHaveBeenCalled()
  })

  it.each(['UnbrokenToken'.repeat(24), 'A tag name with many words describing the people and activities I enjoy'])('discloses the full habit detail tag %s', async (name) => {
    mocks.allHabits.set('habit-1', { ...makeScopedParent(), tags: [{ id: 'long-tag', name, color: '#000000' }] })
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const tags = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'habit-detail-tags')[0]!
    const disclosure = expandedTextControls(tags, name, false)[0]!
    expect(disclosure).toBeDefined()
    await expectPersonalTextLayout(tree.root, name, 1)
    await TestRenderer.act(() => pressTextControl(disclosure))
    expect(expandedTextControls(tags, name, true)).toHaveLength(1)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('shows authoritative tags and linked goals and opens the selected goal', () => {
    mocks.allHabits.set('habit-1', makeScopedParent())
    mocks.scopedHabits.set('habit-1', makeScopedParent())
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    expect(tree!.root.findAll((node: { props: { children?: unknown } }) => node.props.children === 'Focus').length).toBeGreaterThan(0)
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
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
      tree!.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === mocks.detail!.title)[0]!.props.onPress()
    })
    const input = tree!.root.findByProps({ accessibilityLabel: 'habits.detail.rename' })
    TestRenderer.act(() => {
      input.props.onChangeText('   ')
    })
    await TestRenderer.act(async () => {
      input.props.onBlur()
      await Promise.resolve()
    })

    expect(tree!.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === mocks.detail!.title)[0]!.props.value).toBeUndefined()
    expect(mocks.update).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'common.backToToday' }).props.onPress()
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

    TestRenderer.act(() => tree!.root.findByProps({ accessibilityLabel: 'common.backToParentHabit' }).props.onPress())
    expect(mocks.history.map((entry) => entry.path)).toEqual([
      '/?date=2026-08-28',
      '/habits/parent-1?date=2026-08-28&from=today',
    ])

    TestRenderer.act(() => {
      tree!.update(<HabitDetailScreen habitId="parent-1" date="2026-08-28" fromToday />)
    })
    TestRenderer.act(() => tree!.root.findByProps({ accessibilityLabel: 'common.backToToday' }).props.onPress())

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
    TestRenderer.act(() => historicalChild.props.actions.onUnlog())
    expect(mocks.log).not.toHaveBeenCalled()
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.onConfirm())
    expect(mocks.log).toHaveBeenLastCalledWith({
      habitId: 'child-1',
      date: '2026-08-28',
      intent: 'unlog',
    })
  })

  it('announces full dates for logged and unlogged history cells and keeps the log time', () => {
    mocks.language = 'en'
    mocks.uses24HourClock = true
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    const loggedLabel = tree!.root.findByProps({ testID: 'history-day-26-inside' }).props.accessibilityLabel
    const unloggedLabel = tree!.root.findByProps({ testID: 'history-day-28-inside' }).props.accessibilityLabel
    const loggedTime = formatLocaleDateTime('2026-08-26T12:00:00Z', 'en', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
    expect(loggedLabel).toContain('Wednesday, August 26, 2026')
    expect(loggedLabel).toContain(loggedTime)
    expect(unloggedLabel).toBe('Friday, August 28, 2026')
  })

  it('announces logged time in 12-hour format under a 24-hour locale', () => {
    mocks.language = 'pt-BR'
    mocks.uses24HourClock = false
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const loggedTime = formatLocaleDateTime('2026-08-26T12:00:00Z', 'pt-BR', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })
    expect(tree!.root.findByProps({ testID: 'history-day-26-inside' }).props.accessibilityLabel).toContain(loggedTime)
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
      expect(child.props.completionReadOnly).toBe(false)

      TestRenderer.act(() => child.props.actions.onUnlog())
      if (date < '2026-08-29') {
        expect(mocks.log).not.toHaveBeenCalled()
        TestRenderer.act(() => tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.onConfirm())
      }
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
      tree!.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === mocks.detail!.title)[0]!.props.onPress()
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

  it('opens a non-daily schedule editor inline without opening the full editor', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: 'Week', frequencyQuantity: 2 }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    TestRenderer.act(() => tree.root.findByProps({ title: 'habits.detail.schedule' }).props.onClick())
    expect(tree.root.findByProps({ accessibilityLabel: 'habits.form.frequencyRequired' }).props.value).toBe('2')
    expect(tree.root.findAllByType('EditHabitModal')).toHaveLength(0)
  })
  it('corrects daily weekdays directly without opening the disclosure', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const day = () => tree.root.findByProps({ accessibilityLabel: 'dates.daysLong.sunday' })
    expect(day().props.accessibilityState.selected).toBe(true)
    await TestRenderer.act(async () => { day().props.onPress(); await Promise.resolve() })
    const request = mocks.update.mock.calls.at(-1)![0].data
    expect(request).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] })
    mocks.detail = { ...mocks.detail!, days: request.days }
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    expect(day().props.accessibilityState.selected).toBe(false)
    TestRenderer.act(() => day().props.onPress())
    expect(mocks.update.mock.calls.at(-1)![0].data.days).toEqual([])
  })
  it('renders reminders without a cancel or save step', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const disclosure = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!
    TestRenderer.act(() => pressTextControl(disclosure))
    expect(findPillButton(tree.root, 'common.cancel')).toBeUndefined()
    expect(findPillButton(tree.root, 'common.save')).toBeUndefined()
  })

  it.each([false, true])('preserves queued reminder selections across disclosure collapse and reopen, refreshed %s', async (refreshWhilePending) => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    const finishes: (() => void)[] = []
    mocks.update.mockImplementation(() => new Promise<void>((resolve) => { finishes.push(resolve) }))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const press = (label: string) => TestRenderer.act(() => {
      const node = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes(label))[0]!
      node.props.onPress()
    })
    press('habits.detail.moreDetails')
    press('habits.form.reminderAdd')
    press('habits.form.reminder1hour')
    press('habits.form.reminderAdd')
    press('habits.form.reminder30min')
    expect(mocks.update).toHaveBeenCalledTimes(1)
    if (refreshWhilePending) {
      await TestRenderer.act(async () => { finishes[0]!(); await Promise.resolve() })
      mocks.detail = { ...mocks.detail, reminderTimes: mocks.update.mock.calls[0]![0].data.reminderTimes }
      TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    }
    press('habits.detail.moreDetails')
    expect(tree.root.findAllByProps({ testID: 'habits.form.reminders' })).toHaveLength(0)
    press('habits.detail.moreDetails')
    press('habits.form.reminderAdd')
    press('habits.form.reminderAtTime')
    for (let index = refreshWhilePending ? 1 : 0; index < 3; index += 1) {
      await TestRenderer.act(async () => { finishes[index]!(); await Promise.resolve() })
    }
    expect(mocks.update).toHaveBeenCalledTimes(3)
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({
      reminderEnabled: true, reminderTimes: [60, 30, 15, 0], scheduledReminders: [],
    })
  })

  it('patches a reminder toggle once with optimistic state', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: false, reminderTimes: [15] }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const disclosure = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!
    TestRenderer.act(() => pressTextControl(disclosure))
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'offset-reminders' }).props.onToggleReminder()
      await Promise.resolve()
    })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ reminderEnabled: true, reminderTimes: [15], scheduledReminders: [] })
  })

  it.each([false, true])('keeps one filled action with a rescue card and schedule editor, Pro %s', (hasProAccess) => {
    openRescueGate()
    mocks.hasProAccess = hasProAccess
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const rescueAction = () => findPillButton(tree.root, hasProAccess ? 'habits.detail.rescheduleAccept' : 'habits.reschedule.upgrade')!
    expect(rescueAction().props.variant).toBe('primary')
    TestRenderer.act(() => tree.root.findByProps({ title: 'habits.detail.schedule' }).props.onClick())
    expect(rescueAction().props.variant).toBe('ghost')
    expect(findPillButton(tree.root, 'common.save')!.props.variant).toBe('secondary')
    TestRenderer.act(() => pressPillButton(tree.root, 'common.cancel'))
    expect(rescueAction().props.variant).toBe('primary')
  })

  it('uses a ghost cancel before the filled schedule action', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    TestRenderer.act(() => tree.root.findByProps({ title: 'habits.detail.schedule' }).props.onClick())
    expect(findPillButton(tree.root, 'common.cancel')!.props.variant).toBe('ghost')
    expect(findPillButton(tree.root, 'common.save')!.props.variant).toBe('secondary')
  })

  it('persists each real reminder control once without filling another action', async () => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const press = (label: string) => {
      const node = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes(label))[0]
      if (!node) throw new Error(`Missing control: ${label}`)
      node.props.onPress()
    }
    TestRenderer.act(() => press('habits.detail.moreDetails'))
    expect(tree.root.findByProps({ testID: 'habits.form.reminders' }).props.checked).toBe(true)
    expect(textsOf(tree.root).filter((label) => label === 'habits.form.reminders')).toHaveLength(1)
    expect(textsOf(tree.root)).not.toContain('habits.form.reminder')
    TestRenderer.act(() => tree.root.findByProps({ title: 'habits.detail.schedule' }).props.onClick())

    TestRenderer.act(() => press('habits.form.reminderAdd'))
    await TestRenderer.act(async () => { press('habits.form.reminder1hour'); await Promise.resolve() })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls.at(-1)![0].data.reminderTimes).toEqual([60, 15])
    await TestRenderer.act(async () => {
      tree.root.findAllByProps({ accessibilityLabel: 'habits.form.removeReminder' })[0].props.onPress()
      await Promise.resolve()
    })
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update.mock.calls.at(-1)![0].data.reminderTimes).toEqual([15])

    TestRenderer.act(() => press('habits.form.reminderAdd'))
    TestRenderer.act(() => press('habits.form.reminderCustom'))
    const custom = () => tree.root.findByProps({ accessibilityLabel: 'habits.form.reminderCustomLabel' })
    TestRenderer.act(() => custom().props.onChangeText('0'))
    TestRenderer.act(() => tree.root.findByProps({ label: 'common.add' }).props.onClick())
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.invalidRelativeReminder')
    TestRenderer.act(() => custom().props.onChangeText('45'))
    expect(tree.root.findByProps({ label: 'common.add' }).props.variant).toBe('ghost')
    await TestRenderer.act(async () => { tree.root.findByProps({ label: 'common.add' }).props.onClick(); await Promise.resolve() })
    expect(mocks.update).toHaveBeenCalledTimes(3)
    expect(mocks.update.mock.calls.at(-1)![0].data.reminderTimes).toEqual([45, 15])

    TestRenderer.act(() => press('habits.form.reminderAddTime'))
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'habits.form.scheduledReminderTimePlaceholder' }).props.onChangeText('08:00'))
    expect(findPillButton(tree.root, 'common.add')!.props.variant).toBe('ghost')
    await TestRenderer.act(async () => { pressPillButton(tree.root, 'common.add'); await Promise.resolve() })
    expect(mocks.update).toHaveBeenCalledTimes(4)
    expect(mocks.update.mock.calls.at(-1)![0].data.scheduledReminders).toEqual([{ when: 'same_day', time: '08:00' }])
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'habits.form.removeScheduledReminder' }).props.onPress(); await Promise.resolve() })
    expect(mocks.update).toHaveBeenCalledTimes(5)
    expect(mocks.update.mock.calls.at(-1)![0].data.scheduledReminders).toEqual([])
    expect(tree.root.findAllByType('PillButton').filter((node: TestNode) => node.props.variant === 'secondary')).toHaveLength(1)
  })

  it('restores the reminder switch and reports a failed patch', async () => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    let rejectPatch!: (error: Error) => void
    mocks.update.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectPatch = reject }))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const disclosure = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!
    TestRenderer.act(() => pressTextControl(disclosure))
    const reminderSwitch = () => tree.root.findByProps({ testID: 'habits.form.reminders' })
    TestRenderer.act(() => reminderSwitch().props.onChange(false))
    expect(reminderSwitch().props.checked).toBe(false)
    await TestRenderer.act(async () => { rejectPatch(new Error('update failed')); await Promise.resolve() })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.updateError')
    expect(reminderSwitch().props.checked).toBe(true)
  })

  it.each(['relative', 'scheduled'])('keeps the real %s reminder cap visible without a patch', (cap) => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true,
      reminderTimes: cap === 'relative' ? Array.from({ length: 15 }, (_, index) => index * 10) : [15],
      scheduledReminders: cap === 'scheduled' ? Array.from({ length: 5 }, (_, index) => ({ when: 'same_day' as const, time: `0${index}:00` })) : [],
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const disclosure = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!
    TestRenderer.act(() => pressTextControl(disclosure))
    expect(textsOf(tree.root)).toContain(cap === 'relative' ? 'habits.form.relativeReminderMax' : 'habits.form.scheduledReminderMax')
    expect(textsOf(tree.root)).not.toContain('habits.form.reminderAddTime')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('edits reminders inside the disclosure and shows the saved readout', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const disclosure = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!
    TestRenderer.act(() => pressTextControl(disclosure))
    const scheduled = () => tree.root.findByProps({ testID: 'scheduled-reminders' })
    TestRenderer.act(() => scheduled().props.onSetScheduledReminders([{ when: 'same_day', time: '08:00' }]))
    TestRenderer.act(() => scheduled().props.onToggleReminder())
    expect(mocks.update).toHaveBeenCalledTimes(1)
    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ reminderEnabled: true, scheduledReminders: [{ when: 'same_day', time: '08:00' }] })
    mocks.detail = { ...makeDetail(), reminderEnabled: true, reminderTimes: [10, 30], scheduledReminders: [{ when: 'same_day', time: '08:00' }] }
    TestRenderer.act(() => { tree.update(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    expect(JSON.stringify(tree.toJSON())).toContain('8:00 AM')
  })
  it('orders the open sections like the canvas and swaps checklist logging for editing', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const rendered = JSON.stringify(tree.toJSON())
    const orderedLabels = ['Read', 'habits.detail.lastThirtyDays', 'habits.detail.inside', 'habits.detail.history', 'habits.detail.schedule', 'habits.detail.moreDetails']
    const positions = orderedLabels.map((label) => rendered.indexOf(label))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((first, second) => first - second))
    const disclosure = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!
    TestRenderer.act(() => pressTextControl(disclosure))
    const lists = tree.root.findAllByProps({ testID: 'habit-checklist' })
    expect(lists).toHaveLength(1)
    expect(lists[0]!.props.editable).toBe(true)
    TestRenderer.act(() => pressTextControl(disclosure))
    expect(tree.root.findAllByProps({ testID: 'habit-checklist' })).toHaveLength(1)
  })
  it('composes a single 24px gap from the header to the strip with no empty status slot', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const strip = tree.root.findAllByType('View').find((node: TestNode) => node.props.testID === 'habit-detail-strip-section')!
    let parent = strip.parent
    while (typeof parent.type !== 'string') parent = parent.parent
    const slots = parent.findAll((node: { type: unknown; parent: { type: unknown; parent: unknown } | null }) => {
      if (typeof node.type !== 'string') return false
      let owner = node.parent
      while (owner && typeof owner.type !== 'string') owner = owner.parent as typeof owner
      return owner === parent
    })
    const stripIndex = slots.indexOf(strip)
    const headerStyle = (StyleSheet.flatten(slots[0]!.props.style) ?? {}) as { paddingBottom?: number; marginBottom?: number }
    const stripStyle = StyleSheet.flatten(strip.props.style) as { paddingTop?: number; marginTop?: number }
    const parentStyle = (StyleSheet.flatten(parent.props.contentContainerStyle ?? parent.props.style) ?? {}) as { gap?: number }
    const gap = parentStyle.gap ?? 0
    expect(gap * stripIndex + (headerStyle.paddingBottom ?? 0) + (headerStyle.marginBottom ?? 0)
      + (stripStyle.paddingTop ?? 0) + (stripStyle.marginTop ?? 0)).toBe(24)
    const region = parent.findAll((node: { type: unknown; props: { accessibilityLiveRegion?: string } }) =>
      node.type === 'View' && node.props.accessibilityLiveRegion === 'polite')[0]!
    expect(region.children).toHaveLength(0)
    expect(StyleSheet.flatten(region.props.style)).toBeUndefined()
    expect(gap).toBe(0)
    const body = tree.root.findByType('ScrollView')
    expect(StyleSheet.flatten(body.props.contentContainerStyle)).toMatchObject({ gap: 24 })
  })

  it.each([[false, false], [true, false], [false, true], [true, true]])('places optional tags (%s) and description (%s) below the header row', (hasTags, hasDescription) => {
    mocks.allHabits.set('habit-1', { ...makeScopedParent(), tags: hasTags ? makeScopedParent().tags : [] })
    mocks.detail = { ...makeDetail(), description: hasDescription ? 'A note about this routine' : null }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const tags = tree.root.findAllByType('View').filter((node: TestNode) => node.props.testID === 'habit-detail-tags')
    const description = tree.root.findAllByType('Pressable').filter((node: TestNode) => node.props.testID === 'habit-detail-description')
    expect(tags).toHaveLength(hasTags ? 1 : 0)
    expect(description).toHaveLength(hasDescription ? 1 : 0)
    const header = tree.root.findAllByType('View').find((node: TestNode) => node.props.testID === 'habit-detail-header-row')!
    const copy = header.findAll((node: TestNode) => node.type === 'View' && viewStyle(node).width === '100%')[0]!
    let parent = header.parent
    while (typeof parent.type !== 'string') parent = parent.parent
    const slots = parent.findAll((node: { type: unknown; parent: { type: unknown; parent: unknown } | null }) => {
      if (typeof node.type !== 'string') return false
      let owner = node.parent
      while (owner && typeof owner.type !== 'string') owner = owner.parent as typeof owner
      return owner === parent
    })
    const contentSlots = slots.filter((node: TestNode) => node.props.accessibilityLiveRegion !== 'polite')
    expect(contentSlots.slice(0, 2 + Number(hasTags) + Number(hasDescription)).map((node: TestNode) => node.props.testID)).toEqual([
      'habit-detail-header-row',
      ...(hasTags ? ['habit-detail-tags'] : []),
      ...(hasDescription ? ['habit-detail-description'] : []),
      'habit-detail-strip-section',
    ])
    expect(copy.findAll((node: TestNode) => node.type === 'ScrollView')).toHaveLength(0)
    expect(StyleSheet.flatten(parent.props.style)).toBeUndefined()
    const strip = contentSlots[1 + Number(hasTags) + Number(hasDescription)]!
    expect(StyleSheet.flatten(strip.props.style)).toEqual({ gap: 8, paddingTop: 24 })
    for (const metadata of [...tags, ...description]) {
      expect(StyleSheet.flatten(metadata.props.style)).toMatchObject({ paddingTop: 12 })
    }
    if (hasDescription) {
      const target = tree.root.findByProps({ accessibilityLabel: 'A note about this routine' })
      expect(target.props.accessibilityHint).toBe('habits.detail.viewDescription')
      expect(StyleSheet.flatten(target.props.style).minHeight).toBe(48)
      expect(target.props.hitSlop).toBeUndefined()
      expect(target.props.accessibilityState.expanded).toBe(false)
      expect(target.findByType('Text').props.numberOfLines).toBe(1)
      TestRenderer.act(() => target.props.onPress())
      expect(target.props.accessibilityState.expanded).toBe(true)
      expect(target.findByType('Text').props.numberOfLines).toBeUndefined()
      TestRenderer.act(() => target.props.onPress())
      expect(target.props.accessibilityState.expanded).toBe(false)
    }
  })

  it('keeps a populated completion boundary inside the header block', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-30" />) })
    const headerBlock = tree.root.findByType('ScrollView').findAllByType('View')[0]!
    expect(textsOf(headerBlock)).toContain('habits.todayBoundary.future')
    const region = headerBlock.findAll((node: { type: unknown; props: { accessibilityLiveRegion?: string } }) =>
      node.type === 'View' && node.props.accessibilityLiveRegion === 'polite')[0]!
    expect(region.children).toHaveLength(0)
  })

  it('sizes the 30-day strip from its content column without horizontal scrolling', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const strip = tree!.root.findByProps({ testID: 'detail-strip' })
    expect(strip.props.dayCount).toBe(30)
    expect(strip.props.size).toBe(8)
    expect(strip.parent.type).not.toBe('ScrollView')
    __setWindowDimensions({ width: 1024, height: 892, scale: 1, fontScale: 1 })
    TestRenderer.act(() => { tree!.update(<HabitDetailScreen habitId="habit-1" />) })
    expect(tree!.root.findByProps({ testID: 'detail-strip' }).props.size).toBe(8)
    const section = tree!.root.findByProps({ testID: 'habit-detail-strip-section' })
    TestRenderer.act(() => { section.props.onLayout({ nativeEvent: { layout: { width: 380 } } }) })
    expect(tree!.root.findByProps({ testID: 'detail-strip' }).props.size).toBe(8)
    TestRenderer.act(() => { section.props.onLayout({ nativeEvent: { layout: { width: 740 } } }) })
    expect(tree!.root.findByProps({ testID: 'detail-strip' }).props.size).toBe(16)
  })

  it.each([
    ['pt-BR', false, '7:30 PM', '19:30'],
    ['en', true, '19:30', '7:30 PM'],
  ])('uses %s and the saved clock in the header and time row', (language, uses24HourClock, expected, excluded) => {
    mocks.language = language
    mocks.uses24HourClock = uses24HourClock
    mocks.detail = { ...makeDetail(), dueTime: '19:30' }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const header = JSON.stringify(tree!.root.findByProps({ testID: 'habit-detail-header-row' }).findAllByType('Text').map((node: { props: { children?: string } }) => node.props.children))
    expect(header).toContain(expected)
    expect(header).not.toContain(excluded)
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    expect(tree!.root.findByProps({ accessibilityLabel: 'habits.form.exactTime' }).props.value).toBe('19:30')
  })

  it('shows only the due time for a habit without a frequency', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null, dueTime: '08:00' }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const header = tree!.root.findByProps({ testID: 'habit-detail-header-row' }).parent
    expect(header.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === '8:00 AM')).toBe(true)
    expect(JSON.stringify(header.findAllByType('Text').map((node: { props: { children?: string } }) => node.props.children))).not.toContain(' · ')
  })

  it('omits the summary element when there is no frequency or due time', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null, dueTime: null }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const header = tree!.root.findByProps({ testID: 'habit-detail-header-row' }).parent
    expect(header.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === '')).toBe(false)
  })

  it('omits the empty read-only schedule row for a habit without a frequency', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    expect(tree!.root.findAllByProps({ title: 'habits.detail.schedule' })).toHaveLength(0)
  })



  it.each([412, 840].flatMap((width) => [1, 2].map((scale) => ({ width, scale }))))('measures the full detail owner at $width and text scale $scale', ({ width, scale }) => {
    mocks.realListRows = true
    mocks.realPressTokens = true
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const disclosure = tree.root.findAllByType('Pressable').find((node: TestNode) => node.props.accessibilityLabel === 'habits.detail.moreDetails')!
    TestRenderer.act(() => disclosure.props.onPress())
    const geometry = measureProfileRow(tree.toJSON(), width, scale)
    const rowTitles = geometry.parts.filter((part) => part.slot === 'list-row-title')
    expect(rowTitles.length).toBeGreaterThanOrEqual(4)
    const date = geometry.parts.find((part) => part.slot === 'date-row-label')!
    const icons = geometry.parts.filter((part) => part.slot === 'list-row-icon')
    expect(date).toBeDefined()
    for (const icon of icons) expect(icon.left).toBeCloseTo(date.left, 1)
    for (const body of geometry.parts.filter((part) => part.slot === 'list-row-body')) {
      expect(body.left).toBeCloseTo(date.left - 16, 1)
      expect(body.right).toBeLessThanOrEqual(width)
    }
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['', 'My draft'])('paints and opens Astra about the habit, preserving draft %s', (draft) => {
    mocks.reducedMotion = draft !== ''
    mocks.realPressTokens = true
    useChatStore.getState().setDraft(draft)
    useChatStore.getState().setContextualSuggestion(null)
    useUIStore.getState().setAstraConversationOpen(false)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const ask = tree.root.findAllByType('Pressable').find((node: TestNode) => node.props.accessibilityLabel === 'habits.detail.askAstra')!
    TestRenderer.act(() => ask.props.onPressIn())
    const fill = tree.root.findAll((node: TestNode) => node.props['data-slot'] === 'list-row-body').find((node: TestNode) => (StyleSheet.flatten(node.props.style) as import('react-native').ViewStyle).left === -16)!
    expect(StyleSheet.flatten(fill.props.style)).toMatchObject({ backgroundColor: createTokensV2('purple', 'dark').bgHover, borderRadius: 12, left: -16, right: -16 })
    TestRenderer.act(() => ask.props.onPressOut())
    TestRenderer.act(() => tree.root.findAllByType('Pressable').find((node: TestNode) => node.props.accessibilityLabel === 'habits.detail.askAstra')!.props.onPress())
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    const prompt = 'habits.detail.askAstraSeedDefault:{"title":"Read"}'
    if (draft) {
      expect(useChatStore.getState().draft).toBe(draft)
      expect(useChatStore.getState().contextualSuggestion).toMatchObject({ id: 'habit-detail:habit-1', prompt })
    } else expect(useChatStore.getState().draft).toBe(prompt)
    mocks.reducedMotion = false
    mocks.realPressTokens = false
  })

  it('preserves consecutive edits before detail refreshes', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00' }
    let finish!: () => void
    mocks.update.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!.props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'habits.form.exactTime' }).props.onChangeText('10:15'))
    TestRenderer.act(() => tree.root.findByProps({ testID: 'habits.form.habitTypeAvoid' }).props.onChange(true))
    await TestRenderer.act(async () => { finish(); await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ dueTime: '10:15', isBadHabit: true })
  })

  it('keeps an empty time draft local while replacing the saved time', async () => {
    mocks.realTimeField = true
    mocks.uses24HourClock = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!.props.onPress())
    const input = () => tree.root.findAllByType('TextInput').find((node: TestNode) => node.props.accessibilityLabel === 'habits.form.exactTime')!
    TestRenderer.act(() => input().props.onFocus())
    TestRenderer.act(() => input().props.onChangeText(''))
    expect(mocks.update).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { input().props.onChangeText('10:15'); await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ dueTime: '10:15', reminderEnabled: true, reminderTimes: [15] })
  })

  it('keeps cadence editing available for a daily habit', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => tree.root.findByProps({ title: 'habits.detail.schedule' }).props.onClick())
    TestRenderer.act(() => tree.root.findAllByType('Pressable').find((node: TestNode) => node.props.accessibilityLabel === 'habits.form.unitWeek')!.props.onPress())
    await TestRenderer.act(async () => { pressPillButton(tree.root, 'common.save'); await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1 })
  })

  it('hides Avoid for a general habit as Creation does', () => {
    mocks.detail = { ...makeDetail(), isGeneral: true }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    TestRenderer.act(() => tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!.props.onPress())
    expect(tree.root.findAllByProps({ testID: 'habits.form.habitTypeAvoid' })).toHaveLength(0)
  })

  it('persists Creation controls through their existing write paths', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00', description: 'Old note', endDate: '2026-09-30' }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const disclosure = tree.root.findAll((node: TestNode) => node.type === 'Pressable' && textsOf(node).includes('habits.detail.moreDetails'))[0]!
    TestRenderer.act(() => pressTextControl(disclosure))
    TestRenderer.act(() => tree.root.findByProps({ title: 'habits.detail.linkedGoals' }).props.onClick())
    TestRenderer.act(() => tree.root.findByProps({ testID: 'goal-linking-field' }).props.onToggleGoal('goal-2'))
    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ goalIds: ['goal-2'] })
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'habits.form.exactTime' }).props.onChangeText('10:15'))
    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ dueTime: '10:15', dueEndTime: null })
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'habits.form.description' }).props.onChangeText(' Better note '))
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'habits.form.description' }).props.onBlur(); await Promise.resolve() })
    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ description: 'Better note' })
    TestRenderer.act(() => tree.root.findByProps({ testID: 'habits.form.habitTypeAvoid' }).props.onChange(true))
    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ isBadHabit: true })
  })
  it('clears reminder configuration when the time editor clears due time', async () => {
    mocks.detail = {
      ...makeDetail(),
      dueTime: '09:00',
      dueEndTime: '10:00',
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())

    TestRenderer.act(() => tree!.root.findByProps({ accessibilityLabel: 'habits.form.exactTime' }).props.onClear())
    await TestRenderer.act(async () => {
      await Promise.resolve()
    })

    const request = mocks.update.mock.calls.at(-1)?.[0].data
    expect({
      dueTime: request.dueTime,
      dueEndTime: request.dueEndTime,
      reminderEnabled: request.reminderEnabled,
      reminderTimes: request.reminderTimes,
      scheduledReminders: request.scheduledReminders,
    }).toEqual({
      dueTime: null,
      dueEndTime: null,
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
    })
  })

  it('validates reminder changes before mutation', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())

    TestRenderer.act(() => tree!.root.findByProps({ testID: 'scheduled-reminders' }).props.onToggleReminder())

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.reminderMinimumOne')

    TestRenderer.act(() => tree!.root.findByProps({ testID: 'scheduled-reminders' }).props.onSetScheduledReminders([{ when: 'same_day', time: '08:00' }]))
    await TestRenderer.act(async () => {
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
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())


    expect(tree!.root.findByProps({ testID: 'offset-reminders' })).toBeDefined()
    const scheduled = tree!.root.findByProps({ testID: 'scheduled-reminders' })
    TestRenderer.act(() => scheduled.props.onRemoveScheduledReminders())
    await TestRenderer.act(async () => {
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

    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
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
      tree!.root.findAll((node: TestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === mocks.detail!.title)[0]!.props.onPress()
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

    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it.each(['2020-01-01', '2030-01-01'])('rejects an outside date before offline queueing: %s', async (date) => {
    mocks.log.mockImplementation(({ habitId }: { habitId: string }) => performQueuedApiMutation({
      type: 'logHabit', scope: 'habits', endpoint: `/api/habits/${habitId}/log`,
      method: 'POST', payload: { date }, entityType: 'habit', targetEntityId: habitId,
      dedupeKey: `habit-toggle:${habitId}:${date}`,
    }))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date={date} />) })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'header-log' }).props.onPress()
      await Promise.resolve()
    })
    expect(tree!.root.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === 'habits.detail.logDateUnavailable')).toBe(true)
    expect(mocks.log).not.toHaveBeenCalled()
    expect(getQueuedMutations()).toEqual([])
  })

  it('asks before logging a date before the habit existed', async () => {
    expect(en.habits.detail.logDateConfirmMessage).toBe('This logs {name} on {date}.')
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-28T12:00:00Z' }
    mocks.logs = []
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-27" />) })
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'header-log' }).props.onPress())
    expect(mocks.log).not.toHaveBeenCalled()
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.message).toContain('August 27, 2026')
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.message).toContain('Read')
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.confirmLabel).toBe('habits.detail.logDateConfirmLog')
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.onConfirm()
      await Promise.resolve()
    })
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'habit-1', date: '2026-08-27', intent: 'log' })
  })

  it('names the undo action when confirming an unusual unlog date', () => {
    expect(en.habits.detail.logDateConfirmUnlogMessage).toBe('This undoes the log for {name} on {date}.')
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-28T12:00:00Z' }
    mocks.logs = [{ id: 'selected', date: '2026-08-27', value: 1, createdAtUtc: '2026-08-27T12:00:00Z' }]
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-27" />) })
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'header-log' }).props.onPress())
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.message).toBe('Undo Read: August 27, 2026')
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.confirmLabel).toBe('habits.detail.logDateConfirmUnlog')
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('confirms a child date when its creation time is unavailable from the schedule', async () => {
    const schedule = makeHabitScheduleItem({ createdAtUtc: '2026-08-01T12:00:00Z' })
    mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onLog())
    expect(mocks.log).not.toHaveBeenCalled()
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.message).toContain('August 28, 2026')
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.onConfirm()
      await Promise.resolve()
    })
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'child-1', date: '2026-08-28', intent: 'log' })
  })

  it('blocks a child date before its own creation despite an earlier parent and due date', () => {
    const schedule = makeHabitScheduleItem({
      createdAtUtc: '2026-08-01T12:00:00Z',
      children: [{ ...makeHabitScheduleItem().children[0]!, createdAtUtc: '2026-08-29T08:00:00Z' }],
    })
    mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onLog())
    expect(mocks.log).not.toHaveBeenCalled()
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' })).toHaveLength(0)
    expect(tree!.root.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === 'habits.detail.logDateUnavailable')).toBe(true)
    expect(tree!.root.findByProps({ testID: 'child-child-1' }).parent.parent.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === 'habits.detail.logDateUnavailable')).toBe(true)
  })

  it('unlogs a previously saved child date before its own creation', async () => {
    mocks.scopedHabits.set('child-1', {
      ...makeScopedChild('2026-08-28'),
      createdAtUtc: '2026-08-29T08:00:00Z',
      createdAtUtcIsInherited: false,
      isCompleted: true,
    })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })

    TestRenderer.act(() => tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onUnlog())
    expect(mocks.log).not.toHaveBeenCalled()
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.confirmLabel).toBe('habits.detail.logDateConfirmUnlog')
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.message).toBe('habits.detail.logDateConfirmPermanentUnlogMessage')
    expect(en.habits.detail.logDateConfirmPermanentUnlogMessage).toBe('This removes the log for {name} on {date}. It cannot be undone.')
    expect(ptBR.habits.detail.logDateConfirmPermanentUnlogMessage).toBe('Isso remove o registro de {name} em {date}. Não dá para desfazer.')
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.onConfirm()
      await Promise.resolve()
    })
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'child-1', date: '2026-08-28', intent: 'unlog' })
    expect(tree!.root.findAllByType('Text').some((node: { props: { children?: string } }) => node.props.children === 'habits.detail.logDateUnavailable')).toBe(false)
  })

  it('keeps a precreation child log when permanent removal is canceled', () => {
    mocks.scopedHabits.set('child-1', {
      ...makeScopedChild('2026-08-28'),
      createdAtUtc: '2026-08-29T08:00:00Z',
      createdAtUtcIsInherited: false,
      isCompleted: true,
    })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })

    TestRenderer.act(() => tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onUnlog())
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.message).toBe('habits.detail.logDateConfirmPermanentUnlogMessage')
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.onCancel())

    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' })).toHaveLength(0)
    expect(mocks.log).not.toHaveBeenCalled()
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onUnlog())
    expect(tree!.root.findByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' }).props.message).toBe('habits.detail.logDateConfirmPermanentUnlogMessage')
  })

  it.each([
    ['child-1', 'habit-1'],
    ['grandchild-1', 'child-1'],
  ])('blocks a direct %s detail log before its own creation', (targetId, parentId) => {
    const schedule = makeHabitScheduleItem()
    const child = schedule.children[0]!
    schedule.children = [{ ...child, createdAtUtc: '2026-08-29T08:00:00Z', children: [{ ...child, id: 'grandchild-1', createdAtUtc: '2026-08-29T08:00:00Z', children: [] }] }]
    mocks.allHabits = normalizeHabitQueryData([schedule]).habitsById
    mocks.detail = { ...makeDetail(), id: targetId, createdAtUtc: '2026-08-29T08:00:00Z', children: [] }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId={targetId} parentId={parentId} date="2026-08-28" />) })
    const region = tree!.root.findAll((node: { type: unknown; props: { accessibilityLiveRegion?: string } }) =>
      node.type === 'View' && node.props.accessibilityLiveRegion === 'polite')[0]!
    expect(region.children).toHaveLength(0)
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'header-log' }).props.onPress())
    expect(mocks.log).not.toHaveBeenCalled()
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' })).toHaveLength(0)
    expect(tree!.root.findAll((node: { type: unknown; props: { accessibilityLiveRegion?: string } }) =>
      node.type === 'View' && node.props.accessibilityLiveRegion === 'polite')[0]).toBe(region)
    expect(textsOf(region)).toContain('habits.detail.logDateUnavailable')
  })

  it('logs a child date after its own creation without confirmation', async () => {
    const schedule = makeHabitScheduleItem({
      createdAtUtc: '2026-08-01T12:00:00Z',
      children: [{ ...makeHabitScheduleItem().children[0]!, createdAtUtc: '2026-08-27T08:00:00Z' }],
    })
    mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onLog()
      await Promise.resolve()
    })
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'child-1', date: '2026-08-28', intent: 'log' })
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' })).toHaveLength(0)
  })

  it('replaces checklist confirmation with the unusual-date confirmation', async () => {
    mocks.logs = []
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-28T12:00:00Z', checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValue(undefined)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-27" />) })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'habit-checklist' }).props.onToggle(0)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'confirm-habits.checklistCompleteTitle' }).props.onConfirm()
      await Promise.resolve()
    })
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.checklistCompleteTitle' })).toHaveLength(0)
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.detail.logDateConfirmTitle' })).toHaveLength(1)
    expect(mocks.log).not.toHaveBeenCalled()
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

  it('keeps checklist edits without offering old-day completion', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-19" />)
    })
    expect(tree!.root.findAllByType('Text').filter((node: { props: { children?: string } }) => node.props.children === 'habits.todayBoundary.readOnly')).toHaveLength(1)

    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'habit-checklist' }).props.onToggle(0)
      await Promise.resolve()
    })

    expect(mocks.checklist).toHaveBeenCalledWith({
      habitId: 'habit-1',
      items: [{ text: 'First', isChecked: true }],
    })
    expect(tree!.root.findAllByProps({ testID: 'confirm-habits.checklistCompleteTitle' })).toHaveLength(0)
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('uses the account day and disables completion after rollover while mounted', () => {
    mocks.timeZone = 'Pacific/Kiritimati'
    vi.setSystemTime(new Date('2026-08-30T09:59:59Z'))
    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-23'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-23" />)
    })
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.disabled).toBe(false)
    TestRenderer.act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.disabled).toBe(true)
    expect(tree!.root.findByProps({ testID: 'header-log' }).props.disabledReason).toBe('habits.todayBoundary.readOnly')
    expect(tree!.root.findByProps({ testID: 'child-child-1' }).props.completionReadOnly).toBe(true)
    expect(tree!.root.findByProps({ testID: 'child-child-1' }).props.completionReason).toBe('habits.todayBoundary.readOnly')
    expect(tree!.root.findByProps({ testID: 'child-child-1' }).props.today).toBe('2026-08-31')
  })

  it.each(['log', 'unlog'] as const)('refuses stale detail %s and child log immediately after account midnight', (intent) => {
    mocks.timeZone = 'Pacific/Kiritimati'
    vi.setSystemTime(new Date('2026-08-30T09:59:59Z'))
    if (intent === 'unlog') mocks.logs.push({ id: 'selected', date: '2026-08-23', value: 1, createdAtUtc: '2026-08-23T12:00:00Z' })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-23" />)
    })
    const headerLog = tree!.root.findByProps({ testID: 'header-log' }).props.onPress
    const childLog = tree!.root.findByProps({ testID: 'child-child-1' }).props.actions.onLog
    vi.setSystemTime(new Date('2026-08-30T10:00:01Z'))

    TestRenderer.act(() => {
      headerLog()
      childLog()
    })

    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('refuses checklist completion confirmation after account midnight', async () => {
    mocks.timeZone = 'Pacific/Kiritimati'
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    vi.setSystemTime(new Date('2026-08-30T09:59:59Z'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-23" />)
    })
    await TestRenderer.act(async () => {
      tree!.root.findByProps({ testID: 'habit-checklist' }).props.onToggle(0)
      await Promise.resolve()
    })
    const confirmLog = tree!.root.findByProps({ testID: 'confirm-habits.checklistCompleteTitle' }).props.onConfirm

    vi.setSystemTime(new Date('2026-08-30T10:00:01Z'))
    await TestRenderer.act(async () => {
      confirmLog()
      await Promise.resolve()
    })
    expect(mocks.log).not.toHaveBeenCalled()
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

  it('leaves habit detail suggestions to the shell composer', () => {
    TestRenderer.act(() => {
      TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('preserves authoritative relationship state for an off-schedule habit', async () => {
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
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
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
    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ slipAlertEnabled: false })
  })

  it('keeps a general habit existing goal links after the first toggle', () => {
    mocks.detail = { ...makeDetail(), isGeneral: true }
    mocks.allHabits.clear()
    mocks.scopedHabits = normalizeHabitQueryData([makeHabitScheduleItem({
      isGeneral: true,
      linkedGoals: [{ id: 'goal-1', title: 'Read more books' }],
    })]).habitsById
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.linkedGoals' }).props.onClick())
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'goal-linking-field' }).props.onToggleGoal())

    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      goalIds: ['goal-1', 'goal-2'],
    })
  })

  it('hides relationship controls for a nested child from real normalized schedule data', () => {
    mocks.detail = { ...makeDetail(), id: 'child-1', isBadHabit: true, children: [] }
    mocks.allHabits = normalizeHabitQueryData([makeHabitScheduleItem()]).habitsById
    mocks.scopedHabits = normalizeHabitQueryData([makeHabitScheduleItem()]).habitsById
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="habit-1" />)
    })
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())

    expect(tree!.root.findAllByProps({ title: 'habits.detail.linkedGoals' })).toHaveLength(0)
    expect(tree!.root.findAllByProps({ title: 'habits.detail.slipAlert' })).toHaveLength(0)
  })

  it('keeps normalized nested tags visible without relationship controls', () => {
    mocks.detail = { ...makeDetail(), id: 'child-1', isBadHabit: true, children: [] }
    const normalized = normalizeHabitQueryData([makeTaggedNestedHabitScheduleItem()])
    mocks.allHabits = normalized.habitsById
    mocks.scopedHabits = normalized.habitsById
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="habit-1" />)
    })

    expect(tree!.root.findAll((node: { props: { children?: unknown } }) => node.props.children === 'Nested focus').length).toBeGreaterThan(0)
    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    expect(tree!.root.findAllByProps({ title: 'habits.detail.linkedGoals' })).toHaveLength(0)
    expect(tree!.root.findAllByProps({ title: 'habits.detail.slipAlert' })).toHaveLength(0)
  })

  it('keeps relationship controls interactive for a top-level habit with zero linked goals', async () => {
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    mocks.allHabits = normalizeHabitQueryData([makeHabitScheduleItem({ isBadHabit: true })]).habitsById
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    })

    const disclosure = tree!.root.findAll((node: { props: { accessibilityState?: { expanded?: boolean }; children?: React.ReactNode } }) => node.props.accessibilityState?.expanded === false && renderedText(node.props.children).includes('habits.detail.moreDetails'))[0]
    TestRenderer.act(() => disclosure!.props.onPress())
    TestRenderer.act(() => tree!.root.findByProps({ title: 'habits.detail.linkedGoals' }).props.onClick())
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'goal-linking-field' }).props.onToggleGoal())
    TestRenderer.act(() => tree!.root.findByProps({ testID: 'slip-alert-switch' }).props.onChange(true))

    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls.at(-2)?.[0].data).toMatchObject({ goalIds: ['goal-2'] })
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ slipAlertEnabled: true })
  })


  it('keeps the plan label busy and holds Not now while the plan saves', () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    mocks.updatePending = true
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const proposal = tree.root.findAllByType('Proposed').find(isRescueProposal)!
    expect(findPillButton(proposal, 'habits.detail.rescheduleAccept')?.props.loading).toBe(true)
    expect(findPillButton(proposal, 'habits.reschedule.dismiss')?.props.disabled).toBe(true)
  })

  it('offers Pro and Not now on the free rescue card without asking Astra', () => {
    openRescueGate()
    mocks.hasProAccess = false
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const card = tree.root.findByProps({ testID: 'rescue-free-card' })
    expect(tree.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(0)
    expect(card.findByType('AstraGlyph').props.size).toBe(20)
    expect(textsOf(card)).toEqual(['habits.detail.proGate', 'habits.reschedule.freePrompt', 'habits.reschedule.dismiss', 'habits.reschedule.upgrade'])
    expect(card.findAllByType('PillButton').map((button: TestNode) => [button.props.variant, button.props.size])).toEqual([['ghost', 'sm'], ['primary', 'sm']])
    expect(mocks.rescheduleOptions.length).toBeGreaterThan(0)
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)

    expect(findPillButton(tree.root, 'habits.reschedule.upgrade')!.props.accessibilityRole).toBe('link')
    TestRenderer.act(() => { pressPillButton(card, 'habits.reschedule.upgrade') })
    expect(mocks.routerPush).toHaveBeenCalledWith('/upgrade')

    TestRenderer.act(() => { pressPillButton(card, 'habits.reschedule.dismiss') })
    expect(tree.root.findAllByProps({ testID: 'rescue-free-card' })).toHaveLength(0)
    expect(textsOf(tree.root)).toContain('habits.detail.slippingLine:9:0:50')
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
    openRescueGate()
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
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />)
    })

    await TestRenderer.act(async () => {
      pressPillButton(tree!.root, 'habits.detail.rescheduleAccept')
      await Promise.resolve()
    })

    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.rescheduleWriteError')
    expect(tree!.root.findAllByType('Proposed').filter(isRescueProposal)).toHaveLength(1)
    expect(findPillButton(tree!.root, 'habits.detail.rescheduleAccept')).toBeDefined()
  })

})
