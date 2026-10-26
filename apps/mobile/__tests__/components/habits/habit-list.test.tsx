import { testI18n } from '@/__tests__/support/i18n'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { resetAccountQueries } from '@orbit/shared/query'
import { createMoveInventoryFixture } from '@orbit/shared/__tests__/move-inventory-fixtures'
import { createAppendedGeneralSearchItems, createHabitViewItems, createHabitViewScheduleItems, createHabitViewFixture, HABIT_VIEW_ROW_ORDER } from '@orbit/shared/__tests__/habit-view-fixtures'
import { createTokensV2 } from '@/lib/theme'
import { expectPressFill } from '../../support/press-feedback'
import React from 'react'
import { measureSafeArea, type GeometryTree } from '../../support/safe-area-geometry'
import { FlatList, StyleSheet, View, type ViewStyle, type HostInstance } from 'react-native'
import { Shell412 } from '@/components/shell/shell-412'
import { Fab } from '@/components/ui/fab'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit, createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { formatAPIDate, createApiClientError, normalizeHabitQueryData } from '@orbit/shared/utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toast } from '@/components/ui/app-toast'
import { useAppToastStore } from '@/stores/app-toast-store'
import { habitScheduleItemSchema, skipHabitRequestSchema } from '@orbit/shared/types/habit'
import type { HabitScheduleItem, NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitVisibilityOptions } from '@orbit/shared/utils/habit-visibility'
import { HabitList, type HabitListHandle } from '@/components/habit-list'
import { MoveParentDialog } from '@/components/habit-list/move-parent-dialog'
import { SelectionTray } from '@/components/habits/selection-tray'
import { TodayLaunchContent } from '@/components/today/today-launch-content'
import { HabitRow } from '@/components/habits/habit-row'
import { __resetTestHostConfig, __setMeasureInWindowImpl, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import { HabitListAllDone } from '@/components/habit-list/empty-state'
import { SearchEmpty } from '@/components/search/search-results'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { flushQueuedMutations } from '@/lib/offline-mutations'
import { clear as clearOfflineQueue, getAll as getQueuedMutations } from '@/lib/offline-queue'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const rootListScroll = vi.hoisted(() => ({ scrollToOffset: vi.fn() }))
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  const React = await import('react')
  return {
    ...actual,
    FlatList: React.forwardRef((props: React.ComponentProps<typeof actual.FlatList>, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: rootListScroll.scrollToOffset }), [])
      const renderSlot = (slot: unknown) => typeof slot === 'function' ? React.createElement(slot as React.ComponentType) : slot as React.ReactNode
      const children = props.testID === 'habit-list-all' ? <>
        {renderSlot(props.ListHeaderComponent)}
        {Array.from(props.data ?? []).map((item, index) => <React.Fragment key={index}>{props.renderItem?.({ item, index, separators: { highlight: () => {}, unhighlight: () => {}, updateProps: () => {} } })}</React.Fragment>)}
        {!props.data?.length ? renderSlot(props.ListEmptyComponent) : null}
      </> : props.children
      return React.createElement(actual.FlatList, props, children)
    }),
  }
})
const listQueryState = { isLoading: false, isError: false }

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => {
  TestRenderer.act(() => {
    for (const tree of mountedTrees) tree.unmount()
  })
  mountedTrees.clear()
  vi.useRealTimers()
  __resetTestHostConfig()
})

const TODAY = formatAPIDate(new Date())
const YESTERDAY = formatAPIDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
const TOMORROW = formatAPIDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const accountDate = vi.hoisted(() => ({ timeZone: undefined as string | undefined, hasProAccess: true, push: vi.fn() }))
const accountHabitCount = vi.hoisted(() => ({ count: 1, isLoaded: true }))
const setFrequencyFilters = vi.hoisted(() => vi.fn())

const skipFlow = vi.hoisted(() => ({ active: false }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '22222222-2222-4222-8222-222222222222' }))

function SkipToastHost() {
  const current = useAppToastStore((state) => state.currentToast)
  if (!current) return null
  const toast = current.toast
  return (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? <Toast {...toast} onAction={useAppToastStore.getState().triggerAction} />
    : <Toast {...toast} />
}

vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-habit-queries')>()),
  useHabitCountLoaded: () => accountHabitCount,
}))

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const TestRenderer = require('react-test-renderer')
const mountedTrees = new Set<{ unmount: () => void }>()

function createTestTree(element: React.ReactElement): ReturnType<typeof TestRenderer.create> {
  const tree = TestRenderer.create(element)
  mountedTrees.add(tree)
  return tree
}
const rowRenderCounts = vi.hoisted(() => new Map<string, number>())
const tokenBuilds = vi.hoisted(() => ({ count: 0 }))

vi.mock('@/components/habits/habit-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-row')>()
  const React = await import('react')
  type RowProps = React.ComponentProps<typeof actual.HabitRow>
  const row = actual.HabitRow as unknown as
    | ((props: RowProps) => React.ReactNode)
    | { type: (props: RowProps) => React.ReactNode }
  const renderRow = typeof row === 'function' ? row : row.type
  const trackedRenderRow = function TrackedHabitRow(
    props: RowProps,
  ) {
    const id = props.habit.id
    rowRenderCounts.set(id, (rowRenderCounts.get(id) ?? 0) + 1)
    return renderRow(props)
  }
  const trackedRow = typeof row === 'function' ? trackedRenderRow : row
  if (typeof row !== 'function') row.type = trackedRenderRow
  return {
    ...actual,
    HabitRow: function ObservedHabitRow(props: RowProps) {
      return React.createElement(trackedRow as React.ElementType, props)
    },
  }
})

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'children' in node) {
    return flattenText((node as { children?: unknown }).children)
  }
  if (typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

const reorderMutateAsync = vi.fn()
const logMutateAsync = vi.fn()
const habitListRefetch = vi.fn()
const deleteMutateAsync = vi.fn()
const duplicateMutateAsync = vi.fn()
const skipMutateAsync = vi.fn()
const bulkDeleteMutateAsync = vi.fn()
const bulkLogMutateAsync = vi.fn()
const bulkSkipMutateAsync = vi.fn()
const moveHabitParentMutateAsync = vi.fn()
let mockHabitsDataUpdatedAt = 1
let useActualHabitVisibility = false
const toggleSelectMode = vi.fn()
const toggleSelectionCascade = vi.fn()
const replaySelection = vi.hoisted(() => ({
  selectedHabitIds: new Set<string>(),
  isSelectMode: true,
  selectAllHabits: vi.fn(),
  clearSelection: vi.fn(),
}))
const replayDelivery = vi.hoisted(() => ({ listener: null as null | ((event: {
  mutationId: string
  type: 'bulkLogHabits' | 'bulkSkipHabits'
  items: { habitId: string; date?: string }[]
}) => unknown) }))
const colorProxy: Record<string, string> = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

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
  const appliedHabitIds: string[] = []
  const loggedHabits = new Set<string>()
  let online = false

  function receiveHabitToggle(endpoint: string): null {
    const match = endpoint.match(/^\/api\/habits\/([^/]+)\/log$/)
    const habitId = match?.[1]
    if (!habitId) return null

    appliedHabitIds.push(habitId)
    if (loggedHabits.has(habitId)) {
      loggedHabits.delete(habitId)
    } else {
      loggedHabits.add(habitId)
    }
    return null
  }

  const apiClient = vi.fn((endpoint: string, _options?: { body?: string }): Promise<unknown> => Promise.resolve(receiveHabitToggle(endpoint)))

  return {
    rows,
    appliedHabitIds,
    loggedHabits,
    apiClient,
    receiveHabitToggle,
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

vi.mock('@/lib/api-client', () => ({ apiClient: offlineMocks.apiClient }))
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

const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
  totalCount: 0,
}

let moveInventoryStreams: { scheduled: ReturnType<typeof normalizeHabitQueryData>; general: ReturnType<typeof normalizeHabitQueryData> } | null = null

let moveInventoryStatus = { scheduled: 'ready', general: 'ready' }

function moveQueryResult(filters: import('@orbit/shared/types/habit').HabitsFilter) {
  const inventory = moveInventoryStreams && (Object.keys(filters).length === 0 || (Object.keys(filters).length === 1 && filters.isGeneral === true))
    ? (filters.isGeneral ? moveInventoryStreams.general : moveInventoryStreams.scheduled) : mockHabitsData
  const state = moveInventoryStreams && inventory !== mockHabitsData ? moveInventoryStatus[filters.isGeneral ? 'general' : 'scheduled'] : 'ready'
  return {
    data: inventory, isSuccess: state === 'ready', isFetching: state === 'loading', isError: state === 'error',
    getChildren: (parentId: string) => (inventory.childrenByParent.get(parentId) ?? [])
      .map((id) => inventory.habitsById.get(id)!),
  }
}

const mockDrillState = {
  currentParentId: null as string | null,
  currentParent: null as NormalizedHabit | null,
  drillChildren: [] as NormalizedHabit[],
  hasUnfilteredChildren: false,
  canRevealCompletedChildren: false,
  drillStack: [] as string[],
  drillLoading: false,
  drillError: null as string | null,
  drillInto: vi.fn(async () => {}),
  drillBack: vi.fn(),
  drillReset: vi.fn(),
  refreshCurrent: vi.fn(async () => {}),
  getDrillChildren: vi.fn<(id: string) => NormalizedHabit[]>(() => []),
}
let capturedDrillOptions: HabitVisibilityOptions | undefined

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
  ...actual,
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'habits.deleteListConfirmMessage') {
        return testI18n.getFixedT('en')(key, params)
      }
      return params ? `${key}(${JSON.stringify(params)})` : key
    },
    i18n: { language: 'en' },
  }),
  }
})

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: accountDate.push,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
}))

vi.mock('@/hooks/use-habits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-habits')>()
  const { useState } = await import('react')
  return ({
    ...actual,
    useHabits: (...args: Parameters<typeof actual.useHabits>) => {
      const [useRealHook] = useState(() => skipFlow.active)
      return useRealHook ? actual.useHabits(...args) : ({
        ...moveQueryResult(args[0]),
        data: listQueryState.isError ? undefined : moveQueryResult(args[0]).data,
        isLoading: listQueryState.isLoading,
        isError: listQueryState.isError || moveQueryResult(args[0]).isError,
        dataUpdatedAt: mockHabitsDataUpdatedAt,
        refetch: habitListRefetch,

      })
    },
    useLogHabit: () => ({ mutate: vi.fn(), mutateAsync: logMutateAsync }),
    useSkipHabit: () => {
      const [useRealHook] = useState(() => skipFlow.active)
      return useRealHook ? actual.useSkipHabit() : ({ mutateAsync: skipMutateAsync })
    },
    useDeleteHabit: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
    useBulkDeleteHabits: () => ({ mutateAsync: bulkDeleteMutateAsync }),
    useBulkLogHabits: () => ({ mutateAsync: bulkLogMutateAsync }),
    useBulkMoveHabitParent: () => ({ mutateAsync: vi.fn() }),
  useBulkSkipHabits: () => ({ mutateAsync: bulkSkipMutateAsync }),
    useDuplicateHabit: () => ({ mutateAsync: duplicateMutateAsync }),
    useReorderHabits: () => ({ mutateAsync: reorderMutateAsync }),
    useMoveHabitParent: () => ({ mutateAsync: moveHabitParentMutateAsync, isPending: false }),
  })
})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { hasProAccess: accountDate.hasProAccess, timeZone: accountDate.timeZone },
  }),
}))

vi.mock('@/hooks/use-drill-navigation', () => ({
  useDrillNavigation: (_byId: unknown, _updated: unknown, options: HabitVisibilityOptions) => {
    capturedDrillOptions = options
    return mockDrillState
  },
}))

vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({
    maxHabitDepth: 5,
    config: { limits: { maxHabitDepth: 5 } },
  }),
}))

vi.mock('@/hooks/use-habit-visibility', async () => {
  const { createHabitVisibilityHelpers, getChildrenFromIndex } = await import(
    '@orbit/shared/utils/habit-visibility'
  )

  return {
    useHabitVisibility: (options: HabitVisibilityOptions) => {
      const helpers = createHabitVisibilityHelpers(options)

      return {
        ...helpers,
        hasVisibleContent: useActualHabitVisibility
          ? helpers.hasVisibleContent
          : () => true,
        getVisibleChildren: useActualHabitVisibility
          ? helpers.getVisibleChildren
          : (parentId: string, view: 'today' | 'all' | 'general') =>
              options.showCompleted && view !== 'all'
                ? getChildrenFromIndex(
                    parentId,
                    options.habitsById,
                    options.childrenByParent,
                  )
                : helpers.getVisibleChildren(parentId, view),
        isRelevantToday: () => true,
        isDueOnSelectedDate: () => true,
      }
    },
  }
})

vi.mock('@/stores/ui-store', () => {
  const getState = () => ({
      setFilters: setFrequencyFilters,
      toggleSelectMode,
      toggleSelectionCascade,
      ...replaySelection,
    })
  return { useUIStore: Object.assign(
    (selector: (state: any) => unknown) => selector(getState()),
    { getState },
  ) }
})

vi.mock('@/lib/bulk-replay-events', () => ({
  subscribeBulkReplaySuccesses: (listener: typeof replayDelivery.listener) => {
    replayDelivery.listener = listener
    return () => { replayDelivery.listener = null }
  },
}))

vi.mock('@/lib/habit-selection-state', async (importOriginal) => (
  importOriginal<typeof import('@/lib/habit-selection-state')>()
))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
    currentScheme: 'purple',
    currentTheme: 'dark',
  }),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: (props: Record<string, unknown>) =>
    props.open ? React.createElement('ConfirmDialog', props) : null,
}))

vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: ({ open }: { open: boolean }) => open ? React.createElement('CreateHabitModal', { testID: 'create-sub-habit' }) : null,
}))

vi.mock('@/components/habits/reschedule-sheet', () => ({
  RescheduleSheet: (props: Record<string, unknown>) =>
    React.createElement('RescheduleSheet', props),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({
    displayTime: (value: string | null | undefined) => value ?? '',
  }),
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createColors: () => colorProxy,
    createTokensV2: () => {
      tokenBuilds.count += 1
      return colorProxy
    },
  }
})

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('Svg', props),
  Rect: (props: any) => React.createElement('Rect', props),
  Circle: (props: any) => React.createElement('Circle', props),
  Path: (props: any) => React.createElement('Path', props),
}))

function flattenRenderedText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenRenderedText).join('')
  if (typeof node === 'object' && 'children' in node) {
    return flattenRenderedText(node.children)
  }
  return ''
}

function seedHabits(habits: NormalizedHabit[]) {
  mockHabitsData.habitsById = new Map(habits.map((habit) => [habit.id, habit]))
  mockHabitsData.childrenByParent = new Map<string, string[]>()
  mockHabitsData.topLevelHabits = habits.filter((habit) => !habit.parentId)

  for (const habit of habits) {
    if (!habit.parentId) continue
    const siblings = mockHabitsData.childrenByParent.get(habit.parentId) ?? []
    siblings.push(habit.id)
    mockHabitsData.childrenByParent.set(habit.parentId, siblings)
  }
}

/** The sheet double renders every sheet as a `Sheet` host node carrying its title. */
function confirmationSheets(tree: any, title: string) {
  return tree.root.findAll(
    (node: any) => node.type === 'Sheet' && node.props?.title === title && node.props.open,
  )
}

function pressConfirm(tree: any, label: string) {
  const button = tree.root.findAll(
    (node: any) =>
      typeof node.props?.onPress === 'function' &&
      node.findAll((child: any) => child.type === 'Text' && child.props.children === label)
        .length > 0,
  )
  const target = button.at(-1)
  if (!target) throw new Error(`Confirm action not found: ${label}`)
  target.props.onPress()
}

async function confirmRowSkip(tree: any, habitId: string) {
  TestRenderer.act(() => {
    const row = tree.root.findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === habitId)
    row?.props.actions.onSkip()
  })
  await TestRenderer.act(async () => {
    await Promise.resolve()
  })
}

