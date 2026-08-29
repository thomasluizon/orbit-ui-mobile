import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitVisibilityOptions } from '@orbit/shared/utils/habit-visibility'

const TODAY = formatAPIDate(new Date())
const YESTERDAY = formatAPIDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
const TOMORROW = formatAPIDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'


const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
  totalCount: 0,
}
const logHabitMutateAsync = vi.fn()
const habitListRefetch = vi.fn()
const skipHabitMutateAsync = vi.fn()
const deleteHabitMutateAsync = vi.fn()
const duplicateHabitMutateAsync = vi.fn()
const toggleSelectionSpy = vi.fn()
const drillRefreshCurrent = vi.fn()
const drillInto = vi.fn()
const getDrillChildrenMock = vi.fn(() => [])
let mockHabitsDataUpdatedAt = 1
let useActualHabitVisibility = false
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
    dataUpdatedAt: mockHabitsDataUpdatedAt,
    refetch: habitListRefetch,
    getChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
  }),
  useLogHabit: () => ({ mutateAsync: logHabitMutateAsync, mutate: vi.fn(), isPending: false }),
  useSkipHabit: () => ({ mutateAsync: skipHabitMutateAsync, isPending: false }),
  useDeleteHabit: () => ({ mutateAsync: deleteHabitMutateAsync, isPending: false }),
  useDuplicateHabit: () => ({ mutateAsync: duplicateHabitMutateAsync, isPending: false }),
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
        hasVisibleContent: useActualHabitVisibility
          ? helpers.hasVisibleContent
          : () => true,
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
      onLog?: () => void
      onUnlog?: () => void
      onSkip?: () => void
      onDelete?: () => void
      onEdit?: () => void
      onDuplicate?: () => void
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
      <button data-testid={`unlog-${habit.id}`} onClick={actions?.onUnlog}>
        unlog
      </button>
      <button data-testid={`delete-${habit.id}`} onClick={actions?.onDelete}>
        delete
      </button>
      <button data-testid={`skip-${habit.id}`} onClick={actions?.onSkip}>
        skip
      </button>
      <button data-testid={`edit-${habit.id}`} onClick={actions?.onEdit}>
        edit
      </button>
      <button data-testid={`duplicate-${habit.id}`} onClick={actions?.onDuplicate}>
        duplicate
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

vi.mock('@/components/habits/reschedule-sheet', () => ({
  RescheduleSheet: () => null,
}))

vi.mock('@/components/habits/edit-habit-modal', () => ({
  EditHabitModal: ({
    open,
    onSaved,
    lockedGeneral,
  }: {
    open: boolean
    onSaved?: () => void | Promise<void>
    lockedGeneral?: boolean | null
  }) =>
    open ? (
      <>
        <button data-testid="edit-habit-modal-save" onClick={() => void onSaved?.()}>save</button>
        <span data-testid="edit-habit-modal-locked-general">{String(lockedGeneral)}</span>
      </>
    ) : null,
}))

vi.mock('@/components/habits/log-habit-modal', () => ({
  LogHabitModal: () => null,
}))


vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
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

async function confirmVisibleSheet(title: string, confirmLabel: string) {
  const confirmation = await screen.findByRole('dialog', { name: title })
  await act(async () => {
    fireEvent.click(within(confirmation).getByRole('button', { name: confirmLabel }))
  })
}

const defaultFilters = {
  dateFrom: '2025-01-01',
  dateTo: '2025-01-01',
  includeOverdue: true,
}


