import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import profileResponse from '@orbit/shared/__tests__/fixtures/profile-api-response.json'
import { serverAuthFetch } from '@/lib/server-fetch'

const { cookieValues, cookieStore } = vi.hoisted(() => {
  const values = new Map<string, string>()
  return {
    cookieValues: values,
    cookieStore: {
      get: (name: string) => values.has(name) ? { value: values.get(name) } : undefined,
      set: vi.fn((name: string, value: string) => values.set(name, value)),
    },
  }
})

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => cookieStore,
}))

function accessToken(lifetimeSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + lifetimeSeconds })).toString('base64url')
  return `header.${payload}.signature`
}

describe('profile response around a session refresh', () => {
  beforeEach(() => {
    cookieValues.clear()
    cookieStore.set.mockClear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each(['expired', 'unauthorized'])('parses the profile after an %s access token refresh', async (mode) => {
    const originalToken = accessToken(mode === 'expired' ? -60 : 3600)
    const refreshedToken = accessToken(7200)
    cookieValues.set('auth_token', originalToken)
    cookieValues.set('refresh_token', 'profile-refresh-token')
    const mockFetch = vi.fn()
    if (mode === 'unauthorized') {
      mockFetch.mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    mockFetch
      .mockResolvedValueOnce(Response.json({ token: refreshedToken, refreshToken: 'profile-rotated-token' }))
      .mockResolvedValueOnce(Response.json(profileResponse))
      .mockResolvedValueOnce(Response.json(profileResponse))
    vi.stubGlobal('fetch', mockFetch)

    const profile = await serverAuthFetch(API.profile.get, {}, profileSchema)
    const nextProfile = await serverAuthFetch(API.profile.get, {}, profileSchema)

    expect(profile.publicProfile).toBeNull()
    expect(nextProfile).toEqual(profile)
    expect(cookieValues.get('auth_token')).toBe(refreshedToken)
    expect(cookieValues.get('refresh_token')).toBe('profile-rotated-token')
    expect(mockFetch).toHaveBeenCalledTimes(mode === 'expired' ? 3 : 4)
    const refreshIndex = mode === 'expired' ? 0 : 1
    expect(mockFetch).toHaveBeenNthCalledWith(refreshIndex + 1, expect.stringContaining(API.auth.refresh), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'profile-refresh-token' }),
    }))
    for (const requestNumber of [refreshIndex + 2, refreshIndex + 3]) {
      expect(mockFetch).toHaveBeenNthCalledWith(requestNumber, expect.stringContaining(API.profile.get), expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${refreshedToken}` }),
      }))
    }
  })
})
