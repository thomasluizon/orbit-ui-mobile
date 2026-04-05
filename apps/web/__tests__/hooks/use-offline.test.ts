import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockReplayQueue = vi.fn().mockResolvedValue({ synced: 5 })
const mockGetQueueSize = vi.fn().mockResolvedValue(0)

vi.mock('@/lib/offline-queue', () => ({
  replayQueue: () => mockReplayQueue(),
  getQueueSize: () => mockGetQueueSize(),
}))

import { useOffline } from '@/hooks/use-offline'

describe('useOffline', () => {
  let onlineHandlers: Array<() => void>
  let offlineHandlers: Array<() => void>

  beforeEach(() => {
    onlineHandlers = []
    offlineHandlers = []
    mockReplayQueue.mockClear()
    mockGetQueueSize.mockClear().mockResolvedValue(0)

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })

    vi.spyOn(globalThis, 'addEventListener').mockImplementation((event: string, handler: unknown) => {
      if (event === 'online') onlineHandlers.push(handler as () => void)
      if (event === 'offline') offlineHandlers.push(handler as () => void)
    })
    vi.spyOn(globalThis, 'removeEventListener').mockImplementation(() => {})
  })

  it('starts as online when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOffline())
    expect(result.current.isOnline).toBe(true)
  })

  it('reports offline when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOffline())
    expect(result.current.isOnline).toBe(false)
  })

  it('updates to offline on offline event', () => {
    const { result } = renderHook(() => useOffline())
    act(() => {
      offlineHandlers.forEach((h) => h())
    })
    expect(result.current.isOnline).toBe(false)
  })

  it('checks queue size on mount', async () => {
    mockGetQueueSize.mockResolvedValue(3)
    const { result } = renderHook(() => useOffline())
    await waitFor(() => expect(result.current.queueSize).toBe(3))
  })

  it('sync replays queue and updates queue size', async () => {
    mockReplayQueue.mockResolvedValue({ synced: 2 })
    mockGetQueueSize.mockResolvedValue(0)

    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.sync()
    })

    expect(mockReplayQueue).toHaveBeenCalled()
    expect(result.current.queueSize).toBe(0)
  })

  it('refreshQueueSize updates count', async () => {
    mockGetQueueSize.mockResolvedValueOnce(0).mockResolvedValueOnce(5)
    const { result } = renderHook(() => useOffline())

    await act(async () => {
      await result.current.refreshQueueSize()
    })

    expect(result.current.queueSize).toBe(5)
  })
})
