import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { computeHabitCardStatus } from '@orbit/shared/utils'

const { useHabitsMock } = vi.hoisted(() => ({
  useHabitsMock: vi.fn(),
}))

const dateParamState = { value: null as string | null }

const uiState = {
  activeView: 'today',
  setActiveView: vi.fn(),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  selectedFrequency: null,
  setSelectedFrequency: vi.fn(),
  selectedTagIds: [],
  setSelectedTagIds: vi.fn(),
  showCompleted: false,
  setShowCompleted: vi.fn(),
  isSelectMode: false,
  selectedHabitIds: new Set<string>(),
  toggleSelectMode: vi.fn(),
  toggleSelectionCascade: vi.fn(),
  selectAllHabits: vi.fn(),
  clearSelection: vi.fn(),
  setFilters: vi.fn(),
  showCreateModal: false,
  setShowCreateModal: vi.fn(),
  showCreateGoalModal: false,
  setShowCreateGoalModal: vi.fn(),
}

const bulkLogMutateAsync = vi.fn()
const bulkSkipMutateAsync = vi.fn()
const markRecentlyCompleted = vi.fn()
const checkAndPromptParentLog = vi.fn()

const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
}

const habitListHandle = {
  allCollapsed: false,
  allLoadedIds: new Set<string>(),
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  markRecentlyCompleted,
  checkAndPromptParentLog,
}
const mockRouterPush = vi.fn()
let mockProfile = createMockProfile({ hasProAccess: false, aiSummaryEnabled: false })

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(
      dateParamState.value ? { date: dateParamState.value } : {},
    ),
  useRouter: () => ({
    push: mockRouterPush,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@orbit/shared/query', () => ({
  habitKeys: {
    lists: () => ['habits'],
  },
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof uiState) => unknown) => selector(uiState),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfile,
  }),
}))

vi.mock('@/hooks/use-gamification', () => ({
  useStreakInfo: () => ({
    data: { currentStreak: 0 },
  }),
}))

vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({
    tags: [],
  }),
}))

function defaultUseHabitsReturn() {
  return {
    data: mockHabitsData,
    getChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
    isFetching: false,
    dataUpdatedAt: Date.now(),
  }
}

vi.mock('@/hooks/use-habits', () => ({
  useHabits: useHabitsMock,
  useBulkDeleteHabits: () => ({ mutateAsync: vi.fn() }),
  useBulkLogHabits: () => ({ mutateAsync: bulkLogMutateAsync }),
  useBulkSkipHabits: () => ({ mutateAsync: bulkSkipMutateAsync }),
}))

vi.mock('@/hooks/use-coach-tour', () => ({
  useCoachTour: () => {},
}))

vi.mock('@/components/today/setup-checklist-card', () => ({
  SetupChecklistCard: () => null,
}))

vi.mock('@/components/referral/referral-card', () => ({
  ReferralCard: () => null,
}))

vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: () => null,
}))

vi.mock('@/components/habits/habit-list', () => ({
  HabitList: React.forwardRef(function MockHabitList(props: Record<string, unknown>, ref) {
    React.useImperativeHandle(ref, () => habitListHandle)
    return <div data-testid="habit-list">{JSON.stringify(props.view)}</div>
  }),
}))

vi.mock('@/components/habits/today-ai-summary', () => ({
  TodayAISummary: () => null,
}))

vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: () => null,
}))

vi.mock('@/components/goals/goals-view', () => ({
  GoalsView: () => <div>Goals view</div>,
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => null,
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => null,
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    title,
    onConfirm,
  }: {
    title: string
    onConfirm: () => void
  }) => (
    <button data-testid={`confirm-dialog-${title}`} onClick={onConfirm}>
      {title}
    </button>
  ),
}))

import TodayPage from '@/app/(app)/page'

