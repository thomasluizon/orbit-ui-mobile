import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { useWrapped, useWrappedStory } from '@/hooks/use-wrapped'

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  reportEvent: vi.fn(),
  fetchJson: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: mocks.fetchJson }))
vi.mock('@/hooks/use-gamification', () => ({
  useReportEvent: () => ({ mutate: mocks.reportEvent }),
}))

describe('web useWrapped', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  beforeEach(() => {
    mocks.useQuery.mockReset()
    mocks.reportEvent.mockReset()
    mocks.fetchJson.mockReset()
  })

  it('requests and caches a notified closed month separately from the current month', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app-staging.useorbit.org')
    mocks.fetchJson.mockResolvedValue(createMockRecap({ period: 'month' }))
    mocks.useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderHook(() => useWrapped('month', { closedMonth: { year: 2024, month: 2 } }))
    const options = mocks.useQuery.mock.calls[0]?.[0]
    expect(options.queryKey).toEqual(['gamification', 'recap', 'month', 2024, 2])
    await expect(options.queryFn()).resolves.toMatchObject({
      period: 'month',
      shareDeepLink: 'https://app-staging.useorbit.org/r/ABC123?recap=week',
    })
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/gamification/recap?period=month&year=2024&month=2')
  })

  it('keeps an all-zero recap empty', () => {
    mocks.useQuery.mockReturnValue({
      data: createMockRecap({
        goalCompletions: 0,
        metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }),
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useWrapped('month'))
    expect(result.current.isEmpty).toBe(true)
  })

  it('keeps Start enabled and reaches the goals slide for a goal-only recap', () => {
    mocks.useQuery.mockReturnValue({
      data: createMockRecap({
        goalCompletions: 4,
        metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }),
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useWrapped('month'))
    expect(result.current.isEmpty).toBe(false)
    expect(result.current.slides.at(-1)?.id).toBe('share')
    expect(result.current.slides).toContainEqual({ id: 'goals', closedGoals: 4 })
  })
})

describe('web useWrappedStory', () => {
  it('clamps to the last slide when a refetch removes the top habit', () => {
    const slides = buildWrappedSlides(createMockRecap())
    const shorterSlides = buildWrappedSlides(createMockRecap({
      metrics: createMockRetrospectiveMetrics({ topHabits: [] }),
    }))
    expect(slides).toHaveLength(8)
    expect(shorterSlides).toHaveLength(7)
    const { result, rerender } = renderHook(
      ({ slideCount }) => useWrappedStory(slideCount),
      { initialProps: { slideCount: slides.length } },
    )
    for (let step = 0; step < slides.length - 1; step += 1) {
      act(() => result.current.next())
    }
    expect(result.current.index).toBe(7)

    rerender({ slideCount: shorterSlides.length })

    expect(result.current.index).toBe(6)
    expect(result.current.isLast).toBe(true)
    expect(shorterSlides[result.current.index]?.id).toBe('share')
    act(() => result.current.prev())
    expect(result.current.index).toBe(5)
    expect(result.current.isLast).toBe(false)
    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current.index).toBe(6)

    rerender({ slideCount: 0 })
    expect(result.current.index).toBe(0)
    expect(result.current.isFirst).toBe(true)
    act(() => result.current.prev())
    act(() => result.current.next())
    expect(result.current.index).toBe(0)
    rerender({ slideCount: slides.length })
    expect(result.current.index).toBe(0)
    expect(result.current.isLast).toBe(false)
  })
})
