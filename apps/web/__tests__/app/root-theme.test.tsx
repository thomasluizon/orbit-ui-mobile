import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import RootLayout from '@/app/layout'
import { captureException } from '@sentry/nextjs'
import { cookies } from 'next/headers'
import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies'
import { RequestCookiesAdapter } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

const requestCookies = vi.hoisted(() => new Map<string, string>())
const cookieMutationAccess = vi.hoisted(() => vi.fn())
const { JSDOM } = require('jsdom') as {
  JSDOM: new (markup: string, options: {
    runScripts: 'dangerously'
    url: string
    beforeParse: (window: Window) => void
  }) => { window: Window }
}
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => {
    const incoming = new RequestCookies(new Headers({
      cookie: Array.from(requestCookies, ([name, value]) => `${name}=${value}`).join('; '),
    }))
    const sealed = RequestCookiesAdapter.seal(incoming)
    return new Proxy(sealed, {
      get(target, property, receiver) {
        if (property === 'set' || property === 'delete' || property === 'clear') cookieMutationAccess(property)
        return Reflect.get(target, property, receiver)
      },
    })
  },
  headers: async () => new Headers(),
}))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en', getMessages: async () => ({}) }))
vi.mock('next-intl', () => ({ NextIntlClientProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/app/fonts', () => ({ geist: { variable: '' }, geistMono: { variable: '' }, spaceGrotesk: { variable: '' } }))
vi.mock('@/components/posthog-provider', () => ({ PostHogProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/navigation/route-context', () => ({ RouteContext: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/navigation/navigation-history-tracker', () => ({ NavigationHistoryTracker: () => null }))
vi.mock('@/lib/public-session-bootstrap', () => ({ PublicSessionBootstrap: () => null }))
vi.mock('@/lib/session-cookie-provider', () => ({ SessionCookieProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/shell/keyboard-platform-provider', () => ({ KeyboardPlatformProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/ui/throttle-screen', () => ({ ThrottleScreen: () => null }))

beforeEach(() => { requestCookies.clear(); vi.clearAllMocks() })
afterEach(() => vi.unstubAllGlobals())

async function serverDocument() {
  const tree = await RootLayout({ children: <main>Theme fixture</main> })
  return new DOMParser().parseFromString(renderToStaticMarkup(tree), 'text/html')
}

describe('root theme before hydration', () => {
  it.each([undefined, 'dark', 'light'])('renders a light profile with theme cookie %s', async (cookieTheme) => {
    const profile = profileSchema.parse({ ...profileFixture, themePreference: 'light' })
    const token = mintHermeticJwt(profile)
    requestCookies.set('auth_token', token)
    requestCookies.set('refresh_token', token)
    if (cookieTheme) requestCookies.set('orbit_theme_mode', cookieTheme)
    const upstream = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(input instanceof Request ? input.url : input.toString()).toContain(API.profile.get)
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`)
      return Response.json(profile)
    })
    vi.stubGlobal('fetch', upstream)
    const page = await serverDocument()
    const root = page.documentElement
    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
    for (const [property, value] of Object.entries(resolveWebThemeVariables('orange', 'light'))) {
      expect(root.style.getPropertyValue(property)).toBe(value)
    }
    const bootstrapped = new JSDOM(page.documentElement.outerHTML, {
      runScripts: 'dangerously', url: 'https://theme.test',
      beforeParse: (window) => { if (cookieTheme) window.document.cookie = `orbit_theme_mode=${cookieTheme}` },
    })
    expect(bootstrapped.window.document.documentElement.classList.contains('light')).toBe(true)
    expect(bootstrapped.window.document.documentElement.style.colorScheme).toBe('light')
    bootstrapped.window.close()
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it.each(['dark', 'light'])('uses the %s cookie without a session', async (theme) => {
    requestCookies.set('orbit_theme_mode', theme)
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const page = await serverDocument()
    expect(page.documentElement.classList.contains(theme)).toBe(true)
    expect(page.documentElement.style.colorScheme).toBe(theme)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each(['refresh-only', 'expired', 'near-expiry', 'rejected-fresh'] as const)(
    'preserves a %s session during a public document render', async (sessionKind) => {
      const profile = profileSchema.parse({ ...profileFixture, themePreference: 'dark' })
      const freshToken = mintHermeticJwt(profile)
      const [header, payload, signature] = freshToken.split('.') as [string, string, string]
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>
      const secondsUntilExpiry = sessionKind === 'expired' ? -60 : 30
      const accessToken = sessionKind === 'rejected-fresh' ? freshToken
        : `${header}.${Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + secondsUntilExpiry })).toString('base64url')}.${signature}`
      if (sessionKind !== 'refresh-only') requestCookies.set('auth_token', accessToken)
      requestCookies.set('refresh_token', freshToken)
      requestCookies.set('orbit_theme_mode', 'light')
      const renderCookies = await cookies()
      expect(() => renderCookies.set('sealed-check', 'value')).toThrow('Cookies can only be modified')
      cookieMutationAccess.mockClear()
      const upstream = vi.fn(async (input: string | URL | Request) => {
        const path = input instanceof Request ? input.url : input.toString()
        if (path.endsWith(API.auth.refresh)) {
          return Response.json({ token: freshToken, refreshToken: 'rotated-refresh-token' })
        }
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      })
      vi.stubGlobal('fetch', upstream)

      const page = await serverDocument()

      expect(page.documentElement.classList.contains('light')).toBe(true)
      expect(page.documentElement.style.colorScheme).toBe('light')
      expect(upstream.mock.calls.some(([input]) => (input instanceof Request ? input.url : input.toString()).endsWith(API.auth.refresh))).toBe(false)
      expect(cookieMutationAccess).not.toHaveBeenCalled()
      expect(renderCookies.get('refresh_token')?.value).toBe(freshToken)
      expect((await cookies()).get('refresh_token')?.value).toBe(freshToken)
      expect(upstream).toHaveBeenCalledTimes(sessionKind === 'refresh-only' || sessionKind === 'expired' ? 0 : 1)
      if (sessionKind === 'refresh-only' || sessionKind === 'expired') expect(captureException).not.toHaveBeenCalled()
    },
  )

  it('keeps public rendering available and reports an unavailable profile API', async () => {
    requestCookies.set('auth_token', mintHermeticJwt(profileFixture))
    requestCookies.set('orbit_theme_mode', 'light')
    const failure = new TypeError('Network request failed')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure))
    const page = await serverDocument()
    expect(page.documentElement.classList.contains('light')).toBe(true)
    expect(page.documentElement.style.colorScheme).toBe('light')
    expect(captureException).toHaveBeenCalledWith(failure)
  })
})
