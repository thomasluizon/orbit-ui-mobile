import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '@/hooks/use-media-query'

describe('useMediaQuery', () => {
  let listeners: Map<string, (e: MediaQueryListEvent) => void>
  let matchResults: Map<string, boolean>

  beforeEach(() => {
    listeners = new Map()
    matchResults = new Map()

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: matchResults.get(query) ?? false,
      addEventListener: (_event: string, handler: (e: MediaQueryListEvent) => void) => {
        listeners.set(query, handler)
      },
      removeEventListener: vi.fn(),
    }))
  })

  it('returns false by default when query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 640px)'))
    expect(result.current).toBe(false)
  })

  it('returns true when query matches', () => {
    matchResults.set('(min-width: 640px)', true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 640px)'))
    expect(result.current).toBe(true)
  })

  it('updates when media query changes', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 640px)'))
    expect(result.current).toBe(false)

    act(() => {
      const handler = listeners.get('(min-width: 640px)')
      handler?.({ matches: true } as MediaQueryListEvent)
    })

    expect(result.current).toBe(true)
  })
})
