import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRetrospective } from '@/hooks/use-retrospective'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return `${key}: ${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

// Mock getErrorMessage
vi.mock('@orbit/shared/utils', () => ({
  getErrorMessage: (err: unknown, fallback: string) => {
    if (err instanceof Error) return err.message
    return fallback
  },
}))

describe('useRetrospective', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('starts with default state', () => {
    const { result } = renderHook(() => useRetrospective())

    expect(result.current.retrospective).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.fromCache).toBe(false)
    expect(result.current.period).toBe('week')
  })

  it('generates retrospective on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          retrospective: 'You had a great week! Completed 90% of habits.',
          fromCache: false,
        }),
    })

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.retrospective).toBe('You had a great week! Completed 90% of habits.')
    expect(result.current.fromCache).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('detects cached response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          retrospective: 'Cached result',
          fromCache: true,
        }),
    })

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.fromCache).toBe(true)
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'AI service down' }),
    })

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.retrospective).toBeNull()
    expect(result.current.error).toBeTruthy()
    expect(result.current.isLoading).toBe(false)
  })

  it('handles network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.retrospective).toBeNull()
    expect(result.current.error).toBe('Network error')
    expect(result.current.isLoading).toBe(false)
  })

  it('allows changing period', () => {
    const { result } = renderHook(() => useRetrospective())

    act(() => {
      result.current.setPeriod('month')
    })

    expect(result.current.period).toBe('month')
  })

  it('passes period to API call', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ retrospective: 'Monthly review', fromCache: false }),
    })

    const { result } = renderHook(() => useRetrospective())

    act(() => {
      result.current.setPeriod('quarter')
    })

    await act(async () => {
      await result.current.generate()
    })

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('period=quarter')
    expect(calledUrl).toContain('language=en')
  })

  it('replaces old result with new generation', async () => {
    // First generate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ retrospective: 'First result', fromCache: false }),
    })

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })
    expect(result.current.retrospective).toBe('First result')

    // Second generate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ retrospective: 'Second result', fromCache: true }),
    })

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.retrospective).toBe('Second result')
    expect(result.current.fromCache).toBe(true)
  })
})
