import React from 'react'
import { FlatList } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitVisibilityOptions } from '@orbit/shared/utils/habit-visibility'
import { HabitList, type HabitListHandle } from '@/components/habit-list'
import { HabitRow } from '@/components/habits/habit-row'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import { tourScrollRegistry } from '@/components/tour/tour-target-context'
import { useTourStore } from '@/stores/tour-store'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { flushQueuedMutations } from '@/lib/offline-mutations'
import { clear as clearOfflineQueue, getAll as getQueuedMutations } from '@/lib/offline-queue'

const TODAY = formatAPIDate(new Date())
const YESTERDAY = formatAPIDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
const TOMORROW = formatAPIDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'

const TestRenderer = require('react-test-renderer')

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
const skipMutateAsync = vi.fn()
const bulkDeleteMutateAsync = vi.fn()
const bulkLogMutateAsync = vi.fn()
const bulkSkipMutateAsync = vi.fn()
let mockHabitsDataUpdatedAt = 1
let useActualHabitVisibility = false
const toggleSelectMode = vi.fn()
const toggleSelectionCascade = vi.fn()
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

  const apiClient = vi.fn((endpoint: string) => Promise.resolve(receiveHabitToggle(endpoint)))

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

const mockDrillState = {
  currentParentId: null as string | null,
  currentParent: null as NormalizedHabit | null,
  drillChildren: [] as NormalizedHabit[],
  drillStack: [] as string[],
  drillLoading: false,
  drillError: null as string | null,
  drillInto: vi.fn(async () => {}),
  drillBack: vi.fn(),
  drillReset: vi.fn(),
  refreshCurrent: vi.fn(async () => {}),
  getDrillChildren: vi.fn(() => [] as NormalizedHabit[]),
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({
    data: mockHabitsData,
    isLoading: false,
    isFetching: false,
    dataUpdatedAt: mockHabitsDataUpdatedAt,
    refetch: habitListRefetch,
    getChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
  }),
  useLogHabit: () => ({ mutate: vi.fn(), mutateAsync: logMutateAsync }),
  useSkipHabit: () => ({ mutateAsync: skipMutateAsync }),
  useDeleteHabit: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
  useBulkDeleteHabits: () => ({ mutateAsync: bulkDeleteMutateAsync }),
  useBulkLogHabits: () => ({ mutateAsync: bulkLogMutateAsync }),
  useBulkSkipHabits: () => ({ mutateAsync: bulkSkipMutateAsync }),
  useDuplicateHabit: () => ({ mutate: vi.fn() }),
  useReorderHabits: () => ({ mutateAsync: reorderMutateAsync }),
  useMoveHabitParent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { hasProAccess: true },
  }),
}))

vi.mock('@/hooks/use-drill-navigation', () => ({
  useDrillNavigation: () => mockDrillState,
}))

vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({
    maxHabitDepth: 5,
    config: { limits: { maxHabitDepth: 5 } },
  }),
}))

vi.mock('@/hooks/use-habit-visibility', async () => {
  const { createHabitVisibilityHelpers } = await import('@orbit/shared/utils/habit-visibility')

  return {
    useHabitVisibility: (options: HabitVisibilityOptions) => {
      const helpers = createHabitVisibilityHelpers(options)

      return {
        ...helpers,
        hasVisibleContent: useActualHabitVisibility
          ? helpers.hasVisibleContent
          : () => true,
        isRelevantToday: () => true,
        isDueOnSelectedDate: () => true,
      }
    },
  }
})

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: any) => unknown) =>
    selector({
      toggleSelectMode,
      toggleSelectionCascade,
    }),
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
  CreateHabitModal: () => null,
}))

vi.mock('@/components/habits/reschedule-sheet', () => ({
  RescheduleSheet: () => null,
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
    createTokensV2: () => colorProxy,
  }
})

