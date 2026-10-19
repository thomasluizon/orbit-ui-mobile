import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import { createApiClientError } from '@orbit/shared/utils'

import { useBilling } from '@/hooks/use-billing'

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
    mocks.apiClient.mockRejectedValue(createApiClientError(
      404,
      { error: 'This account has no active subscription.' },
      'Request failed: 404',
    ))

    useBilling(true)
    await expect(mocks.state.lastOptions?.queryFn()).resolves.toBeNull()
  })

  it.each([401, 403, 429, 500])('rethrows billing errors with status %i', async (status) => {
    const error = createApiClientError(status, { error: 'Upstream error 404' }, `Request failed: ${status}`)
    mocks.apiClient.mockRejectedValue(error)

    useBilling(true)
    await expect(mocks.state.lastOptions?.queryFn()).rejects.toBe(error)
  })

  it('rethrows network errors', async () => {
    const error = new TypeError('Network request failed')
    mocks.apiClient.mockRejectedValue(error)

    useBilling(true)
    await expect(mocks.state.lastOptions?.queryFn()).rejects.toBe(error)
  })
})
