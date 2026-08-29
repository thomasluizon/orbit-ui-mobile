import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canNavigateToNextDay, getTodayBoundary } from '@orbit/shared/utils'

const mocks = vi.hoisted(() => ({
  focusCallback: null as null | (() => void | (() => void)),
  clearSelection: vi.fn(),
  composerEnabled: [] as boolean[],
}))

vi.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    mocks.focusCallback = callback
  },
}))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn().mockResolvedValue(null) },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({ showInterstitialIfDue: vi.fn() }),
}))
vi.mock('@/hooks/use-habits', () => ({
  EMPTY_HABITS_BY_ID: new Map(),
  useHabits: () => ({ data: undefined, isFetching: false, refetch: vi.fn() }),
}))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    showCompleted: false,
    setShowCompleted: vi.fn(),
    isSelectMode: true,
    selectedHabitIds: new Set(['habit-1']),
    showCreateModal: false,
    setShowCreateModal: vi.fn(),
    showCreateGoalModal: false,
    setShowCreateGoalModal: vi.fn(),
  }),
}))
vi.mock('@/components/habit-list', () => ({ HabitList: () => null }))
vi.mock('@/components/habits/selection-tray', () => ({ SelectionTray: () => null }))
vi.mock('@/components/ui/capacity-notice', () => ({ CapacityNotice: () => null }))
vi.mock('@/components/today/today-shell', () => ({ TodayDateControl: () => null }))
vi.mock('@/components/today/today-modals', () => ({ TodayModals: () => null }))
vi.mock('@/lib/theme', () => ({ createTokensV2: () => ({ bg: '#000000' }) }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))
vi.mock('@/app/(tabs)/use-today-date', () => ({
  useTodayDate: () => ({
    dateStr: '2026-04-08',
    today: '2026-04-08',
    selectedDate: new Date('2026-04-08T12:00:00Z'),
    dayName: 'Today',
    numericDate: '8',
    nextDisabled: false,
    goToPreviousDay: vi.fn(),
    goToToday: vi.fn(),
    goToNextDay: vi.fn(),
  }),
}))
vi.mock('@/app/(tabs)/use-today-selection', () => ({
  useTodaySelection: () => ({
    selectedCount: 1,
    allSelected: false,
    clearSelection: mocks.clearSelection,
    handleSelectAll: vi.fn(),
    handleDeselectAll: vi.fn(),
    handleOpenBulkLog: vi.fn(),
    handleOpenBulkSkip: vi.fn(),
    handleOpenBulkDelete: vi.fn(),
    handleToggleSelectMode: vi.fn(),
    showBulkDeleteConfirm: false,
    setShowBulkDeleteConfirm: vi.fn(),
    confirmBulkDelete: vi.fn(),
  }),
}))
vi.mock('@/components/shell/shell-composer-slot', () => ({
  useShellComposerSlot: (enabled: boolean) => {
    mocks.composerEnabled.push(enabled)
  },
}))

describe('Hoje date boundaries', () => {
  it('keeps seven days back loggable and marks the next day read only', () => {
    expect(getTodayBoundary('2026-04-01', '2026-04-08')).toBe('last-loggable')
    expect(getTodayBoundary('2026-03-31', '2026-04-08')).toBe('read-only')
  })

  it('marks future days without blocking navigation', () => {
    expect(getTodayBoundary('2026-04-09', '2026-04-08')).toBe('future')
  })

  it('stops the forward control at the API horizon', () => {
    expect(canNavigateToNextDay('2026-07-06', '2026-04-08')).toBe(true)
    expect(canNavigateToNextDay('2026-07-07', '2026-04-08')).toBe(false)
  })
})

describe('Hoje selection composer lifecycle', () => {
  beforeEach(() => {
    mocks.focusCallback = null
    mocks.clearSelection.mockReset()
    mocks.composerEnabled.length = 0
  })

  it('registers only while Today is focused and clears selection on a tab switch', async () => {
    const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
    const { default: TodayScreen } = await import('@/app/(tabs)/index')
    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(TodayScreen))
      await Promise.resolve()
    })

    expect(mocks.composerEnabled.at(-1)).toBe(false)
    let blur: void | (() => void)
    await TestRenderer.act(async () => {
      blur = mocks.focusCallback?.()
      await Promise.resolve()
    })
    expect(mocks.composerEnabled.at(-1)).toBe(true)

    await TestRenderer.act(async () => {
      blur?.()
      await Promise.resolve()
    })
    expect(mocks.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.composerEnabled.at(-1)).toBe(false)
  })
})
