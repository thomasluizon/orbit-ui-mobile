import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useOffline } from '@/hooks/use-offline'

describe('useOffline', () => {
  let onlineHandlers: Array<() => void>
  let offlineHandlers: Array<() => void>

  beforeEach(() => {
    onlineHandlers = []
    offlineHandlers = []

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

  it('updates to online on online event after being offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOffline())
    act(() => {
      onlineHandlers.forEach((h) => h())
    })
    expect(result.current.isOnline).toBe(true)
  })
})
