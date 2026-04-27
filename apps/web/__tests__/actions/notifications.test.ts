import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-api', () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({
    Authorization: 'Bearer test-token',
  }),
  resolveServerSession: vi.fn().mockResolvedValue({
    token: 'test-token',
    expiresAt: null,
    refreshed: false,
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  subscribePush,
  unsubscribePush,
} = await import('@/app/actions/notifications')

describe('notification server actions', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  function mockApiResponse(body: unknown, status = 200) {
    mockFetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })
  }

  function mock204() {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('No body')),
    })
  }

  // -------------------------------------------------------------------------
  // markNotificationRead
  // -------------------------------------------------------------------------

  describe('markNotificationRead', () => {
    it('sends PUT to /api/notifications/:id/read', async () => {
      mock204()

      await markNotificationRead('notif-1')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/notifications/notif-1/read')
      expect(init.method).toBe('PUT')
    })

    it('includes auth headers', async () => {
      mock204()

      await markNotificationRead('notif-1')

      const [, init] = mockFetch.mock.calls[0]!
      expect(init.headers).toHaveProperty('Authorization', 'Bearer test-token')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Notification not found' }, 404)

      await expect(markNotificationRead('nonexistent')).rejects.toThrow(
        'Notification not found',
      )
    })
  })

  // -------------------------------------------------------------------------
  // markAllNotificationsRead
  // -------------------------------------------------------------------------

  describe('markAllNotificationsRead', () => {
    it('sends PUT to /api/notifications/read-all', async () => {
      mock204()

      await markAllNotificationsRead()

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/notifications/read-all')
      expect(init.method).toBe('PUT')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not authenticated' }, 401)

      await expect(markAllNotificationsRead()).rejects.toThrow(
        'Not authenticated',
      )
    })
  })

  // -------------------------------------------------------------------------
  // deleteNotification
  // -------------------------------------------------------------------------

  describe('deleteNotification', () => {
    it('sends DELETE to /api/notifications/:id', async () => {
      mock204()

      await deleteNotification('notif-1')

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/notifications/notif-1')
      expect(init.method).toBe('DELETE')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Not found' }, 404)

      await expect(deleteNotification('nonexistent')).rejects.toThrow(
        'Not found',
      )
    })
  })

  // -------------------------------------------------------------------------
  // deleteAllNotifications
  // -------------------------------------------------------------------------

  describe('deleteAllNotifications', () => {
    it('sends DELETE to /api/notifications/all', async () => {
      mock204()

      await deleteAllNotifications()

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/notifications/all')
      expect(init.method).toBe('DELETE')
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Server error' }, 500)

      await expect(deleteAllNotifications()).rejects.toThrow('Server error')
    })
  })

  // -------------------------------------------------------------------------
  // subscribePush
  // -------------------------------------------------------------------------

  describe('subscribePush', () => {
    it('sends POST to /api/notifications/subscribe with flattened keys', async () => {
      mock204()

      const subscription: PushSubscriptionJSON = {
        endpoint: 'https://push.example.com/abc',
        keys: {
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      }

      await subscribePush(subscription)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/notifications/subscribe')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({
        endpoint: 'https://push.example.com/abc',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      })
    })

    it('handles missing keys with empty strings', async () => {
      mock204()

      const subscription: PushSubscriptionJSON = {
        endpoint: 'https://push.example.com/abc',
      }

      await subscribePush(subscription)

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({
        endpoint: 'https://push.example.com/abc',
        p256dh: '',
        auth: '',
      })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Invalid subscription' }, 400)

      await expect(
        subscribePush({ endpoint: '' }),
      ).rejects.toThrow('Invalid subscription')
    })
  })

  // -------------------------------------------------------------------------
  // unsubscribePush
  // -------------------------------------------------------------------------

  describe('unsubscribePush', () => {
    it('sends POST to /api/notifications/unsubscribe with flattened keys', async () => {
      mock204()

      const subscription: PushSubscriptionJSON = {
        endpoint: 'https://push.example.com/abc',
        keys: {
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      }

      await unsubscribePush(subscription)

      const [url, init] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/notifications/unsubscribe')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({
        endpoint: 'https://push.example.com/abc',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      })
    })

    it('handles missing keys with empty strings', async () => {
      mock204()

      const subscription: PushSubscriptionJSON = {
        endpoint: 'https://push.example.com/abc',
      }

      await unsubscribePush(subscription)

      const [, init] = mockFetch.mock.calls[0]!
      expect(JSON.parse(init.body)).toEqual({
        endpoint: 'https://push.example.com/abc',
        p256dh: '',
        auth: '',
      })
    })

    it('throws on server error', async () => {
      mockApiResponse({ error: 'Subscription not found' }, 404)

      await expect(
        unsubscribePush({ endpoint: 'https://push.example.com/abc' }),
      ).rejects.toThrow('Subscription not found')
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws with error message from response body', async () => {
      mockApiResponse({ error: 'Not found' }, 404)

      await expect(deleteNotification('x')).rejects.toThrow('Not found')
    })

    it('throws with message field from response body', async () => {
      mockApiResponse({ message: 'Validation failed' }, 400)

      await expect(markNotificationRead('')).rejects.toThrow(
        'Validation failed',
      )
    })

    it('throws with status code when no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('No JSON')),
      })

      await expect(deleteAllNotifications()).rejects.toThrow('500')
    })
  })
})
