import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOffline } from '@/hooks/use-offline'

const TestRenderer = require('react-test-renderer')

type NetInfoState = {
  isConnected: boolean | null
  isInternetReachable: boolean | null
}

type ReplayState = 'idle' | 'flushing' | 'waiting-on-backoff' | 'stopped-for-auth'

const mocks = vi.hoisted(() => {
  const state = {
    netInfoListener: undefined as ((value: NetInfoState) => void) | undefined,
    appStateListener: undefined as ((value: 'active' | 'background' | 'inactive') => void) | undefined,
    queueListener: undefined as ((count: number) => void) | undefined,
    queueCount: 0,
    allowFlush: true,
    replayState: 'idle' as ReplayState,
    replayStateListener: undefined as ((state: ReplayState) => void) | undefined,
    resolveConnectivity: undefined as ((value: boolean) => void) | undefined,
    hookIsOnline: true,
    hookPendingCount: 0,
  }

  const flushQueuedMutations = vi.fn(async () => {
    state.queueCount = 0
    await Promise.resolve()
    return { succeeded: 1, failed: 0, remaining: 0, droppedMutations: [] }
  })
  const resumeOfflineReplay = vi.fn(() => {
    state.allowFlush = true
    state.replayState = 'idle'
    state.replayStateListener?.('idle')
  })

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
    resumeOfflineReplay,
    enqueue,
    subscribeQueueCount,
    count,
    getCurrentConnectivity,
    captureError: vi.fn(),
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
      addEventListener: vi.fn(
        (_event: string, listener: (value: 'active' | 'background' | 'inactive') => void) => {
          mocks.state.appStateListener = listener
          return { remove: () => { mocks.state.appStateListener = undefined } }
        },
      ),
    },
  }
})

vi.mock('@/lib/offline-queue', () => ({
  enqueue: mocks.enqueue,
  subscribeQueueCount: mocks.subscribeQueueCount,
  count: mocks.count,
  getAll: () => [],
}))

vi.mock('@/lib/offline-runtime', () => ({
  getCurrentConnectivity: mocks.getCurrentConnectivity,
  setCachedConnectivity: vi.fn(),
}))

vi.mock('@/lib/offline-mutations', () => ({
  flushQueuedMutations: mocks.flushQueuedMutations,
  canAutoFlush: () => mocks.state.allowFlush,
  getReplayState: () => mocks.state.replayState,
  subscribeReplayState: (listener: typeof mocks.state.replayStateListener) => {
    mocks.state.replayStateListener = listener
    listener?.(mocks.state.replayState)
    return () => { mocks.state.replayStateListener = undefined }
  },
  resumeOfflineReplay: mocks.resumeOfflineReplay,
}))

vi.mock('@/lib/sentry', () => ({
  captureError: mocks.captureError,
}))

function HookHarness() {
  const { isOnline, pendingCount } = useOffline(true)
  mocks.state.hookIsOnline = isOnline
  mocks.state.hookPendingCount = pendingCount
  return null
}

