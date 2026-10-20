import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'

describe('useIsWideDesktop', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: window.innerWidth >= Number(query.match(/\d+/)?.[0]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  it.each([[900, false], [1024, true]] as const)('%ipx yields %s', (width, expected) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    const { result } = renderHook(() => useIsWideDesktop())
    expect(result.current).toBe(expected)
  })
})
