import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingDetails } from '@orbit/shared/types/subscription'

const mocks = vi.hoisted(() => {
  const state = {
    data: undefined as BillingDetails | null | undefined,
    lastOptions: null as {
      enabled?: boolean
      queryFn: () => Promise<BillingDetails | null>
    } | null,
  }

  return {
    state,
    apiClient: vi.fn(),
    useQuery: vi.fn((options: { enabled?: boolean; queryFn: () => Promise<BillingDetails | null> }) => {
      state.lastOptions = options
      return {
        data: state.data,
        isLoading: false,
        isError: false,
        error: null,
      }
    }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

import { useBilling } from '@/hooks/use-billing'

describe('mobile useBilling', () => {
  beforeEach(() => {
    mocks.state.data = undefined
    mocks.state.lastOptions = null
    mocks.apiClient.mockReset()
    mocks.useQuery.mockClear()
  })

  it('passes the enabled flag through to the query config', () => {
    const result = useBilling(true)

    expect(mocks.state.lastOptions?.enabled).toBe(true)
    expect(result.billing).toBeNull()
  })

  it('returns null for 404 billing errors', async () => {
    mocks.apiClient.mockRejectedValue(new Error('Request failed with status 404'))

    useBilling(true)
    await expect(mocks.state.lastOptions?.queryFn()).resolves.toBeNull()
  })

  it('rethrows non-404 billing errors', async () => {
    mocks.apiClient.mockRejectedValue(new Error('Request failed with status 500'))

    useBilling(true)
    await expect(mocks.state.lastOptions?.queryFn()).rejects.toThrow('500')
  })
})
