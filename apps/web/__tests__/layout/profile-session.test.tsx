import { createServer, type Server } from 'node:http'
import type { BrowserContext } from '@playwright/test'
import { cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { profileSchema, type Profile } from '@orbit/shared/types/profile'
import { resolveSystemLocale } from '@orbit/shared/utils'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { useProfile } from '@/hooks/use-profile'
import { setLayoutFixtureSession, setLayoutProfileSession } from '../../e2e/layout/profile-session'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { handleRequest } from '../../test-support/hermetic/mock-api/request-handler'

vi.mock('@/stores/auth-store', () => ({
  useHeldAccountId: () => 'hermetic-perf-user',
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: true }),
}))
vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ syncThemeFromProfile: vi.fn(), detectAndSaveThemeIfNeeded: vi.fn() }),
}))

type SessionCookie = Parameters<BrowserContext['addCookies']>[0][number]
const nativeFetch = globalThis.fetch
let server: Server
let origin: string
const queryClients: QueryClient[] = []

beforeAll(async () => {
  server = createServer(handleRequest)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a mock API port')
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})
afterEach(() => {
  cleanup()
  for (const client of queryClients.splice(0)) client.clear()
  vi.unstubAllGlobals()
  document.cookie = 'i18n_locale=;max-age=0;path=/'
})

function createCookieContext() {
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer))
  const cookies = new Map<string, SessionCookie>()
  const context = {
    addCookies: async (entries: readonly SessionCookie[]) => {
      for (const cookie of entries) cookies.set(cookie.name, cookie)
    },
  } as BrowserContext
  vi.stubGlobal('fetch', (input: string, options?: RequestInit) =>
    nativeFetch(input.replace('http://127.0.0.1:5099', origin), options))
  return { context, cookies }
}

async function readSessionProfile(cookies: Map<string, SessionCookie>): Promise<Profile> {
  const response = await nativeFetch(`${origin}${API.profile.get}`, {
    headers: { Authorization: `Bearer ${cookies.get('auth_token')!.value}` },
  })
  expect(response.status).toBe(200)
  return profileSchema.parse(await response.json())
}

function expectProfileWithoutReload(cookies: Map<string, SessionCookie>, profile: Profile) {
  const reload = vi.fn()
  vi.stubGlobal('location', { reload })
  const locale = cookies.get('i18n_locale')?.value ?? resolveSystemLocale('en-US')
  const client = new QueryClient()
  queryClients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={{}}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  )
  const { result } = renderHook(() => useProfile({ enabled: false, initialData: profile }), { wrapper })
  expect(result.current.profile).toEqual(profile)
  expect(reload).not.toHaveBeenCalled()
  if (profile.language) expect(locale).toBe(profile.language)
  expect(cookies.get('auth_token')?.value).toBe(cookies.get('refresh_token')?.value)
}

describe('layout profile sessions', () => {
  it.each(['en', 'pt-BR'] as const)('renders a %s session in its profile locale without reloading', async (language) => {
    const { context, cookies } = createCookieContext()
    const profile = profileSchema.parse({ ...profileFixture, language })
    await setLayoutProfileSession(context, profile)
    expectProfileWithoutReload(cookies, await readSessionProfile(cookies))
  })

  it('keeps the profile locale and both fixture batches when habits are seeded next', async () => {
    const { context, cookies } = createCookieContext()
    const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
    await setLayoutProfileSession(context, profile)
    await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
    const token = cookies.get('auth_token')!.value
    const habits = { ...emptyHabitsPageFixture, items: [makeHabitScheduleItem()], totalCount: 1 }
    await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
    expect(cookies.get('auth_token')!.value).toBe(token)
    expectProfileWithoutReload(cookies, await readSessionProfile(cookies))
    const response = await nativeFetch(`${origin}${API.habits.list}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(await response.json()).toEqual(habits)
  })

  it('uses a seeded profile locale even without an explicit profile session', async () => {
    const { context, cookies } = createCookieContext()
    const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
    await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
    expectProfileWithoutReload(cookies, await readSessionProfile(cookies))
  })

  it('replaces the locale when a fixture changes an existing profile', async () => {
    const { context, cookies } = createCookieContext()
    await setLayoutProfileSession(context, profileSchema.parse({ ...profileFixture, language: 'en' }))
    const profile = profileSchema.parse({ ...profileFixture, language: 'pt-BR' })
    await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
    expectProfileWithoutReload(cookies, await readSessionProfile(cookies))
    const replacement = profileSchema.parse({ ...profileFixture, language: 'en' })
    await setLayoutProfileSession(context, replacement)
    expectProfileWithoutReload(cookies, await readSessionProfile(cookies))
  })

  it('preserves the request locale when the profile uses the system language', async () => {
    const { context, cookies } = createCookieContext()
    await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', domain: '127.0.0.1', path: '/' }])
    const profile = profileSchema.parse({ ...profileFixture, language: null })
    await setLayoutProfileSession(context, profile)
    expect(cookies.get('i18n_locale')?.value).toBe('pt-BR')
    expectProfileWithoutReload(cookies, await readSessionProfile(cookies))
  })
})