vi.mock('@/components/ui/anchored-menu', () => ({
  AnchoredMenu: ({ visible, children }: any) => (visible ? children : null),
  MenuAnchorHost: ({ children }: any) => children,
  useAnchoredMenu: () => ({
    anchorRef: { current: null },
    visible: false,
    anchorRect: null,
    open: () => {},
    close: () => {},
    toggle: () => {},
  }),
}))

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('Svg', props),
  Circle: (props: any) => React.createElement('Circle', props),
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
  return tree.root.findAll((node: any) => node.type === 'Sheet' && node.props?.title === title)
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

type BulkActions = ReturnType<typeof useBulkActions>
type AllDoneListEmptyComponent = React.ReactElement<{
  children: React.ReactElement<{
    actionLabel?: string
    onAction?: () => void
  }>
}>

function renderBulkActionsWithHabitList(selectedHabitIds: Set<string>) {
  const habitListRef = React.createRef<HabitListHandle>()
  const captured: { current: BulkActions | null } = { current: null }

  function Harness() {
    captured.current = useBulkActions({
      selectedHabitIds,
      selectedDateStr: TODAY,
      readOnly: false,
      habitListRef,
      onSuccess: vi.fn(),
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
    TestRenderer.create(<Harness />)
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
    vi.clearAllMocks()
    clearOfflineQueue()
    offlineMocks.appliedHabitIds.length = 0
    offlineMocks.loggedHabits.clear()
    offlineMocks.setOnline(false)
    mockHabitsDataUpdatedAt = 1
    useActualHabitVisibility = false
    habitListRefetch.mockReset()
    habitListRefetch.mockResolvedValue(undefined)
    logMutateAsync.mockReset()
    skipMutateAsync.mockReset()
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
    mockDrillState.drillStack = []
    mockDrillState.drillLoading = false
    mockDrillState.drillError = null
    mockHabitsData.totalCount = 0
    seedHabits([createMockHabit({ id: 'habit-1', title: 'Exercise', position: 0 })])
  })

  it('renders the all-done upcoming action only when it can navigate', () => {
    seedHabits([])
    mockHabitsData.totalCount = 1
    const onSeeUpcoming = vi.fn()
    let tree: import('react-test-renderer').ReactTestRenderer

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          showCompleted={false}
          onCreatePress={vi.fn()}
        />,
      )
    })

    let flatList = tree!.root.findAll((node) => node.type === FlatList)[0]
    if (!flatList) throw new Error('All-done list is missing')
    let emptyState = (
      flatList.props.ListEmptyComponent as AllDoneListEmptyComponent
    ).props.children
    expect(emptyState.props.actionLabel).toBeUndefined()
    expect(emptyState.props.onAction).toBeUndefined()

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
    flatList = tree!.root.findAll((node) => node.type === FlatList)[0]
    if (!flatList) throw new Error('All-done list is missing')
    emptyState = (
      flatList.props.ListEmptyComponent as AllDoneListEmptyComponent
    ).props.children
    expect(emptyState.props.actionLabel).toBe('habits.seeUpcoming')
    expect(emptyState.props.onAction).toBe(onSeeUpcoming)
    const onAction = emptyState.props.onAction
    if (!onAction) throw new Error('Upcoming action is missing')
    TestRenderer.act(onAction)

    expect(onSeeUpcoming).toHaveBeenCalledOnce()
  })

  it('asks before skipping a recurring habit', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.skipConfirmButton')
      await Promise.resolve()
    })

    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'habit-1', date: TODAY })
    expect(confirmationSheets(tree, 'habits.deleteConfirmTitle')).toHaveLength(0)
  })

  /**
   * Ticket #42 is the product authority: a confirmation belongs to an
   * irreversible act only. Skipping is reversible, so it acts on one press;
   * deleting is not, so it asks first.
   */
  it('asks before the irreversible delete, unlike the reversible skip', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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

    await TestRenderer.act(async () => {
      pressConfirm(tree, 'common.delete')
      await Promise.resolve()
    })

    expect(deleteMutateAsync).toHaveBeenCalledWith('habit-1')
  })

  it('omits the habit description from the canonical row', () => {
    seedHabits([
      createMockHabit({ id: 'habit-desc', title: 'Meditate', description: 'Ten minutes of breathing' }),
    ])

    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    const descriptionNodes = tree.root.findAll(
      (node: any) => node.props?.children === 'Ten minutes of breathing',
    )
    expect(descriptionNodes).toHaveLength(0)
  })

  it('omits the description preview when the habit has none', () => {
    seedHabits([
      createMockHabit({ id: 'habit-nodesc', title: 'Run', description: null }),
    ])

    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    const descriptionNodes = tree.root.findAll(
      (node: any) => node.props?.children === 'Ten minutes of breathing',
    )
    expect(descriptionNodes).toHaveLength(0)
  })

  it('asks before postponing a one-time task', async () => {
    const oneTimeTask = createMockHabit({
      id: 'habit-1',
      title: 'Pay bill',
      frequencyUnit: null,
    })
    seedHabits([oneTimeTask])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.postponeConfirmButton')
      await Promise.resolve()
    })

    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'habit-1', date: TODAY })
    expect(confirmationSheets(tree, 'habits.deleteConfirmTitle')).toHaveLength(0)
  })


  it('logs a habit immediately from the card action', async () => {
    const habit = createMockHabit({ id: 'habit-1', title: 'Exercise' })
    seedHabits([habit])
    const selectedDate = new Date('2026-04-08T00:00:00')

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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
      date: '2026-04-08',
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
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
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
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T12:00:00Z`)}
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
          selectedDate={new Date(`${TODAY}T12:00:00Z`)}
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
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T12:00:00Z`)}
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
          selectedDate={new Date(`${TODAY}T12:00:00Z`)}
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
        selectedDate={new Date(`${TODAY}T12:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(renderList())
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
      tree = TestRenderer.create(renderList())
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
        selectedDate={new Date(`${TODAY}T12:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(renderList())
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
      tree = TestRenderer.create(renderList())
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
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T12:00:00Z`)}
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
          selectedDate={new Date(`${TODAY}T12:00:00Z`)}
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
      tree = TestRenderer.create(
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

  it('keeps a logged habit visible while the direct log request is pending', async () => {
    const habit = createMockHabit({
      id: 'habit-1',
      title: 'Exercise',
      isGeneral: true,
      isCompleted: false,
    })
    seedHabits([habit])

    let resolveLog: (() => void) | undefined
    const pendingLog = new Promise<void>((resolve) => {
      resolveLog = resolve
    })

    logMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => {
      const nextHabit = mockHabitsData.habitsById.get(habitId)
      if (nextHabit) {
        const completedHabit = { ...nextHabit, isCompleted: true }
        mockHabitsData.habitsById.set(habitId, completedHabit)
        mockHabitsData.topLevelHabits = mockHabitsData.topLevelHabits.map((item) =>
          item.id === habitId ? completedHabit : item,
        )
      }

      return pendingLog
    })

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="general"
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

    TestRenderer.act(() => {
      tree.update(
        <HabitList
          view="general"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const loggedHabitCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'habit-1')

    expect(loggedHabitCard).toBeTruthy()

    await TestRenderer.act(async () => {
      resolveLog?.()
      await pendingLog
    })
  })

  it('hides only completed one-time habits in all view when showCompleted is false', () => {
    const active = createMockHabit({ id: 'active', title: 'Active', isCompleted: false })
    const completedOneTime = createMockHabit({
      id: 'completed-one-time',
      title: 'Done one-time',
      isCompleted: true,
      frequencyUnit: null,
    })
    const completedRecurring = createMockHabit({
      id: 'completed-recurring',
      title: 'Done recurring',
      isCompleted: true,
      frequencyUnit: 'Day',
    })
    const general = createMockHabit({ id: 'general', title: 'General', isGeneral: true })
    seedHabits([active, completedOneTime, completedRecurring, general])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="all"
          filters={{}}
          showCompleted={false}
          onCreatePress={vi.fn()}
        />,
      )
    })

    const habitIds = tree.root
      .findByType('FlatList')
      .props.data.flatMap((group: any) =>
        group.habits.map((habit: NormalizedHabit) => habit.id),
      )

    expect(habitIds).toEqual(['active', 'completed-recurring'])
  })

  it('shows completed one-time habits in all view when showCompleted is true', () => {
    const active = createMockHabit({ id: 'active', title: 'Active', isCompleted: false })
    const completedOneTime = createMockHabit({
      id: 'completed-one-time',
      title: 'Done one-time',
      isCompleted: true,
      frequencyUnit: null,
    })
    seedHabits([active, completedOneTime])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="all"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const habitIds = tree.root
      .findByType('FlatList')
      .props.data.flatMap((group: any) =>
        group.habits.map((habit: NormalizedHabit) => habit.id),
      )

    expect(habitIds).toEqual(['active', 'completed-one-time'])
  })

  it('hides completed one-time all-view children when showCompleted is false', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    const activeChild = createMockHabit({ id: 'active-child', title: 'Active child', parentId: 'parent' })
    const completedOneTimeChild = createMockHabit({
      id: 'completed-one-time-child',
      title: 'Done child',
      parentId: 'parent',
      isCompleted: true,
      frequencyUnit: null,
    })
    const completedRecurringChild = createMockHabit({
      id: 'completed-recurring-child',
      title: 'Done recurring child',
      parentId: 'parent',
      isCompleted: true,
      frequencyUnit: 'Day',
    })
    const generalChild = createMockHabit({
      id: 'general-child',
      title: 'General child',
      parentId: 'parent',
      isGeneral: true,
    })
    seedHabits([
      parent,
      activeChild,
      completedOneTimeChild,
      completedRecurringChild,
      generalChild,
    ])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="all"
          filters={{}}
          showCompleted={false}
          onCreatePress={vi.fn()}
        />,
      )
    })

    const flatList = tree.root.findByType('FlatList')
    let groupTree: any
    TestRenderer.act(() => {
      groupTree = TestRenderer.create(flatList.props.renderItem({ item: flatList.props.data[0] }))
    })

    const habitIds = groupTree.root
      .findAllByType(HabitRow)
      .map((node: any) => node.props.habit.id)

    expect(habitIds).toEqual(['parent', 'active-child', 'completed-recurring-child'])
  })

  it('renders deeply nested all-view children up to the configured depth', () => {
    const root = createMockHabit({ id: 'root', title: 'Root', hasSubHabits: true })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'root', hasSubHabits: true })
    const grandchild = createMockHabit({ id: 'grandchild', title: 'Grandchild', parentId: 'child', hasSubHabits: true })
    const greatGrandchild = createMockHabit({ id: 'great-grandchild', title: 'Great grandchild', parentId: 'grandchild', frequencyUnit: 'Day', isCompleted: true })
    seedHabits([root, child, grandchild, greatGrandchild])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="all"
          filters={{}}
          showCompleted={false}
          onCreatePress={vi.fn()}
        />,
      )
    })

    const flatList = tree.root.findByType('FlatList')
    let groupTree: any
    TestRenderer.act(() => {
      groupTree = TestRenderer.create(flatList.props.renderItem({ item: flatList.props.data[0] }))
    })

    const habitIds = groupTree.root
      .findAllByType(HabitRow)
      .map((node: any) => node.props.habit.id)

    expect(habitIds).toEqual(['root', 'child', 'grandchild', 'great-grandchild'])
  })

  it('uses plain draggable list for today view outside select mode', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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

  it('uses plain lists for all view and drill view', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="all"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    expect(tree.root.findAllByType('DraggableFlatList')).toHaveLength(0)

    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent' })
    seedHabits([parent, child])
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillChildren = [child]
    mockDrillState.drillStack = ['parent']

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
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
      emptyStateTree = TestRenderer.create(flatList.props.ListEmptyComponent)
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

  it('submits reordered positions on drag end', async () => {
    const first = createMockHabit({ id: 'first', title: 'First', position: 0 })
    const second = createMockHabit({ id: 'second', title: 'Second', position: 1 })
    seedHabits([first, second])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
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
    seedHabits([parent, child])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
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

  it('anchors the featured demo habit row for the card tour steps', () => {
    seedHabits([
      createMockHabit({
        id: 'tour-habit-1',
        title: 'Meditation',
        position: 0,
      }),
      createMockHabit({
        id: TOUR_FEATURED_HABIT_ID,
        title: 'Exercise',
        position: 1,
      }),
    ])

    const useTourTargetMock = vi.fn()
    vi.doMock('@/hooks/use-tour-target', () => ({
      useTourTarget: useTourTargetMock,
    }))

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    const meditationCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'tour-habit-1')
    const exerciseCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === TOUR_FEATURED_HABIT_ID)

    expect(meditationCard).toBeTruthy()
    expect(exerciseCard).toBeTruthy()
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
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(renderList())
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
      tree = TestRenderer.create(renderList())
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
      tree = TestRenderer.create(renderList())
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
      tree = TestRenderer.create(renderList())
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
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
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
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
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
      tree = TestRenderer.create(
        <HabitList
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      const childRow = tree.root
        .findAllByType(HabitRow)
        .find((node: any) => node.props.habit.id === 'child')
      childRow?.props.actions.onSkip()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.skipConfirmButton')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoSkipParentConfirm')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoSkipParentConfirm')
      await Promise.resolve()
    })

    expect(skipMutateAsync.mock.calls).toEqual([
      [{ habitId: 'child', date: YESTERDAY }],
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
    const childA = createMockHabit({ id: 'child-a', title: 'A', parentId: 'parent' })
    const childB = createMockHabit({ id: 'child-b', title: 'B', parentId: 'parent' })
    seedHabits([parent, childA, childB])

    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitList view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />,
      )
    })

    async function skipChild(childId: string) {
      const card = tree.root
        .findAllByType(HabitRow)
        .find((node: any) => node.props.habit.id === childId)
      await TestRenderer.act(async () => {
        card?.props.actions.onSkip()
        await Promise.resolve()
      })
      await TestRenderer.act(async () => {
        pressConfirm(tree, 'habits.skipConfirmButton')
        await Promise.resolve()
      })
    }

    await skipChild('child-a')

    expect(skipMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ habitId: 'parent' }),
    )

    await skipChild('child-b')
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.autoSkipParentConfirm')
      await Promise.resolve()
    })

    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'child-a', date: TODAY })
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'child-b', date: TODAY })
    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY })
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
        tree = TestRenderer.create(
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
        tree = TestRenderer.create(
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
      tree = TestRenderer.create(
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

  it('asks before postponing an overdue habit with no date', async () => {
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
      tree = TestRenderer.create(
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
    await TestRenderer.act(async () => {
      pressConfirm(tree, 'habits.postponeConfirmButton')
      await Promise.resolve()
    })

    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1', date: TODAY })
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
      tree = TestRenderer.create(
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

    TestRenderer.act(() => {
      overdueCard?.props.actions.onToggleSelection()
    })

    expect(toggleSelectionCascade).toHaveBeenCalledWith(
      'overdue-1',
      expect.any(Function),
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
      tree = TestRenderer.create(
        <HabitRow habit={overdueChild} depth={1} />,
      )
    })

    expect(flattenRenderedText(tree.toJSON())).toContain('habits.overdue')
  })

  it('shows a future meta token for a habit due in six days', () => {
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
      tree = TestRenderer.create(<HabitRow habit={futureHabit} />)
    })

    const renderedText = flattenRenderedText(tree.toJSON())
    expect(renderedText).toContain('habits.schedule.dueInDays')
    expect(renderedText).toContain('"count":6')
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
      nonLoggableTree = TestRenderer.create(
        <HabitRow habit={nonLoggable} actions={{ onLog }} />,
      )
      loggableTree = TestRenderer.create(
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
      tree = TestRenderer.create(
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
      TestRenderer.create(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: 'log-a', mode: 'log' },
        { habitId: 'log-b', mode: 'log' },
      ])
      ref.current?.settleBulkHabitResolutions([
        { habitId: 'skip-a', mode: 'skip' },
        { habitId: 'skip-b', mode: 'skip' },
      ])
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
      TestRenderer.create(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: leafA.id, mode: 'log' },
        { habitId: leafB.id, mode: 'log' },
      ])
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
      TestRenderer.create(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: leafA.id, mode: 'log' },
        { habitId: leafB.id, mode: 'log' },
      ])
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
      TestRenderer.create(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }])
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }])
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
      TestRenderer.create(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }])
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }])
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
        selectedDate={new Date(`${date}T12:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(renderList(YESTERDAY))
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }])
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
        selectedDate={new Date(`${date}T12:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(renderList(YESTERDAY))
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }])
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      tree.update(renderList(TODAY))
    })
    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }])
      await Promise.resolve()
    })
    const currentOperationTimerCount = vi.getTimerCount()
    await TestRenderer.act(async () => {
      rejectEarlierParent?.(new Error('rejected'))
      await Promise.allSettled([earlierParentMutation])
    })

    expect(tree.root.findByType('DraggableFlatList').props.extraData).toBe('0||leaf,parent')
    expect(vi.getTimerCount()).toBe(currentOperationTimerCount)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }])
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
    TestRenderer.act(() => tree.unmount())
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
      tree = TestRenderer.create(
        <HabitList
          ref={ref}
          view="today"
          filters={{}}
          selectedDate={new Date(`${TODAY}T12:00:00Z`)}
          showCompleted
          onCreatePress={vi.fn()}
        />,
      )
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }])
      await Promise.resolve()
    })
    const activeOperationTimerCount = vi.getTimerCount()
    await TestRenderer.act(async () => {
      rejectParent?.(new Error('rejected'))
      await Promise.allSettled([rejectedParentMutation])
    })

    expect(tree.root.findByType('DraggableFlatList').props.extraData).toBe('0||leaf')
    expect(vi.getTimerCount()).toBe(activeOperationTimerCount - 1)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }])
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => habitId === parent.id))
      .toEqual([
        { habitId: parent.id, date: TODAY, intent: 'log' },
        { habitId: parent.id, date: TODAY, intent: 'log' },
      ])
    expect(tree.root.findByType('DraggableFlatList').props.extraData).toBe('0||leaf,parent')
    TestRenderer.act(() => tree.unmount())
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
        selectedDate={new Date(`${date}T12:00:00Z`)}
        showCompleted
        onCreatePress={vi.fn()}
      />
    )
    let tree: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(renderList(YESTERDAY))
    })

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }])
      await Promise.resolve()
    })
    TestRenderer.act(() => {
      tree.update(renderList(TODAY))
    })
    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }])
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
      TestRenderer.create(
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
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'log' }])
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }])
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
      TestRenderer.create(
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
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'skip' }])
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await TestRenderer.act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }])
      await Promise.resolve()
    })

    expect(logMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toEqual([[{ habitId: parent.id, date: TODAY }]])
  })

  it('allows parent settlement again after progress becomes incomplete', async () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent', isCompleted: true })
    seedHabits([parent, child])
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} view="today" filters={{}} showCompleted onCreatePress={vi.fn()} />
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(renderList()) })
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
    afterEach(() => {
      TestRenderer.act(() => {
        useTourStore.setState({ isActive: false })
      })
    })

    function renderTodayList(onScroll?: (offsetY: number) => void) {
      let tree: any
      TestRenderer.act(() => {
        tree = TestRenderer.create(
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

    it('tracks the tour scroll position from onScrollOffsetChange while a tour is active', () => {
      TestRenderer.act(() => {
        useTourStore.setState({ isActive: true })
      })
      const tree = renderTodayList()

      const draggableList = tree.root.findByType('DraggableFlatList')
      TestRenderer.act(() => {
        draggableList.props.onScrollOffsetChange(320)
      })

      expect(tourScrollRegistry.get('/')?.scrollY).toBe(320)
    })
  })
})
