import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { loadInitialNotifications } from '@/lib/server-notifications'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), capture: vi.fn() }))
vi.mock('@/lib/server-fetch', () => ({ serverRenderFetch: mocks.fetch }))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.capture }))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

it('preloads the validated notification list through the server render fetch', async () => {
  const notifications = notificationsResponseSchema.parse({ items: [createMockNotification()], unreadCount: 15 })
  vi.useFakeTimers()
  mocks.fetch.mockResolvedValue(notifications)
  expect(await loadInitialNotifications(true)).toEqual({ notifications, updatedAt: Date.now() })
  expect(mocks.fetch).toHaveBeenCalledWith(API.notifications.list, {
    cache: 'no-store', signal: expect.any(AbortSignal),
  }, notificationsResponseSchema)
})

it('records the preload age when the server response is read', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  const notifications = notificationsResponseSchema.parse({ items: [createMockNotification()], unreadCount: 15 })
  let finishFetch!: (response: typeof notifications) => void
  mocks.fetch.mockReturnValue(new Promise((resolve) => { finishFetch = resolve }))
  const preload = loadInitialNotifications(true)
  vi.setSystemTime(2000)
  finishFetch(notifications)
  expect(await preload).toEqual({ notifications, updatedAt: 2000 })
})

it('does not fetch notifications without a session cookie', async () => {
  expect(await loadInitialNotifications(false)).toBeNull()
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('leaves the query unseeded and reports a failed preload', async () => {
  const error = new Error('Notifications unavailable')
  mocks.fetch.mockRejectedValue(error)
  expect(await loadInitialNotifications(true)).toBeNull()
  expect(mocks.capture).toHaveBeenCalledWith(error)
})

it('leaves the query unseeded when the server render has no usable session', async () => {
  mocks.fetch.mockResolvedValue(null)
  expect(await loadInitialNotifications(true)).toBeNull()
})