describe('useOffline', () => {
  beforeEach(() => {
    mocks.state.allowFlush = true
    mocks.state.replayState = 'idle'
    mocks.state.replayStateListener = undefined
    mocks.state.queueCount = 0
    mocks.state.queueListener = undefined
    mocks.state.netInfoListener = undefined
    mocks.state.appStateListener = undefined
    mocks.state.resolveConnectivity = undefined
    mocks.state.hookIsOnline = true
    mocks.state.hookPendingCount = 0
    mocks.flushQueuedMutations.mockClear()
    mocks.resumeOfflineReplay.mockClear()
    mocks.flushQueuedMutations.mockImplementation(async () => {
      mocks.state.queueCount = 0
      await Promise.resolve()
      return { succeeded: 1, failed: 0, remaining: 0, droppedMutations: [] }
    })
    mocks.enqueue.mockClear()
    mocks.subscribeQueueCount.mockClear()
    mocks.count.mockClear()
    mocks.getCurrentConnectivity.mockClear()
    mocks.captureError.mockClear()
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

  it('does not flush a persisted queue before connectivity hydration resolves offline', async () => {
    mocks.state.queueCount = 2

    await mountHook()

    TestRenderer.act(() => mocks.state.appStateListener?.('active'))
    expect(mocks.flushQueuedMutations).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(false)
      await Promise.resolve()
    })

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
      mocks.state.netInfoListener?.({ isConnected: true, isInternetReachable: true })
      await Promise.resolve()
    })

    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
    expect(mocks.count).toHaveBeenCalled()
  })

  it('does not spin while a failed mutation waits for its scheduled retry', async () => {
    mocks.state.queueCount = 1
    mocks.flushQueuedMutations.mockImplementation(async () => {
      mocks.state.allowFlush = false
      await Promise.resolve()
      return { succeeded: 0, failed: 1, remaining: mocks.state.queueCount, droppedMutations: [] }
    })

    await mountHook()
    await TestRenderer.act(async () => {
      mocks.state.netInfoListener?.({ isConnected: true, isInternetReachable: true })
      mocks.state.queueListener?.(1)
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
  })

  it('does not re-enter when a rejected flush leaves pending work behind the retry gate', async () => {
    mocks.state.queueCount = 1
    mocks.flushQueuedMutations
      .mockImplementationOnce(() => {
        mocks.state.allowFlush = false
        mocks.state.replayState = 'waiting-on-backoff'
        mocks.state.replayStateListener?.('waiting-on-backoff')
        return Promise.reject(new Error('Queue bookkeeping failed'))
      })
      .mockImplementationOnce(() => {
        mocks.state.queueCount = 0
        return Promise.resolve({ succeeded: 0, failed: 0, remaining: 0, droppedMutations: [] })
      })

    await mountHook()
    await TestRenderer.act(async () => {
      mocks.state.netInfoListener?.({ isConnected: true, isInternetReachable: true })
      mocks.state.queueListener?.(1)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
    expect(mocks.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Queue bookkeeping failed' }),
    )
  })

  it('resumes retained authenticated work when connectivity returns', async () => {
    mocks.state.queueCount = 1
    mocks.state.allowFlush = false
    mocks.state.replayState = 'stopped-for-auth'
    await mountHook()

    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(false)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      mocks.state.netInfoListener?.({ isConnected: true, isInternetReachable: true })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.resumeOfflineReplay).toHaveBeenCalledTimes(1)
    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
  })

  it('resumes retained authenticated work when the app returns to foreground', async () => {
    mocks.state.queueCount = 1
    mocks.state.allowFlush = false
    mocks.state.replayState = 'stopped-for-auth'
    mocks.getCurrentConnectivity.mockResolvedValueOnce(true)
    await mountHook()
    await TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await TestRenderer.act(async () => {
      mocks.state.queueListener?.(1)
      await Promise.resolve()
    })
    expect(mocks.state.hookIsOnline).toBe(true)
    expect(mocks.state.hookPendingCount).toBe(1)
    expect(mocks.state.appStateListener).toBeTypeOf('function')
    await TestRenderer.act(async () => {
      mocks.state.appStateListener?.('active')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.resumeOfflineReplay).toHaveBeenCalledTimes(1)
    expect(mocks.flushQueuedMutations).toHaveBeenCalledTimes(1)
  })

  it('keeps connectivity-only consumers from starting a queue flush', async () => {
    function ConnectivityConsumer() {
      useOffline()
      return null
    }

    await TestRenderer.act(async () => {
      TestRenderer.create(<ConnectivityConsumer />)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      mocks.state.resolveConnectivity?.(true)
      mocks.state.queueListener?.(1)
      await Promise.resolve()
    })

    expect(mocks.flushQueuedMutations).not.toHaveBeenCalled()
  })
})
