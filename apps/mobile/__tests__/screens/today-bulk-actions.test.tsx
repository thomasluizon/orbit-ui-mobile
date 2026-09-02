import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import TodayScreen from '@/app/(tabs)/index'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

type RenderedTree = { unmount: () => void }
type ComponentProps = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  bulkBarProps: null as ComponentProps | null,
  modalProps: null as ComponentProps | null,
  execute: vi.fn(),
  invalidateQueries: vi.fn(async () => {}),
  OfflineMutationPreflightError: class OfflineMutationPreflightError extends Error {},
  clearSelection: vi.fn(),
  settleBulkHabitResolutions: vi.fn(),
  showToast: vi.fn(),
  store: {
    activeView: 'today',
    showCompleted: false,
    isSelectMode: true,
    selectedHabitIds: new Set(['habit-1']),
    showCreateModal: false,
    setShowCreateModal: vi.fn(),
    showCreateGoalModal: false,
    setShowCreateGoalModal: vi.fn(),
    toggleSelectMode: vi.fn(),
    selectAllHabits: vi.fn(),
    clearSelection: vi.fn(),
  },
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    getQueriesData: vi.fn(() => []),
    getQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: mocks.invalidateQueries,
  }

  return {
    ...actual,
    useQuery: vi.fn(),
    useQueryClient: () => queryClient,
    useMutation: (config: {
      mutationFn: (variables: unknown) => Promise<unknown>
      onMutate?: (variables: unknown) => unknown
      onSuccess?: (result: unknown, variables: unknown, context: unknown) => unknown
      onError?: (error: Error, variables: unknown, context: unknown) => unknown
      onSettled?: (
        result: unknown,
        error: Error | null,
        variables: unknown,
        context: unknown,
      ) => unknown
    }) => ({
      mutateAsync: async (variables: unknown) => {
        const context = await config.onMutate?.(variables)
        try {
          const result = await config.mutationFn(variables)
          await config.onSuccess?.(result, variables, context)
          await config.onSettled?.(result, null, variables, context)
          return result
        } catch (error: unknown) {
          const mutationError = error instanceof Error ? error : new Error(String(error))
          await config.onError?.(mutationError, variables, context)
          await config.onSettled?.(undefined, mutationError, variables, context)
          throw mutationError
        }
      },
    }),
  }
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    React.useEffect(callback, [callback])
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({ showInterstitialIfDue: vi.fn() }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/offline-mutations', () => ({
  createTempEntityId: vi.fn(),
  isQueuedResult: (value: unknown) => (
    typeof value === 'object' && value !== null && 'queued' in value
  ),
  OfflineMutationPreflightError: mocks.OfflineMutationPreflightError,
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: (options: unknown) => mocks.execute(options),
}))

vi.mock('@/lib/orbit-widget', () => ({
  syncWidgetData: vi.fn(async () => {}),
}))

vi.mock('@/hooks/use-habits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-habits')>()
  return {
    ...actual,
    EMPTY_HABITS_BY_ID: new Map<string, NormalizedHabit>(),
    useHabits: () => ({ data: { habitsById: new Map<string, NormalizedHabit>() } }),
  }
})

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showToast: mocks.showToast }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}))

vi.mock('@/components/habit-list', () => ({
  HabitList: React.forwardRef(function MockHabitList(
    _props: ComponentProps,
    ref: React.ForwardedRef<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      settleBulkHabitResolutions: mocks.settleBulkHabitResolutions,
      markRecentlyCompleted: vi.fn(),
      checkAndPromptParentLog: vi.fn(),
    }))
    return null
  }),
}))

vi.mock('@/components/habits/selection-tray', () => ({
  SelectionTray: (props: ComponentProps) => {
    mocks.bulkBarProps = props
    return null
  },
}))

vi.mock('@/components/shell/shell-composer-slot', () => ({
  useShellComposerSlot: (enabled: boolean, render: () => React.ReactElement) => {
    if (!enabled) return
    const slot = render() as React.ReactElement<ComponentProps>
    const tray = slot.props.children as React.ReactElement<ComponentProps>
    mocks.bulkBarProps = tray.props
  },
}))

vi.mock('@/components/today/today-date-control', () => ({
  TodayDateControl: () => null,
}))

vi.mock('@/components/today/today-modals', () => ({
  TodayModals: (props: ComponentProps) => {
    mocks.modalProps = props
    return null
  },
}))

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => ({ bg: '#000000' }),
  }
})

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }),
}))

vi.mock('@/app/(tabs)/use-today-date', () => ({
  useTodayDate: () => ({
    today: '2026-04-08',
    selectedDate: new Date('2026-04-08T00:00:00'),
    dateStr: '2026-04-08',
    dayName: 'Wednesday',
    numericDate: '08/04/2026',
    nextDisabled: false,
    goToPreviousDay: vi.fn(),
    goToToday: vi.fn(),
    goToNextDay: vi.fn(),
  }),
}))

const mountedTrees: RenderedTree[] = []

function successfulExecution(options: unknown) {
  const mutation = options as {
    type: string
    payload: { habitIds?: string[]; items?: { habitId: string }[] } | null
  }
  if (mutation.type === 'bulkCascadeDeleteHabits') return Promise.resolve(undefined)
  const habitIds = mutation.payload?.habitIds
    ?? mutation.payload?.items?.map((item) => item.habitId)
    ?? []
  return Promise.resolve({
    results: habitIds.map((habitId, index) => ({
      index,
      habitId,
      status: 'Success' as const,
      logId: mutation.type === 'bulkLogHabits' ? `log-${index}` : undefined,
      error: null,
    })),
  })
}

