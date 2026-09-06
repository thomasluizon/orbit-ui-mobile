import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOfflineSyncStore } from '@/stores/offline-sync-store'

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
    allowFlush: true,
    foreground: undefined as ((state: string) => void) | undefined,
    resolveConnectivity: undefined as ((value: boolean) => void) | undefined,
  }

  const flushQueuedMutations = vi.fn(
    async (): Promise<{
      succeeded: number
      failed: number
      remaining: number
      droppedMutations: { id: string; type: string; lastError: string | null }[]
    }> => {
      state.queueCount = 0
      await Promise.resolve()
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
      addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        mocks.state.foreground = listener
        return ({
        remove: () => {},
      }) }),
    },
  }
})

vi.mock('@/lib/offline-queue', () => ({
  enqueue: mocks.enqueue,
  subscribeQueueCount: mocks.subscribeQueueCount,
  count: mocks.count,
  getAll: vi.fn(() => []),
}))

vi.mock('@/lib/offline-mutations', () => ({
  flushQueuedMutations: mocks.flushQueuedMutations,
  canAutoFlush: () => mocks.state.allowFlush,
  getMutationScope: mocks.getMutationScope,
}))

vi.mock('@/lib/offline-runtime', () => ({
  getCurrentConnectivity: mocks.getCurrentConnectivity,
  setCachedConnectivity: vi.fn(),
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
  useOffline(true)
  return null
}

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

describe('useOffline', () => {
  beforeEach(() => {
    useOfflineSyncStore.setState({ isFlushing: false, drops: [] })
    mocks.state.allowFlush = true
    mocks.state.queueCount = 0
    mocks.state.queueListener = undefined
    mocks.state.netInfoListener = undefined
    mocks.state.resolveConnectivity = undefined
    mocks.flushQueuedMutations.mockClear()
    mocks.flushQueuedMutations.mockImplementation(async () => {
      mocks.state.queueCount = 0
      await Promise.resolve()
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

  it('flushes once, not on a spin loop, when the queue never drains', async () => {
    mocks.state.queueCount = 1
    mocks.flushQueuedMutations.mockImplementation(async () => {
      useOfflineSyncStore.setState({ isFlushing: true })
      if (mocks.flushQueuedMutations.mock.calls.length >= 5) mocks.state.queueCount = 0
      await Promise.resolve()
      mocks.state.allowFlush = false
      useOfflineSyncStore.setState({ isFlushing: false })
      return { succeeded: 0, failed: 0, remaining: mocks.state.queueCount, droppedMutations: [] }
    })
    await mountHook()
    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(true)
      mocks.state.queueListener?.(1)
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
    await TestRenderer.act(async () => {
      for (let index = 0; index < 20; index += 1) mocks.state.foreground?.('active')
      await Promise.resolve()
    })
    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
  })

  it('connectivity-only consumers never start a flush', async () => {
    function ConnectivityConsumer() { useOffline(); return null }
    mocks.state.queueCount = 2
    await TestRenderer.act(async () => {
      TestRenderer.create(<ConnectivityConsumer />)
      await Promise.resolve()
    })
    expect(mocks.flushQueuedMutations).not.toHaveBeenCalled()
  })

})
