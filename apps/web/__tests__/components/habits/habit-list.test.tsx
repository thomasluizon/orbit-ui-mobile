import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitVisibilityOptions } from '@orbit/shared/utils/habit-visibility'

const TODAY = formatAPIDate(new Date())
const TOMORROW = formatAPIDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'


const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
}
const logHabitMutateAsync = vi.fn()
const skipHabitMutateAsync = vi.fn()
const toggleSelectionSpy = vi.fn()
const drillRefreshCurrent = vi.fn()
const drillInto = vi.fn()
const getDrillChildrenMock = vi.fn(() => [])
const mockDrillState = {
  drillStack: [] as string[],
  currentParentId: null as string | null,
  currentParent: null as NormalizedHabit | null,
  drillChildren: [] as NormalizedHabit[],
  drillInto,
  drillBack: vi.fn(),
  drillReset: vi.fn(),
  drillLoading: false,
  drillError: null as unknown,
  refreshCurrent: drillRefreshCurrent,
  getDrillChildren: getDrillChildrenMock,
}

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params && Object.keys(params).length > 0) {
        return `${key}(${JSON.stringify(params)})`
      }
      return key
    }
    return t
  },
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({
    data: mockHabitsData,
    isLoading: false,
    error: null,
    dataUpdatedAt: Date.now(),
    getChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
  }),
  useLogHabit: () => ({ mutateAsync: logHabitMutateAsync, mutate: vi.fn(), isPending: false }),
  useSkipHabit: () => ({ mutateAsync: skipHabitMutateAsync, isPending: false }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMoveHabitParent: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

vi.mock('@/hooks/use-drill-navigation', () => ({
  useDrillNavigation: () => mockDrillState,
}))

vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({
    config: { limits: { maxHabitDepth: 5 } },
  }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({
    displayTime: (time: string) => time,
    currentFormat: '24h' as const,
    toggleFormat: vi.fn(),
  }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => null,
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()

  return {
    ...actual,
    formatAPIDate: (date?: Date) => {
      const d = date ?? new Date()
      return d.toISOString().split('T')[0]
    },
  }
})

vi.mock('@/components/habits/habit-row', () => ({
  HabitRow: ({
    habit,
    childProgress,
    tourTargetId,
    state,
    selectMode,
    selected,
    actions,
  }: {
    habit: NormalizedHabit
    childProgress?: { done: number; total: number }
    tourTargetId?: string
    state?: string
    selectMode?: boolean
    selected?: boolean
    actions?: {
      onForceLogParent?: () => void
      onLog?: () => void
      onSkip?: () => void
      onEdit?: () => void
      onToggleSelection?: () => void
    }
  }) => (
    <div
      data-testid={`habit-card-${habit.id}`}
      data-tour={tourTargetId}
      data-select-mode={selectMode ? 'yes' : 'no'}
      data-selected={selected ? 'yes' : 'no'}
      data-state={state}
    >
      <span>{habit.title}</span>
      <span data-testid={`habit-progress-${habit.id}`}>
        {childProgress?.done ?? 0}/{childProgress?.total ?? 0}
      </span>
      <span data-testid={`recent-${habit.id}`}>
        {state === 'done' ? 'yes' : 'no'}
      </span>
      <button data-testid={`log-${habit.id}`} onClick={actions?.onLog}>
        log
      </button>
      <button data-testid={`skip-${habit.id}`} onClick={actions?.onSkip}>
        skip
      </button>
      <button data-testid={`force-log-${habit.id}`} onClick={actions?.onForceLogParent}>
        force
      </button>
      <button data-testid={`edit-${habit.id}`} onClick={actions?.onEdit}>
        edit
      </button>
      {selectMode && (
        <button
          data-testid={`select-${habit.id}`}
          onClick={actions?.onToggleSelection}
        >
          select
        </button>
      )}
    </div>
  ),
}))

vi.mock('@/components/habits/habit-detail-drawer', () => ({
  HabitDetailDrawer: () => null,
}))

vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: () => null,
}))

vi.mock('@/components/habits/edit-habit-modal', () => ({
  EditHabitModal: ({
    open,
    onSaved,
  }: {
    open: boolean
    onSaved?: () => void | Promise<void>
  }) => (open ? <button data-testid="edit-habit-modal-save" onClick={() => void onSaved?.()}>save</button> : null),
}))

vi.mock('@/components/habits/log-habit-modal', () => ({
  LogHabitModal: () => null,
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    onConfirm,
  }: {
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }) =>
    open ? (
      <div data-testid={`confirm-dialog-${title}`}>
        <span>{title}</span>
        <span>{description}</span>
        <button data-testid={`confirm-action-${title}`} onClick={onConfirm}>
          confirm
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="app-overlay">{children}</div> : null,
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => null,
    },
  },
}))