type BulkActions = ReturnType<typeof useBulkActions>
function renderBulkActionsWithHabitList(selectedHabitIds: Set<string>) {
  const habitListRef = React.createRef<HabitListHandle>()
  const captured: { current: BulkActions | null } = { current: null }

  function Harness() {
    captured.current = useBulkActions({
      selectedHabitIds,
      selectedDateStr: TODAY,
      completionReadOnly: false,
      habitsById: new Map(),
      habitListRef,
      onSuccess: vi.fn(),
      onPartialFailure: vi.fn(),
    })

    return (
      <HabitList
        ref={habitListRef}
        view="today"
        filters={{}}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
  }

  TestRenderer.act(() => {
    createTestTree(<Harness />)
  })

  return captured
}

function queueHabitToggle({ habitId, date }: { habitId: string; date?: string }) {
  const occurrenceDate = date ?? TODAY
  return performQueuedApiMutation({
    type: 'logHabit',
    scope: 'habits',
    endpoint: `/api/habits/${habitId}/log`,
    method: 'POST',
    payload: date ? { date } : undefined,
    entityType: 'habit',
    targetEntityId: habitId,
    dedupeKey: `habit-toggle:${habitId}:${occurrenceDate}`,
  })
}

describe('HabitList', () => {
  beforeEach(() => {
    moveInventoryStatus = { scheduled: 'ready', general: 'ready' }
    moveInventoryStreams = null
    listQueryState.isLoading = false
    listQueryState.isError = false
    replaySelection.selectedHabitIds = new Set()
    replaySelection.isSelectMode = true
    replayDelivery.listener = null
    accountDate.timeZone = undefined
    capturedDrillOptions = undefined
    vi.clearAllMocks()
    sheetTestControls.defer(false)
    clearOfflineQueue()
    offlineMocks.appliedHabitIds.length = 0
    offlineMocks.loggedHabits.clear()
    offlineMocks.setOnline(false)
    offlineMocks.apiClient.mockImplementation((endpoint: string) => Promise.resolve(offlineMocks.receiveHabitToggle(endpoint)))
    skipFlow.active = false
    useAppToastStore.setState({ currentToast: null, queue: [] })
    mockHabitsDataUpdatedAt = 1
    useActualHabitVisibility = false
    habitListRefetch.mockReset()
    habitListRefetch.mockResolvedValue(undefined)
    logMutateAsync.mockReset()
    skipMutateAsync.mockReset()
    skipMutateAsync.mockResolvedValue(undefined)
    bulkDeleteMutateAsync.mockReset()
    bulkLogMutateAsync.mockReset()
    bulkSkipMutateAsync.mockReset()
    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => {
      const habit = mockHabitsData.habitsById.get(habitId)
      if (!habit) return

      mockHabitsData.habitsById.set(habitId, {
        ...habit,
        isCompleted: true,
      })
    })
    mockDrillState.currentParentId = null
    mockDrillState.currentParent = null
    mockDrillState.drillChildren = []
    mockDrillState.hasUnfilteredChildren = false
    mockDrillState.canRevealCompletedChildren = false
    mockDrillState.drillStack = []
    mockDrillState.drillLoading = false
    mockDrillState.drillError = null
    mockHabitsData.totalCount = 0
    accountHabitCount.count = 1
    accountHabitCount.isLoaded = true
    seedHabits([createMockHabit({ id: 'habit-1', title: 'Exercise', position: 0 })])
  })

  it.each(['close', 'account', 'unmount'] as const)('discards late Move work after %s', async (boundary) => {
    skipFlow.active = true
    const fixture = createMoveInventoryFixture(TODAY)
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    offlineMocks.apiClient.mockImplementation(async (url: string) => {
      if (url.includes('page=2')) await held
      return fixture.response(url)
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = createTestTree(<QueryClientProvider client={client}>
      <HabitList filters={{ dateFrom: TODAY }} showCompleted onCreatePress={vi.fn()} />
    </QueryClientProvider>); await Promise.resolve() })
    const rows = () => tree!.root.findAllByType(HabitRow)
    await vi.waitFor(() => expect(rows().some((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === 'source')).toBe(true))
    TestRenderer.act(() => rows().find((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === 'source')!.props.actions.onMoveParent())
    const picker = () => tree!.root.findByType(MoveParentDialog)
    expect(picker().props.inventoryState).toBe('loading')
    if (boundary === 'close') TestRenderer.act(() => picker().props.onClose())
    else if (boundary === 'account') await TestRenderer.act(async () => { advanceAccountGeneration(); await resetAccountQueries(client, 'signed-out') })
    else TestRenderer.act(() => tree!.unmount())
    await TestRenderer.act(async () => { release(); await held })
    if (boundary !== 'unmount') expect(picker().props.visible).toBe(false)
    expect(moveHabitParentMutateAsync).not.toHaveBeenCalled()
    if (boundary !== 'unmount') TestRenderer.act(() => tree!.unmount())
    client.clear()
  })

  it('keeps General sources captured across filters and recovers missing or stale inventory', async () => {
    const source = createMockHabitScheduleItem({ id: 'source', title: 'source', isGeneral: true })
    Object.assign(mockHabitsData, normalizeHabitQueryData([source]))
    moveInventoryStreams = { scheduled: normalizeHabitQueryData([createMockHabitScheduleItem({ id: 'scheduled', title: 'Scheduled target' })]),
      general: normalizeHabitQueryData([source, createMockHabitScheduleItem({ id: 'general-target', title: 'General target', isGeneral: true })]) }
    const onBulkMove = vi.fn().mockResolvedValue({ results: [{ index: 0, habitId: 'source', status: 'Success' }] })
    const ref = React.createRef<HabitListHandle>()
    const list = () => <HabitList ref={ref} filters={{ dateFrom: TODAY, search: 'source' }} showCompleted onCreatePress={vi.fn()}
      isSelectMode selectedHabitIds={new Set(['source'])} onBulkMove={onBulkMove} />
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(list()) })
    moveInventoryStatus.general = 'error'
    TestRenderer.act(() => ref.current!.openBulkMove())
    const picker = () => tree!.root.findByType(MoveParentDialog)
    expect(picker().props.inventoryState).toBe('error')
    expect(picker().props.canSubmit).toBe(false)
    expect(flattenRenderedText(tree!.toJSON())).not.toContain('habits.moveParent.noDestinations')
    TestRenderer.act(() => picker().props.onRetryInventory())
    expect(habitListRefetch).toHaveBeenCalledTimes(2)
    moveInventoryStatus.general = 'ready'
    TestRenderer.act(() => tree!.update(list()))
    expect(picker().props.options.find((option: { id: string }) => option.id === 'general-target').disabled).toBe(false)
    expect(picker().props.options.find((option: { id: string }) => option.id === 'scheduled').disabled).toBe(true)
    TestRenderer.act(() => picker().props.onSelectOption('general-target'))
    moveInventoryStreams.general = normalizeHabitQueryData([source])
    TestRenderer.act(() => tree!.update(list()))
    expect(picker().props.inventoryState).toBe('stale')
    expect(picker().props.selectedMoveParentId).toBe('general-target')
    expect(picker().props.canSubmit).toBe(false)
    moveInventoryStreams.general = normalizeHabitQueryData([])
    TestRenderer.act(() => tree!.update(list()))
    expect(picker().props.inventoryState).toBe('error')
    moveInventoryStreams.general = normalizeHabitQueryData([source, createMockHabitScheduleItem({ id: 'general-target', title: 'General target', isGeneral: true })])
    Object.assign(mockHabitsData, normalizeHabitQueryData([createMockHabitScheduleItem({ id: 'other-visible' })]))
    TestRenderer.act(() => tree!.update(<HabitList ref={ref} view="general" filters={{ isGeneral: true, isCompleted: true, page: 4 }}
      showCompleted onCreatePress={vi.fn()} isSelectMode selectedHabitIds={new Set(['other-visible'])} onBulkMove={onBulkMove} />))
    expect(picker().props.selectedMoveParentId).toBe('general-target')
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.moveParent.confirm'); await Promise.resolve() })
    expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(['source'], 'general-target')
  })

  it.each(['source', 'nested-source'])('waits for both complete streams and searches the actual paginated picker for %s', async (sourceId) => {
    skipFlow.active = true
    const fixture = createMoveInventoryFixture(TODAY)
    const requests: string[] = []
    let releaseScheduled: () => void = () => {}
    let releaseGeneral: () => void = () => {}
    const heldScheduled = new Promise<void>((resolve) => { releaseScheduled = resolve })
    const heldGeneral = new Promise<void>((resolve) => { releaseGeneral = resolve })
    offlineMocks.apiClient.mockImplementation(async (url: string) => {
      requests.push(url)
      if (url.includes('page=2')) await (url.includes('isGeneral=true') ? heldGeneral : heldScheduled)
      const response = fixture.response(url)
      return url.includes('dateFrom=') && sourceId === 'nested-source'
        ? { ...response, items: [createMockHabitScheduleItem({ id: sourceId, title: sourceId })] } : response
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = createTestTree(<QueryClientProvider client={client}>
      <HabitList filters={{ dateFrom: TODAY, dateTo: TODAY, search: 'source', isCompleted: false, frequencyUnit: 'Day', tagIds: ['tag'] }} showCompleted onCreatePress={vi.fn()} />
    </QueryClientProvider>); await Promise.resolve() })
    const rows = () => tree!.root.findAllByType(HabitRow)
    await vi.waitFor(() => expect(rows().some((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === sourceId)).toBe(true))
    TestRenderer.act(() => rows().find((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === sourceId)!.props.actions.onMoveParent())
    const picker = () => tree!.root.findByType(MoveParentDialog)
    await vi.waitFor(() => expect(requests).toHaveLength(5))
    expect(picker().props.inventoryState).toBe('loading')
    expect(picker().props.canSubmit).toBe(false)
    expect(flattenRenderedText(tree!.toJSON())).not.toContain('habits.moveParent.noDestinations')
    await TestRenderer.act(async () => { releaseScheduled(); await heldScheduled })
    expect(picker().props.inventoryState).toBe('loading')
    await TestRenderer.act(async () => { releaseGeneral(); await heldGeneral })
    await vi.waitFor(() => expect(picker().props.inventoryState).toBeUndefined())
    const options = picker().props.options as import('@orbit/shared/utils').MoveParentOption[]
    expect(new Set(options.map((option) => option.id))).toEqual(new Set(fixture.optionIds))
    for (const id of ['past', 'future', 'finished-container', 'completed-recurring'])
      expect(options.find((option) => option.id === id)?.disabled).toBe(false)
    for (const id of sourceId === 'source' ? ['hidden-descendant', 'deep-3', 'general-two'] : ['general-two'])
      expect(options.find((option) => option.id === id)?.disabled).toBe(true)
    expect(picker().props.movingHabitParentId).toBe(sourceId === 'source' ? null : 'current-parent')
    if (sourceId === 'nested-source') expect(options.find((option) => option.id === 'current-parent')?.disabled).toBe(true)
    const input = tree!.root.findAll((node: { props: { label?: string; onChange?: unknown } }) => node.props.label === 'habits.moveParent.searchPlaceholder' && typeof node.props.onChange === 'function')[0]!
    TestRenderer.act(() => input.props.onChange('ACAO FUTURA'))
    const text = flattenRenderedText(tree!.toJSON())
    expect(text).toContain('General two')
    expect(text).toContain('Ação futura')
    expect(text).not.toContain('Past destination')
    TestRenderer.act(() => input.props.onChange(''))
    expect(flattenRenderedText(tree!.toJSON())).toContain('Past destination')
    expect(requests.filter((url) => !url.includes('dateFrom='))).toEqual(expect.arrayContaining([
      '/api/habits?pageSize=200', '/api/habits?page=2&pageSize=200',
      '/api/habits?isGeneral=true&pageSize=200', '/api/habits?isGeneral=true&page=2&pageSize=200',
    ]))
    expect(requests.filter((url) => !url.includes('dateFrom='))).toHaveLength(4)
    expect(rows().map((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id)).toEqual([sourceId])
    TestRenderer.act(() => tree!.unmount())
    client.clear()
  })

  it.each(['single', 'bulk'] as const)('offers complete account destinations through the actual %s picker', async (entry) => {
    const source = createMockHabitScheduleItem({ id: 'source', title: 'source' })
    Object.assign(mockHabitsData, normalizeHabitQueryData([source]))
    moveInventoryStreams = { scheduled: normalizeHabitQueryData([
      { ...source, children: [createMockHabitScheduleChild({ id: 'hidden-descendant', title: 'Hidden descendant' })] },
      createMockHabitScheduleItem({ id: 'past', title: 'Past destination', dueDate: YESTERDAY, scheduledDates: [] }),
      createMockHabitScheduleItem({ id: 'future', title: 'Future page two', dueDate: TOMORROW, scheduledDates: [] }),
    ].map((item) => habitScheduleItemSchema.parse(item))), general: normalizeHabitQueryData([
      habitScheduleItemSchema.parse(createMockHabitScheduleItem({ id: 'general', title: 'General destination', isGeneral: true })),
    ]) }
    const onBulkMove = vi.fn().mockResolvedValue({ results: [{ index: 0, habitId: 'source', status: 'Success' }] })
    const ref = React.createRef<HabitListHandle>()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<HabitList ref={ref} showCompleted onCreatePress={vi.fn()}
      filters={{ dateFrom: TODAY, dateTo: TODAY, search: 'source', tagIds: ['tag'], frequencyUnit: 'Day', isCompleted: false }}
      isSelectMode={entry === 'bulk'} selectedHabitIds={new Set(['source'])} onBulkMove={onBulkMove} />) })
    TestRenderer.act(() => {
      if (entry === 'bulk') ref.current!.openBulkMove()
      else tree!.root.findAllByType(HabitRow).find((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === 'source')!.props.actions.onMoveParent()
    })
    const picker = () => tree!.root.findByType(MoveParentDialog)
    const options = picker().props.options as import('@orbit/shared/utils').MoveParentOption[]
    expect(options.find((option) => option.id === 'past')).toMatchObject({ disabled: false })
    expect(options.find((option) => option.id === 'future')).toMatchObject({ disabled: false })
    expect(options.find((option) => option.id === 'hidden-descendant')).toMatchObject({ disabled: true })
    expect(options.find((option) => option.id === 'general')).toMatchObject({ disabled: true })
    TestRenderer.act(() => picker().props.onSelectOption('past'))
    expect(picker().props.canSubmit).toBe(true)
    TestRenderer.act(() => picker().props.onSelectOption('future'))
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.moveParent.confirm'); await Promise.resolve() })
    if (entry === 'bulk') expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(['source'], 'future')
    else expect(moveHabitParentMutateAsync).toHaveBeenCalledExactlyOnceWith({ habitId: 'source', data: { parentId: 'future' } })
  })

  it.each([100, 101])('enforces the bulk move boundary for %s selected ids', async (count) => {
    const ids = Array.from({ length: count }, (_, index) => `habit-${index}`)
    seedHabits([...ids, 'target'].map((id) => createMockHabit({ id, title: id })))
    const onBulkMove = vi.fn().mockResolvedValue({ results: ids.map((habitId, index) => ({ index, habitId, status: 'Success' })) })
    const ref = React.createRef<HabitListHandle>()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<>
        <SelectionTray count={count} allSelected onSelectAll={vi.fn()} onDeselectAll={vi.fn()}
          onLog={vi.fn()} onSkip={vi.fn()} onMove={() => ref.current?.openBulkMove()} onDelete={vi.fn()} onClose={vi.fn()}
          countSuffixLabel="selected" selectAllLabel="Select all" deselectAllLabel="Deselect all"
          logLabel="Log selected" skipLabel="Skip selected" moveLabel="Move selected" deleteLabel="Delete selected" closeLabel="Cancel" />
        <HabitList ref={ref} filters={{}} showCompleted onCreatePress={vi.fn()}
          isSelectMode selectedHabitIds={new Set(ids)} onBulkMove={onBulkMove} />
      </>)
    })
    const move = tree!.root.findAll((node: { type: unknown; props: { accessibilityLabel?: string } }) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === 'Move selected')[0]!
    if (count === 101) {
      expect.soft(move.props.disabled).toBe(true)
      expect.soft(flattenRenderedText(tree!.toJSON())).toContain('habits.bulkBar.moveLimit')
      TestRenderer.act(() => ref.current!.openBulkMove())
      expect.soft(tree!.root.findByType(MoveParentDialog).props.visible).toBe(false)
      expect(onBulkMove).not.toHaveBeenCalled()
      return
    }
    expect(move.props.disabled).toBe(false)
    TestRenderer.act(() => move.props.onPress())
    const picker = () => tree!.root.findByType(MoveParentDialog)
    expect(picker().props.visible).toBe(true)
    TestRenderer.act(() => picker().props.onSelectOption('target'))
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.moveParent.confirm'); await Promise.resolve() })
    expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(ids, 'target')
    expect(picker().props.visible).toBe(false)
  })

  it('still moves one habit from its row menu and closes through the picker', async () => {
    seedHabits(['source', 'target'].map((id) => createMockHabit({ id, title: id })))
    moveHabitParentMutateAsync.mockResolvedValue(undefined)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<HabitList filters={{}} showCompleted onCreatePress={vi.fn()} />) })
    TestRenderer.act(() => {
      tree!.root.findAllByType(HabitRow).find((row: { props: { habit: NormalizedHabit; actions: { onMoveParent: () => void } } }) => row.props.habit.id === 'source')!.props.actions.onMoveParent()
    })
    const picker = () => tree!.root.findByType(MoveParentDialog)
    expect(picker().props.options.find((option: { id: string }) => option.id === 'source').disabled).toBe(true)
    TestRenderer.act(() => picker().props.onSelectOption('target'))
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.moveParent.confirm'); await Promise.resolve() })
    expect(moveHabitParentMutateAsync).toHaveBeenCalledExactlyOnceWith({ habitId: 'source', data: { parentId: 'target' } })
    expect(picker().props.visible).toBe(false)
  })

  it('keeps a bulk move open with its destination and retries only the failed habit', async () => {
    seedHabits(['a', 'b', 'c', 'target'].map((id) => createMockHabit({ id, title: id, parentId: id === 'b' ? 'a' : null })))
    const onBulkMove = vi.fn()
      .mockResolvedValueOnce({ results: ['a', 'b', 'c'].map((habitId, index) => ({
        index, habitId, status: habitId === 'b' ? 'Failed' : 'Success', error: habitId === 'b' ? 'Move refused by server' : null,
      })) })
      .mockResolvedValueOnce({ results: [{ index: 0, habitId: 'b', status: 'Success' }] })
    const ref = React.createRef<HabitListHandle>()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList ref={ref} filters={{}} showCompleted onCreatePress={vi.fn()}
        isSelectMode selectedHabitIds={new Set(['a', 'b', 'c'])} onBulkMove={onBulkMove} />)
    })
    TestRenderer.act(() => ref.current!.openBulkMove())
    const picker = () => tree!.root.findByType(MoveParentDialog)
    expect(picker().props.movingHabitParentId).toBeUndefined()
    expect(picker().props.options.filter((option: { id: string; disabled: boolean }) => ['a', 'b', 'c'].includes(option.id)).every((option: { disabled: boolean }) => option.disabled)).toBe(true)
    TestRenderer.act(() => picker().props.onSelectOption('target'))
    await TestRenderer.act(async () => { await picker().props.onConfirm() })
    expect(onBulkMove).toHaveBeenNthCalledWith(1, ['a', 'b', 'c'], 'target')
    expect(picker().props.visible).toBe(true)
    expect(picker().props.selectedMoveParentId).toBe('target')
    expect(picker().props.error).toBe('habits.moveParent.errorPartial')
    expect(picker().props.movingHabitCount).toBe(1)
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.moveParent.confirm'); await Promise.resolve() })
    expect(onBulkMove).toHaveBeenNthCalledWith(2, ['b'], 'target')
    expect(picker().props.visible).toBe(false)
  })

  it.each(['ready', 'error'] as const)('preserves the active Move operation across list loading and %s', async (outcome) => {
    skipFlow.active = true
    const fixture = createMoveInventoryFixture(TODAY)
    let releaseList = () => {}
    let heldList = new Promise<void>((resolve) => { releaseList = resolve })
    const changedRequests = vi.fn()
    offlineMocks.apiClient.mockImplementation(async (url: string) => {
      if (url.includes('dateFrom=') && !url.includes(`dateFrom=${TODAY}`)) {
        changedRequests()
        await heldList
        if (outcome === 'error') throw new Error('List unavailable')
      }
      return fixture.response(url)
    })
    let releaseMove = (_result: import('@orbit/shared/types/habit').BulkMoveHabitParentResult) => {}
    const heldMove = new Promise<import('@orbit/shared/types/habit').BulkMoveHabitParentResult>((resolve) => { releaseMove = resolve })
    const onBulkMove = vi.fn().mockReturnValueOnce(heldMove)
      .mockResolvedValueOnce({ results: [{ index: 0, habitId: 'past', status: 'Success' }] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const ref = React.createRef<HabitListHandle>()
    const list = (date: string) => <QueryClientProvider client={client}>
      <HabitList ref={ref} filters={{ dateFrom: date }} showCompleted onCreatePress={vi.fn()} isSelectMode
        selectedHabitIds={new Set(['source', 'past'])} onBulkMove={onBulkMove} />
    </QueryClientProvider>
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = createTestTree(list(TODAY)); await Promise.resolve() })
    const rows = () => tree!.root.findAllByType(HabitRow)
    await vi.waitFor(() => expect(rows().some((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === 'source')).toBe(true))
    TestRenderer.act(() => ref.current!.openBulkMove())
    const picker = () => tree!.root.findByType(MoveParentDialog)
    await vi.waitFor(() => expect(picker().props.inventoryState).toBeUndefined())
    const search = () => tree!.root.findAll((node: { props: { label?: string; onChange?: unknown } }) =>
      node.props.label === 'habits.moveParent.searchPlaceholder' && typeof node.props.onChange === 'function')[0]!
    TestRenderer.act(() => { search().props.onChange('Future page'); picker().props.onSelectOption('future') })
    TestRenderer.act(() => { pressConfirm(tree, 'habits.moveParent.confirm') })
    expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(['source', 'past'], 'future')
    await TestRenderer.act(async () => { tree!.update(list(TOMORROW)); await Promise.resolve() })
    await vi.waitFor(() => expect(changedRequests).toHaveBeenCalledOnce())
    expect(picker().props.visible).toBe(true)
    expect(picker().props.selectedMoveParentId).toBe('future')
    expect(search().props.value).toBe('Future page')
    expect(picker().props.isPending).toBe(true)
    await TestRenderer.act(async () => { releaseList(); await heldList })
    if (outcome === 'error') await vi.waitFor(() => expect(tree!.root.findByType(FlatList).props.ListEmptyComponent.props.title).toBe('habits.loadError'))
    else await vi.waitFor(() => expect(rows().some((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === 'source')).toBe(true))
    await TestRenderer.act(async () => { await picker().props.onConfirm() })
    expect(onBulkMove).toHaveBeenCalledOnce()
    await TestRenderer.act(async () => { releaseMove({ results: [
      { index: 0, habitId: 'source', status: 'Success' },
      { index: 1, habitId: 'past', status: 'Failed', error: 'Move refused by server' },
    ] }); await heldMove })
    await vi.waitFor(() => expect(picker().props.error).toBe('habits.moveParent.errorPartial'))
    changedRequests.mockClear()
    heldList = new Promise<void>((resolve) => { releaseList = resolve })
    await TestRenderer.act(async () => { tree!.update(list(YESTERDAY)); await Promise.resolve() })
    await vi.waitFor(() => expect(changedRequests).toHaveBeenCalledOnce())
    expect(picker().props.selectedMoveParentId).toBe('future')
    expect(search().props.value).toBe('Future page')
    expect(picker().props.movingHabitCount).toBe(1)
    expect(picker().props.error).toBe('habits.moveParent.errorPartial')
    await TestRenderer.act(async () => { releaseList(); await heldList })
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.moveParent.confirm'); await Promise.resolve() })
    expect(onBulkMove).toHaveBeenNthCalledWith(2, ['past'], 'future')
    expect(picker().props.visible).toBe(false)
    TestRenderer.act(() => tree!.unmount())
    client.clear()
  })

  it('opens sub-habit creation for a free account from the habit list', () => {
    accountDate.hasProAccess = false
    try {
      seedHabits([createMockHabit({ id: 'free-parent', title: 'Parent', scheduledDates: [TODAY] })])
      let tree!: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = createTestTree(<HabitList view="today" showCompleted={false} onCreatePress={vi.fn()} filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />) })
      accountDate.push.mockClear()
      const row = tree.root.findAllByType(HabitRow)[0]!
      TestRenderer.act(() => { row.props.actions.onAddSubHabit() })
      expect(tree.root.findAllByProps({ testID: 'create-sub-habit' }).length).toBeGreaterThan(0)
      expect(accountDate.push).not.toHaveBeenCalled()
    } finally { accountDate.hasProAccess = true }
  })

  it.each([false, true])('scopes Hoje search with appended general habits, matching descendant=%s', (matchesDescendant) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, normalizeHabitQueryData(createAppendedGeneralSearchItems(matchesDescendant)))
    const query = matchesDescendant ? 'Needle child' : 'zzzz-no-match'
    const onClearSearch = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeGeneral: true, search: query }}
        searchQuery={query} showCompleted={false} onCreatePress={vi.fn()} onClearSearch={onClearSearch} />)
    })
    const ids = tree!.root.findAllByType(HabitRow).map((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id)
    expect(ids).toEqual(matchesDescendant ? ['general-parent', 'general-match'] : [])
    if (matchesDescendant) expect(tree!.root.findAllByType(SearchEmpty)).toHaveLength(0)
    else {
      expect(tree!.root.findByType(SearchEmpty).props.query).toBe(query)
      const clear = tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'Pressable' && flattenText(node.props.children).includes('common.clear'))[0]!
      TestRenderer.act(() => clear.props.onPress())
      expect(onClearSearch).toHaveBeenCalledOnce()
    }
  })

  it('loads producer-shaped Todos rows with overdue logging and rescheduling available', async () => {
    skipFlow.active = true
    useActualHabitVisibility = true
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    offlineMocks.apiClient.mockImplementation((url: string) => {
      const items = url.includes('dateFrom=') ? createHabitViewScheduleItems(TODAY) : createHabitViewItems(TODAY, 'all')
      return Promise.resolve({ items, page: 1, pageSize: 200, totalCount: items.length, totalPages: 1 })
    })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<QueryClientProvider client={queryClient}><HabitList view="all" filters={{}} showCompleted={false} onCreatePress={vi.fn()} /></QueryClientProvider>)
    })
    await TestRenderer.act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    const rows = tree!.root.findAllByType(HabitRow)
    const overdue = rows.find((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === 'overdue')!
    expect(overdue.props.habit.isOverdue).toBe(true)
    const logButton = overdue.find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel?.includes('habits.logHabit') === true)
    expect(logButton.props.disabled).toBe(false)
    expect(overdue.props.actions.onReschedule).toBeTypeOf('function')
    expect(rows.some((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === 'future')).toBe(true)
    await TestRenderer.act(async () => { overdue.props.actions.onLog(); await Promise.resolve() })
    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue', intent: 'log' })
    queryClient.clear()
  })

  it.each(['future', 'future-child'])('withholds current-day Skip from the future recurring Todos row %s', (id) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, 'all'))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<HabitList view="all" filters={{}} showCompleted={false} onCreatePress={vi.fn()} />) })
    const row = tree!.root.findAllByType(HabitRow).find((node: { props: { habit: NormalizedHabit } }) => node.props.habit.id === id)!
    TestRenderer.act(() => row.findAll((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'habits.actions.more')[0].props.onPress())
    const skipItems = tree!.root.findAll((node: { props: { accessibilityRole?: string } }) => node.props.accessibilityRole === 'menuitem' && flattenRenderedText(node).includes('habits.actions.skip'))
    expect(skipItems).toHaveLength(0)
    expect(row.props.actions.onSkip).toBeUndefined()
    expect(skipMutateAsync).not.toHaveBeenCalled()
  })

  it.each(['parent', 'today-child', 'overdue', 'one-time'])('keeps current-day Skip or postponement available for the Todos row %s', async (id) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, 'all'))
    const oneTime = createMockHabit({ id: 'one-time', frequencyUnit: null, dueDate: TOMORROW, scheduledDates: [] })
    mockHabitsData.habitsById.set(oneTime.id, oneTime)
    mockHabitsData.topLevelHabits.push(oneTime)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<HabitList view="all" filters={{}} showCompleted={false} onCreatePress={vi.fn()} />) })
    await confirmRowSkip(tree, id)
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: id, date: TODAY, onUndo: expect.any(Function) })
  })

  it.each(['all', 'general'] as const)('retains row actions and selection in %s', async (view) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, view))
    const id = view === 'all' ? 'overdue' : 'general'
    const edit = vi.fn()
    const detail = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<HabitList view={view} filters={{}} selectedDate={new Date('2000-01-01T12:00:00')} showCompleted onCreatePress={vi.fn()} onEditHabit={edit} onDetailHabit={detail} />) })
    const row = () => tree!.root.findAllByType(HabitRow).find((node: { props: { habit: NormalizedHabit } }) => node.props.habit.id === id)!
    await TestRenderer.act(async () => { row().props.actions.onLog(); await Promise.resolve() })
    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: id, intent: 'log' })
    await TestRenderer.act(async () => { row().props.actions.onUnlog(); await Promise.resolve() })
    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: id, intent: 'unlog' })
    TestRenderer.act(() => { row().props.actions.onToggleSelection(); row().props.actions.onEdit(); row().props.actions.onDetail() })
    expect(toggleSelectionCascade).toHaveBeenCalledWith(id, expect.any(Function))
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id }), undefined)
    expect(detail).toHaveBeenCalledWith(expect.objectContaining({ id }))
    await TestRenderer.act(async () => { row().props.actions.onDuplicate(); await Promise.resolve() })
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.duplicateConfirm'); await Promise.resolve() })
    expect(duplicateMutateAsync).toHaveBeenCalledWith(id)
    if (view === 'all') {
      await confirmRowSkip(tree, id)
      expect(skipMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ habitId: id }))
    }
    await TestRenderer.act(async () => { row().props.actions.onDelete(); await Promise.resolve() })
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.deleteHabit'); await Promise.resolve() })
    expect(deleteMutateAsync).toHaveBeenCalledWith(id)
  })

  it.each(['today', 'all', 'general'] as const)('restores production membership and nesting in %s', (view) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, view))
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view={view} filters={view === 'general' ? { isGeneral: true } : {}} selectedDate={new Date(`${TODAY}T00:00:00`)} showCompleted={false} onCreatePress={vi.fn()} />)
    })
    expect(tree!.root.findAllByType(HabitRow).map((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id)).toEqual(HABIT_VIEW_ROW_ORDER[view])
  })

  it.each([412, 840, 1352])('renders the padding contract on Android Hoje at %ipx', async (width) => {
    const native = await import('react-native')
    const dimensions = vi.spyOn(native, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale: 1 })
    try {
    replaySelection.isSelectMode = false
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />)
      await Promise.resolve()
    })
    const list = tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => typeof node.type === 'string' && node.props.testID === 'habit-list')[0]!
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingHorizontal).toBe(16)
    const row = tree.root.findAll((node: { type: unknown; props: { testID?: string } }) => node.type === 'View' && node.props.testID === 'habit-row')[0]!
    expect(StyleSheet.flatten(row.props.style).paddingHorizontal ?? 0).toBe(0)
    const resolvedStyle = (style: ViewStyle | ((state: { pressed: boolean }) => ViewStyle)) => StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style)
    const body = row.findAll((node: { type: unknown; props: { style?: ViewStyle | ((state: { pressed: boolean }) => ViewStyle); accessibilityRole?: string } }) => node.type === 'Pressable' && node.props.accessibilityRole === 'button'
      && resolvedStyle(node.props.style ?? {}).paddingLeft === 8)[0]!
    expect(resolvedStyle(body.props.style)).toMatchObject({ paddingLeft: 8, paddingVertical: 8 })
    } finally { dimensions.mockRestore() }
  })

  it('keeps the Hoje habit list loading through 429 then renders the list', async () => {
    const { queryClient } = await vi.importActual<typeof import('@/lib/query-client')>('@/lib/query-client')
    vi.useFakeTimers()
    skipFlow.active = true
    queryClient.clear()
    const habit = createMockHabitScheduleItem({ id: 'recovered', title: 'Recovered habit', scheduledDates: [TODAY] })
    offlineMocks.apiClient.mockRejectedValueOnce(createApiClientError(429, null, 'Unavailable', '60'))
      .mockResolvedValue({ items: [habit], totalCount: 1, totalPages: 1, page: 1, pageSize: 200 })
    let tree: ReturnType<typeof TestRenderer.create>
    try {
      await TestRenderer.act(async () => {
        tree = createTestTree(<QueryClientProvider client={queryClient}><HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} showCompleted onCreatePress={vi.fn()} /></QueryClientProvider>)
        await Promise.resolve()
      })
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(59_999) })
      expect(tree!.root.findAllByType(FlatList)[0].props.accessibilityState).toEqual({ busy: true })
      expect(flattenText(tree!.toJSON())).not.toContain('habits.loadError')
      expect(offlineMocks.apiClient).toHaveBeenCalledOnce()
      await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(2) })
      expect(tree!.root.findAllByType(HabitRow).map((row: { props: { habit: HabitScheduleItem } }) => row.props.habit.title)).toContain('Recovered habit')
      expect(flattenText(tree!.toJSON())).not.toContain('habits.loadError')
    } finally {
      if (tree) TestRenderer.act(() => (tree as unknown as { unmount: () => void }).unmount())
      queryClient.clear()
      vi.useRealTimers()
    }
  })

  it.each(['rows', 'empty', 'loading', 'error'] as const)('marks first Hoje content only after its %s surface renders', (surface) => {
    seedHabits(surface === 'empty' ? [] : [createMockHabit({ id: 'launch-habit', title: 'Habit' })])
    listQueryState.isLoading = surface === 'loading'
    listQueryState.isError = surface === 'error'
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />) })
    const markers = tree.root.findAllByType(TodayLaunchContent)
    if (surface === 'loading' || surface === 'error') {
      expect(markers).toHaveLength(0)
    } else {
      expect(markers).toHaveLength(1)
      expect(markers[0].props).toMatchObject({ enabled: true, fromCache: true, empty: surface === 'empty' })
    }
  })

  it.each(['normal', 'drill', 'loading', 'error'] as const)('scrolls the actual %s list handle and forwards upward offsets', (surface) => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    if (surface === 'drill') {
      mockDrillState.currentParentId = parent.id
      mockDrillState.currentParent = parent
      mockDrillState.drillStack = [parent.id]
    }
    listQueryState.isLoading = surface === 'loading'
    listQueryState.isError = surface === 'error'
    const ref = React.createRef<HabitListHandle>()
    const onScroll = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitList ref={ref} view="today" filters={{}} showCompleted onScroll={onScroll} onCreatePress={vi.fn()} />, {
        createNodeMock: (element: { type: unknown }) => element.type === 'DraggableFlatList' ? { scrollToOffset: rootListScroll.scrollToOffset } : null,
      })
      mountedTrees.add(tree)
    })
    TestRenderer.act(() => ref.current!.scrollToOffset(0, false))
    expect(rootListScroll.scrollToOffset).toHaveBeenCalledExactlyOnceWith({ offset: 0, animated: false })
    const list = tree!.root.findByType(surface === 'normal' ? 'DraggableFlatList' : 'FlatList')
    TestRenderer.act(() => {
      if (surface === 'normal') list.props.onScrollOffsetChange(700)
      else list.props.onScroll({ nativeEvent: { contentOffset: { y: 700 } } })
    })
    expect(onScroll).toHaveBeenCalledWith(700)
    expect(mockDrillState.drillReset).not.toHaveBeenCalled()
    expect(mockDrillState.currentParentId).toBe(surface === 'drill' ? parent.id : null)
  })

  it.each([{ width: 412, height: 915, withNotice: false }, { width: 320, height: 915, withNotice: true }, { width: 840, height: 240, withNotice: true }])('reveals intermediate list focus above the actual floating action at $width/$height with notice=$withNotice', async ({ width, height, withNotice }) => {
    __setWindowDimensions({ width, height, scale: 1, fontScale: height < 320 ? 2 : 1 })
    replaySelection.isSelectMode = false
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<Shell412 header={<View style={{ height: 48 }} />}
        notice={withNotice ? <Toast kind="neutral" message="Saved" persistent /> : undefined}
        composer={<View style={{ height: 64 }} />} tabBar={<View style={{ height: 80 }} />}
        fab={<Fab label="Create" onClick={vi.fn()}><View /></Fab>}>
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />
      </Shell412>, {
        createNodeMock: (element: { type: unknown }) => element.type === 'DraggableFlatList' ? { scrollToOffset: rootListScroll.scrollToOffset } : null,
      }) as GeometryTree
      mountedTrees.add(tree)
    })
    await TestRenderer.act(() => tree.root.findByProps({ testID: 'shell-412' }).props.onLayout({ nativeEvent: { layout: { width, height } } }))
    const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID, { width, height })
    const viewport = boxes.get('shell-scroller')!
    const fab = boxes.get('fab')!
    __setMeasureInWindowImpl(callback => callback(viewport.left, viewport.top, viewport.width, viewport.bottom - viewport.top))
    const list = tree.root.findByType('DraggableFlatList')
    list.props.onScrollOffsetChange(700)
    rootListScroll.scrollToOffset.mockClear()
    const target = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(fab.left, fab.top + 6, 48, 48) } as HostInstance
    await TestRenderer.act(() => {
      tree.root.findByProps({ testID: 'shell-412' }).props.onFocusCapture({ target, nativeEvent: { target: 123 } })
      list.props.onFocus?.({ target, nativeEvent: { target: 123 } })
    })
    expect(rootListScroll.scrollToOffset).toHaveBeenCalledOnce()
    const options = rootListScroll.scrollToOffset.mock.calls[0]![0] as { offset: number; animated: boolean }
    expect(options.animated).toBe(false)
    expect(fab.top + 6 + 48 - (options.offset - 700)).toBeLessThanOrEqual(fab.top - 16)
    expect(fab.top + 6 - (options.offset - 700)).toBeGreaterThanOrEqual(viewport.top)
    rootListScroll.scrollToOffset.mockClear()
    const visibleTarget = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(fab.left, viewport.top + 8, 48, 48) } as HostInstance
    await TestRenderer.act(() => {
      tree.root.findByProps({ testID: 'shell-412' }).props.onFocusCapture({ target: visibleTarget, nativeEvent: { target: 124 } })
      list.props.onFocus?.({ target: visibleTarget, nativeEvent: { target: 124 } })
    })
    expect(rootListScroll.scrollToOffset).not.toHaveBeenCalled()
  })

  describe('mounted list focus offsets', () => {
    type ListSurface = 'normal' | 'drill' | 'all' | 'loading' | 'error'

    function renderFocusList(surface: ListSurface, showCompleted = true) {
      if (surface === 'drill') {
        const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
        mockDrillState.currentParentId = parent.id
        mockDrillState.currentParent = parent
        mockDrillState.drillStack = [parent.id]
      }
      listQueryState.isLoading = surface === 'loading'
      listQueryState.isError = surface === 'error'
      return <Shell412 header={<View style={{ height: 48 }} />}
        composer={<View style={{ height: 64 }} />} tabBar={<View style={{ height: 80 }} />}
        fab={<Fab label="Create" onClick={vi.fn()}><View /></Fab>}>
        <HabitList view={surface === 'all' ? 'all' : 'today'} filters={{}} showCompleted={showCompleted} onCreatePress={vi.fn()} />
      </Shell412>
    }

    async function mountFocusList(surface: ListSurface) {
      const width = 412
      const height = 915
      __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
      replaySelection.isSelectMode = false
      const todayHandle = { scrollToOffset: vi.fn() }
      let tree!: ReturnType<typeof TestRenderer.create>
      await TestRenderer.act(() => {
        tree = TestRenderer.create(renderFocusList(surface), {
          createNodeMock: (element: { type: unknown }) => element.type === 'DraggableFlatList' ? todayHandle : null,
        }) as GeometryTree
        mountedTrees.add(tree)
      })
      await TestRenderer.act(() => tree.root.findByProps({ testID: 'shell-412' }).props.onLayout({ nativeEvent: { layout: { width, height } } }))
      const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID, { width, height })
      const viewport = boxes.get('shell-scroller')!
      const fab = boxes.get('fab')!
      __setMeasureInWindowImpl(callback => callback(viewport.left, viewport.top, viewport.width, viewport.bottom - viewport.top))
      return { tree, todayHandle, viewport, fab }
    }

    async function focusListControl(tree: ReturnType<typeof TestRenderer.create>, top: number) {
      const target = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(16, top, 48, 48) } as HostInstance
      const list = tree.root.findByType(tree.root.findAllByType('DraggableFlatList').length ? 'DraggableFlatList' : 'FlatList')
      await TestRenderer.act(() => {
        tree.root.findByProps({ testID: 'shell-412' }).props.onFocusCapture({ target, nativeEvent: { target: 123 } })
        list.props.onFocus({ target, nativeEvent: { target: 123 } })
      })
    }

    it.each(['drill', 'all', 'loading', 'error'] as const)('reveals a replacement %s list from its initial offset without a new scroll event', async (surface) => {
      const { tree, todayHandle, viewport, fab } = await mountFocusList('normal')
      TestRenderer.act(() => tree.root.findByType('DraggableFlatList').props.onScrollOffsetChange(700))
      await TestRenderer.act(() => tree.update(renderFocusList(surface)))
      expect(tree.root.findAllByType('DraggableFlatList')).toHaveLength(0)
      rootListScroll.scrollToOffset.mockClear()
      await focusListControl(tree, fab.top + 6)

      expect(todayHandle.scrollToOffset).not.toHaveBeenCalled()
      const delta = fab.top + 6 + 48 - (viewport.bottom - 96)
      expect(rootListScroll.scrollToOffset).toHaveBeenCalledExactlyOnceWith({ offset: delta, animated: false })
      const { offset } = rootListScroll.scrollToOffset.mock.calls[0]![0] as { offset: number }
      expect(fab.top + 6 + 48 - offset).toBeLessThanOrEqual(fab.top - 16)
      expect(fab.top + 6 - offset).toBeGreaterThanOrEqual(viewport.top)
      rootListScroll.scrollToOffset.mockClear()
      await focusListControl(tree, viewport.top + 8)
      expect(rootListScroll.scrollToOffset).not.toHaveBeenCalled()
      expect(todayHandle.scrollToOffset).not.toHaveBeenCalled()
    })

    it.each(['normal', 'drill', 'all'] as const)('preserves the mounted %s list offset through an ordinary rerender', async (surface) => {
      const { tree, todayHandle, viewport, fab } = await mountFocusList(surface)
      const list = tree.root.findByType(surface === 'normal' ? 'DraggableFlatList' : 'FlatList')
      TestRenderer.act(() => {
        if (surface === 'normal') list.props.onScrollOffsetChange(700)
        else list.props.onScroll({ nativeEvent: { contentOffset: { y: 700 } } })
      })
      await TestRenderer.act(() => tree.update(renderFocusList(surface, false)))
      await focusListControl(tree, fab.top + 6)
      const activeScroll = surface === 'normal' ? todayHandle.scrollToOffset : rootListScroll.scrollToOffset
      const delta = fab.top + 6 + 48 - (viewport.bottom - 96)
      expect(activeScroll).toHaveBeenCalledExactlyOnceWith({ offset: 700 + delta, animated: false })
      await TestRenderer.act(() => tree.update(renderFocusList(surface)))
      activeScroll.mockClear()
      await focusListControl(tree, viewport.bottom - 96 - 48)
      expect(activeScroll).not.toHaveBeenCalled()
    })
  })

  it('keeps a mounted mock HabitList isolated when skip flow becomes active', () => {
    const renderList = () => <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(renderList()) })
    try {
      skipFlow.active = true
      expect(() => TestRenderer.act(() => tree.update(renderList()))).not.toThrow()
      expect(tree!.root.findAllByType(HabitRow).map(
        (row: { props: { habit: NormalizedHabit } }) => row.props.habit.id,
      )).toEqual(['habit-1'])
    } finally {
      TestRenderer.act(() => tree!.unmount())
    }
  })

  it.each([false, true])('expands and collapses child rows without changing selection (select mode: %s)', (selectMode) => {
    const parent = createMockHabit({ scheduledDates: [TODAY], id: 'parent', title: 'Parent', hasSubHabits: true })
    const child = createMockHabit({ scheduledDates: [TODAY], id: 'child', title: 'Child', parentId: parent.id })
    const secondParent = createMockHabit({ scheduledDates: [TODAY], id: 'second-parent', title: 'Second parent', hasSubHabits: true })
    const secondChild = createMockHabit({ scheduledDates: [TODAY], id: 'second-child', title: 'Second child', parentId: secondParent.id })
    seedHabits([parent, child, secondParent, secondChild])
    const selected = new Set([parent.id])
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted
        isSelectMode={selectMode} selectedHabitIds={selected} onCreatePress={vi.fn()} />)
    })
    const parentRow = () => tree.root.findAllByType(HabitRow).find(
      (row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === parent.id,
    )!
    const disclosure = () => parentRow().findAll(
      (node: { props: Record<string, unknown> }) => node.props.accessibilityRole === 'button' &&
        (node.props.accessibilityLabel === 'common.collapse' || node.props.accessibilityLabel === 'common.expand'),
    )[0]
    const visibleIds = () => tree.root.findAllByType(HabitRow).map(
      (row: { props: { habit: NormalizedHabit } }) => row.props.habit.id,
    )
    expect(disclosure().props.accessibilityState).toEqual({ expanded: true })
    expect(visibleIds()).toEqual([parent.id, child.id, secondParent.id, secondChild.id])
    TestRenderer.act(() => disclosure().props.onPress())
    expect(disclosure().props.accessibilityLabel).toBe('common.expand')
    expect(disclosure().props.accessibilityState).toEqual({ expanded: false })
    expect(visibleIds()).toEqual([parent.id, secondParent.id, secondChild.id])
    TestRenderer.act(() => disclosure().props.onPress())
    expect(disclosure().props.accessibilityLabel).toBe('common.collapse')
    expect(disclosure().props.accessibilityState).toEqual({ expanded: true })
    expect(visibleIds()).toEqual([parent.id, child.id, secondParent.id, secondChild.id])
    expect(toggleSelectionCascade).not.toHaveBeenCalled()
    expect(selected).toEqual(new Set([parent.id]))
    expect(parentRow().props.isSelected).toBe(true)
    TestRenderer.act(() => tree.unmount())
  })

  function assertNativeCascadeMetadata(rows: import('react-test-renderer').ReactTestInstance[]) {
    for (const row of rows) {
      const meta = row.findAll((node) => String(node.type) === 'View' && node.props.testID === 'habit-row-meta')[0]!
      expect(meta.findAll((node) => String(node.type) === 'Text')[0]!.props.testID).toBe('habit-row-type')
      const checklist = meta.findAll((node) => node.props.testID === 'habit-row-checklist')[0]!
      expect(checklist.findAll((node) => String(node.type) === 'Text')[0]!.props.children).toBe('1/2')
    }
  }

  function assertNativeCascadeActions(tree: ReturnType<typeof TestRenderer.create>, expectedDepths: number[], width: number, fontScale: number) {
    const findRow = (id: string) => tree.root.findAllByType(HabitRow).find((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id === id)!
    const branchDisclosure = () => findRow('branch').findAllByType('Pressable').find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'common.collapse' || node.props.accessibilityLabel === 'common.expand')!
    if (width > 320 || fontScale !== 2) {
      TestRenderer.act(() => branchDisclosure().props.onPress())
      expect(tree.root.findAllByType(HabitRow).map((row: { props: { habit: NormalizedHabit } }) => row.props.habit.id)).toEqual(['parent', 'leaf', 'branch'])
      TestRenderer.act(() => branchDisclosure().props.onPress())
      expect(tree.root.findAllByType(HabitRow).map((row: { props: { depth: number } }) => row.props.depth)).toEqual(expectedDepths)
    }
    if (width <= 320) {
      const boundaryId = fontScale === 2 ? 'branch' : 'nested-parent'
      const boundary = findRow(boundaryId).findAllByType('Pressable').find((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'habits.actions.openSubHabits')!
      expect(boundary.props.accessibilityState).toBeUndefined()
      TestRenderer.act(() => boundary.props.onPress())
      expect(mockDrillState.drillInto).toHaveBeenCalledWith(boundaryId)
    }
    expect(toggleSelectionCascade).not.toHaveBeenCalled()
  }


  it.each((['today', 'all', 'general'] as const).flatMap((view) => [false, true].flatMap((drilling) =>
    [false, true].flatMap((selectMode) => [316, 320, 412, 1352].flatMap((width) => [1, 2].map((fontScale) => ({ view, drilling, selectMode, width, fontScale })))),
  )))('applies display depth once in $view, drilling=$drilling, selecting=$selectMode at $width/$fontScale', ({ view, drilling, selectMode, width, fontScale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale })
    const parent = createMockHabit({ id: 'parent', title: 'Parent', description: '**Read** two pages before breakfast.', checklistItems: [{ text: 'Page', isChecked: true }, { text: 'Page', isChecked: false }], hasSubHabits: true, isGeneral: view === 'general', scheduledDates: [TODAY] })
    const leaf = createMockHabit({ id: 'leaf', title: 'Leaf', description: '**Read** two pages before breakfast.', checklistItems: [{ text: 'Page', isChecked: true }, { text: 'Page', isChecked: false }], parentId: parent.id, isGeneral: parent.isGeneral, scheduledDates: [TODAY] })
    const branch = createMockHabit({ ...leaf, id: 'branch', title: 'Branch', hasSubHabits: true })
    const grandchild = createMockHabit({ ...leaf, id: 'grandchild', title: 'Grandchild', parentId: branch.id })
    const nestedParent = createMockHabit({ ...grandchild, id: 'nested-parent', title: 'Nested parent', hasSubHabits: true })
    const deeper = createMockHabit({ ...grandchild, id: 'deeper', title: 'Deeper', parentId: nestedParent.id })
    seedHabits([parent, leaf, branch, grandchild, nestedParent, deeper])
    if (drilling) {
      mockDrillState.currentParent = parent
      mockDrillState.currentParentId = parent.id
      mockDrillState.drillStack = [parent.id]
      mockDrillState.drillChildren = [leaf, branch]
      mockDrillState.getDrillChildren.mockImplementation((id) => id === branch.id ? [grandchild] : [])
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<View><HabitList view={view} filters={{}} showCompleted
      isSelectMode={selectMode} selectedHabitIds={new Set([leaf.id])} onCreatePress={vi.fn()} /></View>) })
    let composition = tree
    if (drilling) {
      const list = tree.root.findByType('FlatList')
      TestRenderer.act(() => { composition = createTestTree(<View>{list.props.data.map((item: NormalizedHabit, index: number) => list.props.renderItem({ item, index }))}</View>) })
    }
    const listWidth = width === 320 ? 316 : width
    if (!drilling) {
      const list = tree.root.findAllByType(view === 'all' ? 'FlatList' : 'DraggableFlatList')[0]!
      TestRenderer.act(() => list.props.onLayout({ nativeEvent: { layout: { width: listWidth, height: 915, x: 0, y: 0 } } }))
    }
    const rows = composition.root.findAllByType(HabitRow)
    assertNativeCascadeMetadata(rows)
    const expectedDepths = drilling ? [0, 0] : width <= 320 ? fontScale === 2 ? [0, 1, 1] : [0, 1, 1, 2, 2] : [0, 1, 1, 2, 2, 3]
    const list = tree.root.findAllByType(view === 'all' || drilling ? 'FlatList' : 'DraggableFlatList')[0]!
    let measuredRows!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { measuredRows = createTestTree(<View style={[list.props.contentContainerStyle, { width: listWidth }]}>{rows.map((row: import('react-test-renderer').ReactTestInstance) => {
      const props = row.props as React.ComponentProps<typeof HabitRow>
      return <HabitRow key={props.habit.id} {...props} />
    })}</View>) })
    const geometry = measureInteractionFills(measuredRows.toJSON(), width, false, fontScale)
    const rowBounds = geometry.filter((part) => part.host.props.testID === 'habit-row')
    expect(rowBounds).toHaveLength(expectedDepths.length)
    expect(composition.root.findAllByType('Text').filter((node: { props: { testID?: string; children?: string } }) => node.props.testID === 'habit-row-description').map((node: { props: { children: string } }) => node.props.children)).toEqual(rows.map(() => 'Read two pages before breakfast.'))
    rowBounds.forEach((bounds, index) => {
      expect(bounds.width).toBe(listWidth - 32 - 16 * expectedDepths[index]!)
      expect(bounds.left).toBe(16 + 16 * expectedDepths[index]!)
      if (index) expect(bounds.top - rowBounds[index - 1]!.bottom).toBeCloseTo(expectedDepths[index] === 0 ? 12 : 8, 2)
      const well = geometry.find((part) => [32, 46].includes(Number(part.style.width)) && part.style.borderRadius === 12 && part.ancestors.includes(bounds.slot))!
      expect(well.left - bounds.left).toBe(8)
      const title = geometry.find((part) => part.host.type === 'Text' && part.host.children?.includes(rows[index]!.props.habit.title) && part.style.opacity !== 0 && part.ancestors.includes(bounds.slot))!
      expect(title.left - bounds.left).toBe(68)
      expect(title.width).toBeGreaterThanOrEqual(Number((title.style as import('react-native').TextStyle).fontSize) * fontScale)
    })
    if (!drilling) assertNativeCascadeActions(tree, expectedDepths, width, fontScale)
    TestRenderer.act(() => tree.unmount())
    if (drilling) TestRenderer.act(() => composition.unmount())
  })

  it('removes only confirmed bulk replay habits from the current selection', () => {
    const confirmed = createMockHabit({ id: 'confirmed' })
    const failed = createMockHabit({ id: 'failed' })
    seedHabits([confirmed, failed])
    replaySelection.selectedHabitIds = new Set([confirmed.id, failed.id])
    TestRenderer.act(() => {
      createTestTree(<HabitList view="today" filters={{}} selectedDate={new Date(`${TODAY}T09:00:00Z`)}
        showCompleted isSelectMode selectedHabitIds={replaySelection.selectedHabitIds} onCreatePress={vi.fn()} />)
    })

    expect(replayDelivery.listener).not.toBeNull()
    TestRenderer.act(() => {
      replayDelivery.listener?.({ mutationId: 'replayed', type: 'bulkLogHabits',
        items: [{ habitId: confirmed.id, date: TODAY }] })
    })

    expect(replaySelection.selectAllHabits).toHaveBeenCalledWith([failed.id])
    expect(replaySelection.clearSelection).not.toHaveBeenCalled()
    replaySelection.selectedHabitIds = new Set([failed.id])
    TestRenderer.act(() => {
      replayDelivery.listener?.({ mutationId: 'replayed-later', type: 'bulkSkipHabits',
        items: [{ habitId: failed.id, date: TODAY }] })
    })
    expect(replaySelection.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('blocks an account-old completion before it enters the offline queue', () => {
    vi.setSystemTime(new Date('2026-09-11T10:30:00Z'))
    accountDate.timeZone = 'Pacific/Kiritimati'
    const habit = createMockHabit({ id: 'account-window', title: 'Read' })
    seedHabits([habit])
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{ dateFrom: '2026-09-04', dateTo: '2026-09-04' }}
          selectedDate={new Date('2026-09-04T12:00:00Z')}
          showCompleted onCreatePress={vi.fn()} />,
      )
    })

    const row = tree!.root.findAllByType(HabitRow).find(
      (node: { props: { habit: NormalizedHabit } }) => node.props.habit.id === habit.id,
    )!
    expect(row.props.today).toBe('2026-09-12')
    const ring = tree!.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityHint === 'habits.todayBoundary.readOnly' &&
        node.props.accessibilityRole === 'button',
    )[0]
    expect(ring.props.disabled).toBe(true)
    TestRenderer.act(() => ring.props.onPress())
    expect(logMutateAsync).not.toHaveBeenCalled()
  })

  it('does not carry recent completion feedback into another selected date', () => {
    const habit = createMockHabit({ id: 'dated-child', scheduledDates: [YESTERDAY, TODAY] })
    seedHabits([habit])
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        selectedDate={new Date(`${date}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => { tree = createTestTree(renderList(YESTERDAY)) })
    TestRenderer.act(() => { ref.current?.markRecentlyCompleted(habit.id) })
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(true)
    TestRenderer.act(() => { tree.update(renderList(TODAY)) })
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(false)
    TestRenderer.act(() => { ref.current?.markRecentlyCompleted(habit.id) })
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(true)
    TestRenderer.act(() => { tree.update(renderList(YESTERDAY)) })
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(true)
  })

  it('reuses row tokens when only habit content changes', () => {
    const habit = createMockHabit({ id: 'token-row', title: 'Before' })
    let tree: any
    TestRenderer.act(() => { tree = createTestTree(<HabitRow habit={habit} />) })
    const previousBuilds = tokenBuilds.count
    TestRenderer.act(() => {
      tree.update(<HabitRow habit={{ ...habit, title: 'After' }} />)
    })
    expect(tokenBuilds.count).toBe(previousBuilds + 1)
  })

  it('renders only changed rows through a 60-habit Today log, completed toggle, and date change', async () => {
    const habits = Array.from({ length: 60 }, (_, index) => createMockHabit({
      id: `render-habit-${index}`,
      title: `Habit ${index}`,
      position: index,
      dueDate: TODAY,
      scheduledDates: [TODAY, TOMORROW],
    }))
    const onCreatePress = vi.fn()
    const selectedDate = new Date(`${TODAY}T09:00:00Z`)
    const nextDate = new Date(`${TOMORROW}T09:00:00Z`)
    const todayFilters = {
      dateFrom: TODAY,
      dateTo: TODAY,
      includeOverdue: true,
      includeGeneral: undefined,
    }
    const nextDateFilters = {
      dateFrom: TOMORROW,
      dateTo: TOMORROW,
      includeOverdue: false,
      includeGeneral: undefined,
    }
    const renderList = (date = selectedDate, showCompleted = false) => (
      <HabitList
        view="today"
        filters={date === selectedDate ? todayFilters : nextDateFilters}
        selectedDate={date}
        showCompleted={showCompleted}
        onCreatePress={onCreatePress}
      />
    )
    const totalSince = (before: Map<string, number>) =>
      Array.from(rowRenderCounts, ([id, count]) => count - (before.get(id) ?? 0))
        .reduce((sum, count) => sum + count, 0)

    seedHabits(habits)
    rowRenderCounts.clear()
    let tree: any
    TestRenderer.act(() => { tree = createTestTree(renderList()) })
    const initial = totalSince(new Map())
    expect(tree.root.findAllByType(HabitRow)).toHaveLength(60)
    expect(tree.root.findByType(HabitList).props).toMatchObject({
      view: 'today',
      filters: todayFilters,
      selectedDate,
      showCompleted: false,
    })

    const beforeLog = new Map(rowRenderCounts)
    const firstRow = tree.root.findAll((node: any) =>
      node.props.habit?.id === habits[0]!.id && typeof node.props.actions?.onLog === 'function',
    )[0]
    await TestRenderer.act(async () => {
      firstRow.props.actions.onLog()
      await Promise.resolve()
    })
    const updatedHabit = { ...habits[0]!, isCompleted: true, isLoggedInRange: true }
    seedHabits([updatedHabit, ...habits.slice(1)])
    TestRenderer.act(() => { tree.update(renderList()) })
    const logged = totalSince(beforeLog)

    const beforeCompletedToggle = new Map(rowRenderCounts)
    TestRenderer.act(() => { tree.update(renderList(selectedDate, true)) })
    const completedToggle = totalSince(beforeCompletedToggle)

    const beforeDateChange = new Map(rowRenderCounts)
    TestRenderer.act(() => { tree.update(renderList(nextDate, true)) })
    const dateChange = totalSince(beforeDateChange)

    expect({ initial, logged, completedToggle, dateChange }).toEqual({
      initial: 60,
      logged: 1,
      completedToggle: 0,
      dateChange: 60,
    })
  })

  it('keeps row actions stable while using the latest habit and list callbacks', () => {
    const habit = createMockHabit({
      id: 'action-parent',
      title: 'Before',
      isOverdue: true,
      hasSubHabits: true,
    })
    const child = createMockHabit({ id: 'action-child', parentId: habit.id })
    const onDetailHabit = vi.fn()
    const onEditHabit = vi.fn()
    const onCreatePress = vi.fn()
    const renderList = (editHabit: typeof onEditHabit) => (
      <HabitList
        view="today"
        filters={{}}
        showCompleted
        onCreatePress={onCreatePress}
        onDetailHabit={onDetailHabit}
        onEditHabit={editHabit}
      />
    )

    seedHabits([habit, child])
    let tree: any
    TestRenderer.act(() => { tree = createTestTree(renderList(onEditHabit)) })
    const firstRow = tree.root.findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === habit.id)
    expect(firstRow).toBeDefined()
    const actions = firstRow!.props.actions

    const updatedHabit = { ...habit, title: 'After' }
    const onEditHabitAfterUpdate = vi.fn()
    seedHabits([updatedHabit, child])
    TestRenderer.act(() => { tree.update(renderList(onEditHabitAfterUpdate)) })
    const updatedRow = tree.root.findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === habit.id)
    expect(updatedRow!.props.actions).toBe(actions)

    TestRenderer.act(() => {
      actions.onDetail()
      actions.onEdit()
      actions.onReschedule()
      actions.onDuplicate()
      actions.onDrillInto()
      actions.onEnterSelectMode()
    })

    expect(onDetailHabit).toHaveBeenCalledWith(updatedHabit)
    expect(onEditHabitAfterUpdate).toHaveBeenCalledWith(updatedHabit, undefined)
    expect(tree.root.findByType('RescheduleSheet').props).toMatchObject({
      open: true,
      habit: updatedHabit,
    })
    expect(flattenRenderedText(confirmationSheets(tree, 'habits.duplicateConfirmTitle')))
      .toContain('After')
    expect(mockDrillState.drillInto).toHaveBeenCalledWith(habit.id)
    expect(toggleSelectMode).toHaveBeenCalledOnce()
    expect(toggleSelectionCascade).toHaveBeenCalledWith(
      habit.id,
      expect.any(Function),
    )
  })

  it('hides one-time tasks completed before the selected day when completed items are shown', () => {
    useActualHabitVisibility = true
    const dueToday = createMockHabit({
      id: 'due-today',
      dueDate: '2026-09-15',
      scheduledDates: ['2026-09-15'],
      instances: [{ date: '2026-09-15', status: 'Pending', logId: null }],
    })
    const completedEarlier = createMockHabit({
      id: 'completed-earlier',
      frequencyUnit: null,
      isCompleted: true,
      isLoggedInRange: false,
      dueDate: '2026-08-01',
      scheduledDates: [],
      instances: [],
    })
    seedHabits([dueToday, completedEarlier])

    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{ dateFrom: '2026-09-15', dateTo: '2026-09-15' }}
          selectedDate={new Date(2026, 8, 15, 12)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    expect(
      tree!.root
        .findAll((node) => node.type === HabitRow)
        .map((node) => (node.props.habit as NormalizedHabit).id),
    ).toEqual(['due-today'])
  })

  it('shows only selected-day completions alongside habits due that day', () => {
    useActualHabitVisibility = true
    const dueToday = createMockHabit({
      id: 'due-today',
      dueDate: '2026-09-15',
      scheduledDates: ['2026-09-15'],
      instances: [{ date: '2026-09-15', status: 'Pending', logId: null }],
    })
    const completedToday = createMockHabit({
      id: 'completed-today',
      frequencyUnit: null,
      isCompleted: true,
      isLoggedInRange: true,
      dueDate: '2026-09-15',
      scheduledDates: [],
      instances: [],
    })
    const completedEarlier = createMockHabit({
      id: 'completed-earlier',
      frequencyUnit: null,
      isCompleted: true,
      isLoggedInRange: false,
      dueDate: '2026-08-01',
      scheduledDates: [],
      instances: [],
    })
    seedHabits([dueToday, completedToday, completedEarlier])

    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{ dateFrom: '2026-09-15', dateTo: '2026-09-15' }}
          selectedDate={new Date(2026, 8, 15, 12)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    expect(
      tree!.root
        .findAll((node) => node.type === HabitRow)
        .map((node) => (node.props.habit as NormalizedHabit).id),
    ).toEqual(['due-today', 'completed-today'])
  })

  it('shows a plain day line instead of first run on an empty future day with account habits', () => {
    accountHabitCount.count = 3
    seedHabits([])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{ dateFrom: TOMORROW, dateTo: TOMORROW }}
          selectedDate={new Date(`${TOMORROW}T09:00:00Z`)} showCompleted={false} onCreatePress={vi.fn()} />,
      )
    })
    expect(flattenRenderedText(tree!.toJSON())).toContain('habits.nothingOpen')
    expect(flattenRenderedText(tree!.toJSON())).not.toContain('habits.emptyState')
    expect(flattenRenderedText(tree!.toJSON())).not.toContain('habits.askAstra')
  })

  it('shows the plain line when nothing is due today', () => {
    accountHabitCount.count = 3
    seedHabits([])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted={false} onCreatePress={vi.fn()} />)
    })
    expect(flattenRenderedText(tree.toJSON())).toContain('habits.nothingOpen')
    expect(flattenRenderedText(tree.toJSON())).not.toContain('habits.emptyState')
  })

  it('names an empty frequency view and offers all frequencies', () => {
    seedHabits([])
    let tree: ReturnType<typeof createTestTree>
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{ frequencyUnit: 'Week' }} showCompleted={false} onCreatePress={vi.fn()} />)
    })
    expect(flattenRenderedText(tree!.toJSON())).toContain('habits.filter.weekly')
    const button = tree!.root.findAll((node: import('react-test-renderer').ReactTestInstance) => node.props.accessibilityRole === 'button' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === 'common.all').length > 0)[0]!
    TestRenderer.act(() => button.props.onPress())
    expect(setFrequencyFilters).toHaveBeenCalledWith({ frequencyUnit: undefined })
  })

  it('keeps the plain line visible if the account count cannot load', () => {
    accountHabitCount.isLoaded = false
    seedHabits([])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted={false} onCreatePress={vi.fn()} />)
    })
    expect(flattenRenderedText(tree.toJSON())).toContain('habits.nothingOpen')
    expect(flattenRenderedText(tree.toJSON())).not.toContain('habits.emptyState')
  })

  it('keeps first-run actions on another day when the account has no habits', () => {
    accountHabitCount.count = 0
    seedHabits([])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} selectedDate={new Date(`${TOMORROW}T09:00:00Z`)} showCompleted={false} onCreatePress={vi.fn()} />)
    })
    const text = flattenRenderedText(tree.toJSON())
    expect(text).toContain('habits.emptyState')
    expect(text).toContain('habits.askAstra')
    expect(tree.root.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'Pressable' && node.findAll(child => String(child.type) === 'Text' && child.props.children === 'habits.askAstra').length > 0)).toHaveLength(1)
    expect(text).toContain('habits.createManually')
  })

  it('uses the plain line on a past day with every due habit logged', () => {
    useActualHabitVisibility = true
    seedHabits([createMockHabit({ id: 'past-due', scheduledDates: [YESTERDAY], isLoggedInRange: true })])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)} showCompleted={false} onCreatePress={vi.fn()} />)
    })
    const text = flattenRenderedText(tree.toJSON())
    expect(text).toContain('habits.nothingOpen')
    expect(text).not.toContain('habits.allDoneToday')
  })

  it.each([false, true])('does not announce whole-day completion from a monthly subset, showCompleted=%s', (showCompleted) => {
    useActualHabitVisibility = true
    accountHabitCount.count = 2
    const daily = createMockHabit({ id: 'daily-pending', frequencyUnit: 'Day', scheduledDates: [TODAY] })
    const monthly = createMockHabit({ id: 'monthly-done', frequencyUnit: 'Month', scheduledDates: [TODAY], isLoggedInRange: true })
    seedHabits([daily, monthly])
    let tree: import('react-test-renderer').ReactTestRenderer
    const list = (frequencyUnit?: 'Month') => <HabitList view="today" filters={{ frequencyUnit }} showCompleted={showCompleted} onCreatePress={vi.fn()} />
    TestRenderer.act(() => { tree = createTestTree(list()) })
    expect(tree!.root.findAll((node) => node.type === HabitListAllDone)).toHaveLength(0)
    seedHabits([monthly])
    TestRenderer.act(() => { tree!.update(list('Month')) })
    expect(tree!.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'habits.allDoneHint')).toHaveLength(0)
    expect(tree!.root.findAll((node) => node.type === HabitListAllDone)).toHaveLength(0)
    TestRenderer.act(() => { tree!.update(list()) })
    expect(tree!.root.findAll((node) => node.type === HabitListAllDone)).toHaveLength(1)
  })

  it('renders the all-done upcoming action only when it can navigate', () => {
    useActualHabitVisibility = true
    seedHabits([createMockHabit({ id: 'due', scheduledDates: [TODAY], isLoggedInRange: true })])
    mockHabitsData.totalCount = 1
    const onSeeUpcoming = vi.fn()
    let tree: import('react-test-renderer').ReactTestRenderer

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted={false}
          onCreatePress={vi.fn()}
        />,
      )
    })

    let allDone = tree!.root.findAll((node) => node.type === HabitListAllDone)[0]
    expect(allDone?.props.onSeeUpcoming).toBeUndefined()

    TestRenderer.act(() => {
      tree!.update(
        <HabitList
          view="today"
          filters={{}}
          showCompleted={false}
          onCreatePress={vi.fn()}
          onSeeUpcoming={onSeeUpcoming}
        />,
      )
    })
    allDone = tree!.root.findAll((node) => node.type === HabitListAllDone)[0]
    expect(allDone?.props.onSeeUpcoming).toBe(onSeeUpcoming)
    expect(allDone?.findAll((node) => node.props.testID === 'orbit-mark')).toHaveLength(0)
    expect(allDone?.findAll((node) => (node.props.style as { alignItems?: string } | undefined)?.alignItems === 'flex-start').length).toBeGreaterThan(0)
    expect(allDone?.findAll((node) => node.props.testID === 'button-ghost-sm').length).toBeGreaterThan(0)
    const action = allDone?.props.onSeeUpcoming as (() => void) | undefined
    if (!action) throw new Error('Upcoming action is missing')
    TestRenderer.act(action)

    expect(onSeeUpcoming).toHaveBeenCalledOnce()
  })

  it('shows all-done above an unfinished anytime habit with a 24 gap', () => {
    useActualHabitVisibility = true
    const due = createMockHabit({ id: 'due', title: 'Due habit', scheduledDates: [TODAY], isLoggedInRange: true })
    const anytime = createMockHabit({ id: 'anytime', title: 'Anytime habit', isGeneral: true })
    seedHabits([due, anytime])
    mockHabitsData.totalCount = 2
    let tree: import('react-test-renderer').ReactTestRenderer

    TestRenderer.act(() => {
      tree = createTestTree(
        <View><HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }}
          showCompleted={false} onCreatePress={vi.fn()} /></View>,
      )
    })

    expect(tree!.root.findAll((node) => node.type === HabitListAllDone)).toHaveLength(1)
    expect(tree!.root.findAll((node) => node.type === HabitRow)
      .map((node) => (node.props.habit as NormalizedHabit).id)).toContain('anytime')
    const geometry = measureSafeArea((tree! as GeometryTree).toJSON(), (host) => {
      if (host.children?.some((child) => typeof child !== 'string' && child.type === 'Text' && child.children?.includes('habits.allDoneToday'))) return 'banner'
      return host.props.testID === 'habit-row' ? 'row' : undefined
    })
    expect(geometry.get('row')!.top - geometry.get('banner')!.bottom).toBe(24)
  })

  it('keeps the all-done block above completed rows when they are shown', () => {
    useActualHabitVisibility = true
    seedHabits([createMockHabit({ id: 'done-due', scheduledDates: [TODAY], isLoggedInRange: true })])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />)
    })
    expect(tree.root.findAll((node: any) => node.type === HabitListAllDone)).toHaveLength(1)
    expect(tree.root.findAll((node: any) => node.type === HabitRow)
      .map((node: any) => (node.props.habit as NormalizedHabit).id)).toContain('done-due')
  })

  it('shows all-done when a due row is completed without a range log flag', () => {
    useActualHabitVisibility = true
    seedHabits([createMockHabit({ id: 'completed-due', scheduledDates: [TODAY], isCompleted: true, isLoggedInRange: false })])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted={false} onCreatePress={vi.fn()} />)
    })
    expect(flattenRenderedText(tree.toJSON())).toContain('habits.allDoneToday')
    expect(flattenRenderedText(tree.toJSON())).not.toContain('habits.nothingOpen')
  })

  it.each([
    ['recurring', 'Day', false, true],
    ['weekly flexible', 'Week', true, true],
    ['monthly flexible', 'Month', true, true],
    ['one-time', null, false, true],
    ['offline recurring', 'Day', false, false],
    ['offline one-time', null, false, false],
  ] as const)('skips a %s row without a sheet and restores it through the undo endpoint', async (_kind, frequencyUnit, isFlexible, online) => {
    skipFlow.active = true
    useActualHabitVisibility = true
    accountHabitCount.count = 2
    offlineMocks.setOnline(online)
    const row = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '11111111-1111-4111-8111-111111111111', title: 'Walk', frequencyUnit, isFlexible,
      dueDate: TODAY, scheduledDates: [TODAY], instances: [{ date: TODAY, status: 'Pending', logId: null }],
      flexibleTarget: isFlexible ? 1 : null, flexibleCompleted: isFlexible ? 0 : null,
    }))
    let items: HabitScheduleItem[] = [row]
    let receipt: string | undefined
    offlineMocks.apiClient.mockImplementation((endpoint: string, options?: { body?: string }) => {
      if (endpoint.endsWith('/undo')) {
        expect(endpoint).toBe(`/api/habits/${row.id}/skip/${receipt}/undo`)
        items = [row]
        return Promise.resolve(undefined)
      }
      if (endpoint.endsWith('/skip')) {
        const request = skipHabitRequestSchema.parse(JSON.parse(options!.body!))
        expect(request.date).toBe(TODAY)
        receipt = request.skipId ?? undefined
        expect(receipt).toBe('22222222-2222-4222-8222-222222222222')
        items = []
        return Promise.resolve(undefined)
      }
      return Promise.resolve({ items, totalCount: items.length, totalPages: 1, page: 1, pageSize: 200 })
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    let tree: any
    await TestRenderer.act(async () => {
      tree = createTestTree(<QueryClientProvider client={client}><HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} showCompleted onCreatePress={vi.fn()} /><SkipToastHost /></QueryClientProvider>)
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(tree.root.findAllByType(HabitRow)).toHaveLength(1))
    TestRenderer.act(() => tree.root.findAll((node: any) => node.props.accessibilityLabel === 'habits.actions.more')[0].props.onPress())
    const skipItem = tree.root.findAll((node: any) => node.props.accessibilityRole === 'menuitem' && flattenRenderedText(node).includes('habits.actions.skip'))[0]
    await TestRenderer.act(async () => { skipItem.props.onPress(); await Promise.resolve() })
    await vi.waitFor(() => expect(tree.root.findAllByType(HabitRow)).toHaveLength(0))
    expect(tree.root.findAll((node: any) => node.type === 'Sheet' && node.props.open)).toHaveLength(0)
    expect(useAppToastStore.getState().currentToast?.toast).toMatchObject({ kind: 'neutral', message: frequencyUnit === null ? 'undo.habitPostponed' : 'undo.habitSkipped', actionLabel: 'undo.action' })
    await TestRenderer.act(async () => { tree.root.findAll((node: any) => node.props.testID === 'toast-action' && node.type === 'Pressable')[0].props.onPress(); await Promise.resolve() })
    await vi.waitFor(() => expect(tree.root.findAllByType(HabitRow)).toHaveLength(1))
    expect(offlineMocks.apiClient.mock.calls.some(([endpoint]) => endpoint.endsWith('/undo'))).toBe(online)
    expect(getQueuedMutations()).toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
    client.clear()
  })

  it('does not log a parent after undo restores its final skipped child', async () => {
    skipFlow.active = true
    useActualHabitVisibility = true
    accountHabitCount.count = 3
    offlineMocks.setOnline(true)
    const child = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '11111111-1111-4111-8111-111111111111', title: 'Pending child',
      dueDate: TODAY, scheduledDates: [TODAY], instances: [{ date: TODAY, status: 'Pending', logId: null }],
    }))
    const loggedChild = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '33333333-3333-4333-8333-333333333333', title: 'Logged child',
      dueDate: TODAY, scheduledDates: [TODAY], isCompleted: true, isLoggedInRange: true,
      instances: [{ date: TODAY, status: 'Completed', logId: 'child-log' }],
    }))
    const parent = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '44444444-4444-4444-8444-444444444444', title: 'Parent', hasSubHabits: true,
      dueDate: TODAY, scheduledDates: [TODAY], children: [loggedChild, child],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    }))
    let items: HabitScheduleItem[] = [parent]
    offlineMocks.apiClient.mockImplementation((endpoint: string, options?: { body?: string }) => {
      if (endpoint.endsWith('/undo')) {
        items = [parent]
        return Promise.resolve(undefined)
      }
      if (endpoint.endsWith('/skip')) {
        expect(endpoint).toBe(`/api/habits/${child.id}/skip`)
        skipHabitRequestSchema.parse(JSON.parse(options!.body!))
        items = [{ ...parent, children: [loggedChild] }]
        return Promise.resolve(undefined)
      }
      return Promise.resolve({ items, totalCount: items.length, totalPages: 1, page: 1, pageSize: 200 })
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    let tree: any
    await TestRenderer.act(async () => {
      tree = createTestTree(<QueryClientProvider client={client}><HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} showCompleted onCreatePress={vi.fn()} /><SkipToastHost /></QueryClientProvider>)
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(tree.root.findAllByType(HabitRow).some((node: any) => node.props.habit.id === child.id)).toBe(true))
    const childRow = tree.root.findAllByType(HabitRow).find((node: any) => node.props.habit.id === child.id)
    TestRenderer.act(() => childRow.findAll((node: any) => node.props.accessibilityLabel === 'habits.actions.more')[0].props.onPress())
    const skipItem = tree.root.findAll((node: any) => node.props.accessibilityRole === 'menuitem' && flattenRenderedText(node).includes('habits.actions.skip'))[0]
    await TestRenderer.act(async () => { skipItem.props.onPress(); await Promise.resolve() })
    await vi.waitFor(() => expect(confirmationSheets(tree, 'habits.autoLogParentTitle')).toHaveLength(1))
    await vi.waitFor(() => expect(tree.root.findAllByType(HabitRow).some((node: any) => node.props.habit.id === child.id)).toBe(false))
    await TestRenderer.act(async () => { tree.root.findAll((node: any) => node.props.testID === 'toast-action' && node.type === 'Pressable')[0].props.onPress(); await Promise.resolve() })
    await vi.waitFor(() => expect(tree.root.findAllByType(HabitRow).some((node: any) => node.props.habit.id === child.id)).toBe(true))
    await TestRenderer.act(async () => { pressConfirm(tree, 'habits.autoLogParentConfirm'); await Promise.resolve() })
    expect(logMutateAsync).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
    client.clear()
  })

  it('skips a recurring habit immediately', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise', scheduledDates: [TODAY] })
    seedHabits([habit])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    TestRenderer.act(() => {
      const moreButton = tree.root.findAll((node: any) => (
        node.props.accessibilityLabel === 'habits.actions.more'
      ))[0]
      moreButton.props.onPress()
    })
    const skipItem = tree.root.findAll((node: any) => (
      node.props.accessibilityRole === 'menuitem' &&
      flattenRenderedText(node).includes('habits.actions.skip')
    ))[0]
    expect(skipItem).toBeDefined()
    await TestRenderer.act(async () => {
      skipItem.props.onPress()
      await Promise.resolve()
    })
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'habit-1', date: TODAY, onUndo: expect.any(Function) })
    expect(confirmationSheets(tree, 'habits.skipConfirmTitle({\"name\":\"Exercise\"})')).toHaveLength(0)
    expect(confirmationSheets(tree, 'habits.deleteConfirmTitle')).toHaveLength(0)
  })

  it.each(['Week', 'Month'] as const)('skips a %s flexible habit without confirmation', async (frequencyUnit) => {
    const habit = createMockHabit({ id: 'flexible', title: 'Walk', isFlexible: true, frequencyUnit, scheduledDates: [TODAY] })
    seedHabits([habit])
    let tree: any
    TestRenderer.act(() => { tree = createTestTree(<HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />) })
    await confirmRowSkip(tree, habit.id)
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: habit.id, date: TODAY, onUndo: expect.any(Function) })
    expect(tree.root.findAll((node: any) => node.type === 'Sheet' && node.props.open)).toHaveLength(0)
  })

  it('does not retain a confirmed skip as recently completed', async () => {
    const habit = createMockHabit({ id: 'skip-state', title: 'Walk', scheduledDates: [TODAY] })
    seedHabits([habit])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })
    await confirmRowSkip(tree, habit.id)
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: habit.id, date: TODAY, onUndo: expect.any(Function) })
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(false)
    expect(tree.root.findByType(HabitRow).props.habit.isCompleted).toBe(false)
  })

  it('asks before deleting a habit', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    const child = createMockHabit({ id: 'habit-2', title: 'Warm up', parentId: habit.id })
    seedHabits([habit, child])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const habitCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'habit-1')

    await TestRenderer.act(async () => {
      habitCard?.props.actions.onDelete()
      await Promise.resolve()
    })

    expect(deleteMutateAsync).not.toHaveBeenCalled()
    const [confirmation] = confirmationSheets(tree, 'habits.deleteConfirmTitle')
    expect(confirmation).toBeDefined()
    expect(flattenRenderedText(confirmation)).toContain(
      'Exercise and 1 item inside it leave your list. You can undo it from the message that appears.',
    )

    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.deleteHabit')
      await Promise.resolve()
    })

    expect(deleteMutateAsync).toHaveBeenCalledWith('habit-1')
  })

  it('starts a future-day row delete as soon as confirmation is pressed', async () => {
    const habit = createMockHabit({ id: 'future-delete', title: 'Read', scheduledDates: [TOMORROW] })
    seedHabits([habit])
    deleteMutateAsync.mockImplementationOnce(() => {
      seedHabits([])
      return Promise.resolve()
    })
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" selectedDate={new Date(`${TOMORROW}T09:00:00Z`)}
          filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })
    TestRenderer.act(() => {
      const moreButton = tree.root.findAll((node: any) =>
        node.props.accessibilityLabel === 'habits.actions.more')[0]
      moreButton.props.onPress()
    })
    const deleteItem = tree.root.findAll((node: any) =>
      node.props.accessibilityRole === 'menuitem' &&
      flattenRenderedText(node).includes('habits.actions.delete'))[0]
    expect(deleteItem).toBeDefined()
    TestRenderer.act(() => { deleteItem.props.onPress() })
    expect(confirmationSheets(tree, 'habits.deleteConfirmTitle')).toHaveLength(1)

    sheetTestControls.defer(true)
    TestRenderer.act(() => { pressConfirm(tree, 'habits.deleteHabit') })

    expect(confirmationSheets(tree, 'habits.deleteConfirmTitle')).toHaveLength(0)
    expect(deleteMutateAsync).toHaveBeenCalledTimes(1)
    expect(deleteMutateAsync).toHaveBeenCalledWith('future-delete')
    await TestRenderer.act(async () => { await Promise.resolve() })
    TestRenderer.act(() => {
      tree.update(
        <HabitList view="today" selectedDate={new Date(`${TOMORROW}T09:00:00Z`)}
          filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })
    expect(tree.root.findAllByType(HabitRow)
      .some((node: any) => node.props.habit.id === 'future-delete')).toBe(false)
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(flattenRenderedText(tree.toJSON())).toContain(
      'Read leaves your list. You can undo it from the message that appears.',
    )
    TestRenderer.act(() => { sheetTestControls.completeDismissal() })
    expect(confirmationSheets(tree, 'habits.deleteConfirmTitle')).toHaveLength(0)
  })

  it.each([
    [0, 'Read leaves your list. You can undo it from the message that appears.'],
    [1, 'Read and 1 item inside it leave your list. You can undo it from the message that appears.'],
    [3, 'Read and 3 items inside it leave your list. You can undo it from the message that appears.'],
  ])('names %i descendants in the delete confirmation', async (count, message) => {
    const habit = createMockHabit({ id: 'read', title: 'Read' })
    const children = Array.from({ length: count }, (_, index) =>
      createMockHabit({ id: `child-${index}`, title: `Child ${index}`, parentId: habit.id }))
    seedHabits([habit, ...children])
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })
    const row = tree.root.findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'read')
    await TestRenderer.act(async () => { row?.props.actions.onDelete(); await Promise.resolve() })
    const [confirmation] = confirmationSheets(tree, 'habits.deleteConfirmTitle')
    expect(flattenRenderedText(confirmation)).toContain(message)
    if (count === 0) expect(message).not.toMatch(/0|items/)
  })

  it('shows busy delete actions while dismissal and deletion are pending', async () => {
    const habit = createMockHabit({ id: 'read', title: 'Read' })
    seedHabits([habit])
    deleteMutateAsync.mockImplementation(() => new Promise<void>(() => {}))
    sheetTestControls.defer(true)
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })
    const row = tree.root.findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'read')
    await TestRenderer.act(async () => { row?.props.actions.onDelete(); await Promise.resolve() })
    TestRenderer.act(() => { pressConfirm(tree, 'habits.deleteHabit') })
    const button = (label: string) => tree.root.findAll(
      (node: any) => node.type === 'Pressable' && node.findAll(
        (child: any) => child.type === 'Text' && child.props.children === label,
      ).length > 0,
    ).at(-1)
    expect(button('habits.deleteHabit')?.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    expect(button('common.cancel')?.props.accessibilityState).toMatchObject({ disabled: true })
    expect(deleteMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('restores the habit description in the canonical row', () => {
    seedHabits([
      createMockHabit({ id: 'habit-desc', title: 'Meditate', description: 'Ten minutes of breathing' }),
    ])

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    const descriptionNodes = tree.root.findAll(
      (node: any) => node.props?.children === 'Ten minutes of breathing',
    )
    expect(descriptionNodes.length).toBeGreaterThan(0)
  })

  it('omits the description preview when the habit has none', () => {
    seedHabits([
      createMockHabit({ id: 'habit-nodesc', title: 'Run', description: null }),
    ])

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    const descriptionNodes = tree.root.findAll(
      (node: any) => node.props?.children === 'Ten minutes of breathing',
    )
    expect(descriptionNodes).toHaveLength(0)
  })

  it('postpones immediately a one-time task', async () => {
    const oneTimeTask = createMockHabit({
      id: 'habit-1',
      title: 'Pay bill',
      frequencyUnit: null,
    })
    seedHabits([oneTimeTask])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const habitCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'habit-1')

    await TestRenderer.act(async () => {
      habitCard?.props.actions.onSkip()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node: any) => node.type === 'Sheet' && node.props.open)).toHaveLength(0)
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'habit-1', date: TODAY, onUndo: expect.any(Function) })
    expect(confirmationSheets(tree, 'habits.deleteConfirmTitle')).toHaveLength(0)
  })


  it('logs a habit immediately from the card action', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])
    const selectedDate = new Date('2026-09-05T09:00:00Z')

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={selectedDate}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const habitCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'habit-1')

    await TestRenderer.act(async () => {
      await habitCard?.props.actions.onLog()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-1',
      date: '2026-09-05',
      intent: 'log',
    })
  })

  it('unlogs only the viewed historical occurrence', () => {
    let occurrences: NormalizedHabit['instances'] = [
      { date: YESTERDAY, status: 'Completed', logId: 'log-yesterday' },
      { date: TODAY, status: 'Pending', logId: null },
    ]
    const habit = createMockHabit({
      id: 'habit-1',
      title: 'Exercise',
      isCompleted: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: occurrences,
    })
    seedHabits([habit])
    logMutateAsync.mockImplementation(({ date }: { date?: string }) => {
      occurrences = occurrences.map((occurrence) =>
        occurrence.date === date
          ? { ...occurrence, status: 'Pending', logId: null }
          : occurrence,
      )
    })

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })
    const habitCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === habit.id)

    TestRenderer.act(() => {
      habitCard?.props.actions.onUnlog()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-1',
      date: YESTERDAY,
      intent: 'unlog',
    })
    expect(occurrences).toContainEqual({
      date: TODAY,
      status: 'Pending',
      logId: null,
    })
  })

  it('guards only the settling habit until its refetch completes', async () => {
    const firstHabit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    const secondHabit = createMockHabit({ id: 'habit-2', title: 'Read' })
    seedHabits([firstHabit, secondHabit])

    let resolveFirstMutation: (() => void) | undefined
    const firstMutation = new Promise<void>((resolve) => {
      resolveFirstMutation = resolve
    })
    let resolveFirstRefetch: (() => void) | undefined
    const firstRefetch = new Promise<void>((resolve) => {
      resolveFirstRefetch = resolve
    })
    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) =>
      habitId === firstHabit.id ? firstMutation : Promise.resolve(),
    )
    habitListRefetch
      .mockReturnValueOnce(firstRefetch)
      .mockResolvedValue(undefined)

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date()}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })
    const findHabitCard = (habitId: string) =>
      tree.root
        .findAllByType(HabitRow)
        .find((node: any) => node.props.habit.id === habitId)

    TestRenderer.act(() => {
      findHabitCard(firstHabit.id)?.props.actions.onLog()
    })
    await TestRenderer.act(async () => {
      resolveFirstMutation?.()
      await firstMutation
    })
    expect(habitListRefetch).toHaveBeenCalledTimes(1)

    TestRenderer.act(() => {
      findHabitCard(firstHabit.id)?.props.actions.onUnlog()
    })
    expect(logMutateAsync).toHaveBeenCalledTimes(1)

    TestRenderer.act(() => {
      findHabitCard(secondHabit.id)?.props.actions.onLog()
    })
    expect(logMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ habitId: secondHabit.id }),
    )

    await TestRenderer.act(async () => {
      resolveFirstRefetch?.()
      await firstRefetch
    })
  })

  it('keeps an offline toggle guarded through real queue replay', async () => {
    const firstHabit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    const secondHabit = createMockHabit({ id: 'habit-2', title: 'Read' })
    seedHabits([firstHabit, secondHabit])
    logMutateAsync.mockImplementation(queueHabitToggle)

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })
    const findHabitCard = (habitId: string) => tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === habitId)

    await TestRenderer.act(async () => {
      await findHabitCard(firstHabit.id)?.props.actions.onLog()
    })

    seedHabits([{ ...firstHabit, isCompleted: true }, secondHabit])
    TestRenderer.act(() => {
      tree.update(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      await findHabitCard(firstHabit.id)?.props.actions.onUnlog()
      await findHabitCard(secondHabit.id)?.props.actions.onLog()
    })

    expect(getQueuedMutations().map((mutation) => ({
      type: mutation.type,
      targetEntityId: mutation.targetEntityId,
      payload: mutation.payload,
    }))).toEqual([
      { type: 'logHabit', targetEntityId: firstHabit.id, payload: { date: TODAY } },
      { type: 'logHabit', targetEntityId: secondHabit.id, payload: { date: TODAY } },
    ])

    offlineMocks.setOnline(true)
    await flushQueuedMutations()

    expect(getQueuedMutations()).toEqual([])
    expect(offlineMocks.appliedHabitIds).toEqual([firstHabit.id, secondHabit.id])
    expect(offlineMocks.loggedHabits).toEqual(new Set([firstHabit.id, secondHabit.id]))
  })

  it('coalesces a reconnect tap while the retained toggle is still flushing', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])
    logMutateAsync.mockImplementation(queueHabitToggle)

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })
    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onLog()
    })

    seedHabits([{ ...habit, isCompleted: true }])
    TestRenderer.act(() => {
      tree.update(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    let releaseReplay: (() => void) | undefined
    const replayResponse = new Promise<null>((resolve) => {
      releaseReplay = () => resolve(null)
    })
    offlineMocks.apiClient.mockImplementationOnce((endpoint) => {
      offlineMocks.receiveHabitToggle(endpoint)
      return replayResponse
    })
    offlineMocks.setOnline(true)
    const flush = flushQueuedMutations()

    await vi.waitFor(() => {
      expect(offlineMocks.apiClient).toHaveBeenCalledTimes(1)
      expect(getQueuedMutations()[0]?.status).toBe('syncing')
    })

    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onUnlog()
    })

    expect(offlineMocks.apiClient).toHaveBeenCalledTimes(1)
    expect(getQueuedMutations()).toEqual([
      expect.objectContaining({
        type: 'logHabit',
        status: 'syncing',
        targetEntityId: habit.id,
        payload: { date: TODAY },
        dedupeKey: `habit-toggle:${habit.id}:${TODAY}`,
      }),
    ])

    releaseReplay?.()
    await flush

    expect(getQueuedMutations()).toEqual([])
    expect(offlineMocks.appliedHabitIds).toEqual([habit.id])
    expect(offlineMocks.loggedHabits).toEqual(new Set([habit.id]))
  })

  it('keeps one persisted toggle when the list remounts before replay', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])
    logMutateAsync.mockImplementation(queueHabitToggle)

    const renderList = () => (
      <HabitList
        view="today"
        filters={{}}
        selectedDate={new Date(`${TODAY}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })
    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onLog()
    })
    const queuedMutationId = getQueuedMutations()[0]?.id

    TestRenderer.act(() => {
      tree.unmount()
    })
    seedHabits([{ ...habit, isCompleted: true }])
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })
    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onUnlog()
    })

    expect(getQueuedMutations()).toEqual([
      expect.objectContaining({
        id: queuedMutationId,
        type: 'logHabit',
        targetEntityId: habit.id,
        payload: { date: TODAY },
        dedupeKey: `habit-toggle:${habit.id}:${TODAY}`,
      }),
    ])

    offlineMocks.setOnline(true)
    await flushQueuedMutations()

    expect(offlineMocks.appliedHabitIds).toEqual([habit.id])
    expect(offlineMocks.loggedHabits).toEqual(new Set([habit.id]))
  })

  it('keeps one restored toggle after persisted rows are rehydrated before replay', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])
    logMutateAsync.mockImplementation(queueHabitToggle)

    const renderList = () => (
      <HabitList
        view="today"
        filters={{}}
        selectedDate={new Date(`${TODAY}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })
    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onLog()
    })

    const restoredRows = Array.from(offlineMocks.rows.entries()).map(([id, row]) => [
      id,
      { ...row },
    ] as const)
    TestRenderer.act(() => {
      tree.unmount()
    })
    offlineMocks.rows.clear()
    for (const [id, row] of restoredRows) offlineMocks.rows.set(id, row)

    seedHabits([{ ...habit, isCompleted: true }])
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })
    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onUnlog()
    })

    expect(getQueuedMutations()).toHaveLength(1)
    expect(getQueuedMutations()[0]).toEqual(expect.objectContaining({
      id: restoredRows[0]?.[0],
      targetEntityId: habit.id,
      payload: { date: TODAY },
      dedupeKey: `habit-toggle:${habit.id}:${TODAY}`,
    }))

    offlineMocks.setOnline(true)
    await flushQueuedMutations()

    expect(getQueuedMutations()).toEqual([])
    expect(offlineMocks.appliedHabitIds).toEqual([habit.id])
    expect(offlineMocks.loggedHabits).toEqual(new Set([habit.id]))
  })

  it('accepts a second offline toggle intent after the first queue item finalizes', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])
    logMutateAsync.mockImplementation(queueHabitToggle)

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onLog()
    })
    expect(getQueuedMutations()).toHaveLength(1)

    offlineMocks.setOnline(true)
    await flushQueuedMutations()
    expect(offlineMocks.loggedHabits.has(habit.id)).toBe(true)

    seedHabits([{ ...habit, isCompleted: true }])
    TestRenderer.act(() => {
      tree.update(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })
    await TestRenderer.act(async () => {
      await tree.root.findByType(HabitRow).props.actions.onUnlog()
    })

    expect(getQueuedMutations()).toEqual([])
    expect(offlineMocks.appliedHabitIds).toEqual([habit.id, habit.id])
    expect(offlineMocks.loggedHabits.has(habit.id)).toBe(false)
  })

  it('keeps the row visible while a direct log request is pending', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise', isCompleted: false })
    seedHabits([habit])

    let resolveLog: (() => void) | undefined
    const pendingLog = new Promise<void>((resolve) => {
      resolveLog = resolve
    })

    logMutateAsync.mockImplementation(() => pendingLog)

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const initialHabitCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'habit-1')

    await TestRenderer.act(async () => {
      void initialHabitCard?.props.actions.onLog()
      await Promise.resolve()
    })

    const pendingHabitCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'habit-1')

    expect(pendingHabitCard).toBeTruthy()

    resolveLog?.()
    await TestRenderer.act(async () => {
      await pendingLog
    })
  })

  it('uses plain draggable list for today view outside select mode', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          listHeader={React.createElement('Header')}
          onCreatePress={vi.fn()}
        />,
      )
    })

    const [draggableList] = tree.root.findAllByType('DraggableFlatList')

    expect(draggableList).toBeTruthy()
    expect(tree.root.findAllByType('Header')).toHaveLength(1)
    expect(tree.root.findAllByType('FlatList')).toHaveLength(0)
  })

  it.each(['populated', 'deep', 'loading', 'empty', 'filtered-empty', 'error'])('spaces drill groups by 24 without widening rows (%s)', (surface) => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    const children = ['first', 'second'].map((id) => createMockHabit({ id, title: id, parentId: parent.id }))
    seedHabits([parent, ...children])
    mockDrillState.currentParentId = parent.id
    mockDrillState.currentParent = parent
    mockDrillState.drillStack = surface === 'deep' ? ['root', parent.id] : [parent.id]
    mockDrillState.drillChildren = surface === 'populated' || surface === 'deep' ? children : []
    mockDrillState.drillLoading = surface === 'loading'
    mockDrillState.drillError = surface === 'error' ? 'boom' : null
    mockDrillState.hasUnfilteredChildren = surface === 'filtered-empty'
    mockDrillState.canRevealCompletedChildren = surface === 'filtered-empty'
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted={false} onShowCompleted={vi.fn()} onCreatePress={vi.fn()} />)
    })
    const list = tree!.root.findByType('FlatList')
    let composition: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      composition = createTestTree(<View>
        {list.props.ListHeaderComponent}
        <View testID="drill-content">
          {list.props.data.length > 0
            ? list.props.data.map((item: NormalizedHabit, index: number) => list.props.renderItem({ item, index }))
            : list.props.ListEmptyComponent}
          {list.props.ListFooterComponent}
        </View>
      </View>)
    })
    const emptyMessageKey = surface === 'empty' ? 'habits.noSubHabits' : 'habits.filterEmptySubHabits'
    let rowIndex = 0
    const geometry = measureSafeArea((composition! as GeometryTree).toJSON(), (host) => {
      if (host.props.testID === 'habit-row') return `habit-row-${rowIndex++}`
      if (host.props.testID === 'drill-content') return 'content'
      if (surface !== 'deep' && host.props.accessibilityLabel === 'common.back') return 'control'
      if (host.props.accessibilityRole === 'button') {
        const text = flattenText(host.children)
        if (surface === 'deep' && text.includes('habits.backToHabits')) return 'control'
        if (text.includes('habits.form.addSubHabit')) return 'add-row'
        if (text.includes('habits.showCompleted')) return 'show-completed'
      }
      if (host.type === 'View' && host.children?.some((child) => typeof child !== 'string' && child.type === 'Text' && child.children?.includes(emptyMessageKey))) return 'empty-message'
      return undefined
    })
    expect(geometry.get('content')!.top - geometry.get('control')!.bottom).toBe(24)
    if (surface === 'empty' || surface === 'filtered-empty') {
      const emptyMessageToAddRowGap = 0
      expect(geometry.get('add-row')!.top - geometry.get('empty-message')!.bottom).toBe(emptyMessageToAddRowGap)
      if (surface === 'filtered-empty') expect(geometry.has('show-completed')).toBe(true)
    }
    if (surface === 'populated' || surface === 'deep') {
      expect(rowIndex).toBe(2)
      expect(geometry.get('habit-row-1')!.top - geometry.get('habit-row-0')!.bottom).toBe(12)
    }
  })

  it('uses a plain list for drill view', () => {
    let tree: any

    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent' })
    seedHabits([parent, child])
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillChildren = [child]
    mockDrillState.drillStack = ['parent']

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    expect(tree.root.findAllByType('DraggableFlatList')).toHaveLength(0)
    expect(tree.root.findAllByType('FlatList')).toHaveLength(1)
    expect(tree.root.findByType('FlatList').props.removeClippedSubviews).toBeFalsy()
    expect(tree.root.findByType('FlatList').props.keyboardShouldPersistTaps).toBe('handled')
    expect(tree.root.findByType('FlatList').props.renderItem({ item: child, index: 0 }).props.structuralColumn).toBe(true)
    let headerTree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { headerTree = createTestTree(tree.root.findByType('FlatList').props.ListHeaderComponent) })
    expectPressFill(headerTree, 'common.back', createTokensV2().bgHover, 999)
  })

  it('explains filtered empty drills and offers Show completed when it can reveal children', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    const onShowCompleted = vi.fn()
    seedHabits([parent])
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillStack = ['parent']
    mockDrillState.hasUnfilteredChildren = true
    mockDrillState.canRevealCompletedChildren = true

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted={false} onShowCompleted={onShowCompleted} onCreatePress={vi.fn()} />,
      )
    })

    const flatList = tree.root.findByType('FlatList')
    let emptyStateTree: any
    TestRenderer.act(() => {
      emptyStateTree = createTestTree(flatList.props.ListEmptyComponent)
    })
    expect(flattenRenderedText(emptyStateTree.toJSON())).toContain('habits.filterEmptySubHabits')
    expect(flattenRenderedText(emptyStateTree.toJSON())).not.toContain('habits.noSubHabits')

    const showCompletedButton = emptyStateTree.root.findAll(
      (node: any) => flattenText(node.props?.children) === 'habits.showCompleted' && typeof node.props?.onPress === 'function',
    )[0]
    TestRenderer.act(() => showCompletedButton.props.onPress())
    expect(onShowCompleted).toHaveBeenCalledTimes(1)
  })

  it('explains date-filtered drills without offering Show completed', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    seedHabits([parent])
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillStack = ['parent']
    mockDrillState.hasUnfilteredChildren = true

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />)
    })
    const flatList = tree.root.findByType('FlatList')
    let emptyStateTree: any
    TestRenderer.act(() => {
      emptyStateTree = createTestTree(flatList.props.ListEmptyComponent)
    })
    expect(flattenRenderedText(emptyStateTree.toJSON())).toContain('habits.filterEmptySubHabits')
    expect(flattenRenderedText(emptyStateTree.toJSON())).not.toContain('habits.showCompleted')
  })

  it('keeps the true empty drill message when the habit has no children', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent' })
    seedHabits([parent])
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillStack = ['parent']

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />)
    })
    const flatList = tree.root.findByType('FlatList')
    let emptyStateTree: any
    TestRenderer.act(() => {
      emptyStateTree = createTestTree(flatList.props.ListEmptyComponent)
    })
    expect(flattenRenderedText(emptyStateTree.toJSON())).toContain('habits.noSubHabits')
    expect(flattenRenderedText(emptyStateTree.toJSON())).not.toContain('habits.filterEmptySubHabits')
  })

  it('retries loading drill children from the drill error state', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
    })
    seedHabits([parent])
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillStack = ['parent']
    mockDrillState.drillError = 'boom'

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const flatList = tree.root.findByType('FlatList')
    let emptyStateTree: any
    TestRenderer.act(() => {
      emptyStateTree = createTestTree(flatList.props.ListEmptyComponent)
    })

    expect(flattenRenderedText(emptyStateTree.toJSON())).toContain('boom')

    const retryButton = emptyStateTree.root.findAll(
      (node: any) =>
        flattenText(node.props?.children) === 'common.retry' &&
        typeof node.props?.onPress === 'function',
    )[0]
    TestRenderer.act(() => {
      retryButton.props.onPress()
    })

    expect(mockDrillState.refreshCurrent).toHaveBeenCalledTimes(1)
  })

  it('reorders grandchildren within their parent while keeping their visible depth', async () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent' })
    const branch = createMockHabit({ id: 'branch', title: 'Branch', parentId: parent.id })
    const first = createMockHabit({ id: 'first', title: 'First', parentId: branch.id, position: 0 })
    const second = createMockHabit({ ...first, id: 'second', title: 'Second', position: 1 })
    seedHabits([parent, branch, first, second])
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = createTestTree(<HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />) })
    const list = tree.root.findByType('DraggableFlatList')
    await TestRenderer.act(async () => { await list.props.onDragEnd({ from: 3, to: 2 }) })
    expect(reorderMutateAsync).toHaveBeenCalledWith({ positions: [{ habitId: second.id, position: 0 }, { habitId: first.id, position: 1 }] })
    expect(tree.root.findAllByType(HabitRow).map((row: { props: { depth: number } }) => row.props.depth)).toEqual([0, 1, 2, 2])
  })

  it('submits reordered positions on drag end', async () => {
    const first = createMockHabit({ id: 'first', title: 'First', position: 0 })
    const second = createMockHabit({ id: 'second', title: 'Second', position: 1 })
    seedHabits([first, second])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted={false}
          onCreatePress={vi.fn()}
        />,
      )
    })

    const draggableList = tree.root.findByType('DraggableFlatList')

    await TestRenderer.act(async () => {
      await draggableList.props.onDragEnd({ from: 1, to: 0 })
    })

    expect(reorderMutateAsync).toHaveBeenCalledWith({
      positions: [
        { habitId: 'second', position: 0 },
        { habitId: 'first', position: 1 },
      ],
    })
  })

  it('renders every row with calibrated render-window props while keeping reorder working', async () => {
    const habits = Array.from({ length: 12 }, (_, index) =>
      createMockHabit({
        id: `habit-${index}`,
        title: `Habit ${index}`,
        position: index,
      }),
    )
    seedHabits(habits)

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const draggableList = tree.root.findByType('DraggableFlatList')

    expect(
      tree.root
        .findAllByType(HabitRow)
        .map((node: any) => node.props.habit.id),
    ).toEqual(habits.map((habit) => habit.id))

    expect(draggableList.props.initialNumToRender).toBe(10)
    expect(draggableList.props.maxToRenderPerBatch).toBe(8)
    expect(draggableList.props.windowSize).toBe(11)
    expect(draggableList.props.removeClippedSubviews).toBeFalsy()

    await TestRenderer.act(async () => {
      await draggableList.props.onDragEnd({ from: 0, to: 1 })
    })

    expect(reorderMutateAsync).toHaveBeenCalledTimes(1)
    expect(reorderMutateAsync).toHaveBeenCalledWith({
      positions: [
        { habitId: 'habit-1', position: 0 },
        { habitId: 'habit-0', position: 1 },
        ...Array.from({ length: 10 }, (_, index) => ({
          habitId: `habit-${index + 2}`,
          position: index + 2,
        })),
      ],
    })
  })

  it('temporarily collapses dragged parents and restores them after drop', async () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', position: 0 })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent', position: 0 })
    const grandchild = createMockHabit({ id: 'grandchild', title: 'Grandchild', parentId: child.id, position: 0 })
    seedHabits([parent, child, grandchild])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const findDraggableCards = () =>
      tree.root.findAll(
        (node: any) =>
          typeof node.props?.onLongPress === 'function',
      )

    expect(findDraggableCards().length).toBeGreaterThanOrEqual(2)

    expect(tree.root.findAllByType(HabitRow).map((row: { props: { depth: number } }) => row.props.depth)).toEqual([0, 1, 2])
    const initialCount = findDraggableCards().length
    const [parentCard] = findDraggableCards()

    TestRenderer.act(() => {
      parentCard?.props.onLongPress?.()
    })

    expect(findDraggableCards().length).toBeLessThan(initialCount)

    const draggableList = tree.root.findByType('DraggableFlatList')

    await TestRenderer.act(async () => {
      await draggableList.props.onDragEnd({ from: 0, to: 0 })
      await Promise.resolve()
    })

    expect(findDraggableCards().length).toBeGreaterThanOrEqual(initialCount)
    expect(tree.root.findAllByType(HabitRow).map((row: { props: { depth: number } }) => row.props.depth)).toEqual([0, 1, 2])
  })

  it('computes parent progress recursively for deep habit trees', () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: 'grandparent',
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      hasSubHabits: true,
    })
    const leaf = createMockHabit({
      id: 'leaf',
      title: 'Leaf',
      parentId: 'child',
      isCompleted: true,
    })
    seedHabits([grandparent, parent, child, leaf])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const grandparentCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'grandparent')

    expect(grandparentCard?.props.childrenDone).toBe(1)
    expect(grandparentCard?.props.childrenTotal).toBe(3)
  })

  it('logs an incomplete parent immediately without confirmation', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
    })
    seedHabits([parent, child])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const parentCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'parent')

    await TestRenderer.act(async () => {
      parentCard?.props.actions.onLog()
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', intent: 'log' })
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('asks before settling the parent when the last child is marked completed', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    seedHabits([parent, child])

    const ref = React.createRef<HabitListHandle>()
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: 'parent',
      date: TODAY,
      intent: 'log',
    })
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('does not settle the parent before the current snapshot reflects the final child completion', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const doneChild = createMockHabit({
      id: 'child-a',
      title: 'A',
      parentId: 'parent',
      isCompleted: true,
    })
    const justLoggedChild = createMockHabit({
      id: 'child-b',
      title: 'B',
      parentId: 'parent',
      isCompleted: false,
    })
    seedHabits([parent, doneChild, justLoggedChild])

    const ref = React.createRef<HabitListHandle>()
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.markRecentlyCompleted('child-b')
      ref.current?.checkAndPromptParentLog('child-b')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: 'parent',
      date: TODAY,
      intent: 'log',
    })
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('does not settle the parent when a refetch makes a child incomplete while confirmation is open', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })

    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog(child.id)
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      seedHabits([parent, { ...child, isCompleted: false }])
      mockHabitsDataUpdatedAt += 1
      tree.update(renderList())
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
    expect(skipMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it('does not settle a recurring parent logged elsewhere after a refetch', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })

    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog(child.id)
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      seedHabits([
        { ...parent, isCompleted: false, isLoggedInRange: true },
        child,
      ])
      mockHabitsDataUpdatedAt += 1
      tree.update(renderList())
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
    expect(skipMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it.each([
    ['one-time', null],
    ['recurring', 'Day'],
  ] as const)('does not settle a %s parent postponed while confirmation is open', async (_label, frequencyUnit) => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      dueDate: TODAY,
      frequencyUnit,
      hasSubHabits: true,
      instances: [],
      scheduledDates: [],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })

    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog(child.id)
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      seedHabits([{ ...parent, dueDate: TOMORROW }, child])
      mockHabitsDataUpdatedAt += 1
      tree.update(renderList())
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
    expect(skipMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it('uses the current logged and skipped mix when confirmation is accepted', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })

    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog(child.id)
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      seedHabits([
        parent,
        {
          ...child,
          isCompleted: false,
          isFlexible: true,
          flexibleTarget: 1,
          flexibleCompleted: 1,
          isLoggedInRange: false,
        },
      ])
      mockHabitsDataUpdatedAt += 1
      tree.update(renderList())
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: parent.id, date: TODAY })
    expect(logMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it('settles an overdue parent when the last child is marked completed', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      isOverdue: true,
      scheduledDates: [],
      instances: [],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    seedHabits([parent, child])

    const ref = React.createRef<HabitListHandle>()
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: 'parent',
      date: TODAY,
      intent: 'log',
    })
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('does not prompt a parent that is only due in the future', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      dueDate: TOMORROW,
      scheduledDates: [TOMORROW],
      instances: [{ date: TOMORROW, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
    })
    seedHabits([parent, child])

    const ref = React.createRef<HabitListHandle>()
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    TestRenderer.act(() => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })

    expect(logMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ habitId: 'parent' }),
    )
  })

  it('logs the final child and every ancestor on the viewed historical date', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      scheduledDates: [YESTERDAY],
    })
    seedHabits([grandparent, parent, child])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      const childRow = tree.root
        .findAllByType(HabitRow)
        .find((node: any) => node.props.habit.id === 'child')
      await childRow?.props.actions.onLog()
      await Promise.resolve()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls).toEqual([
      [{ habitId: 'child', date: YESTERDAY, intent: 'log' }],
      [{ habitId: 'parent', date: YESTERDAY, intent: 'log' }],
      [{ habitId: 'grandparent', date: YESTERDAY, intent: 'log' }],
    ])
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('skips the final child and every ancestor on the viewed historical date', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      scheduledDates: [YESTERDAY],
    })
    seedHabits([grandparent, parent, child])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await confirmRowSkip(tree, 'child')
    await TestRenderer.act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(skipMutateAsync.mock.calls).toEqual([
      [{ habitId: 'child', date: YESTERDAY, onUndo: expect.any(Function) }],
      [{ habitId: 'parent', date: YESTERDAY }],
      [{ habitId: 'grandparent', date: YESTERDAY }],
    ])
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('skips the parent once every sub-habit is skipped', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [TODAY, TOMORROW],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({ id: 'child-a', title: 'A', parentId: 'parent', scheduledDates: [TODAY] })
    const childB = createMockHabit({ id: 'child-b', title: 'B', parentId: 'parent', scheduledDates: [TODAY] })
    seedHabits([parent, childA, childB])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    async function skipChild(childId: string) {
      await confirmRowSkip(tree, childId)
      await TestRenderer.act(async () => {
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    await skipChild('child-a')

    expect(skipMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ habitId: 'parent' }),
    )

    await skipChild('child-b')
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'child-a', date: TODAY, onUndo: expect.any(Function) })
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'child-b', date: TODAY, onUndo: expect.any(Function) })
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY })
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('asks before logging a parent when the final row action is a skip', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const loggedChild = createMockHabit({
      id: 'child-logged',
      title: 'Logged child',
      parentId: parent.id,
      isCompleted: true,
      scheduledDates: [TODAY],
    })
    const skippedChild = createMockHabit({
      id: 'child-skipped',
      title: 'Skipped child',
      parentId: parent.id,
      scheduledDates: [TODAY],
    })
    seedHabits([parent, loggedChild, skippedChild])
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    await confirmRowSkip(tree, skippedChild.id)

    expect(logMutateAsync).not.toHaveBeenCalledWith({
      habitId: parent.id,
      date: TODAY,
      intent: 'log',
    })
    expect(confirmationSheets(tree, 'habits.autoLogParentTitle')).toHaveLength(1)
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })
    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: parent.id,
      date: TODAY,
      intent: 'log',
    })
  })

  it('queues confirmations when concurrent row skips complete two mixed parents', async () => {
    const parentA = createMockHabit({
      id: 'parent-a',
      title: 'Parent A',
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      title: 'Parent B',
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const children = [
      createMockHabit({
        id: 'logged-a',
        parentId: parentA.id,
        isCompleted: true,
        scheduledDates: [TODAY],
      }),
      createMockHabit({ id: 'skipped-a', parentId: parentA.id, scheduledDates: [TODAY] }),
      createMockHabit({
        id: 'logged-b',
        parentId: parentB.id,
        isCompleted: true,
        scheduledDates: [TODAY],
      }),
      createMockHabit({ id: 'skipped-b', parentId: parentB.id, scheduledDates: [TODAY] }),
    ]
    seedHabits([parentA, parentB, ...children])
    const resolveSkips: (() => void)[] = []
    skipMutateAsync.mockImplementation(
      () => new Promise<void>((resolve) => resolveSkips.push(resolve)),
    )
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })
    await confirmRowSkip(tree, 'skipped-a')
    await confirmRowSkip(tree, 'skipped-b')
    sheetTestControls.defer(true)
    await TestRenderer.act(async () => {
      resolveSkips.forEach((resolve) => resolve())
      await Promise.resolve()
    })

    let [confirmation] = confirmationSheets(tree, 'habits.autoLogParentTitle')
    expect(flattenRenderedText(confirmation)).toContain(
      'habits.autoLogParentMessage({"name":"Parent A"})',
    )
    TestRenderer.act(() => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
    })
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(confirmationSheets(tree, 'habits.autoLogParentTitle')).toHaveLength(0)

    await TestRenderer.act(async () => {
      sheetTestControls.completeDismissal()
      await Promise.resolve()
    })
    ;[confirmation] = confirmationSheets(tree, 'habits.autoLogParentTitle')
    expect(flattenRenderedText(confirmation)).toContain(
      'habits.autoLogParentMessage({"name":"Parent B"})',
    )

    TestRenderer.act(() => {
      mockHabitsDataUpdatedAt += 1
      tree.update(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    TestRenderer.act(() => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
    })
    expect(sheetTestControls.isDismissPending).toBe(true)
    await TestRenderer.act(async () => {
      sheetTestControls.completeDismissal()
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: parentA.id,
      date: TODAY,
      intent: 'log',
    })
    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: parentB.id,
      date: TODAY,
      intent: 'log',
    })
  })

  it('keeps a cascaded grandparent confirmation actionable after stale settlement data', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const loggedChild = createMockHabit({
      id: 'logged-child',
      parentId: parent.id,
      isCompleted: true,
      scheduledDates: [TODAY],
    })
    const skippedChild = createMockHabit({
      id: 'skipped-child',
      parentId: parent.id,
      scheduledDates: [TODAY],
    })
    seedHabits([grandparent, parent, loggedChild, skippedChild])

    let resolveParentMutation!: () => void
    const pendingParentMutation = new Promise<void>((resolve) => {
      resolveParentMutation = resolve
    })
    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parent.id ? pendingParentMutation : Promise.resolve()
    ))
    const renderList = () => (
      <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />
    )
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(renderList())
    })

    await confirmRowSkip(tree, skippedChild.id)
    let [confirmation] = confirmationSheets(tree, 'habits.autoLogParentTitle')
    expect(flattenRenderedText(confirmation)).toContain(
      'habits.autoLogParentMessage({"name":"Parent"})',
    )

    TestRenderer.act(() => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
    })
    await TestRenderer.act(async () => {
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      mockHabitsDataUpdatedAt += 1
      tree.update(renderList())
    })

    await TestRenderer.act(async () => {
      resolveParentMutation()
      await pendingParentMutation
      await Promise.resolve()
    })

    ;[confirmation] = confirmationSheets(tree, 'habits.autoLogParentTitle')
    expect(flattenRenderedText(confirmation)).toContain(
      'habits.autoLogParentMessage({"name":"Grandparent"})',
    )
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })
    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: grandparent.id,
      date: TODAY,
      intent: 'log',
    })
  })

  it('does not settle a parent when a row skip resolves after the viewed date changes', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    seedHabits([parent, child])
    let resolveSkip!: () => void
    skipMutateAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveSkip = resolve
    }))
    const renderList = (date: string) => (
      <HabitList
        view="today"
        filters={{}}
        selectedDate={new Date(`${date}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(renderList(YESTERDAY))
    })

    TestRenderer.act(() => {
      const childRow = tree.root
        .findAllByType(HabitRow)
        .find((node: any) => node.props.habit.id === child.id)
      childRow?.props.actions.onSkip()
    })
    await TestRenderer.act(async () => {
        await Promise.resolve()
    })
    TestRenderer.act(() => {
      tree.update(renderList(TODAY))
    })
    await TestRenderer.act(async () => {
      resolveSkip()
      await Promise.resolve()
    })

    expect(skipMutateAsync.mock.calls).toEqual([
      [{ habitId: child.id, date: YESTERDAY, onUndo: expect.any(Function) }],
    ])
    expect(logMutateAsync).not.toHaveBeenCalledWith({
      habitId: parent.id,
      date: YESTERDAY,
      intent: 'log',
    })
    expect(tree.root.findAllByType('ConfirmDialog')).toHaveLength(0)
  })

  it('clears the recently-completed timer on unmount so it never fires after teardown', () => {
    vi.useFakeTimers()
    try {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
      seedHabits([createMockHabit({ id: 'habit-1', title: 'Exercise' })])

      const ref = React.createRef<HabitListHandle>()
      let tree: any

      TestRenderer.act(() => {
        tree = createTestTree(
          <HabitList
            ref={ref}
            view="today"
            filters={{}}
            showCompleted
            onCreatePress={vi.fn()}
          />,
        )
      })

      TestRenderer.act(() => {
        ref.current?.markRecentlyCompleted('habit-1')
      })

      clearTimeoutSpy.mockClear()

      TestRenderer.act(() => {
        tree.unmount()
      })

      expect(clearTimeoutSpy).toHaveBeenCalled()

      expect(() => {
        TestRenderer.act(() => {
          vi.advanceTimersByTime(2000)
        })
      }).not.toThrow()

      clearTimeoutSpy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a completed row in place for 1400 ms', () => {
    vi.useFakeTimers()
    useActualHabitVisibility = true
    try {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const activeHabit = createMockHabit({
        id: 'habit-2',
        title: 'Read',
        isGeneral: true,
      })
      seedHabits([
        createMockHabit({ id: 'habit-1', title: 'Exercise' }),
        activeHabit,
      ])
      const ref = React.createRef<HabitListHandle>()
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => {
        tree = createTestTree(
          <HabitList ref={ref} view="today" filters={{}} showCompleted={false} onCreatePress={vi.fn()} />,
        )
      })

      TestRenderer.act(() => ref.current?.markRecentlyCompleted('habit-1'))

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1400)
      const completedHabit = createMockHabit({
        id: 'habit-1',
        title: 'Exercise',
        isCompleted: true,
      })
      seedHabits([completedHabit, activeHabit])
      TestRenderer.act(() => {
        tree!.update(
          <HabitList ref={ref} view="today" filters={{}} showCompleted={false} onCreatePress={vi.fn()} />,
        )
      })
      expect(flattenText(tree!.toJSON())).toContain('Exercise')

      TestRenderer.act(() => vi.advanceTimersByTime(1400))

      expect(flattenText(tree!.toJSON())).not.toContain('Exercise')
      TestRenderer.act(() => tree!.unmount())
      setTimeoutSpy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs an overdue habit directly with no date', async () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    seedHabits([overdue])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    const overdueCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'overdue-1')

    await TestRenderer.act(async () => {
      await overdueCard?.props.actions.onLog()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1', intent: 'log' })
  })

  it('postpones immediately an overdue habit with no date', async () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    seedHabits([overdue])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    const overdueCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'overdue-1')

    await TestRenderer.act(async () => {
      overdueCard?.props.actions.onSkip()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node: any) => node.type === 'Sheet' && node.props.open)).toHaveLength(0)
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1', date: TODAY, onUndo: expect.any(Function) })
  })

  it('renders a selectable overdue row in select mode', () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    seedHabits([overdue])

    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          isSelectMode
          selectedHabitIds={new Set()}
          onCreatePress={vi.fn()}
        />,
      )
    })

    const overdueCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'overdue-1')

    expect(overdueCard?.props.isSelectMode).toBe(true)
    expect(overdueCard?.props.structuralColumn).toBe(true)

    TestRenderer.act(() => {
      overdueCard?.props.actions.onToggleSelection()
    })

    expect(toggleSelectionCascade).toHaveBeenCalledWith(
      'overdue-1',
      expect.any(Function),
    )
  })

  it('shows the overdue meta token on a child row', () => {
    const overdueChild = createMockHabit({
      id: 'overdue-child',
      title: 'Overdue child',
      parentId: 'parent',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitRow habit={overdueChild} depth={1} />,
      )
    })

    expect(flattenRenderedText(tree.toJSON())).toContain('habits.overdue')
  })

  it('keeps a future schedule hint accessible without visible row meta', () => {
    const inSixDays = formatAPIDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000))
    const futureHabit = createMockHabit({
      id: 'future-1',
      title: 'Dentist',
      frequencyUnit: null,
      dueDate: inSixDays,
      scheduledDates: [inSixDays],
    })

    let tree: any
    TestRenderer.act(() => {
      tree = createTestTree(<HabitRow habit={futureHabit} />)
    })

    const renderedText = flattenRenderedText(tree.toJSON())
    expect(renderedText).not.toContain('habits.schedule.dueInDays')
    const body = tree.root.findAllByType('Pressable').find((node: { props: { delayLongPress?: number } }) => node.props.delayLongPress === 500)
    expect(body.props.accessibilityHint).toContain('habits.schedule.dueInDays')
    expect(body.props.accessibilityHint).toContain('"count":6')
  })

  it('renders the status dot disabled for a non-loggable row and interactive for a loggable one', () => {
    const nonLoggable = createMockHabit({
      id: 'non-loggable',
      title: 'Daily yoga',
      frequencyUnit: 'Day',
      scheduledDates: [],
      isOverdue: false,
      isCompleted: false,
    })
    const loggable = createMockHabit({
      id: 'loggable',
      title: 'Pay rent',
      frequencyUnit: null,
      isCompleted: false,
    })
    const onLog = vi.fn()

    let nonLoggableTree: any
    let loggableTree: any
    TestRenderer.act(() => {
      nonLoggableTree = createTestTree(
        <HabitRow habit={nonLoggable} actions={{ onLog }} />,
      )
      loggableTree = createTestTree(
        <HabitRow habit={loggable} actions={{ onLog }} />,
      )
    })

    const nonLoggableDot = nonLoggableTree.root.find(
      (node: any) =>
        typeof node.props?.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('habits.logHabit'),
    )
    const loggableDot = loggableTree.root.find(
      (node: any) =>
        typeof node.props?.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('habits.logHabit'),
    )

    expect(nonLoggableDot.props.disabled).toBe(true)
    expect(loggableDot.props.disabled).toBe(false)

    const nonLoggableButton = nonLoggableDot.find(
      (node: any) => node.props?.accessibilityRole === 'button',
    )
    expect(nonLoggableButton.props.disabled).toBe(true)
    expect(nonLoggableButton.props.accessibilityState).toEqual({ disabled: true })
    expect(onLog).not.toHaveBeenCalled()

    const loggablePressables = loggableDot.findAll(
      (node: any) => typeof node.props?.onPress === 'function',
    )
    expect(loggablePressables.length).toBeGreaterThan(0)

    TestRenderer.act(() => {
      loggablePressables[0].props.onPress()
    })
    expect(onLog).toHaveBeenCalledTimes(1)
  })

  it('settles the parent exactly once when several siblings complete in one burst', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({ id: 'child-a', title: 'A', parentId: 'parent', isCompleted: true })
    const childB = createMockHabit({ id: 'child-b', title: 'B', parentId: 'parent', isCompleted: true })
    const childC = createMockHabit({ id: 'child-c', title: 'C', parentId: 'parent', isCompleted: true })
    seedHabits([parent, childA, childB, childC])

    const ref = React.createRef<HabitListHandle>()
    let tree: any

    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog('child-a')
      ref.current?.checkAndPromptParentLog('child-b')
      ref.current?.checkAndPromptParentLog('child-c')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledTimes(1)
    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: 'parent',
      date: TODAY,
      intent: 'log',
    })

    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog('child-a')
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('does not mutate a parent when an offline bulk log is refused', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({ id: 'child-a', parentId: parent.id })
    const childB = createMockHabit({ id: 'child-b', parentId: parent.id })
    seedHabits([parent, childA, childB])
    bulkLogMutateAsync.mockRejectedValueOnce(new Error('offline'))
    const actions = renderBulkActionsWithHabitList(new Set([childA.id, childB.id]))

    await TestRenderer.act(async () => {
      await expect(actions.current?.confirmBulkLog()).rejects.toThrow('offline')
      await Promise.resolve()
    })

    expect(logMutateAsync).not.toHaveBeenCalled()
    expect(skipMutateAsync).not.toHaveBeenCalled()
  })

  it('does not mutate a parent when an offline bulk skip is refused', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({ id: 'child-a', parentId: parent.id })
    const childB = createMockHabit({ id: 'child-b', parentId: parent.id })
    seedHabits([parent, childA, childB])
    bulkSkipMutateAsync.mockRejectedValueOnce(new Error('offline'))
    const actions = renderBulkActionsWithHabitList(new Set([childA.id, childB.id]))

    await TestRenderer.act(async () => {
      await expect(actions.current?.confirmBulkSkip()).rejects.toThrow('offline')
      await Promise.resolve()
    })

    expect(logMutateAsync).not.toHaveBeenCalled()
    expect(skipMutateAsync).not.toHaveBeenCalled()
  })

  it('mutates the parent once after a confirmed bulk log succeeds', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({ id: 'child-a', parentId: parent.id })
    const childB = createMockHabit({ id: 'child-b', parentId: parent.id })
    seedHabits([parent, childA, childB])
    bulkLogMutateAsync.mockResolvedValueOnce({
      results: [childA, childB].map((child, index) => ({
        index,
        status: 'Success',
        habitId: child.id,
        logId: `log-${index}`,
        error: null,
      })),
    })
    const actions = renderBulkActionsWithHabitList(new Set([childA.id, childB.id]))

    await TestRenderer.act(async () => {
      await actions.current?.confirmBulkLog()
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledTimes(1)
    expect(logMutateAsync).toHaveBeenCalledWith({
      habitId: parent.id,
      date: TODAY,
      intent: 'log',
    })
    expect(skipMutateAsync).not.toHaveBeenCalled()
  })

  it('does not mutate a parent after a confirmed mixed bulk log result', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const acceptedChild = createMockHabit({ id: 'child-accepted', parentId: parent.id })
    const rejectedChild = createMockHabit({ id: 'child-rejected', parentId: parent.id })
    seedHabits([parent, acceptedChild, rejectedChild])
    bulkLogMutateAsync.mockResolvedValueOnce({
      results: [
        {
          index: 0,
          status: 'Success',
          habitId: acceptedChild.id,
          logId: 'log-accepted',
          error: null,
        },
        {
          index: 1,
          status: 'Failed',
          habitId: rejectedChild.id,
          logId: null,
          error: 'rejected',
        },
      ],
    })
    const actions = renderBulkActionsWithHabitList(
      new Set([acceptedChild.id, rejectedChild.id]),
    )

    await TestRenderer.act(async () => {
      await actions.current?.confirmBulkLog()
      await Promise.resolve()
    })

    expect(logMutateAsync).not.toHaveBeenCalled()
    expect(skipMutateAsync).not.toHaveBeenCalled()
  })

  it('settles each bulk-resolved parent once on the viewed historical date', async () => {
    const loggedParent = createMockHabit({
      id: 'logged-parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const skippedParent = createMockHabit({
      id: 'skipped-parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const children = [
      createMockHabit({ id: 'log-a', parentId: loggedParent.id, scheduledDates: [YESTERDAY] }),
      createMockHabit({ id: 'log-b', parentId: loggedParent.id, scheduledDates: [YESTERDAY] }),
      createMockHabit({ id: 'skip-a', parentId: skippedParent.id, scheduledDates: [YESTERDAY] }),
      createMockHabit({ id: 'skip-b', parentId: skippedParent.id, scheduledDates: [YESTERDAY] }),
    ]
    seedHabits([loggedParent, skippedParent, ...children])
    const ref = React.createRef<HabitListHandle>()

    TestRenderer.act(() => {
      createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: 'log-a', mode: 'log' },
        { habitId: 'log-b', mode: 'log' },
      ], YESTERDAY)
      ref.current?.settleBulkHabitResolutions([
        { habitId: 'skip-a', mode: 'skip' },
        { habitId: 'skip-b', mode: 'skip' },
      ], YESTERDAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === loggedParent.id))
      .toEqual([[{ habitId: loggedParent.id, date: YESTERDAY, intent: 'log' }]])
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === skippedParent.id))
      .toEqual([[{ habitId: skippedParent.id, date: YESTERDAY }]])
  })

  it('settles converging bulk branches and their shared grandparent once on one date', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    const leaves = [leafA, leafB]
    seedHabits([grandparent, parentA, parentB, ...leaves])
    const ref = React.createRef<HabitListHandle>()

    TestRenderer.act(() => {
      createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: leafA.id, mode: 'log' },
        { habitId: leafB.id, mode: 'log' },
      ], YESTERDAY)
      await Promise.resolve()
      await Promise.resolve()
    })

    const hierarchyMutations = logMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toHaveLength(3)
    expect(hierarchyMutations).toEqual(expect.arrayContaining([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
      { habitId: grandparent.id, date: YESTERDAY, intent: 'log' },
    ]))
  })

  it('does not settle a shared grandparent from a sibling that rejects after a delay', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    seedHabits([grandparent, parentA, parentB, leafA, leafB])

    let rejectParentBMutation: ((reason?: unknown) => void) | undefined
    const pendingParentBMutation = new Promise<void>((_resolve, reject) => {
      rejectParentBMutation = reject
    })
    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parentB.id ? pendingParentBMutation : Promise.resolve()
    ))
    const ref = React.createRef<HabitListHandle>()

    TestRenderer.act(() => {
      createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: leafA.id, mode: 'log' },
        { habitId: leafB.id, mode: 'log' },
      ], YESTERDAY)
      await Promise.resolve()
      rejectParentBMutation?.(new Error('rejected'))
      await Promise.allSettled([pendingParentBMutation])
      await Promise.resolve()
    })

    const hierarchyMutations = logMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toEqual([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
    ])
  })

  it('settles a shared grandparent once after two overlapping bulk calls succeed', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    seedHabits([grandparent, parentA, parentB, leafA, leafB])

    let resolveParentA: (() => void) | undefined
    let resolveParentB: (() => void) | undefined
    const pendingParentA = new Promise<void>((resolve) => {
      resolveParentA = resolve
    })
    const pendingParentB = new Promise<void>((resolve) => {
      resolveParentB = resolve
    })
    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => {
      if (habitId === parentA.id) return pendingParentA
      if (habitId === parentB.id) return pendingParentB
      return Promise.resolve()
    })
    const ref = React.createRef<HabitListHandle>()

    TestRenderer.act(() => {
      createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }], YESTERDAY)
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
      resolveParentA?.()
      await pendingParentA
      await Promise.resolve()
      resolveParentB?.()
      await pendingParentB
      await Promise.resolve()
    })

    const hierarchyMutations = logMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toHaveLength(3)
    expect(hierarchyMutations).toEqual(expect.arrayContaining([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
      { habitId: grandparent.id, date: YESTERDAY, intent: 'log' },
    ]))
  })

  it('does not settle a shared grandparent when one of two overlapping bulk calls rejects', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    seedHabits([grandparent, parentA, parentB, leafA, leafB])

    let resolveParentA: (() => void) | undefined
    let rejectParentB: ((reason?: unknown) => void) | undefined
    const pendingParentA = new Promise<void>((resolve) => {
      resolveParentA = resolve
    })
    const pendingParentB = new Promise<void>((_resolve, reject) => {
      rejectParentB = reject
    })
    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parentA.id ? pendingParentA : pendingParentB
    ))
    const ref = React.createRef<HabitListHandle>()

    TestRenderer.act(() => {
      createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }], YESTERDAY)
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
      resolveParentA?.()
      await pendingParentA
      rejectParentB?.(new Error('rejected'))
      await Promise.allSettled([pendingParentB])
      await Promise.resolve()
    })

    const hierarchyMutations = logMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toEqual([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
    ])
  })

  it('stops a deferred settlement chain when the viewed date changes', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leaf = createMockHabit({
      id: 'leaf',
      parentId: parent.id,
      scheduledDates: [YESTERDAY],
    })
    seedHabits([grandparent, parent, leaf])

    let resolveParentMutation: (() => void) | undefined
    const pendingParentMutation = new Promise<void>((resolve) => {
      resolveParentMutation = resolve
    })
    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parent.id ? pendingParentMutation : Promise.resolve()
    ))
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        selectedDate={new Date(`${date}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = createTestTree(renderList(YESTERDAY))
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      tree.update(renderList(TODAY))
    })
    await TestRenderer.act(async () => {
      resolveParentMutation?.()
      await pendingParentMutation
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.map(([input]) => input)).toEqual([
      { habitId: parent.id, date: YESTERDAY, intent: 'log' },
    ])
  })

  it.each(['log', 'skip'] as const)(
    'does not apply a delayed bulk %s result to the newly viewed date',
    (mode) => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const child = createMockHabit({
      id: 'child',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        selectedDate={new Date(`${date}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => { tree = createTestTree(renderList(YESTERDAY)) })
    TestRenderer.act(() => { tree.update(renderList(TODAY)) })

    TestRenderer.act(() => {
      ref.current?.settleBulkHabitResolutions([{ habitId: child.id, mode }], YESTERDAY)
    })

    expect(tree!.root.findAll((node) => String(node.type) === 'DraggableFlatList')[0]?.props.extraData)
      .toBe('0||')
    expect(capturedDrillOptions?.recentlyCompletedIds.has(child.id)).toBe(false)
    expect(logMutateAsync).not.toHaveBeenCalled()
    expect(skipMutateAsync).not.toHaveBeenCalled()
    TestRenderer.act(() => { tree.update(renderList(YESTERDAY)) })
    expect(tree!.root.findAll((node) => String(node.type) === 'DraggableFlatList')[0]?.props.extraData)
      .toBe('0||child')
    expect(capturedDrillOptions?.recentlyCompletedIds.has(child.id)).toBe(true)
  })

  it('rejects a delayed bulk result after the new date handle commits before passive effects', () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const child = createMockHabit({
      id: 'child',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    seedHabits([parent, child])

    const ref = React.createRef<HabitListHandle>()
    function ResolveInLayout({ date }: { date: string }) {
      React.useLayoutEffect(() => {
        if (date === TODAY) {
          ref.current?.settleBulkHabitResolutions([{ habitId: child.id, mode: 'log' }], YESTERDAY)
        }
      }, [date])
      return null
    }
    const renderList = (date: string) => (
      <>
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${date}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />
        <ResolveInLayout date={date} />
      </>
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => { tree = createTestTree(renderList(YESTERDAY)) })
    TestRenderer.act(() => { tree.update(renderList(TODAY)) })

    expect(logMutateAsync).not.toHaveBeenCalled()
    expect(skipMutateAsync).not.toHaveBeenCalled()
    expect(capturedDrillOptions?.recentlyCompletedIds.has(parent.id)).toBe(false)
    expect(capturedDrillOptions?.recentlyCompletedIds.has(child.id)).toBe(false)
  })

  it('keeps the current parent guard when an earlier date settlement rejects', async () => {
    vi.useFakeTimers()
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const leaf = createMockHabit({
      id: 'leaf',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    seedHabits([parent, leaf])

    let rejectEarlierParent: ((reason?: unknown) => void) | undefined
    let resolveCurrentParent: (() => void) | undefined
    const earlierParentMutation = new Promise<void>((_resolve, reject) => {
      rejectEarlierParent = reject
    })
    const currentParentMutation = new Promise<void>((resolve) => {
      resolveCurrentParent = resolve
    })
    logMutateAsync.mockImplementation((input: { habitId: string; date: string }) => {
      if (input.habitId !== parent.id) return Promise.resolve()
      return input.date === YESTERDAY ? earlierParentMutation : currentParentMutation
    })
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        selectedDate={new Date(`${date}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = createTestTree(renderList(YESTERDAY))
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      tree.update(renderList(TODAY))
    })
    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })
    const currentOperationTimerCount = vi.getTimerCount()
    await TestRenderer.act(async () => {
      rejectEarlierParent?.(new Error('rejected'))
      await Promise.allSettled([earlierParentMutation])
    })

    expect(tree!.root.findAll((node) => String(node.type) === 'DraggableFlatList')[0]?.props.extraData)
      .toBe('0||leaf,parent')
    expect(vi.getTimerCount()).toBe(currentOperationTimerCount)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => habitId === parent.id))
      .toEqual([
        { habitId: parent.id, date: YESTERDAY, intent: 'log' },
        { habitId: parent.id, date: TODAY, intent: 'log' },
      ])

    await TestRenderer.act(async () => {
      resolveCurrentParent?.()
      await currentParentMutation
      await Promise.resolve()
    })
    vi.useRealTimers()
  })

  it('clears the current parent guard after its settlement rejects', async () => {
    vi.useFakeTimers()
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const leaf = createMockHabit({
      id: 'leaf',
      parentId: parent.id,
      scheduledDates: [TODAY],
    })
    seedHabits([parent, leaf])

    let rejectParent: ((reason?: unknown) => void) | undefined
    const rejectedParentMutation = new Promise<void>((_resolve, reject) => {
      rejectParent = reject
    })
    logMutateAsync
      .mockImplementationOnce(() => rejectedParentMutation)
      .mockResolvedValue(undefined)
    const ref = React.createRef<HabitListHandle>()
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T09:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })
    const activeOperationTimerCount = vi.getTimerCount()
    await TestRenderer.act(async () => {
      rejectParent?.(new Error('rejected'))
      await Promise.allSettled([rejectedParentMutation])
    })

    expect(tree!.root.findAll((node) => String(node.type) === 'DraggableFlatList')[0]?.props.extraData)
      .toBe('0||leaf')
    expect(vi.getTimerCount()).toBe(activeOperationTimerCount - 1)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => habitId === parent.id))
      .toEqual([
        { habitId: parent.id, date: TODAY, intent: 'log' },
        { habitId: parent.id, date: TODAY, intent: 'log' },
      ])
    expect(tree!.root.findAll((node) => String(node.type) === 'DraggableFlatList')[0]?.props.extraData)
      .toBe('0||leaf,parent')
    vi.useRealTimers()
  })

  it('does not reuse a confirmed resolution after the viewed date changes', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    seedHabits([parent, leafA, leafB])
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        view="today"
        filters={{}}
        selectedDate={new Date(`${date}T09:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = createTestTree(renderList(YESTERDAY))
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      tree.update(renderList(TODAY))
    })
    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
  })

  it('does not settle a parent from a rejected sibling in a mixed bulk log', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const acceptedChild = createMockHabit({
      id: 'child-accepted',
      parentId: parent.id,
      isCompleted: true,
    })
    const rejectedChild = createMockHabit({
      id: 'child-rejected',
      parentId: parent.id,
      isCompleted: false,
    })
    seedHabits([parent, acceptedChild, rejectedChild])
    const ref = React.createRef<HabitListHandle>()

    TestRenderer.act(() => {
      createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toEqual([[{ habitId: parent.id, date: TODAY, intent: 'log' }]])
  })

  it('does not treat a rejected sibling as logged in a mixed bulk skip', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const acceptedChild = createMockHabit({
      id: 'child-accepted',
      parentId: parent.id,
      isCompleted: true,
    })
    const rejectedChild = createMockHabit({
      id: 'child-rejected',
      parentId: parent.id,
      isCompleted: false,
    })
    seedHabits([parent, acceptedChild, rejectedChild])
    const ref = React.createRef<HabitListHandle>()

    TestRenderer.act(() => {
      createTestTree(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toEqual([[{ habitId: parent.id, date: TODAY }]])
  })

  it('does not settle a parent when a delayed child result arrives after account midnight', async () => {
    accountDate.timeZone = 'Pacific/Honolulu'
    vi.setSystemTime(new Date('2026-09-20T09:59:00Z'))
    const parent = createMockHabit({ id: 'parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const acceptedChild = createMockHabit({ id: 'accepted', parentId: parent.id, isCompleted: true })
    const rejectedChild = createMockHabit({ id: 'rejected', parentId: parent.id, isCompleted: false })
    seedHabits([parent, acceptedChild, rejectedChild])
    const ref = React.createRef<HabitListHandle>()
    TestRenderer.act(() => {
      createTestTree(<HabitList ref={ref} view="today" filters={{}} selectedDate={new Date(`${TODAY}T00:00:00`)} showCompleted onCreatePress={vi.fn()} />)
    })
    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })
    expect(skipMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: TODAY })

    vi.setSystemTime(new Date('2026-09-20T10:01:00Z'))
    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })
    expect(skipMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: TODAY })
  })

  it('does not confirm a parent after its account-day window closes', async () => {
    accountDate.timeZone = 'Pacific/Honolulu'
    vi.setSystemTime(new Date('2026-09-20T09:59:00Z'))
    const parent = createMockHabit({ id: 'parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', parentId: parent.id, isCompleted: true })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = createTestTree(<HabitList ref={ref} view="today" filters={{}} selectedDate={new Date(`${TODAY}T00:00:00`)} showCompleted onCreatePress={vi.fn()} />)
    })
    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog(child.id)
      await Promise.resolve()
    })
    vi.setSystemTime(new Date('2026-09-20T10:01:00Z'))
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })
    expect(logMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: TODAY, intent: 'log' })
  })

  it('allows parent settlement again after progress becomes incomplete', async () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent', isCompleted: true })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />
    let tree: any
    TestRenderer.act(() => { tree = createTestTree(renderList()) })
    const refetch = (isCompleted = true) => TestRenderer.act(() => {
      seedHabits([parent, { ...child, isCompleted }])
      mockHabitsDataUpdatedAt += 1
      tree.update(renderList())
    })
    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog('child')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })
    expect(logMutateAsync).toHaveBeenCalledTimes(1)
    refetch()
    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog('child')
      await Promise.resolve()
    })
    expect(logMutateAsync).toHaveBeenCalledTimes(1)
    refetch(false)
    refetch()
    await TestRenderer.act(async () => {
      ref.current?.checkAndPromptParentLog('child')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoLogParentConfirm')
      await Promise.resolve()
    })
    expect(logMutateAsync).toHaveBeenCalledTimes(2)
  })

  describe('today view scroll offset wiring', () => {
    function renderTodayList(onScroll?: (offsetY: number) => void) {
      let tree: any
      TestRenderer.act(() => {
        tree = createTestTree(
          <HabitList
            view="today"
            filters={{}}
            showCompleted
            onCreatePress={vi.fn()}
            onScroll={onScroll}
          />,
        )
      })
      return tree
    }

    it('feeds the scroll offset upward through onScrollOffsetChange, never the discarded onScroll', () => {
      const onScroll = vi.fn()
      const tree = renderTodayList(onScroll)

      const draggableList = tree.root.findByType('DraggableFlatList')
      expect(draggableList.props.onScroll).toBeUndefined()
      expect(typeof draggableList.props.onScrollOffsetChange).toBe('function')

      TestRenderer.act(() => {
        draggableList.props.onScrollOffsetChange(650)
      })
      expect(onScroll).toHaveBeenCalledWith(650)

      TestRenderer.act(() => {
        draggableList.props.onScrollOffsetChange(120)
      })
      expect(onScroll).toHaveBeenLastCalledWith(120)
    })

  })
})
