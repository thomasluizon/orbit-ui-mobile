import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'

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

const { confirmDeletion } = await import('@/app/actions/auth')
const { revokeApiKey } = await import('@/app/actions/api-keys')
const { deleteGoal } = await import('@/app/actions/goals')
const { deleteHabit } = await import('@/app/actions/habits')

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

const destructiveWrites = [
  ['delete the account', () => confirmDeletion('123456', 'account-a'), API.auth.confirmDeletion],
  ['delete a habit', () => deleteHabit('habit-1', 'account-a'), API.habits.delete('habit-1')],
  ['delete a goal', () => deleteGoal('goal-1', 'account-a'), API.goals.delete('goal-1')],
  ['revoke an API key', () => revokeApiKey('key-1', 'account-a'), API.apiKeys.delete('key-1')],
] as const

describe('a destructive write formed under a replaced account', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('No body')),
      text: () => Promise.resolve(''),
    })
    mockCookieStore.get.mockReset()
  })

  it.each(destructiveWrites)(
    'refuses to %s once the cookie holds account B',
    async (_name, runWrite) => {
      holdCookieForAccount('account-b')

      await expect(runWrite()).resolves.toMatchObject({
        ok: false,
        status: 409,
        code: 'ACCOUNT_CHANGED',
      })

      expect(mockFetch).not.toHaveBeenCalled()
    },
  )

  it.each(destructiveWrites)(
    'sends the request to %s while the cookie still holds the account that formed it',
    async (_name, runWrite, path) => {
      holdCookieForAccount('account-a')

      await runWrite()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toContain(path)
    },
  )

  it('sends a delete that names no account because no mismatch is proven', async () => {
    holdCookieForAccount('account-b')

    await deleteHabit('habit-1', null)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain(API.habits.delete('habit-1'))
  })

  it('reports the refused account deletion as a failure rather than as a wrong code', async () => {
    holdCookieForAccount('account-b')

    await expect(confirmDeletion('123456', 'account-a')).resolves.toMatchObject({
      ok: false,
      error: 'The signed in account changed before this request ran',
    })
  })
})
