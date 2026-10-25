import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthLayout from '@/app/(auth)/layout'
import { useAuthStore, withCookieSettingLogin } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { resetAuthStore, respondWithAccount } from '@/__tests__/support/account-change'
import { installWebLocks } from '@/__tests__/helpers/web-locks'

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
    useOnboardingDraftStore.setState(useOnboardingDraftStore.getInitialState())
    useOnboardingDraftStore.getState().bufferHabit({ title: 'Read', frequencyUnit: 'Day', frequencyQuantity: 1 })
    useOnboardingDraftStore.getState().bufferFirstLog(0, '2026-07-05')
    useOnboardingDraftStore.getState().bufferWeekStartDay(1)
    useOnboardingDraftStore.getState().bufferGoal({ title: 'Read books', targetValue: 10, unit: 'books' })
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    await useOnboardingDraftStore.persist.rehydrate()
    replace.mockClear()
  })
  afterEach(() => vi.unstubAllGlobals())

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