describe('HabitList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHabitsDataUpdatedAt = 1
    useActualHabitVisibility = false
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
    deleteHabitMutateAsync.mockReset()
    duplicateHabitMutateAsync.mockReset()
    toggleSelectionSpy.mockReset()
    habitListRefetch.mockReset()
    habitListRefetch.mockResolvedValue(undefined)
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
    mockHabitsData.totalCount = 0
  })

  it('renders without crashing with no habits', () => {
    renderWithProviders(
      <HabitList filters={defaultFilters} />,
    )
    expect(screen.getByText('habits.emptyState')).toBeDefined()
    expect(screen.getByText('habits.noHabitsBody')).toBeDefined()
  })

  it('renders the all-done upcoming action only when it can navigate', () => {
    mockHabitsData.totalCount = 1
    const onSeeUpcoming = vi.fn()
    const result = renderWithProviders(
      <HabitList filters={defaultFilters} view="today" showCompleted={false} />,
    )

    expect(screen.queryByRole('button', { name: 'habits.seeUpcoming' })).toBeNull()

    result.rerenderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="today"
        showCompleted={false}
        onSeeUpcoming={onSeeUpcoming}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'habits.seeUpcoming' }))

    expect(onSeeUpcoming).toHaveBeenCalledOnce()
  })

  it('keeps a completed row in place for 1400 ms', () => {
    vi.useFakeTimers()
    useActualHabitVisibility = true
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    const ref = React.createRef<HabitListHandle>()
    const result = renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => ref.current?.markRecentlyCompleted(habit.id))

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1400)
    const completedHabit = { ...habit, isCompleted: true }
    mockHabitsData.habitsById.set(habit.id, completedHabit)
    mockHabitsData.topLevelHabits = [completedHabit]
    result.rerenderWithProviders(
      <HabitList ref={ref} filters={defaultFilters} showCompleted={false} />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1400)
    })

    expect(screen.queryByTestId('habit-card-h-1')).toBeNull()
    result.unmount()
    setTimeoutSpy.mockRestore()
    vi.useRealTimers()
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
    const selectedDate = new Date('2026-04-08T00:00:00')

    renderWithProviders(
      <HabitList filters={defaultFilters} selectedDate={selectedDate} />,
    )

    fireEvent.click(screen.getByTestId('log-h-1'))

    expect(logHabitMutateAsync).toHaveBeenCalledWith({
      habitId: 'h-1',
      date: '2026-04-08',
    })
  })

  it('unlogs only the viewed historical occurrence', async () => {
    let occurrences: NormalizedHabit['instances'] = [
      { date: YESTERDAY, status: 'Completed', logId: 'log-yesterday' },
      { date: TODAY, status: 'Pending', logId: null },
    ]
    const habit = createMockHabit({
      id: 'h-1',
      title: 'Exercise',
      isCompleted: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: occurrences,
    })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    logHabitMutateAsync.mockImplementation(async ({ date }: { date?: string }) => {
      occurrences = occurrences.map((occurrence) =>
        occurrence.date === date
          ? { ...occurrence, status: 'Pending', logId: null }
          : occurrence,
      )
    })

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('unlog-h-1'))
    })

    expect(logHabitMutateAsync).toHaveBeenCalledWith({
      habitId: 'h-1',
      date: YESTERDAY,
    })
    expect(occurrences).toContainEqual({
      date: TODAY,
      status: 'Pending',
      logId: null,
    })
  })

  it('guards only the settling habit until its refetch completes', async () => {
    const firstHabit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    const secondHabit = createMockHabit({ id: 'h-2', title: 'Read' })
    mockHabitsData.habitsById.set(firstHabit.id, firstHabit)
    mockHabitsData.habitsById.set(secondHabit.id, secondHabit)
    mockHabitsData.topLevelHabits = [firstHabit, secondHabit]

    let resolveFirstMutation: (() => void) | undefined
    const firstMutation = new Promise<void>((resolve) => {
      resolveFirstMutation = resolve
    })
    let resolveFirstRefetch: (() => void) | undefined
    const firstRefetch = new Promise<void>((resolve) => {
      resolveFirstRefetch = resolve
    })
    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) =>
      habitId === firstHabit.id ? firstMutation : Promise.resolve(),
    )
    habitListRefetch
      .mockReturnValueOnce(firstRefetch)
      .mockResolvedValue(undefined)

    renderWithProviders(<HabitList filters={defaultFilters} selectedDate={new Date()} />)
    fireEvent.click(screen.getByTestId('log-h-1'))

    await act(async () => {
      resolveFirstMutation?.()
      await firstMutation
    })
    expect(habitListRefetch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('unlog-h-1'))
    expect(logHabitMutateAsync).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByTestId('log-h-2'))
    })
    expect(logHabitMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ habitId: 'h-2' }),
    )

    await act(async () => {
      resolveFirstRefetch?.()
      await firstRefetch
    })
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
  it('logs an incomplete parent immediately', async () => {
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

    await act(async () => {
      fireEvent.click(screen.getByTestId('log-parent'))
    })

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent' })
  })

  it('asks before settling the next parent after logging its final unresolved child', async () => {
    const grandparent = createMockHabit({ id: 'grandparent', title: 'Grandparent', hasSubHabits: true, scheduledDates: [TODAY], instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'grandparent', hasSubHabits: true, scheduledDates: [TODAY] })
    const grandchild = createMockHabit({ id: 'grandchild', title: 'Grandchild', parentId: 'child', isCompleted: true, scheduledDates: [TODAY] })
    for (const habit of [grandparent, child, grandchild]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(grandparent.id, [child.id])
    mockHabitsData.childrenByParent.set(child.id, [grandchild.id])
    mockHabitsData.topLevelHabits = [grandparent]
    renderWithProviders(<HabitList filters={defaultFilters} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('log-child'))
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'child' })
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'grandparent', date: TODAY })
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

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY })
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

    await act(async () => {
      ref.current?.markRecentlyCompleted('child-b')
      ref.current?.checkAndPromptParentLog('child-b')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY })
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
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(child.id, { ...child, isCompleted: false })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
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
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(parent.id, {
        ...parent,
        isCompleted: false,
        isLoggedInRange: true,
      })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
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
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(parent.id, { ...parent, dueDate: TOMORROW })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
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
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(child.id, {
        ...child,
        isCompleted: false,
        isFlexible: true,
        flexibleTarget: 1,
        flexibleCompleted: 1,
        isLoggedInRange: false,
      })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: parent.id, date: TODAY })
    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it('settles the parent exactly once for a burst of sibling completions', async () => {
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

    await act(async () => {
      ref.current?.checkAndPromptParentLog('child-a')
      ref.current?.checkAndPromptParentLog('child-b')
      ref.current?.checkAndPromptParentLog('child-c')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === 'parent')).toHaveLength(1)
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
    for (const habit of [loggedParent, skippedParent, ...children]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(loggedParent.id, ['log-a', 'log-b'])
    mockHabitsData.childrenByParent.set(skippedParent.id, ['skip-a', 'skip-b'])
    mockHabitsData.topLevelHabits = [loggedParent, skippedParent]
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
      />,
    )

    await act(async () => {
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

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === loggedParent.id))
      .toEqual([[{ habitId: loggedParent.id, date: YESTERDAY }]])
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === skippedParent.id))
      .toEqual([[{ habitId: skippedParent.id, date: YESTERDAY }]])
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
    for (const habit of [parent, acceptedChild, rejectedChild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [acceptedChild.id, rejectedChild.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'log' }])
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }])
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toEqual([[{ habitId: parent.id, date: TODAY }]])
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
    for (const habit of [parent, acceptedChild, rejectedChild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [acceptedChild.id, rejectedChild.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'skip' }])
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }])
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toEqual([[{ habitId: parent.id, date: TODAY }]])
  })

  it('deduplicates parent settlement through refetches until progress becomes incomplete', async () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent', isCompleted: true })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())
    const refetch = (isCompleted = true) => {
      mockHabitsData.habitsById.set(child.id, { ...child, isCompleted })
      mockHabitsData.habitsById.set(parent.id, { ...parent, isCompleted: false })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    }
    await act(async () => ref.current?.checkAndPromptParentLog('child'))
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    refetch()
    await act(async () => ref.current?.checkAndPromptParentLog('child'))
    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === 'parent')).toHaveLength(1)
    refetch(false)
    refetch()
    await act(async () => ref.current?.checkAndPromptParentLog('child'))
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === 'parent')).toHaveLength(2)
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

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY })
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

    mockHabitsData.habitsById.set(grandparent.id, grandparent)
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(grandparent.id, [parent.id])
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [grandparent]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('log-child'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledTimes(3)
    expect(logHabitMutateAsync.mock.calls).toEqual([
      [{ habitId: 'child', date: YESTERDAY }],
      [{ habitId: 'parent', date: YESTERDAY }],
      [{ habitId: 'grandparent', date: YESTERDAY }],
    ])
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

    mockHabitsData.habitsById.set(grandparent.id, grandparent)
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(grandparent.id, [parent.id])
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [grandparent]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T12:00:00Z`)}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-child'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await confirmVisibleSheet('habits.skipConfirmTitle', 'habits.skipConfirmButton')
    await confirmVisibleSheet('habits.autoSkipParentTitle', 'habits.autoSkipParentConfirm')
    await confirmVisibleSheet('habits.autoSkipParentTitle', 'habits.autoSkipParentConfirm')

    expect(skipHabitMutateAsync.mock.calls).toEqual([
      [{ habitId: 'child', date: YESTERDAY }],
      [{ habitId: 'parent', date: YESTERDAY }],
      [{ habitId: 'grandparent', date: YESTERDAY }],
    ])
  })

  it('does not prompt the parent while an overdue sub-habit is still unresolved', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const loggedChild = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      isLoggedInRange: true,
    })
    const overdueChild = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      isOverdue: true,
      scheduledDates: [],
      dueDate: '2025-01-01',
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(loggedChild.id, loggedChild)
    mockHabitsData.habitsById.set(overdueChild.id, overdueChild)
    mockHabitsData.childrenByParent.set(parent.id, [loggedChild.id, overdueChild.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} view="today" />)

    act(() => {
      ref.current?.checkAndPromptParentLog('child-a')
    })

    expect(screen.queryByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeNull()
  })

  it('skips the parent immediately once every sub-habit is skipped', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [TODAY, TOMORROW],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      scheduledDates: [TODAY],
    })
    const childB = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      scheduledDates: [TODAY],
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(childA.id, childA)
    mockHabitsData.habitsById.set(childB.id, childB)
    mockHabitsData.childrenByParent.set(parent.id, [childA.id, childB.id])
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(<HabitList filters={defaultFilters} view="all" />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-child-a'))
    })
    await confirmVisibleSheet('habits.skipConfirmTitle', 'habits.skipConfirmButton')
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: 'parent' })

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-child-b'))
    })
    await confirmVisibleSheet('habits.skipConfirmTitle', 'habits.skipConfirmButton')
    await confirmVisibleSheet('habits.autoSkipParentTitle', 'habits.autoSkipParentConfirm')

    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'child-a', date: TODAY })
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'child-b', date: TODAY })
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY })
  })

  it('stores drill edit onSaved callback without invoking refresh eagerly', async () => {
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

    fireEvent.click(await screen.findByTestId('edit-habit-modal-save'))
    expect(drillRefreshCurrent).toHaveBeenCalledTimes(1)
  })

  it('locks the edit modal General toggle to the parent isGeneral when editing a sub-habit', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      isGeneral: true,
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isGeneral: true,
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
    expect(screen.getByTestId('edit-habit-modal-locked-general')).toHaveTextContent('true')
  })

  it('locks the edit modal General toggle to an existing child isGeneral when editing a parent', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      isGeneral: false,
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isGeneral: false,
      hasSubHabits: false,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('edit-parent'))
    expect(screen.getByTestId('edit-habit-modal-locked-general')).toHaveTextContent('false')
  })

  it('retries loading drill children from the drill error state', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.topLevelHabits = [parent]

    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillError = 'boom'

    renderWithProviders(<HabitList filters={defaultFilters} />)

    expect(screen.getByRole('alert')).toHaveTextContent('boom')

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
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

  /**
   * Ticket #42 is the product authority: a confirmation belongs to an
   * irreversible act only. Skipping is reversible, so it acts on one press;
   * deleting is not, so it asks first.
   */
  it('asks before skip and delete', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Stretch' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-h-1'))
    })
    await confirmVisibleSheet('habits.skipConfirmTitle', 'habits.skipConfirmButton')
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'h-1', date: TODAY })
    expect(screen.queryByRole('dialog', { name: 'habits.deleteConfirmTitle' })).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-h-1'))
    })
    expect(deleteHabitMutateAsync).not.toHaveBeenCalled()

    const confirmation = await screen.findByRole('dialog', {
      name: 'habits.deleteConfirmTitle',
    })
    await act(async () => {
      fireEvent.click(within(confirmation).getByRole('button', { name: 'common.delete' }))
    })
    expect(deleteHabitMutateAsync).toHaveBeenCalledWith('h-1')
  })

  it('asks before duplicating a habit', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Stretch' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('duplicate-h-1'))
    expect(duplicateHabitMutateAsync).not.toHaveBeenCalled()

    await confirmVisibleSheet('habits.duplicateConfirmTitle', 'habits.duplicateConfirm')
    expect(duplicateHabitMutateAsync).toHaveBeenCalledWith('h-1')
  })

  it('asks before postponing an overdue one-time habit', async () => {
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

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-overdue-1'))
    })
    await confirmVisibleSheet('habits.postponeConfirmTitle', 'habits.postponeConfirmButton')

    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1', date: TODAY })
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
