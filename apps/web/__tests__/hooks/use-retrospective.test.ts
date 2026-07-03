import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRetrospective } from '@/hooks/use-retrospective'
import type { RetrospectiveResponse } from '@orbit/shared/utils/retrospective'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return `${key}: ${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('@orbit/shared/utils', () => ({
  getFriendlyErrorMessage: (
    _err: unknown,
    translate: (key: string) => string,
    fallbackKey: string,
  ) => translate(fallbackKey),
}))

function buildResponse(
  overrides: Partial<RetrospectiveResponse> = {},
): RetrospectiveResponse {
  return {
    period: 'week',
    fromCache: false,
    metrics: {
      completionRate: 90,
      totalCompletions: 18,
      totalScheduled: 20,
      activeDays: 6,
      periodDays: 7,
      currentStreak: 4,
      bestStreak: 9,
      badHabitSlips: 1,
      weeklyConsistency: [80, 100, 60, 100, 40, 0, 100],
      topHabits: [],
      needsAttention: [],
    },
    narrative: {
      highlights: 'You stayed consistent.',
      missed: 'A couple of slips.',
      trends: 'Mornings are strong.',
      suggestion: 'Keep the streak alive.',
    },
    ...overrides,
  }
}

describe('useRetrospective', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('starts with default state', () => {
    const { result } = renderHook(() => useRetrospective())

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.noData).toBe(false)
    expect(result.current.fromCache).toBe(false)
    expect(result.current.period).toBe('week')
  })

  it('generates retrospective on success', async () => {
    const response = buildResponse()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    })

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.data).toEqual(response)
    expect(result.current.fromCache).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('detects cached response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(buildResponse({ fromCache: true })),
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

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('retrospective.error')
    expect(result.current.noData).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('sets noData (not error) when the period has no habits', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ errorCode: 'NO_HABITS_FOR_PERIOD' }),
    })

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.noData).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('handles network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('retrospective.error')
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
      json: () => Promise.resolve(buildResponse({ period: 'quarter' })),
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
    const first = buildResponse()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(first),
    })

    const { result } = renderHook(() => useRetrospective())

    await act(async () => {
      await result.current.generate()
    })
    expect(result.current.data).toEqual(first)

    const second = buildResponse({
      fromCache: true,
      metrics: { ...first.metrics, completionRate: 55 },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(second),
    })

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.data).toEqual(second)
    expect(result.current.fromCache).toBe(true)
  })

  it('ignores a stale generation that resolves after a newer one', async () => {
    const stale = buildResponse()
    const fresh = buildResponse({
      fromCache: true,
      metrics: { ...buildResponse().metrics, completionRate: 42 },
    })

    let resolveStale: () => void = () => {}
    const stalePromise = new Promise((resolve) => {
      resolveStale = () =>
        resolve({ ok: true, json: () => Promise.resolve(stale) })
    })
    mockFetch
      .mockReturnValueOnce(stalePromise)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(fresh) })

    const { result } = renderHook(() => useRetrospective())

    let firstCall: Promise<void> = Promise.resolve()
    await act(async () => {
      firstCall = result.current.generate()
      await result.current.generate()
    })

    expect(result.current.data).toEqual(fresh)

    await act(async () => {
      resolveStale()
      await firstCall
    })

    expect(result.current.data).toEqual(fresh)
    expect(result.current.fromCache).toBe(true)
  })
})
