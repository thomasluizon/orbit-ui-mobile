// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { useNotifications } from '@/hooks/use-notifications'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  appStateListener: null as ((state: string) => void) | null,
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn(),
  createQueuedAck: vi.fn(),
  isQueuedResult: vi.fn(),
  queueOrExecute: vi.fn(),
}))
vi.mock('react-native', async () => {
  const actual = await import('../../test-mocks/react-native')
  return {
    ...actual,
    AppState: {
      currentState: 'active',
      addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        mocks.appStateListener = listener
        return { remove: vi.fn(() => { mocks.appStateListener = null }) }
      }),
    },
  }
})

function mountNotifications(): { unmount: () => void } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Probe() {
    useNotifications()
    return null
  }
  let renderer: { unmount: () => void } | undefined
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(QueryClientProvider, { client }, React.createElement(Probe)),
    )
  })
  return { unmount: () => TestRenderer.act(() => renderer?.unmount()) }
}

describe('mobile notification polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'))
    focusManager.setFocused(true)
    mocks.apiClient.mockReset()
    mocks.apiClient.mockResolvedValue({ items: [], unreadCount: 0 })
  })

  afterEach(() => {
    focusManager.setFocused(undefined)
    vi.useRealTimers()
  })

  it('limits requests during one visible idle hour', async () => {
    const handle = mountNotifications()
    await TestRenderer.act(async () => {})
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(5)
    handle.unmount()
  })

  it('keeps a fresh list across five foregrounds within one minute', async () => {
    const handle = mountNotifications()
    await TestRenderer.act(async () => {})
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)

    for (let foreground = 0; foreground < 5; foreground += 1) {
      await TestRenderer.act(async () => {
        focusManager.setFocused(false)
        mocks.appStateListener?.('background')
        await vi.advanceTimersByTimeAsync(5 * 1000)
        focusManager.setFocused(true)
        mocks.appStateListener?.('active')
      })
    }

    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    handle.unmount()
  })

  it('refetches a stale list on foreground', async () => {
    const handle = mountNotifications()
    await TestRenderer.act(async () => {})
    await TestRenderer.act(async () => {
      focusManager.setFocused(false)
      mocks.appStateListener?.('background')
      await vi.advanceTimersByTimeAsync(61 * 1000)
      focusManager.setFocused(true)
      mocks.appStateListener?.('active')
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    handle.unmount()
  })

  it('pauses polling while the app is backgrounded', async () => {
    const handle = mountNotifications()
    await TestRenderer.act(async () => {})
    await TestRenderer.act(async () => {
      focusManager.setFocused(false)
      mocks.appStateListener?.('background')
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    handle.unmount()
  })
})
