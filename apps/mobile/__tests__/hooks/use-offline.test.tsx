import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOffline } from '@/hooks/use-offline'

const TestRenderer = require('react-test-renderer')

type NetInfoState = {
  isConnected: boolean | null
  isInternetReachable: boolean | null
}

const mocks = vi.hoisted(() => {
  const state = {
    netInfoListener: undefined as ((value: NetInfoState) => void) | undefined,
    queueListener: undefined as ((count: number) => void) | undefined,
    queueCount: 0,
    resolveConnectivity: undefined as ((value: boolean) => void) | undefined,
  }

  const flushQueuedMutations = vi.fn(
    async (): Promise<{
      succeeded: number
      failed: number
      remaining: number
      droppedMutations: Array<{ id: string; type: string; lastError: string | null }>
    }> => {
      state.queueCount = 0
      return { succeeded: 1, failed: 0, remaining: 0, droppedMutations: [] }
    },
  )

  const getMutationScope = vi.fn((_type: string): string => 'habits')
  const showError = vi.fn()

  const enqueue = vi.fn()
  const subscribeQueueCount = vi.fn((listener: (count: number) => void) => {
    state.queueListener = listener
    listener(state.queueCount)
    return () => {
      state.queueListener = undefined
    }
  })
  const count = vi.fn(() => state.queueCount)
  const getCurrentConnectivity = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        state.resolveConnectivity = resolve
      }),
  )

  return {
    state,
    flushQueuedMutations,
    getMutationScope,
    showError,
    enqueue,
    subscribeQueueCount,
    count,
    getCurrentConnectivity,
  }
})

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: mocks.getCurrentConnectivity,
    addEventListener: vi.fn((listener: (state: NetInfoState) => void) => {
      mocks.state.netInfoListener = listener
      return () => {
        mocks.state.netInfoListener = undefined
      }
    }),
  },
}))

vi.mock('react-native', async () => {
  const actual = await import('../../test-mocks/react-native')

  return {
    ...actual,
    AppState: {
      addEventListener: vi.fn(() => ({
        remove: () => {},
      })),
    },
  }
})

vi.mock('@/lib/offline-queue', () => ({
  enqueue: mocks.enqueue,
  subscribeQueueCount: mocks.subscribeQueueCount,
  count: mocks.count,
}))

vi.mock('@/lib/offline-mutations', () => ({
  flushQueuedMutations: mocks.flushQueuedMutations,
  getMutationScope: mocks.getMutationScope,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.item ? `${key}:${String(options.item)}` : key,
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mocks.showError,
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showQueued: vi.fn(),
    showToast: vi.fn(),
  }),
}))

function HookHarness() {
  useOffline()
  return null
}

describe('useOffline', () => {
  beforeEach(() => {
    mocks.state.queueCount = 0
    mocks.state.queueListener = undefined
    mocks.state.netInfoListener = undefined
    mocks.state.resolveConnectivity = undefined
    mocks.flushQueuedMutations.mockClear()
    mocks.flushQueuedMutations.mockImplementation(async () => {
      mocks.state.queueCount = 0
      return { succeeded: 1, failed: 0, remaining: 0, droppedMutations: [] }
    })
    mocks.getMutationScope.mockClear()
    mocks.showError.mockClear()
    mocks.enqueue.mockClear()
    mocks.subscribeQueueCount.mockClear()
    mocks.count.mockClear()
    mocks.getCurrentConnectivity.mockClear()
  })

  async function mountHook() {
    await TestRenderer.act(async () => {
      TestRenderer.create(<HookHarness />)
      await Promise.resolve()
    })
  }

  it('hydrates the queue subscription without flushing while offline', async () => {
    await mountHook()

    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(false)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.state.queueListener?.(2)
      await Promise.resolve()
    })

    expect(mocks.subscribeQueueCount).toHaveBeenCalledTimes(1)
    expect(mocks.flushQueuedMutations).not.toHaveBeenCalled()
  })

  it('flushes queued mutations after connectivity returns', async () => {
    await mountHook()

    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(false)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.state.queueListener?.(1)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.state.netInfoListener?.({
        isConnected: true,
        isInternetReachable: true,
      })
      await Promise.resolve()
    })

    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
    expect(mocks.count).toHaveBeenCalled()
  })

  it('raises one error toast per dropped mutation after a flush', async () => {
    mocks.getMutationScope.mockImplementation((type: string) =>
      type === 'createGoal' ? 'goals' : 'habits',
    )
    mocks.flushQueuedMutations.mockImplementation(async () => {
      mocks.state.queueCount = 0
      return {
        succeeded: 0,
        failed: 2,
        remaining: 0,
        droppedMutations: [
          { id: 'm1', type: 'updateHabit', lastError: '400 validation failed' },
          { id: 'm2', type: 'createGoal', lastError: '409 conflict' },
        ],
      }
    })

    await mountHook()

    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(false)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.state.queueListener?.(2)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.state.netInfoListener?.({
        isConnected: true,
        isInternetReachable: true,
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
    expect(mocks.showError).toHaveBeenCalledTimes(2)
    expect(mocks.showError).toHaveBeenNthCalledWith(
      1,
      'common.syncDropped:common.syncEntity.habits',
    )
    expect(mocks.showError).toHaveBeenNthCalledWith(
      2,
      'common.syncDropped:common.syncEntity.goals',
    )
  })

  it('shows no error toast when a flush drops nothing', async () => {
    await mountHook()

    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(false)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.state.queueListener?.(1)
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      mocks.state.netInfoListener?.({
        isConnected: true,
        isInternetReachable: true,
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
    expect(mocks.showError).not.toHaveBeenCalled()
  })
})
