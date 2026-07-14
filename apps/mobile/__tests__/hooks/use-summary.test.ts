import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { getDailySummaryTimeBucket } from '@orbit/shared/utils'
import { useSummary } from '@/hooks/use-summary'

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

interface SummaryQueryOptions {
  queryKey: readonly unknown[]
  queryFn: () => Promise<{ summary: string; fromCache: boolean }>
  enabled: boolean
  refetchInterval: () => number
  refetchOnWindowFocus: boolean
}

function firstQueryOptions(): SummaryQueryOptions {
  const call = mocks.useQuery.mock.calls[0]
  if (!call) throw new Error('useQuery was not called')
  return call[0] as SummaryQueryOptions
}

const baseInput = {
  date: '2026-07-14',
  locale: 'en',
  hasProAccess: true,
  aiSummaryEnabled: true,
}

describe('mobile useSummary', () => {
  beforeEach(() => {
    mocks.useQuery.mockReset().mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() })
    mocks.apiClient.mockReset().mockResolvedValue({ summary: 'You crushed it', fromCache: false })
  })

  it('builds the bucketed query key and fetches the day summary through apiClient', async () => {
    useSummary(baseInput)

    const options = firstQueryOptions()
    expect(options.queryKey).toEqual(
      habitKeys.summary('2026-07-14', '2026-07-14', 'en', getDailySummaryTimeBucket()),
    )
    expect(options.enabled).toBe(true)
    expect(options.refetchOnWindowFocus).toBe(false)

    const result = await options.queryFn()
    expect(result).toEqual({ summary: 'You crushed it', fromCache: false })
    const requestedUrl = mocks.apiClient.mock.calls[0]?.[0] as string
    expect(requestedUrl).toContain('/api/habits/summary?')
    expect(requestedUrl).toContain('dateFrom=2026-07-14')
    expect(requestedUrl).toContain('dateTo=2026-07-14')
    expect(requestedUrl).toContain('language=en')
  })

  it('disables the query when the user lacks pro access', () => {
    useSummary({ ...baseInput, hasProAccess: false })
    expect(firstQueryOptions().enabled).toBe(false)
  })

  it('disables the query when the AI summary preference is off', () => {
    useSummary({ ...baseInput, aiSummaryEnabled: false })
    expect(firstQueryOptions().enabled).toBe(false)
  })

  it('disables the query when no date is provided', () => {
    useSummary({ ...baseInput, date: '' })
    expect(firstQueryOptions().enabled).toBe(false)
  })

  it('schedules the next refetch at a positive delay toward the next time bucket', () => {
    useSummary(baseInput)
    const delay = firstQueryOptions().refetchInterval()
    expect(typeof delay).toBe('number')
    expect(delay).toBeGreaterThan(0)
  })

  it('maps the query state onto the hook contract', () => {
    const refetch = vi.fn()
    const error = new Error('summary failed')
    mocks.useQuery.mockReturnValue({
      data: { summary: 'Nice streak', fromCache: true },
      isLoading: false,
      error,
      refetch,
    })

    const result = useSummary(baseInput)
    expect(result.summary).toBe('Nice streak')
    expect(result.error).toBe(error)
    expect(result.refetch).toBe(refetch)
  })

  it('reports a null summary while the query has no data yet', () => {
    mocks.useQuery.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() })

    const result = useSummary(baseInput)
    expect(result.summary).toBeNull()
    expect(result.isLoading).toBe(true)
  })
})
