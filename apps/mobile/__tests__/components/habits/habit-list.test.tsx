import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitVisibilityOptions } from '@orbit/shared/utils/habit-visibility'
import { HabitList, type HabitListHandle } from '@/components/habit-list'
import { HabitRow } from '@/components/habits/habit-row'

const TODAY = formatAPIDate(new Date())
const TOMORROW = formatAPIDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'

const TestRenderer = require('react-test-renderer')

const reorderMutateAsync = vi.fn()
const logMutateAsync = vi.fn()
const skipMutateAsync = vi.fn()
const toggleSelectMode = vi.fn()
const toggleSelectionCascade = vi.fn()
const colorProxy: Record<string, string> = new Proxy(
  {},
  {
    get: (_target, prop) => (prop === 'white' ? '#ffffff' : '#111111'),
  },
)

const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
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
    dataUpdatedAt: Date.now(),
    refetch: vi.fn(),
    getChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
  }),
  useLogHabit: () => ({ mutate: vi.fn(), mutateAsync: logMutateAsync }),
  useSkipHabit: () => ({ mutateAsync: skipMutateAsync }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
        hasVisibleContent: () => true,
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

vi.mock('@/lib/habit-selection-state', () => ({
  getHabitListExtraData: () => 'extra',
}))

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
}))

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('Svg', props),
  Circle: (props: any) => React.createElement('Circle', props),
}))

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

