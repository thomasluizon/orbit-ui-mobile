import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/auth/logout/route'
import { expectApiVersion2Requests } from '@/__tests__/support/api-version'

const mocks = vi.hoisted(() => ({
  getRefreshToken: vi.fn(),
  clearSessionCookies: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('@/lib/auth-api', () => ({
  getRefreshToken: mocks.getRefreshToken,
  clearSessionCookies: mocks.clearSessionCookies,
}))
vi.mock('@/lib/request-language', () => ({ getServerRequestLanguage: async () => 'en' }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetch.mockReset()
  mocks.getRefreshToken.mockResolvedValue('refresh-token')
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => vi.unstubAllGlobals())

it.each(['success', 'offline'])('clears the session and versions revocation when upstream is %s', async (outcome) => {
  if (outcome === 'success') mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }))
  else mocks.fetch.mockRejectedValue(new TypeError('offline'))

  const response = await POST()

  expect(response.status).toBe(200)
  expect(mocks.clearSessionCookies).toHaveBeenCalledOnce()
  expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.objectContaining({
    method: 'POST', body: JSON.stringify({ refreshToken: 'refresh-token' }),
  }))
  expectApiVersion2Requests(mocks.fetch.mock.calls)
})

it('clears a session without a refresh token without sending revocation', async () => {
  mocks.getRefreshToken.mockResolvedValue(null)
  const response = await POST()
  expect(response.status).toBe(200)
  expect(mocks.clearSessionCookies).toHaveBeenCalledOnce()
  expect(mocks.fetch).not.toHaveBeenCalled()
})