async function renderToday(): Promise<void> {
  await TestRenderer.act(async () => {
    mountedTrees.push(TestRenderer.create(<TodayScreen />) as unknown as RenderedTree)
    await Promise.resolve()
  })
}

async function press(handler: unknown): Promise<void> {
  if (typeof handler !== 'function') throw new Error('Expected a production action handler')
  await TestRenderer.act(async () => {
    handler()
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  while (mountedTrees.length > 0) {
    void TestRenderer.act(() => mountedTrees.pop()?.unmount())
  }
})

describe('Hoje production bulk action path', () => {
  beforeEach(() => {
    mocks.bulkBarProps = null
    mocks.modalProps = null
    mocks.showToast.mockReset()
    mocks.settleBulkHabitResolutions.mockReset()
    mocks.invalidateQueries.mockReset().mockResolvedValue(undefined)
    mocks.execute.mockReset().mockImplementation(successfulExecution)
    mocks.store.clearSelection = mocks.clearSelection
    mocks.clearSelection.mockReset()
    mocks.store.selectedHabitIds = new Set(['habit-1'])
  })

  it('consumes rejected log and skip executions without an unhandled rejection', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    await renderToday()

    try {
      mocks.execute.mockRejectedValueOnce(new TypeError('Network request failed'))
      await press(mocks.bulkBarProps?.onLog)
      mocks.execute.mockRejectedValueOnce(new TypeError('Network request failed'))
      await press(mocks.bulkBarProps?.onSkip)
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      process.removeListener('unhandledRejection', unhandledRejection)
    }

    expect(unhandledRejection).not.toHaveBeenCalled()
    expect(mocks.showToast).toHaveBeenCalledTimes(2)
    expect(mocks.showToast).toHaveBeenNthCalledWith(1, {
      kind: 'neutral',
      message: 'habits.bulkBar.connectionRefreshed',
    })
    expect(mocks.showToast).toHaveBeenNthCalledWith(2, {
      kind: 'neutral',
      message: 'habits.bulkBar.connectionRefreshed',
    })
    expect(mocks.showToast.mock.calls.every(([toast]) => toast.onAction === undefined)).toBe(true)
    expect(mocks.clearSelection).toHaveBeenCalledTimes(2)
    expect(mocks.settleBulkHabitResolutions).not.toHaveBeenCalled()
    expect(mocks.invalidateQueries).toHaveBeenCalled()
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'bulkLogHabits',
    }))
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'bulkSkipHabits',
    }))
  })

  it('consumes a rejected delete execution and closes after refreshing', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    await renderToday()

    await press(mocks.bulkBarProps?.onDelete)
    try {
      mocks.execute.mockRejectedValueOnce(new TypeError('Network request failed'))
      await press(mocks.modalProps?.onConfirmBulkDelete)
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      process.removeListener('unhandledRejection', unhandledRejection)
    }

    expect(unhandledRejection).not.toHaveBeenCalled()
    expect(mocks.showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.connectionRefreshed',
    })
    expect(mocks.showToast.mock.calls[0]?.[0]?.onAction).toBeUndefined()
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(false)
    expect(mocks.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })

  it('reports offline log and skip refusals without clearing selection', async () => {
    await renderToday()

    mocks.execute.mockRejectedValueOnce(new mocks.OfflineMutationPreflightError())
    await press(mocks.bulkBarProps?.onLog)
    mocks.execute.mockRejectedValueOnce(new mocks.OfflineMutationPreflightError())
    await press(mocks.bulkBarProps?.onSkip)

    expect(mocks.showToast).toHaveBeenCalledTimes(2)
    expect(mocks.showToast).toHaveBeenNthCalledWith(1, {
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(mocks.showToast).toHaveBeenNthCalledWith(2, {
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(mocks.clearSelection).not.toHaveBeenCalled()
    expect(mocks.settleBulkHabitResolutions).not.toHaveBeenCalled()
  })

  it('keeps the delete confirmation and selection after an offline refusal, then retries online', async () => {
    await renderToday()

    await press(mocks.bulkBarProps?.onDelete)
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(true)

    mocks.execute.mockRejectedValueOnce(new mocks.OfflineMutationPreflightError())
    await press(mocks.modalProps?.onConfirmBulkDelete)
    expect(mocks.showToast).toHaveBeenCalledWith({
      kind: 'neutral',
      message: 'habits.bulkBar.offlineFailure',
    })
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(true)
    expect(mocks.modalProps?.selectedCount).toBe(1)
    expect(mocks.clearSelection).not.toHaveBeenCalled()

    await press(mocks.modalProps?.onConfirmBulkDelete)
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(false)
    expect(mocks.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('keeps every online path successful and clears selection after each action', async () => {
    await renderToday()

    await press(mocks.bulkBarProps?.onLog)
    await press(mocks.bulkBarProps?.onSkip)
    await press(mocks.bulkBarProps?.onDelete)
    await press(mocks.modalProps?.onConfirmBulkDelete)

    expect(mocks.settleBulkHabitResolutions).toHaveBeenNthCalledWith(1, [
      { habitId: 'habit-1', mode: 'log' },
    ])
    expect(mocks.settleBulkHabitResolutions).toHaveBeenNthCalledWith(2, [
      { habitId: 'habit-1', mode: 'skip' },
    ])
    expect(mocks.clearSelection).toHaveBeenCalledTimes(3)
    expect(mocks.modalProps?.showBulkDeleteConfirm).toBe(false)
    expect(mocks.showToast).not.toHaveBeenCalled()
  })
})