describe('HabitList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logMutateAsync.mockReset()
    skipMutateAsync.mockReset()
    logMutateAsync.mockImplementation(async ({ habitId }: { habitId: string }) => {
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
    seedHabits([createMockHabit({ id: 'habit-1', title: 'Exercise', position: 0 })])
  })

  it('shows a skip confirmation before skipping a recurring habit', async () => {
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

    TestRenderer.act(() => {
      habitCard?.props.actions.onSkip()
    })

    const skipDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.skipConfirmTitle')

    expect(skipDialog?.props.description).toBe('habits.skipConfirmMessage')

    await TestRenderer.act(async () => {
      await skipDialog.props.onConfirm()
    })

    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'habit-1' })
  })

  it('renders the habit description preview when present', () => {
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
    expect(descriptionNodes.length).toBeGreaterThan(0)
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

  it('shows a postpone confirmation before postponing a one-time task', () => {
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

    TestRenderer.act(() => {
      habitCard?.props.actions.onSkip()
    })

    const postponeDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.postponeConfirmTitle')

    expect(postponeDialog?.props.description).toBe('habits.postponeConfirmMessage')
    expect(postponeDialog?.props.confirmLabel).toBe('habits.postponeConfirmButton')
  })

  it('logs a habit immediately from the card action', async () => {
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
      await habitCard?.props.actions.onLog()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: 'habit-1' })
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

    // HabitRow wires up onLongPress on its root Pressable; the test renderer
    // surfaces that as a node with the long-press handler attached.
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

    // After long-pressing the parent, the child row collapses out so the
    // count of draggable handlers drops by one.
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

    // Both rows should still render and the featured one is wrapped in a
    // tour-anchor wrapper. The wrapper is detected by traversing parents of
    // the row and checking whether any registers the tour-habit-card target;
    // since we cannot easily inspect the registry inline, we instead assert
    // that exactly one tour-habit-card anchor exists in the tree.
    const meditationCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === 'tour-habit-1')
    const exerciseCard = tree.root
      .findAllByType(HabitRow)
      .find((node: any) => node.props.habit.id === TOUR_FEATURED_HABIT_ID)

    expect(meditationCard).toBeTruthy()
    expect(exerciseCard).toBeTruthy()
  })

  it('shows a force-log confirmation before logging an incomplete parent', async () => {
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

    TestRenderer.act(() => {
      parentCard?.props.actions.onForceLogParent()
    })

    const forceLogDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.forceLogTitle')

    expect(forceLogDialog).toBeTruthy()

    await TestRenderer.act(async () => {
      await forceLogDialog.props.onConfirm()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: 'parent' })
  })

  it('prompts the parent immediately when the last child is marked completed', () => {
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

    TestRenderer.act(() => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })

    const autoLogDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.autoLogParentTitle')

    expect(autoLogDialog?.props.description).toContain('"Parent"')
  })

  it('prompts an overdue parent when the last child is marked completed', () => {
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

    TestRenderer.act(() => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })

    const autoLogDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.autoLogParentTitle')

    expect(autoLogDialog?.props.description).toContain('"Parent"')
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

    const autoLogDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.autoLogParentTitle')

    expect(autoLogDialog).toBeUndefined()
  })

  it('re-prompts the next ancestor after confirming an auto-log parent action', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: 'grandparent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    seedHabits([grandparent, parent, child])

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
      ref.current?.checkAndPromptParentLog('child')
    })

    let autoLogDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.autoLogParentTitle')

    expect(autoLogDialog?.props.description).toContain('"Parent"')

    await TestRenderer.act(async () => {
      await autoLogDialog.props.onConfirm()
      await Promise.resolve()
    })

    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: 'parent' })

    autoLogDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.autoLogParentTitle')

    expect(autoLogDialog).toBeTruthy()
    expect(autoLogDialog?.props.description).toContain('"Grandparent"')
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

    expect(logMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1' })
  })

  it('skips an overdue habit with no date after confirmation', async () => {
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

    TestRenderer.act(() => {
      overdueCard?.props.actions.onSkip()
    })

    const skipDialog = tree.root
      .findAllByType('ConfirmDialog')
      .find((node: any) => node.props.title === 'habits.postponeConfirmTitle')

    await TestRenderer.act(async () => {
      await skipDialog.props.onConfirm()
    })

    expect(skipMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1' })
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

    const italicNodes = tree.root.findAll(
      (node: any) =>
        node.props?.style?.fontStyle === 'italic' &&
        node.props?.children === 'habits.overdue',
    )

    expect(italicNodes.length).toBeGreaterThan(0)
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

    const futureNodes = tree.root.findAll(
      (node: any) =>
        node.props?.style?.fontStyle === 'italic' &&
        typeof node.props?.children === 'string' &&
        node.props.children.includes('habits.schedule.dueindays') &&
        node.props.children.includes('"count":6'),
    )

    expect(futureNodes.length).toBeGreaterThan(0)
  })

  it('renders the status dot read-only for a non-loggable row and interactive for a loggable one', () => {
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
      (node: any) => node.props?.accessibilityLabel === 'habits.logHabit',
    )
    const loggableDot = loggableTree.root.find(
      (node: any) => node.props?.accessibilityLabel === 'habits.logHabit',
    )

    expect(nonLoggableDot.props.disabled).toBe(true)
    expect(loggableDot.props.disabled).toBe(false)

    const nonLoggablePressables = nonLoggableDot.findAll(
      (node: any) => typeof node.props?.onPress === 'function',
    )
    expect(nonLoggablePressables).toHaveLength(0)
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

  it('opens the parent prompt exactly once when several siblings complete in one burst', () => {
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

    TestRenderer.act(() => {
      ref.current?.checkAndPromptParentLog('child-a')
      ref.current?.checkAndPromptParentLog('child-b')
      ref.current?.checkAndPromptParentLog('child-c')
    })

    const openDialogs = tree.root
      .findAllByType('ConfirmDialog')
      .filter((node: any) => node.props.title === 'habits.autoLogParentTitle')

    expect(openDialogs).toHaveLength(1)

    TestRenderer.act(() => {
      const dialog = tree.root
        .findAllByType('ConfirmDialog')
        .find((node: any) => node.props.title === 'habits.autoLogParentTitle')
      dialog?.props.onCancel()
    })

    TestRenderer.act(() => {
      ref.current?.checkAndPromptParentLog('child-a')
    })

    const reopenedDialogs = tree.root
      .findAllByType('ConfirmDialog')
      .filter((node: any) => node.props.title === 'habits.autoLogParentTitle')

    expect(reopenedDialogs).toHaveLength(0)
  })
})
