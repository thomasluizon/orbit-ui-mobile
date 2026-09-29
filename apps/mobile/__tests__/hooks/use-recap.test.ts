import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { useRecap } from '@/hooks/use-recap'

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

describe('mobile useRecap', () => {
  beforeEach(() => {
    mocks.useQuery.mockReset().mockReturnValue({ data: undefined })
    mocks.apiClient.mockReset()
  })

  it('builds the recap query key, period URL, and enabled flag', async () => {
    mocks.apiClient.mockResolvedValue(createMockRecap())
    useRecap('month', true)

    const options = mocks.useQuery.mock.calls[0]![0]
    expect(options.queryKey).toEqual(['gamification', 'recap', 'month'])
    expect(options.enabled).toBe(true)

    const recap = await options.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith('/api/gamification/recap?period=month')
    expect(recap.shareDeepLink).toBe('https://app.useorbit.org/r/ABC123?recap=week')
  })

  it('defaults to disabled when no enabled flag is passed', () => {
    useRecap('week')
    expect(mocks.useQuery.mock.calls[0]![0].enabled).toBe(false)
  })
})
