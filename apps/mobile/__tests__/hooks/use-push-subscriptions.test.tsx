import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { usePushSubscriptions } from '@/hooks/use-push-subscriptions'

const mocks = vi.hoisted(() => {
  const queryResult: unknown = null
  return {
    apiClient: vi.fn(),
    digest: vi.fn(),
    options: null as { queryFn: () => Promise<unknown> } | null,
    queryResult,
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryFn: () => Promise<unknown> }) => {
    mocks.options = options
    return { data: mocks.queryResult, isLoading: false, isError: false, refetch: vi.fn() }
  },
}))
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: mocks.digest,
}))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: { userId: string } }) => unknown) => selector({ user: { userId: 'user-1' } }),
}))

const token = 'fcm-token-for-this-device'
const tokenHash = createHash('sha256').update(token).digest('hex')
const otherHash = createHash('sha256').update('other-token').digest('hex')

describe('usePushSubscriptions', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
    mocks.queryResult = null
    mocks.digest.mockReset().mockImplementation((_algorithm: string, input: string) =>
      Promise.resolve(createHash('sha256').update(input).digest('hex')))
  })

  it.each([
    [0, false],
    [1, true],
    [5, true],
    [1, false],
  ])('reads %i devices and current device membership %s', async (count, includesCurrent) => {
    const items = Array.from({ length: count }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      transport: 'native',
      createdAtUtc: '2026-01-01T00:00:00Z',
      endpointHash: includesCurrent && index === 0 ? tokenHash : otherHash,
    }))
    mocks.apiClient.mockResolvedValue({ items, max: 5 })

    usePushSubscriptions(token)
    const queryResult = await mocks.options?.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.notifications.subscriptions, undefined, expect.anything())
    mocks.queryResult = queryResult
    const state = usePushSubscriptions(token)
    expect(state.count).toBe(count)
    expect(state.max).toBe(5)
    expect(state.isCurrentDeviceRegistered).toBe(includesCurrent && count > 0)
  })
})
