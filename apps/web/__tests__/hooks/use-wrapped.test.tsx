import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { useWrapped } from '@/hooks/use-wrapped'

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  fetchJson: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: mocks.fetchJson }))
vi.mock('@/hooks/use-gamification', () => ({ useReportEvent: () => ({ mutate: vi.fn() }) }))

describe('web useWrapped', () => {
  it('requests and caches a notified closed month separately from the current month', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app-staging.useorbit.org')
    mocks.fetchJson.mockResolvedValue(createMockRecap({ period: 'month' }))
    mocks.useQuery.mockReturnValue({
      data: undefined, isLoading: false, isError: false, refetch: vi.fn(),
    })
    const { unmount } = renderHook(() => useWrapped('month', { closedMonth: { year: 2024, month: 2 } }))
    const options = mocks.useQuery.mock.calls[0]?.[0]
    expect(options.queryKey).toEqual(['gamification', 'recap', 'month', 2024, 2])
    await expect(options.queryFn()).resolves.toMatchObject({
      period: 'month',
      shareDeepLink: 'https://app-staging.useorbit.org/r/ABC123?recap=week',
    })
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/gamification/recap?period=month&year=2024&month=2')
    unmount()
    vi.unstubAllEnvs()
  })
})
