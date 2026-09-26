import { beforeEach, expect, it, vi } from 'vitest'
import { openAccountEventStream } from '@/lib/account-event-stream'

const mocks = vi.hoisted(() => ({
  expoFetch: vi.fn(),
  getToken: vi.fn(),
  refreshSessionToken: vi.fn(),
}))
vi.mock('expo/fetch', () => ({ fetch: mocks.expoFetch }))
vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))
vi.mock('@/stores/auth-store', () => ({ refreshSessionToken: mocks.refreshSessionToken }))

beforeEach(() => {
  mocks.expoFetch.mockReset()
  mocks.getToken.mockReset()
  mocks.refreshSessionToken.mockReset()
})

it('replays with Last-Event-ID after refreshing an expired bearer token', async () => {
  mocks.getToken.mockResolvedValue('stale-token')
  mocks.refreshSessionToken.mockResolvedValue('fresh-token')
  mocks.expoFetch.mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 200 })
  await openAccountEventStream(new AbortController().signal, 'epoch.3')
  expect(mocks.refreshSessionToken).toHaveBeenCalledWith({ clearOnFailure: false })
  expect(mocks.expoFetch).toHaveBeenNthCalledWith(2,
    'https://api.useorbit.org/api/events',
    expect.objectContaining({ headers: {
      Authorization: 'Bearer fresh-token', 'Last-Event-ID': 'epoch.3',
    } }),
  )
})
