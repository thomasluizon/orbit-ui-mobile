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
import { createApiClientError, formatAPIDate, formatLocaleDate, formatLocaleDateTime, isHabitSlipping, normalizeHabitQueryData } from '@orbit/shared/utils'
import type { Time24 } from '@orbit/shared/contracts/forms'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import {
  makeHabitDetail as makeDetail,
  makeEnrichedHabitDetail,
  makeHabitScheduleItem,
  makeTaggedNestedHabitScheduleItem,
  makeHabitDetailScopedChild as makeScopedChild,
  makeHabitDetailScopedParent as makeScopedParent,
  makeLoggedGeneralHabitDetailChild as makeLoggedGeneralChild,
} from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit, RescheduleSuggestion } from '@orbit/shared/types/habit'
import { habitDetailSchema, updateHabitRequestSchema } from '@orbit/shared/types/habit'
import { StatusRing } from '@/components/ui/status-ring'
import { DateRow } from '@/components/ui/date-row'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { flushQueuedMutations } from '@/lib/offline-mutations'
import { clear as clearOfflineQueue, getAll as getQueuedMutations } from '@/lib/offline-queue'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { expectPressPaint } from '@/__tests__/support/press-feedback'
import { createTokensV2 } from '@/lib/theme'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn().mockResolvedValue(true), getStringAsync: vi.fn() }))
vi.mock('expo-clipboard', () => ({ ...clipboard }))

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
  allHabitsFallback: null as Map<string, NormalizedHabit> | null,
  allHabitsError: false,
  allHabitsLoading: false,
  allHabitsEnabled: undefined as boolean | undefined,
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
  realUpdateHook: false,
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
  weekStartDay: 1,
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
    useHabits: (filters: { dateFrom?: string; includeOverdue?: boolean }, options?: { completeDay?: boolean; enabled?: boolean }) => {
      if (!filters.dateFrom) mocks.allHabitsEnabled = options?.enabled
      if (filters.dateFrom) {
        mocks.scopedCompleteDay = options?.completeDay ?? false
        mocks.scopedRequests.push({ dateFrom: filters.dateFrom, includeOverdue: filters.includeOverdue === true })
      }
      return { data: filters.dateFrom && mocks.scopedLoading ? undefined : { habitsById: filters.dateFrom ? mocks.scopedHabitsByDate.get(filters.dateFrom) ?? mocks.scopedHabits : (options?.enabled && mocks.allHabitsFallback ? mocks.allHabitsFallback : mocks.allHabits), topLevelHabits: [] }, isLoading: filters.dateFrom ? mocks.scopedLoading : mocks.allHabitsLoading, isError: filters.dateFrom ? mocks.scopedError : mocks.allHabitsError, refetch: filters.dateFrom ? mocks.scopedRefetch : mocks.allHabitsRefetch }
    },
  }
})
vi.mock('@/hooks/use-habits', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/use-habits')>()
  return {
    useLogHabit: () => ({ mutate: mocks.log, mutateAsync: mocks.log }),
    useUpdateHabit: () => mocks.realUpdateHook ? original.useUpdateHabit() : ({ mutate: mocks.update, mutateAsync: mocks.update, isPending: mocks.updatePending }),
    useUpdateChecklist: () => ({ mutate: mocks.checklist, mutateAsync: mocks.checklist }),
    useDeleteHabit: () => ({ mutate: mocks.deleteHabit, mutateAsync: mocks.deleteHabit }),
  }
})

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

  const apiClient = vi.fn((endpoint: string, _options?: Parameters<typeof import('@/lib/api-client').apiClient>[1]) => {
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

vi.mock('@/lib/api-client', () => ({ apiClient: (endpoint: string, options?: Parameters<typeof import('@/lib/api-client').apiClient>[1]) => mocks.realMetrics && endpoint.endsWith('/metrics') ? Promise.reject(new Error('metrics request failed')) : offlineMocks.apiClient(endpoint, options) }))
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
      weekStartDay: mocks.weekStartDay,
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
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: ({ size, days }: { size: number; days: string[] }) => React.createElement('DayStrip', { testID: 'detail-strip', size, dayCount: days.length, days }) }))
vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children, label, loadingLabel }: { children: React.ReactNode; label: string; loadingLabel?: string }) => React.createElement('MonthGrid', { label, loadingLabel }, children),
}))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: (props: { goalId: string }) => React.createElement('View', { ...props, testID: 'read-goal' }) }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: () => null }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: ({ open }: { open: boolean }) => open ? React.createElement('CreateHabitModal', { testID: 'create-sub-habit' }) : null }))
vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: ({ selectedGoalIds, atGoalLimit, onToggleGoal }: { selectedGoalIds: string[]; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }) => React.createElement('GoalLinkingField', { testID: 'goal-linking-field', selectedGoalIds, atGoalLimit, onToggleGoal: () => onToggleGoal(atGoalLimit ? selectedGoalIds[0]! : 'goal-2') }),
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
    habit,
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
    mocks.allHabitsFallback = null
    mocks.allHabitsError = false
    mocks.allHabitsLoading = false
    mocks.allHabitsEnabled = undefined
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
    mocks.realUpdateHook = false
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
    mocks.weekStartDay = 1
    mocks.scopedCompleteDay = false
    mocks.suggestion = null
    mocks.rescheduleOptions = []
    mocks.rescheduleError = null
    mocks.rescheduleRefetch.mockReset()
    mocks.language = 'en'
    mocks.uses24HourClock = undefined
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
  })

  afterEach(() => {
    __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
    vi.useRealTimers()
  })

  it.each([false, true])('keeps the whole type below the full detail title, task: %s', (task) => {
    mocks.detail = { ...makeDetail(), title: 'A complete title with enough words to occupy the available width', frequencyUnit: task ? null : 'Day', frequencyQuantity: task ? null : 1 }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const type = tree.root.findAll((node: TestNode) => node.type === 'Text' && node.props.testID === 'habit-detail-type')[0]!
    expect(type.props.children).toBe(task ? 'habits.rowTypeTask' : 'habits.form.typeHabit')
    expect(type.props.numberOfLines).toBeUndefined()
    expect(renderedText(tree.toJSON())).toContain(mocks.detail.title)
  })

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
    const visibleTitle = tree.root.findAll((node: TestNode) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === title)[0]!
    expect(visibleTitle.props.numberOfLines).toBeUndefined()
    const titleStyle = StyleSheet.flatten(visibleTitle.props.style as { fontSize: number; lineHeight: number })
    expect(titleStyle.lineHeight / titleStyle.fontSize).toBeGreaterThanOrEqual(1.4)
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    const copy = header.findAll((node: TestNode) => node.type === 'View' && viewStyle(node).width === '100%')[0]!
    expect(copy.findAll((node: TestNode) => node === visibleTitle)).toHaveLength(1)
    expect(StyleSheet.flatten(header.props.style)).toEqual({ gap: 8 })
    expect(StyleSheet.flatten(copy.props.style)).toEqual({ width: '100%', minWidth: 0, gap: 8 })
    const views = header.findAll((node: TestNode) => node.type === 'View')
    const controls = views.find((node: TestNode) => viewStyle(node).flexDirection === 'row')!
    expect(views.indexOf(controls)).toBeLessThan(views.indexOf(copy))
    expect(controls.findAllByType('HabitLogButton')).toHaveLength(1)
    expect(controls.findAllByType('PillButton').map((node: TestNode) => node.props.label)).toContain('habits.editHabit')
    expect(controls.findAll((node: TestNode) => node === visibleTitle)).toHaveLength(0)
    expect(copy.findAll((node: TestNode) => node.type === 'Text' && node.props.importantForAccessibility !== 'no-hide-descendants' && node.props.numberOfLines === 1)).toHaveLength(1)
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
    mocks.detail = { ...makeDetail(), children: makeDetail().children.map((child) => ({ ...child, description: '**Read** two pages before breakfast.' })) }
    mocks.scopedHabits.set('child-1', { ...makeScopedChild('2026-08-28'), description: '**Read** two pages before breakfast.' })
    mocks.theme = mode
    const tokens = createTokensV2('purple', mode)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ backgroundColor: tokens.bg }}><HabitDetailScreen habitId="habit-1" /></View>) })
    const group = tree.root.findByProps({ testID: 'detail-children' })
    const row = group.findByProps({ testID: 'habit-row' })
    expect(row.findByProps({ testID: 'habit-row-description' }).props.children).toBe('Read two pages before breakfast.')
    const geometry = measureInteractionFills(tree.toJSON(), 320, false)
    const rowBounds = geometry.find((part) => part.host.props.testID === 'habit-row')!
    const wellBounds = geometry.find((part) => part.style.width === 32 && part.style.borderRadius === 12 && part.ancestors.includes(rowBounds.slot))!
    expect(wellBounds.left - rowBounds.left).toBe(24)
    expect(StyleSheet.flatten(row.props.style as ViewStyle)).toMatchObject({ backgroundColor: tokens.bgCard, borderRadius: 20 })
    expect(StyleSheet.flatten(row.props.style as ViewStyle).borderWidth ?? 0).toBe(0)
    const outline = row.findByProps({ testID: 'habit-row-outline' })
    expect(StyleSheet.flatten(outline.props.style)).toMatchObject({ position: 'absolute', borderWidth: 1, borderRadius: 20, borderColor: tokens.hairline })
    expect(StyleSheet.flatten(group.props.style ?? {})).not.toHaveProperty('backgroundColor')
    expect(StyleSheet.flatten(group.props.style ?? {})).not.toHaveProperty('borderWidth')
    const body = () => row.findAll((node: TestNode) => node.type === 'Pressable' && typeof node.props.onPressIn === 'function')[0]!
    const measure = (pressed: boolean) => {
      const monogram = row.findAll((node: TestNode) => node.type === 'Text' && node.props.children === 'R')[0]!
      const well = row.findAll((node: TestNode) => node.type === 'View' && node.props.accessibilityElementsHidden === true)[0]!
      const style = body().props.style as (state: { pressed: boolean }) => ViewStyle[]
      return {
        color: StyleSheet.flatten(monogram.props.style as TextStyle).color as string,
        layers: [
          StyleSheet.flatten(tree.root.findAllByType('View')[0]!.props.style).backgroundColor,
          StyleSheet.flatten(group.props.style ?? {}).backgroundColor,
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
    TestRenderer.act(() => { tree.root.findAll((node: TestNode) => node.type === 'PillButton' && node.props.label === 'habits.editHabit')[0]!.props.onClick() })
    const editingHeaders = tree.root.findAll((node: { type: unknown; props: { accessibilityRole?: string; children?: React.ReactNode } }) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.children === mocks.detail!.title)
    expect(editingHeaders).toHaveLength(1)
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

  it.each([
    ['2026-08-20', 'Aug 20, 2026'],
    ['2026-08-28', 'Aug 28, 2026'],
    [undefined, formatLocaleDate('2026-08-29T00:30:00Z', 'en', { dateStyle: 'medium' })],
  ])('shows the API start date %s in the detail row with legacy timestamp compatibility', async (startDate, expected) => {
    mocks.detail = { ...makeDetail(), startDate, createdAtUtc: '2026-08-29T00:30:00Z' }
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    const row = tree.root.findAll((node) => node.type === DateRow)[0]!
    expect(row.findAll((node) => (node.type as unknown) === 'Text' && node.props.children === expected)).toHaveLength(1)
    await TestRenderer.act(() => tree.update(<></>))
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

  it('announces the habit heading once and names one full-editor pencil', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const headings = tree!.root.findAll((node: TestNode) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === mocks.detail!.title)
    expect(headings).toHaveLength(1)
    const pencils = tree!.root.findAll((node: TestNode) => node.type === 'PillButton' && node.props.label === 'habits.editHabit')
    expect(pencils).toHaveLength(1)
    expect(tree!.root.findAll((node: TestNode) => node.type === 'TextInput')).toHaveLength(0)
  })

  it('shows loading feedback and a retry action after a load failure', () => {
    mocks.detailLoading = true
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />)
    })

    expect(tree!.root.findAllByType('Skeleton').map((node: { props: { label?: string } }) => node.props.label).filter(Boolean)).toEqual([
      'habits.detail.loading',
      'habits.detail.loading',
    ])
    expect(tree!.root.findByType('MonthGrid').props.loadingLabel).toBe('habits.detail.loading')
    expect(React.Children.count(tree!.root.findByType('MonthGrid').props.children)).toBe(42)
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

  it.each([false, true])('renders detail while the unrelated list is pending and then rejected, legacy=%s', (legacy) => {
    mocks.detail = legacy ? makeDetail() : makeEnrichedHabitDetail()
    mocks.allHabits.clear()
    mocks.allHabitsLoading = true
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    expect(textsOf(tree!.root)).toContain(mocks.detail.title)
    mocks.allHabitsLoading = false
    mocks.allHabitsError = true
    TestRenderer.act(() => tree!.update(<HabitDetailScreen habitId="habit-1" />))
    expect(textsOf(tree!.root)).toContain(mocks.detail.title)
    expect(textsOf(tree!.root)).not.toContain('habits.detail.loadError')
    expect(mocks.allHabitsEnabled).toBe(legacy)
    expect(mocks.allHabitsRefetch).not.toHaveBeenCalled()
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
      tree!.root.findByProps({ title: 'Read more books' }).props.onClick()
    })

    expect(tree!.root.findByProps({ testID: 'read-goal' }).props.goalId).toBe('goal-1')
    expect(mocks.routerPush).not.toHaveBeenCalled()
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

  it.each([
    { unit: 'Month', origin: '2026-01-31', advanced: '2026-02-28', originalDay: 31, rejectedDay: 28 },
    { unit: 'Year', origin: '2024-02-29', advanced: '2025-02-28', originalDay: 29, rejectedDay: 28 },
  ])('keeps $unit strip and month history anchored after due date advancement', (example) => {
    vi.setSystemTime(new Date(`${example.origin}T12:00:00Z`))
    mocks.logs = []
    mocks.detail = habitDetailSchema.parse({ ...makeDetail(), children: [], days: [],
      createdAtUtc: `${example.origin.slice(0, 7)}-01T12:00:00Z`,
      frequencyUnit: example.unit, frequencyQuantity: 1, dueDate: example.origin,
      scheduledStartDate: example.origin })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date={example.origin} />) })
    expect(tree!.root.findByProps({ testID: `history-day-${example.originalDay}-inside` }).props.outcome).toBe('none')
    expect(tree!.root.findByProps({ testID: `history-day-${example.rejectedDay}-inside` }).props.outcome).toBe('not-scheduled')
    expect(tree!.root.findByProps({ testID: 'detail-strip' }).props.days.at(-1)).toBe('missed')
    mocks.detail = { ...mocks.detail, dueDate: example.advanced }
    TestRenderer.act(() => { tree!.update(<HabitDetailScreen habitId="habit-1" date={example.origin} />) })
    expect(tree!.root.findByProps({ testID: `history-day-${example.originalDay}-inside` }).props.outcome).toBe('none')
    expect(tree!.root.findByProps({ testID: `history-day-${example.rejectedDay}-inside` }).props.outcome).toBe('not-scheduled')
    expect(tree!.root.findByProps({ testID: 'detail-strip' }).props.days.at(-1)).toBe('missed')
  })

  it.each([0, 1] as const)('maps interval weeks into history and strip with week start %i', (weekStartDay) => {
    mocks.weekStartDay = weekStartDay
    mocks.logs = []
    for (const example of [
      { unit: 'Month', date: '2026-02-28', dueDate: '2026-06-30', scheduled: true },
      { unit: 'Month', date: '2026-03-31', dueDate: '2026-06-30', scheduled: false },
      { unit: 'Month', date: '2026-05-31', dueDate: '2026-06-30', scheduled: weekStartDay === 0 },
      { unit: 'Week', date: '2026-02-14', dueDate: '2026-03-14', scheduled: true },
      { unit: 'Week', date: '2026-02-21', dueDate: '2026-03-14', scheduled: false },
    ]) {
      vi.setSystemTime(new Date(`${example.date}T12:00:00Z`))
      mocks.detail = habitDetailSchema.parse({ ...makeDetail(), children: [], days: [],
        createdAtUtc: '2026-01-01T12:00:00Z', frequencyUnit: example.unit, frequencyQuantity: 1,
        intervalWeeks: 2, scheduledStartDate: '2026-01-31', dueDate: example.dueDate })
      let tree!: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date={example.date} />) })
      const day = Number(example.date.slice(-2))
      expect(tree.root.findByProps({ testID: `history-day-${day}-inside` }).props.outcome)
        .toBe(example.scheduled ? 'none' : 'not-scheduled')
      expect(tree.root.findByProps({ testID: 'detail-strip' }).props.days.at(-1))
        .toBe(example.scheduled ? 'missed' : 'not-scheduled')
      TestRenderer.act(() => tree.unmount())
    }
  })

  it.each([0, 1] as const)('agrees on Sunday bad-habit completion with week start %i', (weekStartDay) => {
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))
    mocks.weekStartDay = weekStartDay
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.scopedHabits = new Map()
    mocks.detail = habitDetailSchema.parse({ ...makeDetail(), children: [], days: [],
      createdAtUtc: '2026-01-01T12:00:00Z', isBadHabit: true,
      frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 2,
      scheduledStartDate: '2026-01-31', dueDate: '2026-03-09' })
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" date="2026-03-01" />) })
    const scheduled = weekStartDay === 1

    expect(tree.root.findByProps({ testID: 'history-day-1-inside' }).props.outcome)
      .toBe(scheduled ? 'full' : 'not-scheduled')
    expect(tree.root.findByProps({ testID: 'detail-strip' }).props.days.at(-1))
      .toBe(scheduled ? 'done' : 'not-scheduled')
    const header = tree.root.findByProps({ testID: 'habit-detail-header-row' })
    expect(header.findByType(StatusRing).props.status).toBe(scheduled ? 'done' : 'empty')
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
  it('composes a single 24px gap from the header to the checklist with no empty status slot', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const checklist = tree.root.findByProps({ testID: 'habit-checklist' })
    let parent = checklist.parent
    while (typeof parent.type !== 'string') parent = parent.parent
    const slots = parent.findAll((node: { type: unknown; parent: { type: unknown; parent: unknown } | null }) => {
      if (typeof node.type !== 'string') return false
      let owner = node.parent
      while (owner && typeof owner.type !== 'string') owner = owner.parent as typeof owner
      return owner === parent
    })
    const checklistIndex = slots.indexOf(checklist)
    const headerStyle = (StyleSheet.flatten(slots[0]!.props.style) ?? {}) as { paddingBottom?: number; marginBottom?: number }
    const checklistStyle = (StyleSheet.flatten(checklist.props.style) ?? {}) as { paddingTop?: number; marginTop?: number }
    const parentStyle = (StyleSheet.flatten(parent.props.contentContainerStyle ?? parent.props.style) ?? {}) as { gap?: number }
    const gap = parentStyle.gap ?? 0
    expect(gap * checklistIndex + (headerStyle.paddingBottom ?? 0) + (headerStyle.marginBottom ?? 0)
      + (checklistStyle.paddingTop ?? 0) + (checklistStyle.marginTop ?? 0)).toBe(24)
    const region = parent.findAll((node: { type: unknown; props: { accessibilityLiveRegion?: string } }) =>
      node.type === 'View' && node.props.accessibilityLiveRegion === 'polite')[0]!
    expect(region.children).toHaveLength(0)
    expect(StyleSheet.flatten(region.props.style)).toBeUndefined()
    expect(gap).toBe(24)
    const body = tree.root.findByType('ScrollView')
    expect(StyleSheet.flatten(body.props.contentContainerStyle)).toMatchObject({ gap: 24 })
  })

  it('keeps manual description selection outside the disclosure press target after copy fails', async () => {
    const description = 'A note worth selecting\nWith the complete second line'
    mocks.detail = { ...makeDetail(), description }
    clipboard.getStringAsync.mockRejectedValue(new Error('denied'))
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const copy = tree.root.findAllByType('Pressable').find((node: TestNode) => node.props.accessibilityLabel === 'habits.detail.copyDescription')!
    await TestRenderer.act(async () => { copy.props.onPress(); await Promise.resolve() })
    expect(textsOf(tree.root)).toContain('habits.detail.copyFailed')
    const selectedText = tree.root.findAllByType('Text').find((node: TestNode) => node.props.children === description && node.props.selectable)!
    expect(selectedText).toBeDefined()
    for (let ancestor = selectedText.parent; ancestor; ancestor = ancestor.parent) {
      expect(ancestor.type, 'Selection release must not activate a disclosure ancestor').not.toBe('Pressable')
    }
    expect(tree.root.findAllByType('Text').find((node: TestNode) => node.props.children === description && node.props.selectable)).toBeDefined()
  })

  it('copies the full description from habit details', async () => {
    const description = '**A full note**\n\n' + 'Long description. '.repeat(100)
    mocks.detail = { ...makeDetail(), description }
    clipboard.getStringAsync.mockResolvedValue(description)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const copy = tree.root.findAllByType('Pressable').find((node: TestNode) => node.props.accessibilityLabel === 'habits.detail.copyDescription')
    expect(copy).toBeDefined()
    await TestRenderer.act(async () => { await copy!.props.onPress() })
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(description)
    expect(clipboard.getStringAsync).toHaveBeenCalled()
    expect(tree.root.findAllByType('Text').find((node: TestNode) => node.props.children === description && node.props.selectable)).toBeDefined()
  })

  it.each([[false, false], [true, false], [false, true], [true, true]])('places optional tags (%s) and description (%s) below the header row', (hasTags, hasDescription) => {
    mocks.allHabits.set('habit-1', { ...makeScopedParent(), tags: hasTags ? makeScopedParent().tags : [] })
    mocks.detail = { ...makeDetail(), description: hasDescription ? 'A note about this routine' : null }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitDetailScreen habitId="habit-1" />) })
    const tags = tree.root.findAllByType('View').filter((node: TestNode) => node.props.testID === 'habit-detail-tags')
    const description = tree.root.findAllByType('View').filter((node: TestNode) => node.props.testID === 'habit-detail-description')
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
    expect(contentSlots.slice(0, 1 + Number(hasTags) + Number(hasDescription)).map((node: TestNode) => node.props.testID)).toEqual([
      'habit-detail-header-row',
      ...(hasTags ? ['habit-detail-tags'] : []),
      ...(hasDescription ? ['habit-detail-description'] : []),
    ])
    expect(copy.findAll((node: TestNode) => node.type === 'ScrollView')).toHaveLength(0)
    expect(StyleSheet.flatten(parent.props.style)).toBeUndefined()
    const strip = tree.root.findByProps({ testID: 'habit-detail-strip-section' })
    expect(StyleSheet.flatten(strip.props.style)).toEqual({ gap: 8 })
    for (const metadata of [...tags, ...description]) {
      expect(StyleSheet.flatten(metadata.props.style)).toMatchObject({ paddingTop: 12 })
    }
    if (hasDescription) {
      const prose = tree.root.findAllByType('Text').find((node: TestNode) => node.props.children === 'A note about this routine' && node.props.selectable)
      expect(prose).toBeDefined()
      expect(prose.props.numberOfLines).toBeUndefined()
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
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'habits.form.exactTime' })).toHaveLength(0)
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
    const disclosure = tree.root.findAllByType('Pressable').find((node: TestNode) => textsOf(node).includes('habits.detail.moreDetails'))!
    TestRenderer.act(() => disclosure.props.onPress())
    const geometry = measureProfileRow(tree.toJSON(), width, scale)
    const rowTitles = geometry.parts.filter((part) => part.slot === 'list-row-title')
    expect(rowTitles.length).toBeGreaterThanOrEqual(4)
    const date = geometry.parts.find((part) => part.slot === 'date-row-label')!
    const icons = geometry.parts.filter((part) => part.slot === 'list-row-icon')
    expect(date).toBeDefined()
    for (const icon of icons) expect(icon.left).toBeCloseTo(date.left, 1)
    for (const body of geometry.parts.filter((part) => part.slot === 'list-row-body')) {
      expect(body.left).toBeCloseTo(date.left - 12, 1)
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
    const ask = tree.root.findAllByType('Pressable').find((node: TestNode) => textsOf(node).includes('habits.detail.askAstra'))!
    TestRenderer.act(() => ask.props.onPressIn())
    const fill = tree.root.findAll((node: TestNode) => node.props['data-slot'] === 'list-row-body').find((node: TestNode) => (StyleSheet.flatten(node.props.style) as import('react-native').ViewStyle).left === -12)!
    expect(StyleSheet.flatten(fill.props.style)).toMatchObject({ backgroundColor: createTokensV2('purple', 'dark').bgHover, borderRadius: 12, left: -12, right: -12 })
    TestRenderer.act(() => ask.props.onPressOut())
    TestRenderer.act(() => tree.root.findAllByType('Pressable').find((node: TestNode) => textsOf(node).includes('habits.detail.askAstra'))!.props.onPress())
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    const prompt = 'habits.detail.askAstraSeedDefault:{"title":"Read"}'
    if (draft) {
      expect(useChatStore.getState().draft).toBe(draft)
      expect(useChatStore.getState().contextualSuggestion).toMatchObject({ id: 'habit-detail:habit-1', prompt })
    } else expect(useChatStore.getState().draft).toBe(prompt)
    mocks.reducedMotion = false
    mocks.realPressTokens = false
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
    expect(card.findAllByType('AstraGlyph')).toHaveLength(0)
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
