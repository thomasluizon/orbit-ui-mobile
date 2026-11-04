import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthLayout from '@/app/(auth)/layout'
import { useAuthStore, withCookieSettingLogin } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { resetAuthStore, respondWithAccount } from '@/__tests__/support/account-change'
import { installWebLocks } from '@/__tests__/helpers/web-locks'
import { resolve } from 'node:path'
import { API } from '@orbit/shared/api'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { applyThemeTokensToDOM } from '@/lib/theme-dom'

const replace = vi.fn()
const router = { replace }
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/login', useSearchParams: () => new URLSearchParams() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))

const state = 'a'.repeat(64)
const invoke = vi.fn()
function nativeEvent(phase: string, attemptState = state) {
  window.dispatchEvent(new CustomEvent('orbit-desktop-auth', { detail: { phase, state: attemptState } }))
}

describe('native sign-in in the auth composition', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    await resetAuthStore()
    localStorage.clear()
    installWebLocks()
    invoke.mockReset().mockResolvedValue(true)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
    vi.stubGlobal('__ORBIT_DESKTOP_LAUNCH__', undefined)
    useOnboardingDraftStore.setState(useOnboardingDraftStore.getInitialState())
    useOnboardingDraftStore.getState().bufferHabit({ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 })
    useOnboardingDraftStore.getState().bufferFirstLog(0, '2026-07-05')
    useOnboardingDraftStore.getState().bufferWeekStartDay(1)
    useOnboardingDraftStore.getState().bufferGoal({ title: 'Read books', targetValue: 10, unit: 'books' })
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    await useOnboardingDraftStore.persist.rehydrate()
    replace.mockClear()
  })
  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'))
    vi.unstubAllGlobals()
  })

  it.each(['dark', 'light'] as const)('applies the account %s appearance and waits for the reusable native cover before navigating', async mode => {
    const initial = mode === 'dark' ? 'light' : 'dark'
    applyThemeTokensToDOM('orange', initial)
    let contentfulPaint = () => {}
    class PaintObserver {
      static supportedEntryTypes = ['paint']
      constructor(callback: (entries: { getEntries(): Array<{ name: string }> }) => void) {
        contentfulPaint = () => callback({ getEntries: () => [{ name: 'first-contentful-paint' }] })
      }
      observe() {}
      disconnect() {}
    }
    let applied = () => {}
    invoke.mockImplementation((command, payload) => {
      if (command === 'commit_desktop_login') return Promise.resolve(true)
      if (payload.mode === mode) return new Promise<number>(resolve => { applied = () => resolve(7) })
      return Promise.resolve(7)
    })
    vi.stubGlobal('__ORBIT_LAUNCH_ORIGIN__', window.location.origin)
    vi.stubGlobal('PerformanceObserver', PaintObserver)
    await import(`${resolve(__dirname, '../../../desktop/src-tauri/src/launch.js')}?account=${mode}`)
    contentfulPaint()
    await Promise.resolve()
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    respondWithAccount('desktop-account')
    const sessionFetch = vi.mocked(fetch).getMockImplementation()!
    const profile = createMockProfile({ themePreference: mode })
    vi.mocked(fetch).mockImplementation((input, init) => input === API.profile.get
      ? Promise.resolve(Response.json(profile)) : sessionFetch(input, init))
    await act(async () => { nativeEvent('begin'); nativeEvent('ready') })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(API.profile.get, expect.objectContaining({ cache: 'no-store' })))
    expect(document.documentElement.style.colorScheme).toBe(mode)
    expect(invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode, reveal: false })
    expect(replace).not.toHaveBeenCalled()
    await act(async () => { applied() })
    expect(replace).toHaveBeenCalledExactlyOnceWith('/')
  })

  it.each(['attempt', 'account'])('ignores a profile appearance arriving after its sign-in %s changes', async changed => {
    applyThemeTokensToDOM('orange', 'light')
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    respondWithAccount('desktop-account')
    const sessionFetch = vi.mocked(fetch).getMockImplementation()!
    let resolveProfile = (_response: Response) => {}
    vi.mocked(fetch).mockImplementation((input, init) => input === API.profile.get
      ? new Promise<Response>(resolve => { resolveProfile = resolve }) : sessionFetch(input, init))
    await act(async () => { nativeEvent('begin'); nativeEvent('ready') })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(API.profile.get, expect.objectContaining({ cache: 'no-store' })))
    await act(async () => {
      if (changed === 'attempt') nativeEvent('begin', 'b'.repeat(64))
      else useAuthStore.getState().setAuth({ userId: 'other-account', name: 'Person', email: 'person@example.com' })
      resolveProfile(Response.json(createMockProfile({ themePreference: 'dark' })))
    })
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(replace).not.toHaveBeenCalled()
  })

  it('adopts the owning anonymous answers before authenticated hydration', async () => {
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    await act(async () => {
      nativeEvent('begin')
      respondWithAccount('desktop-account')
      nativeEvent('ready')
    })
    await act(async () => {
      useAuthStore.getState().adoptServerAccount('desktop-account')
      await useOnboardingDraftStore.persist.rehydrate()
    })
    expect(useOnboardingDraftStore.getState().buildApplyPayload()).toMatchObject({
      habits: [{ title: 'Read' }], firstLog: { habitIndex: 0, date: '2026-07-05' },
      weekStartDay: 1, goal: { title: 'Read books' },
    })
    expect(useOnboardingDraftStore.getState().accountKey).toBe('desktop-account')
    expect(invoke).toHaveBeenCalledWith('commit_desktop_login', { state })
    expect(replace).toHaveBeenCalledWith('/')
  })

  it.each(['reload', 'unowned ready', 'foreign draft'])('discards unrelated answers on %s', async (path) => {
    if (path === 'foreign draft') useOnboardingDraftStore.getState().setAccountScope('foreign-account', true)
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    await act(async () => {
      respondWithAccount('desktop-account')
      if (path === 'foreign draft') nativeEvent('begin')
      if (path !== 'reload') nativeEvent('ready')
    })
    await act(async () => {
      useAuthStore.getState().adoptServerAccount('desktop-account')
      await useOnboardingDraftStore.persist.rehydrate()
    })
    expect(useOnboardingDraftStore.getState().buildApplyPayload()).toEqual({ habits: [] })
    if (path !== 'foreign draft') expect(invoke).not.toHaveBeenCalled()
  })

  it('accepts only the latest attempt and consumes its completion once', async () => {
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    const latest = 'b'.repeat(64)
    await act(async () => {
      nativeEvent('begin')
      useOnboardingDraftStore.getState().bufferHabit({ title: 'Walk', frequencyUnit: 'Day', frequencyQuantity: 1 })
      nativeEvent('begin', latest)
      nativeEvent('ready')
      respondWithAccount('desktop-account')
      nativeEvent('ready', latest)
      nativeEvent('ready', latest)
    })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('commit_desktop_login', { state: latest })
    expect(useOnboardingDraftStore.getState().habits.map((habit) => habit.title)).toEqual(['Read', 'Walk'])
  })

  it('does not resurrect the anonymous attempt after email sign-in', async () => {
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    await act(async () => {
      nativeEvent('begin')
      useAuthStore.getState().setAuth({ userId: 'email-account', name: 'Person', email: 'person@example.com' })
      nativeEvent('ready')
    })
    expect(invoke).not.toHaveBeenCalled()
    expect(useOnboardingDraftStore.getState().accountKey).toBe('email-account')
    expect(replace).not.toHaveBeenCalled()
  })

  it('holds the session cookie lock until native commit and draft adoption finish', async () => {
    let finishCommit: (committed: boolean) => void = () => {}
    invoke.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishCommit = resolve }))
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    await act(async () => { nativeEvent('begin'); nativeEvent('ready') })
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    const email = vi.fn(async () => {
      expect(useOnboardingDraftStore.getState().accountKey).toBe('desktop-account')
      useAuthStore.getState().setAuth({ userId: 'email-account', name: 'Person', email: 'person@example.com' })
    })
    const signingIn = withCookieSettingLogin(email)
    await act(async () => {})
    expect(email).not.toHaveBeenCalled()
    await act(async () => {
      respondWithAccount('desktop-account')
      finishCommit(true)
      await signingIn
    })
    expect(email).toHaveBeenCalledOnce()
    expect(useOnboardingDraftStore.getState().accountKey).toBe('email-account')
    expect(useOnboardingDraftStore.getState().habits).toEqual([])
  })

  it.each(['rejected commit', 'session failure', 'malformed session'])('keeps the draft anonymous after %s', async (failure) => {
    if (failure === 'rejected commit') invoke.mockRejectedValueOnce(new Error('cannot install'))
    else vi.mocked(fetch).mockResolvedValueOnce(failure === 'session failure'
      ? new Response(null, { status: 503 }) : Response.json({ userId: null, expiresAt: null, refreshFailed: false }))
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    await act(async () => { nativeEvent('begin'); nativeEvent('ready') })
    expect(replace).toHaveBeenCalledWith('/auth-callback?error=desktop_sign_in_failed')
    expect(useOnboardingDraftStore.getState().accountKey).toBeNull()
    expect(useOnboardingDraftStore.getState().habits).toHaveLength(1)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('ignores native events outside the desktop shell', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', undefined)
    render(<AuthLayout><div>Sign in</div></AuthLayout>)
    await screen.findByText('Sign in')
    await act(async () => { nativeEvent('begin'); nativeEvent('ready') })
    expect(invoke).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})
