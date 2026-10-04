import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { serverAuthFetch, serverAuthMutate, serverPublicFetch } from '@/lib/server-fetch'
import { refreshSessionTokens } from '@/lib/auth-api'
import { sessionAwareFetch } from '@/lib/api-fetch'
import { buildForwardedClientHeaders } from '@/app/api/_utils/forwarded-client-context'

const mocks = vi.hoisted(() => ({ language: 'en', fetch: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => name === 'i18n_locale' ? { value: mocks.language } : undefined }),
  headers: async () => new Headers({ 'Accept-Language': 'pt-BR,pt;q=0.9' }),
}))
vi.mock('@/lib/auth-api', async (original) => ({
  ...await original<typeof import('@/lib/auth-api')>(),
  resolveServerSession: async () => ({ token: 'token', refreshFailed: false }),
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: { getState: () => ({ recoverSessionRefreshFailure: vi.fn() }) } }))

beforeEach(() => {
  mocks.fetch.mockReset()
  mocks.fetch.mockImplementation(async () => new Response('{}'))
  vi.stubGlobal('fetch', mocks.fetch)
})

describe('API request language', () => {
  it.each(['en', 'pt-BR'])('forwards selected %s through every server transport', async (language) => {
    mocks.language = language
    await serverAuthFetch('/api/profile')
    await serverAuthMutate('/api/profile', { method: 'PUT', body: '{}' }, null)
    await serverPublicFetch('/api/public/profile')
    mocks.fetch.mockResolvedValue(new Response('{"token":"token","refreshToken":"refresh"}'))
    await refreshSessionTokens('refresh-' + language)
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
    for (const [, init] of mocks.fetch.mock.calls) {
      expect(new Headers((init as RequestInit).headers).get('Accept-Language')).toBe(language)
    }
  })

  it.each(['en', 'pt-BR'])('uses the %s cookie for browser and BFF requests', async (language) => {
    document.cookie = `i18n_locale=${language};path=/`
    await sessionAwareFetch('/api/auth/send-code', { method: 'POST' })
    expect(new Headers(mocks.fetch.mock.calls[0]?.[1].headers).get('Accept-Language')).toBe(language)
    const request = new NextRequest('https://app.useorbit.org/api/profile', {
      headers: { Cookie: `i18n_locale=${language}`, 'Accept-Language': language === 'en' ? 'pt-BR' : 'en' },
    })
    expect(buildForwardedClientHeaders(request)['Accept-Language']).toBe(language)
    document.cookie = 'i18n_locale=;max-age=0;path=/'
  })
})