describe('TodayPage bulk parent prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHabitsMock.mockImplementation(defaultUseHabitsReturn)
    vi.useRealTimers()
    mockRouterPush.mockReset()
    mockProfile = createMockProfile({ hasProAccess: false, aiSummaryEnabled: false })
    bulkLogMutateAsync.mockReset()
    bulkSkipMutateAsync.mockReset()
    mockHabitsData.habitsById = new Map()
    mockHabitsData.childrenByParent = new Map()
    mockHabitsData.topLevelHabits = []
    habitListHandle.allLoadedIds = new Set()
    dateParamState.value = '2026-04-07'
    uiState.activeView = 'today'
    uiState.isSelectMode = true
    uiState.searchQuery = ''
    uiState.selectedFrequency = null
    uiState.selectedTagIds = []
    uiState.showCompleted = false
    uiState.selectedHabitIds = new Set<string>()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('always shows the filter row regardless of habit count', () => {
    render(<TodayPage />)
    expect(screen.getByTestId('today-utility-row')).toBeInTheDocument()
    expect(screen.getByTestId('habit-list')).toBeInTheDocument()
  })

  it('suppresses descendant successes when bulk log finishes', async () => {
    const root = createMockHabit({ id: 'root', title: 'Root', hasSubHabits: true })
    const parent = createMockHabit({ id: 'parent', title: 'Parent', parentId: 'root', hasSubHabits: true })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent' })

    mockHabitsData.habitsById = new Map([
      [root.id, root],
      [parent.id, parent],
      [child.id, child],
    ])
    mockHabitsData.childrenByParent = new Map([
      [root.id, [parent.id]],
      [parent.id, [child.id]],
    ])
    mockHabitsData.topLevelHabits = [root]
    uiState.selectedHabitIds = new Set([parent.id, child.id])

    bulkLogMutateAsync.mockResolvedValue({
      results: [
        { habitId: parent.id, status: 'Success' },
        { habitId: child.id, status: 'Success' },
      ],
    })

    render(<TodayPage />)

    fireEvent.click(screen.getByTestId('confirm-dialog-habits.bulkLogTitle'))

    await waitFor(() => {
      expect(markRecentlyCompleted).toHaveBeenCalledWith('parent')
      expect(markRecentlyCompleted).toHaveBeenCalledWith('child')
      expect(checkAndPromptParentLog).toHaveBeenCalledTimes(1)
      expect(checkAndPromptParentLog).toHaveBeenCalledWith('parent')
    })
  })

  it('renders the animated list shell and bulk action bar in select mode', () => {
    render(<TodayPage />)

    expect(screen.getByTestId('today-list-shell')).toBeInTheDocument()
    expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument()
  })

  it('routes free users to upgrade when they click goals', async () => {
    render(<TodayPage />)

    fireEvent.click(screen.getByText('goals.tab'))

    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade')
    expect(uiState.setActiveView).not.toHaveBeenCalledWith('goals')
  })

  it('lets pro users switch to goals', async () => {
    mockProfile = createMockProfile({ hasProAccess: true, aiSummaryEnabled: false })

    render(<TodayPage />)

    fireEvent.click(screen.getByText('goals.tab'))

    expect(uiState.setActiveView).toHaveBeenCalledWith('goals')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('recovers a stale free goals view back to today', async () => {
    uiState.activeView = 'goals'

    render(<TodayPage />)

    expect(screen.queryByText('Goals view')).not.toBeInTheDocument()
    expect(screen.getByTestId('habit-list')).toHaveTextContent('"today"')
    await waitFor(() => {
      expect(uiState.setActiveView).toHaveBeenCalledWith('today')
    })
  })

  it('advances a followed today selection after midnight without refresh', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T23:59:55'))
    dateParamState.value = null
    uiState.isSelectMode = false

    render(<TodayPage />)

    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: '2026-04-07',
      dateTo: '2026-04-07',
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000)
    })

    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: '2026-04-08',
      dateTo: '2026-04-08',
    })
  })

  it('keeps a manually pinned date fixed after midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T23:59:55'))
    dateParamState.value = '2026-04-06'
    uiState.isSelectMode = false

    render(<TodayPage />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000)
    })

    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: '2026-04-06',
      dateTo: '2026-04-06',
    })
  })

  it('navigates to the previous day with a date query param', () => {
    dateParamState.value = '2026-04-07'
    uiState.isSelectMode = false

    render(<TodayPage />)

    fireEvent.click(screen.getByLabelText('dates.previousDay'))

    expect(mockRouterPush).toHaveBeenCalledWith('/?date=2026-04-06')
  })

  it('navigates to the next day with a date query param', () => {
    dateParamState.value = '2026-04-07'
    uiState.isSelectMode = false

    render(<TodayPage />)

    fireEvent.click(screen.getByLabelText('dates.nextDay'))

    expect(mockRouterPush).toHaveBeenCalledWith('/?date=2026-04-08')
  })

  it('returns to today via the bare route when pressing the date label', () => {
    dateParamState.value = '2026-04-06'
    uiState.isSelectMode = false

    render(<TodayPage />)

    fireEvent.click(screen.getByLabelText('dates.goToToday'))

    expect(mockRouterPush).toHaveBeenCalledWith('/')
  })

  it('renders today on the bare route and the pinned day on a date deep link', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00'))
    uiState.isSelectMode = false

    dateParamState.value = null
    const { rerender } = render(<TodayPage />)
    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: '2026-04-07',
      dateTo: '2026-04-07',
    })

    dateParamState.value = '2026-04-02'
    rerender(<TodayPage />)
    expect(useHabitsMock.mock.calls.at(-1)?.[0]).toMatchObject({
      dateFrom: '2026-04-02',
      dateTo: '2026-04-02',
    })
  })
})