vi.mock('@/components/ui/highlight-text', () => ({
  HighlightText: ({ text }: { text: string }) => <span>{text}</span>,
}))

import { HabitList, type HabitListHandle } from '@/components/habits/habit-list'


function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )

  return {
    ...result,
    rerenderWithProviders(nextUi: React.ReactElement) {
      result.rerender(
        <QueryClientProvider client={queryClient}>{nextUi}</QueryClientProvider>,
      )
    },
  }
}

const defaultFilters = {
  dateFrom: '2025-01-01',
  dateTo: '2025-01-01',
  includeOverdue: true,
}


describe('HabitList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    drillRefreshCurrent.mockReset()
    drillInto.mockReset()
    getDrillChildrenMock.mockReset()
    getDrillChildrenMock.mockReturnValue([])
    mockDrillState.drillStack = []
    mockDrillState.currentParentId = null
    mockDrillState.currentParent = null
    mockDrillState.drillChildren = []
    mockDrillState.drillLoading = false
    mockDrillState.drillError = null
    skipHabitMutateAsync.mockReset()
    toggleSelectionSpy.mockReset()
    logHabitMutateAsync.mockReset()
    logHabitMutateAsync.mockImplementation(async ({ habitId }: { habitId: string }) => {
      const habit = mockHabitsData.habitsById.get(habitId)
      if (!habit) return
      mockHabitsData.habitsById.set(habitId, {
        ...habit,
        isCompleted: true,
      })
    })
    mockHabitsData.habitsById.clear()
    mockHabitsData.childrenByParent.clear()
    mockHabitsData.topLevelHabits = []
  })

  it('renders without crashing with no habits', () => {
    renderWithProviders(
      <HabitList filters={defaultFilters} />,
    )
    expect(screen.getByText('habits.noDueToday')).toBeDefined()
  })

  it('renders habit cards for each top-level habit', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Exercise' })
    const habit2 = createMockHabit({ id: 'h-2', title: 'Read' })

    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.habitsById.set('h-2', habit2)
    mockHabitsData.topLevelHabits = [habit1, habit2]

    renderWithProviders(
      <HabitList filters={defaultFilters} />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
    expect(screen.getByTestId('habit-card-h-2')).toBeDefined()
    expect(screen.getByText('Exercise')).toBeDefined()
    expect(screen.getByText('Read')).toBeDefined()
  })

  it('targets the featured demo habit for the card tour steps', () => {
    const meditation = createMockHabit({
      id: 'tour-habit-1',
      title: 'Meditation',
      position: 0,
    })
    const exercise = createMockHabit({
      id: TOUR_FEATURED_HABIT_ID,
      title: 'Exercise',
      position: 1,
    })

    mockHabitsData.habitsById.set(meditation.id, meditation)
    mockHabitsData.habitsById.set(exercise.id, exercise)
    mockHabitsData.topLevelHabits = [meditation, exercise]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    expect(screen.getByTestId('habit-card-tour-habit-1')).not.toHaveAttribute(
      'data-tour',
      'tour-habit-card',
    )
    expect(
      screen.getByTestId(`habit-card-${TOUR_FEATURED_HABIT_ID}`),
    ).toHaveAttribute('data-tour', 'tour-habit-card')
  })

  it('hides only completed one-time habits in all view when showCompleted is false', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Active', isCompleted: false })
    const habit2 = createMockHabit({ id: 'h-2', title: 'Done one-time', isCompleted: true, frequencyUnit: null })
    const habit3 = createMockHabit({ id: 'h-3', title: 'Done recurring', isCompleted: true, frequencyUnit: 'Day' })
    const habit4 = createMockHabit({ id: 'h-4', title: 'General', isGeneral: true })

    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.habitsById.set('h-2', habit2)
    mockHabitsData.habitsById.set('h-3', habit3)
    mockHabitsData.habitsById.set('h-4', habit4)
    mockHabitsData.topLevelHabits = [habit1, habit2, habit3, habit4]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="all"
        showCompleted={false}
      />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
    expect(screen.getByTestId('habit-card-h-3')).toBeDefined()
    expect(screen.queryByTestId('habit-card-h-2')).toBeNull()
    expect(screen.queryByTestId('habit-card-h-4')).toBeNull()
  })

  it('shows completed one-time habits in all view when showCompleted is true', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Active', isCompleted: false })
    const habit2 = createMockHabit({ id: 'h-2', title: 'Done', isCompleted: true, frequencyUnit: null })

    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.habitsById.set('h-2', habit2)
    mockHabitsData.topLevelHabits = [habit1, habit2]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="all"
        showCompleted={true}
      />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
    expect(screen.getByTestId('habit-card-h-2')).toBeDefined()
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

    for (const habit of [
      parent,
      activeChild,
      completedOneTimeChild,
      completedRecurringChild,
      generalChild,
    ]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [
      activeChild.id,
      completedOneTimeChild.id,
      completedRecurringChild.id,
      generalChild.id,
    ])
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="all"
        showCompleted={false}
      />,
    )

    expect(screen.getByTestId('habit-card-parent')).toBeDefined()
    expect(screen.getByTestId('habit-card-active-child')).toBeDefined()
    expect(screen.getByTestId('habit-card-completed-recurring-child')).toBeDefined()
    expect(screen.queryByTestId('habit-card-completed-one-time-child')).toBeNull()
    expect(screen.queryByTestId('habit-card-general-child')).toBeNull()
  })

  it('renders the bad status circle on bad-habit sub-habit rows', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Bad Habits', hasSubHabits: true, isBadHabit: true })
    const badChild = createMockHabit({
      id: 'bad-child',
      title: 'Cheat diet',
      parentId: 'parent',
      isBadHabit: true,
      frequencyUnit: 'Day',
    })

    for (const habit of [parent, badChild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [badChild.id])
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="all"
        showCompleted={false}
      />,
    )

    expect(screen.getByTestId('habit-card-parent').getAttribute('data-state')).toBe('bad')
    expect(screen.getByTestId('habit-card-bad-child').getAttribute('data-state')).toBe('bad')
  })

  it('renders deeply nested all-view children up to the configured depth', () => {
    const root = createMockHabit({ id: 'root', title: 'Root', hasSubHabits: true })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'root', hasSubHabits: true })
    const grandchild = createMockHabit({ id: 'grandchild', title: 'Grandchild', parentId: 'child', hasSubHabits: true })
    const greatGrandchild = createMockHabit({ id: 'great-grandchild', title: 'Great grandchild', parentId: 'grandchild', frequencyUnit: 'Day', isCompleted: true })

    for (const habit of [root, child, grandchild, greatGrandchild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(root.id, [child.id])
    mockHabitsData.childrenByParent.set(child.id, [grandchild.id])
    mockHabitsData.childrenByParent.set(grandchild.id, [greatGrandchild.id])
    mockHabitsData.topLevelHabits = [root]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="all"
        showCompleted={false}
      />,
    )

    expect(screen.getByTestId('habit-card-root')).toBeDefined()
    expect(screen.getByTestId('habit-card-child')).toBeDefined()
    expect(screen.getByTestId('habit-card-grandchild')).toBeDefined()
    expect(screen.getByTestId('habit-card-great-grandchild')).toBeDefined()
  })

  it('renders the ask-astra and create-manually actions in all view empty state', () => {
    renderWithProviders(
      <HabitList filters={defaultFilters} view="all" />,
    )
    expect(screen.getByText('habits.askAstra')).toBeDefined()
    expect(screen.getByText('habits.createManually')).toBeDefined()
  })

  it('passes selected date to habit cards', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Exercise' })
    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.topLevelHabits = [habit1]

    const selectedDate = new Date('2025-01-15')
    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={selectedDate}
      />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
  })

  it('renders with general view', () => {
    const habit1 = createMockHabit({
      id: 'h-1',
      title: 'General Habit',
      isGeneral: true,
      isCompleted: false,
    })
    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.topLevelHabits = [habit1]

    renderWithProviders(
      <HabitList filters={defaultFilters} view="general" />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
    expect(screen.getByText('General Habit')).toBeDefined()
  })

  it('logs a habit immediately from the card action', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    mockHabitsData.habitsById.set('h-1', habit)
    mockHabitsData.topLevelHabits = [habit]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('log-h-1'))

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'h-1' })
  })

  it('passes an immediate completion trigger to the card while logging is pending', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise', isCompleted: false })
    mockHabitsData.habitsById.set('h-1', habit)
    mockHabitsData.topLevelHabits = [habit]

    let resolveLog: (() => void) | undefined
    const pendingLog = new Promise<void>((resolve) => {
      resolveLog = resolve
    })

    logHabitMutateAsync.mockImplementation(() => pendingLog)

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('log-h-1'))

    expect(screen.getByTestId('recent-h-1').textContent).toBe('yes')

    resolveLog?.()
    await act(async () => {
      await pendingLog
    })
  })

  it('keeps a general habit visible while direct logging is pending', async () => {
    const habit = createMockHabit({
      id: 'h-1',
      title: 'Exercise',
      isGeneral: true,
      isCompleted: false,
    })
    mockHabitsData.habitsById.set('h-1', habit)
    mockHabitsData.topLevelHabits = [habit]

    let resolveLog: (() => void) | undefined
    const pendingLog = new Promise<void>((resolve) => {
      resolveLog = resolve
    })

    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => {
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

    const { rerenderWithProviders } = renderWithProviders(
      <HabitList filters={defaultFilters} view="general" />,
    )

    fireEvent.click(screen.getByTestId('log-h-1'))

    rerenderWithProviders(<HabitList filters={defaultFilters} view="general" />)

    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()

    await act(async () => {
      resolveLog?.()
      await pendingLog
    })
  })
  it('opens a force-log confirmation before logging an incomplete parent', () => {
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

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('force-log-parent'))

    expect(screen.getByTestId('confirm-dialog-habits.forceLogTitle')).toBeDefined()

    fireEvent.click(screen.getByTestId('confirm-action-habits.forceLogTitle'))

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent' })
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

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })

    expect(screen.getByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeDefined()
  })

  it('prompts the parent when the final child is logged before the snapshot reflects its completion', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const doneChild = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      isCompleted: true,
    })
    const justLoggedChild = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      isCompleted: false,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(doneChild.id, doneChild)
    mockHabitsData.habitsById.set(justLoggedChild.id, justLoggedChild)
    mockHabitsData.childrenByParent.set(parent.id, [doneChild.id, justLoggedChild.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => {
      ref.current?.markRecentlyCompleted('child-b')
      ref.current?.checkAndPromptParentLog('child-b')
    })

    expect(screen.getByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeDefined()
  })

  it('opens the parent prompt exactly once for a burst of sibling completions', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      isCompleted: true,
    })
    const childB = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      isCompleted: true,
    })
    const childC = createMockHabit({
      id: 'child-c',
      title: 'Child C',
      parentId: 'parent',
      isCompleted: true,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(childA.id, childA)
    mockHabitsData.habitsById.set(childB.id, childB)
    mockHabitsData.habitsById.set(childC.id, childC)
    mockHabitsData.childrenByParent.set(parent.id, [childA.id, childB.id, childC.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => {
      ref.current?.checkAndPromptParentLog('child-a')
      ref.current?.checkAndPromptParentLog('child-b')
      ref.current?.checkAndPromptParentLog('child-c')
    })

    expect(
      screen.getAllByText('habits.autoLogParentMessage({"name":"Parent"})'),
    ).toHaveLength(1)
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

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })

    expect(screen.getByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeDefined()
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

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })

    expect(screen.queryByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeNull()
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

    mockHabitsData.habitsById.set(grandparent.id, grandparent)
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(grandparent.id, [parent.id])
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [grandparent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => {
      ref.current?.checkAndPromptParentLog('child')
    })

    expect(screen.getByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-action-habits.autoLogParentTitle'))
    })

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent' })
    expect(screen.getByText('habits.autoLogParentMessage({"name":"Grandparent"})')).toBeDefined()
  })

  it('stores drill edit onSaved callback without invoking refresh eagerly', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      hasSubHabits: false,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.topLevelHabits = [parent]

    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillChildren = [child]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('edit-child'))
    expect(drillRefreshCurrent).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('edit-habit-modal-save'))
    expect(drillRefreshCurrent).toHaveBeenCalledTimes(1)
  })

  it('logs an overdue habit directly with no date', () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    mockHabitsData.habitsById.set(overdue.id, overdue)
    mockHabitsData.topLevelHabits = [overdue]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('log-overdue-1'))

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1' })
  })

  it('skips an overdue habit with no date after confirmation', () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    mockHabitsData.habitsById.set(overdue.id, overdue)
    mockHabitsData.topLevelHabits = [overdue]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('skip-overdue-1'))

    fireEvent.click(screen.getByTestId('confirm-action-habits.postponeConfirmTitle'))

    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1' })
  })

  it('renders a selectable checkbox for an overdue row in select mode', () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    mockHabitsData.habitsById.set(overdue.id, overdue)
    mockHabitsData.topLevelHabits = [overdue]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        isSelectMode
        selectedHabitIds={new Set()}
        onToggleSelection={toggleSelectionSpy}
      />,
    )

    expect(screen.getByTestId('habit-card-overdue-1')).toHaveAttribute('data-select-mode', 'yes')

    fireEvent.click(screen.getByTestId('select-overdue-1'))

    expect(toggleSelectionSpy).toHaveBeenCalledWith('overdue-1')
  })
})
