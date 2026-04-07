import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

const uiState = {
  selectedDate: '2026-04-07',
  setSelectedDate: vi.fn(),
  activeView: 'today',
  setActiveView: vi.fn(),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  isSelectMode: false,
  selectedHabitIds: new Set<string>(),
  toggleSelectMode: vi.fn(),
  toggleSelectionCascade: vi.fn(),
  selectAllHabits: vi.fn(),
  clearSelection: vi.fn(),
  showCreateModal: false,
  setShowCreateModal: vi.fn(),
}

const bulkLogMutateAsync = vi.fn()
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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
    profile: createMockProfile({ hasProAccess: false, aiSummaryEnabled: false }),
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

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({
    data: mockHabitsData,
    getChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
    isFetching: false,
    dataUpdatedAt: Date.now(),
  }),
  useBulkDeleteHabits: () => ({ mutateAsync: vi.fn() }),
  useBulkLogHabits: () => ({ mutateAsync: bulkLogMutateAsync }),
  useBulkSkipHabits: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/components/habits/habit-list', () => ({
  HabitList: React.forwardRef(function MockHabitList(props: Record<string, unknown>, ref) {
    React.useImperativeHandle(ref, () => habitListHandle)
    return <div data-testid="habit-list">{JSON.stringify(props.view)}</div>
  }),
}))

vi.mock('@/components/habits/habit-summary-card', () => ({
  HabitSummaryCard: () => null,
}))

vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: () => null,
}))

vi.mock('@/components/goals/goals-view', () => ({
  GoalsView: () => null,
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
    bulkLogMutateAsync.mockReset()
    mockHabitsData.habitsById = new Map()
    mockHabitsData.childrenByParent = new Map()
    mockHabitsData.topLevelHabits = []
    habitListHandle.allLoadedIds = new Set()
    uiState.activeView = 'today'
    uiState.isSelectMode = true
    uiState.searchQuery = ''
    uiState.selectedHabitIds = new Set<string>()
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
})
