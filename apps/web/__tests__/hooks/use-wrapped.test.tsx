import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'
import { useWrapped } from '@/hooks/use-wrapped'

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
