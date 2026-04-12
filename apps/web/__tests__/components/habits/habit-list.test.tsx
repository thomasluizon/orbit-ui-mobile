import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

const TODAY = formatAPIDate(new Date())
const TOMORROW = formatAPIDate(new Date(Date.now() + 24 * 60 * 60 * 1000))

// ---------------------------------------------------------------------------
// Mocks - must be defined before importing the component
// ---------------------------------------------------------------------------

const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
}
const logHabitMutateAsync = vi.fn()

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
  useSkipHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMoveHabitParent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-habit-visibility', () => ({
  useHabitVisibility: () => ({
    hasVisibleContent: () => true,
    getVisibleChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
    isRelevantToday: () => true,
    isDueOnSelectedDate: () => true,
  }),
}))

vi.mock('@/hooks/use-drill-navigation', () => ({
  useDrillNavigation: () => ({
    isDrilled: false,
    drilledHabit: null,
    drillStack: [],
    drilledChildren: [],
    drillInto: vi.fn(),
    goBack: vi.fn(),
    goHome: vi.fn(),
    isLoading: false,
  }),
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

vi.mock('@/components/habits/habit-card', () => ({
  HabitCard: ({
    habit,
    childrenDone,
    childrenTotal,
    actions,
  }: {
    habit: NormalizedHabit
    childrenDone?: number
    childrenTotal?: number
    actions?: { onForceLogParent?: () => void }
  }) => (
    <div data-testid={`habit-card-${habit.id}`}>
      <span>{habit.title}</span>
      <span data-testid={`habit-progress-${habit.id}`}>{childrenDone ?? 0}/{childrenTotal ?? 0}</span>
      <button data-testid={`force-log-${habit.id}`} onClick={actions?.onForceLogParent}>
        force
      </button>
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
  EditHabitModal: () => null,
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

// Import the component after all mocks
import { HabitList, type HabitListHandle } from '@/components/habits/habit-list'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

const defaultFilters = {
  dateFrom: '2025-01-01',
  dateTo: '2025-01-01',
  includeOverdue: true,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HabitList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logHabitMutateAsync.mockReset()
    logHabitMutateAsync.mockImplementation(async ({ habitId }: { habitId: string }) => {
      const habit = mockHabitsData.habitsById.get(habitId)
      if (!habit) return
      mockHabitsData.habitsById.set(habitId, {
        ...habit,
        isCompleted: true,
      })
    })
    // Reset data
    mockHabitsData.habitsById.clear()
    mockHabitsData.childrenByParent.clear()
    mockHabitsData.topLevelHabits = []
  })

  it('renders without crashing with no habits', () => {
    renderWithProviders(
      <HabitList filters={defaultFilters} />,
    )
    // Default view is 'today', empty state says noDueToday
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

  it('hides completed habits by default when showCompleted is false', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Active', isCompleted: false })
    const habit2 = createMockHabit({ id: 'h-2', title: 'Done', isCompleted: true })

    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.habitsById.set('h-2', habit2)
    mockHabitsData.topLevelHabits = [habit1, habit2]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="all"
        showCompleted={false}
      />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
    expect(screen.queryByTestId('habit-card-h-2')).toBeNull()
  })

  it('shows completed habits when showCompleted is true', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Active', isCompleted: false })
    const habit2 = createMockHabit({ id: 'h-2', title: 'Done', isCompleted: true })

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

  it('renders the create button in all view empty state', () => {
    renderWithProviders(
      <HabitList filters={defaultFilters} view="all" />,
    )
    // The empty state in all/general view has a create button
    expect(screen.getByText('habits.createHabit')).toBeDefined()
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
      instances: [{ date: TODAY, status: 'Pending', logId: null, note: null }],
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

    expect(screen.getByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeDefined()
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
      instances: [{ date: TOMORROW, status: 'Pending', logId: null, note: null }],
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
      instances: [{ date: TODAY, status: 'Pending', logId: null, note: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: 'grandparent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null, note: null }],
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
})
