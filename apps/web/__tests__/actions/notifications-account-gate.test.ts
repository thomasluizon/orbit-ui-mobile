import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const { mockCookieStore } = vi.hoisted(() => ({
  mockCookieStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(mockCookieStore),
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
} = await import('@/lib/actions/notifications')

const pushSubscription = {
  endpoint: 'https://push.example.com/abc',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
}

/**
 * The claim the API puts the account id under. It is the literal `auth-api.ts` reads and the one
 * `JwtTokenServiceTests` in the orbit-api repository pins, so a token built here carries an account
 * the real `getAccountIdFromToken` can find.
 */
const ACCOUNT_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'

function encodeJwtSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function makeAccessToken(accountId: string): string {
  return [
    encodeJwtSegment({ alg: 'HS256', typ: 'JWT' }),
    encodeJwtSegment({
      aud: 'orbit-client',
      iss: 'orbit-api',
      exp: Math.floor(Date.now() / 1000) + 3600,
      [ACCOUNT_CLAIM]: accountId,
    }),
    'ZmFrZS1zaWduYXR1cmU',
  ].join('.')
}

/** Puts the account the browser's shared cookie now names in front of the server action. */
function holdCookieForAccount(accountId: string): void {
  mockCookieStore.get.mockImplementation((name: string) =>
    name === 'auth_token' ? { value: makeAccessToken(accountId) } : undefined,
  )
}

describe('a notification write formed under a replaced account', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('No body')),
    })
    mockCookieStore.get.mockReset()
  })

  const writes = [
    ['clear all', () => deleteAllNotifications('account-a'), '/api/notifications/all'],
    ['delete one', () => deleteNotification('n-1', 'account-a'), '/api/notifications/n-1'],
    ['mark all read', () => markAllNotificationsRead('account-a'), '/api/notifications/read-all'],
    ['mark one read', () => markNotificationRead('n-1', 'account-a'), '/api/notifications/n-1/read'],
    ['push subscribe', () => subscribePush(pushSubscription, 'account-a'), '/api/notifications/subscribe'],
    ['push unsubscribe', () => unsubscribePush(pushSubscription, 'account-a'), '/api/notifications/unsubscribe'],
  ] as const

  it.each(writes)(
    'refuses a %s that account A formed once the cookie holds account B',
    async (_name, runWrite) => {
      holdCookieForAccount('account-b')

      await expect(runWrite()).rejects.toThrow(
        'The signed in account changed before this request ran',
      )

      expect(mockFetch).not.toHaveBeenCalled()
    },
  )

  it.each(writes)(
    'sends a %s while the cookie still holds the account that formed it',
    async (_name, runWrite, path) => {
      holdCookieForAccount('account-a')

      await runWrite()

      const [url] = mockFetch.mock.calls[0]!
      expect(url).toContain(path)
    },
  )

  it('sends a write that names no account, because nothing proves a mismatch', async () => {
    holdCookieForAccount('account-b')

    await deleteAllNotifications(null)

    const [url] = mockFetch.mock.calls[0]!
    expect(url).toContain('/api/notifications/all')
  })
})
