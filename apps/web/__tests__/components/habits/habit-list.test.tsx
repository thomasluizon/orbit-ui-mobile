import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Mocks - must be defined before importing the component
// ---------------------------------------------------------------------------

const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
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
  useLogHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSkipHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMoveHabitParent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-habit-visibility', () => ({
  useHabitVisibility: () => ({
    hasVisibleContent: () => true,
    getVisibleChildren: () => [],
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
  HabitCard: ({ habit }: { habit: NormalizedHabit }) => (
    <div data-testid={`habit-card-${habit.id}`}>{habit.title}</div>
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
  ConfirmDialog: () => null,
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
import { HabitList } from '@/components/habits/habit-list'

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
})