describe('TodayPage overdue bulk selection', () => {
  function seedOverdueHabit(): NormalizedHabit {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      dueDate: '2026-04-01',
      scheduledDates: [],
      isCompleted: false,
    })
    mockHabitsData.habitsById = new Map([[overdue.id, overdue]])
    mockHabitsData.topLevelHabits = [overdue]
    return overdue
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useHabitsMock.mockImplementation(defaultUseHabitsReturn)
    vi.useRealTimers()
    mockProfile = createMockProfile({ hasProAccess: false, aiSummaryEnabled: false })
    bulkLogMutateAsync.mockReset()
    bulkSkipMutateAsync.mockReset()
    mockHabitsData.habitsById = new Map()
    mockHabitsData.childrenByParent = new Map()
    mockHabitsData.topLevelHabits = []
    habitListHandle.allLoadedIds = new Set()
    dateParamState.value = '2026-04-07'
    uiState.activeView = 'today'
    uiState.isSelectMode = true
    uiState.searchQuery = ''
    uiState.selectedFrequency = null
    uiState.selectedTagIds = []
    uiState.showCompleted = false
    uiState.selectedHabitIds = new Set<string>()
  })

  it('treats an overdue one-time habit fixture as overdue', () => {
    const overdue = seedOverdueHabit()

    expect(computeHabitCardStatus(overdue)).toBe('overdue')
  })

  it('includes the overdue habit when selecting all', () => {
    const overdue = seedOverdueHabit()
    habitListHandle.allLoadedIds = new Set([overdue.id])

    render(<TodayPage />)

    fireEvent.click(screen.getByText('common.selectAll'))

    expect(uiState.selectAllHabits).toHaveBeenCalledWith(
      expect.arrayContaining([overdue.id]),
    )
  })

  it('dispatches a bulk log for a selected overdue habit without a date', async () => {
    const overdue = seedOverdueHabit()
    uiState.selectedHabitIds = new Set([overdue.id])
    bulkLogMutateAsync.mockResolvedValue({
      results: [{ habitId: overdue.id, status: 'Success' }],
    })

    render(<TodayPage />)

    fireEvent.click(screen.getByTestId('confirm-dialog-habits.bulkLogTitle'))

    await waitFor(() => {
      expect(bulkLogMutateAsync).toHaveBeenCalledWith([{ habitId: overdue.id }])
    })
  })

  it('dispatches a bulk skip for a selected overdue habit without a date', async () => {
    const overdue = seedOverdueHabit()
    uiState.selectedHabitIds = new Set([overdue.id])
    bulkSkipMutateAsync.mockResolvedValue({
      results: [{ habitId: overdue.id, status: 'Success' }],
    })

    render(<TodayPage />)

    fireEvent.click(screen.getByTestId('confirm-dialog-habits.bulkSkipTitle'))

    await waitFor(() => {
      expect(bulkSkipMutateAsync).toHaveBeenCalledWith([{ habitId: overdue.id }])
    })
  })
})

describe('TodayPage overdue date gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHabitsMock.mockImplementation(defaultUseHabitsReturn)
    vi.useRealTimers()
    mockProfile = createMockProfile({ hasProAccess: false, aiSummaryEnabled: false })
    mockHabitsData.habitsById = new Map()
    mockHabitsData.childrenByParent = new Map()
    mockHabitsData.topLevelHabits = []
    dateParamState.value = null
    uiState.activeView = 'today'
    uiState.isSelectMode = false
    uiState.searchQuery = ''
    uiState.selectedFrequency = null
    uiState.selectedTagIds = []
    uiState.showCompleted = false
    uiState.selectedHabitIds = new Set<string>()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function lastFilters() {
    return useHabitsMock.mock.calls.at(-1)?.[0]
  }

  it('includes overdue when the selected date is today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00'))
    dateParamState.value = null

    render(<TodayPage />)

    expect(lastFilters()).toMatchObject({
      dateFrom: '2026-04-07',
      dateTo: '2026-04-07',
      includeOverdue: true,
    })
  })

  it('excludes overdue when the selected date is in the future', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00'))
    dateParamState.value = '2026-04-09'

    render(<TodayPage />)

    expect(lastFilters()).toMatchObject({ includeOverdue: false })
  })

  it('excludes overdue when the selected date is in the past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00'))
    dateParamState.value = '2026-04-05'

    render(<TodayPage />)

    expect(lastFilters()).toMatchObject({ includeOverdue: false })
  })
})
