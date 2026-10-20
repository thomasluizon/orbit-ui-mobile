import { createHash, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { usePushSubscriptions } from '@/hooks/use-push-subscriptions'

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  options: null as { queryFn: () => Promise<unknown> } | null,
  queryResult: null as unknown,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryFn: () => Promise<unknown> }) => {
    mocks.options = options
    return { data: mocks.queryResult, isLoading: false, isError: false, refetch: vi.fn() }
  },
}))
vi.mock('@/hooks/use-session-reset', () => ({ useAccountGeneration: () => 1 }))
vi.mock('@/lib/api-fetch', () => ({ fetchJson: mocks.fetchJson }))
vi.mock('@/hooks/use-push-notification-preferences', () => ({ isPushNotificationSupported: () => true }))

const endpoint = 'https://push.example/this-browser'
const endpointHash = createHash('sha256').update(endpoint).digest('hex')
const otherHash = createHash('sha256').update('https://push.example/other').digest('hex')

describe('usePushSubscriptions', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset()
    mocks.queryResult = null
    vi.stubGlobal('crypto', webcrypto)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint }) } }) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it.each([
    [0, false],
    [1, true],
    [5, true],
    [1, false],
  ])('reads %i devices and current device membership %s', async (count, includesCurrent) => {
    const items = Array.from({ length: count }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      transport: 'web',
      createdAtUtc: '2026-01-01T00:00:00Z',
      endpointHash: includesCurrent && index === 0 ? endpointHash : otherHash,
    }))
    mocks.fetchJson.mockResolvedValue({ items, max: 5 })

    usePushSubscriptions()
    const queryResult = await mocks.options?.queryFn()
    expect(mocks.fetchJson).toHaveBeenCalledWith(API.notifications.subscriptions, expect.anything())
    mocks.queryResult = queryResult
    const state = usePushSubscriptions()
    expect(state.count).toBe(count)
    expect(state.max).toBe(5)
    expect(state.isCurrentDeviceRegistered).toBe(includesCurrent && count > 0)
  })
})
