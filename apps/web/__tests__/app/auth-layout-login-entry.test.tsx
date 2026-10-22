import { createContext, startTransition, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthLayout from '@/app/(auth)/layout'
import LoginPage from '@/app/(auth)/login/page'
import { installWebLocks } from '@/__tests__/helpers/web-locks'
import { holdAccount, resetAuthStore } from '@/__tests__/support/account-change'
import { getSessionEpoch } from '@/lib/session-epoch'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import en from '@orbit/shared/i18n/en.json'

const controls = vi.hoisted(() => ({ online: true, destinations: [] as string[] }))
const NavigationContext = createContext({ url: '/login', navigate: (_destination: string) => {} })

vi.mock('next/navigation', () => ({
  useRouter: () => {
    const { navigate } = useContext(NavigationContext)
    return { push: navigate, replace: navigate }
  },
  usePathname: () => new URL(useContext(NavigationContext).url, window.location.origin).pathname,
  useSearchParams: () => new URL(useContext(NavigationContext).url, window.location.origin).searchParams,
}))
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>()
  return {
    useTranslations: () => Object.assign((key: string) => key, { rich: actual.createTranslator({ locale: 'en', messages: en }).rich }),
    useLocale: () => 'en',
  }
})
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: controls.online }) }))
vi.mock('motion/react', async (original) => ({
  ...await original<typeof import('motion/react')>(),
  useReducedMotion: () => true,
}))
vi.mock('@/components/auth/turnstile-widget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) =>
    <button type="button" onClick={() => onToken('synthetic-protection')}>Solve security check</button>,
}))

const email = 'person@example.com'
const code = '123456'
const link = `/login?email=${encodeURIComponent(email)}&code=${code}&returnUrl=%2Fcalendar&ref=friend-42`
const cleanLink = '/login?returnUrl=%2Fcalendar&ref=friend-42'
const success = { userId: '11111111-1111-4111-8111-111111111111', name: 'Ada', email, wasReactivated: false }
const fetchBoundary = vi.fn<typeof fetch>()
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
let releaseVerification: (response: Response) => void
let verificationSignal: AbortSignal | null | undefined
let sessionAccepted = false
let refuseInitialVerification = false

function OwningRoutes({ initialUrl }: Readonly<{ initialUrl: string }>) {
  const [url, setUrl] = useState(initialUrl)
  const navigate = useCallback((destination: string) => {
    controls.destinations.push(destination)
    window.history.pushState(null, '', destination)
    setUrl(destination)
  }, [])
  useLayoutEffect(() => {
    const replaceState = window.history.replaceState.bind(window.history)
    const replacement = vi.spyOn(window.history, 'replaceState').mockImplementation((...arguments_) => {
      replaceState(...arguments_)
      if (arguments_[2]) startTransition(() => setUrl(window.location.pathname + window.location.search + window.location.hash))
    })
    return () => replacement.mockRestore()
  }, [])
  const navigation = useMemo(() => ({ url, navigate }), [url, navigate])
  const pathname = new URL(url, window.location.origin).pathname
  return <NavigationContext.Provider value={navigation}>
    <output aria-label="Current URL">{url}</output>
    <button type="button" onClick={() => navigate('/auth-callback')}>Leave login</button>
    <button type="button" onClick={() => navigate('/login')}>Open ordinary login</button>
    {pathname === '/login' || pathname === '/auth-callback'
      ? <AuthLayout>{pathname === '/login' ? <LoginPage /> : <span>Auth callback</span>}</AuthLayout>
      : <span>Destination</span>}
  </NavigationContext.Provider>
}

function requestsTo(path: string) {
  return fetchBoundary.mock.calls.filter(([input]) => input === path)
}

async function expectCleanCodeOwner() {
  await waitFor(() => expect(screen.getByLabelText('Current URL').textContent).toBe(cleanLink))
  expect(window.location.pathname).toBe('/login')
  expect(window.location.search.includes('email=') || window.location.search.includes('code=')).toBe(false)
  expect(screen.getAllByRole('textbox', { name: 'auth.verificationCode' })).toHaveLength(1)
  expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(false)
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
  expect(controls.destinations).toEqual([])
  expect(requestsTo('/api/auth/send-code')).toHaveLength(0)
}

beforeEach(async () => {
  vi.unstubAllEnvs()
  installWebLocks()
  vi.stubGlobal('fetch', fetchBoundary)
  await resetAuthStore()
  localStorage.clear()
  document.cookie = 'referral_code=;max-age=0;path=/'
  useOnboardingDraftStore.setState(useOnboardingDraftStore.getInitialState())
  await useOnboardingDraftStore.persist.rehydrate()
  controls.online = true
  controls.destinations.length = 0
  verificationSignal = undefined
  sessionAccepted = false
  refuseInitialVerification = false
  const pending = new Promise<Response>((resolve) => { releaseVerification = resolve })
  fetchBoundary.mockReset().mockImplementation((input, options) => {
    if (input === '/api/auth/verify-code') {
      if (refuseInitialVerification) {
        refuseInitialVerification = false
        return Promise.resolve(Response.json({ error: 'Invalid verification code' }, { status: 400 }))
      }
      verificationSignal = options?.signal
      return pending
    }
    if (input === '/api/auth/session') return Promise.resolve(sessionAccepted
      ? Response.json({ expiresAt: Date.now() + 3600000, userId: success.userId, refreshFailed: false })
      : Response.json({ expiresAt: null, userId: null, refreshFailed: true }, { status: 401 }))
    if (input === '/api/auth/send-code') return Promise.resolve(new Response(null, { status: 204 }))
    return Promise.resolve(new Response(null, { status: 503 }))
  })
  window.history.replaceState(null, '', link)
})

afterEach(async () => {
  cleanup()
  await act(async () => { releaseVerification(new Response(null, { status: 503 })) })
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

describe('email-link admission through the real auth layout and login page', () => {
  it.each([
    ['automatic link', false],
    ['automatic link', true],
    ['explicit Verify', false],
    ['explicit Verify', true],
  ] as const)('completes %s with prior refresh rejection %s through its owning session and referral continuation', async (entry, refreshRejected) => {
    if (refreshRejected) {
      await useAuthStore.getState().confirmSessionRefreshFailure()
      expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
    }
    const epoch = getSessionEpoch()
    refuseInitialVerification = entry === 'explicit Verify'
    render(<OwningRoutes initialUrl={link} />)
    await expectCleanCodeOwner()
    if (entry === 'explicit Verify') {
      const verify = await screen.findByRole('button', { name: 'auth.verify' })
      await waitFor(() => expect(verify).toBeEnabled())
      expect(requestsTo('/api/auth/verify-code')).toHaveLength(1)
      fireEvent.click(verify)
    }
    const verificationCount = entry === 'explicit Verify' ? 2 : 1
    await waitFor(() => expect(requestsTo('/api/auth/verify-code')).toHaveLength(verificationCount))
    expect(verificationSignal?.aborted).toBe(false)
    expect(getSessionEpoch()).toBe(epoch)
    expect(document.cookie.includes('referral_code=')).toBe(true)

    await act(async () => {
      sessionAccepted = true
      releaseVerification(Response.json(success))
    })

    await waitFor(() => expect(useAuthStore.getState().user?.userId === success.userId).toBe(true))
    expect(useAuthStore.getState().user).toEqual({ userId: success.userId, name: success.name, email: success.email })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().sessionRefreshFailed).toBe(false)
    expect(verificationSignal?.aborted).toBe(false)
    expect(getSessionEpoch()).toBe(epoch + 1)
    expect(screen.getByLabelText('Current URL').textContent).toBe('/calendar')
    expect(controls.destinations).toEqual(['/calendar'])
    expect(document.cookie.includes('referral_code=')).toBe(false)
    expect(requestsTo('/api/profile')).toHaveLength(1)
    expect(requestsTo('/api/auth/verify-code')).toHaveLength(verificationCount)
    expect(requestsTo('/api/auth/send-code')).toHaveLength(0)
  })

  it('keeps the cleaned anonymous code owner mounted until verification publishes its session and safe return', async () => {
    const epoch = getSessionEpoch()
    render(<OwningRoutes initialUrl={link} />)
    await expectCleanCodeOwner()
    await waitFor(() => expect(requestsTo('/api/auth/verify-code')).toHaveLength(1))
    expect(screen.getByRole('textbox', { name: 'auth.verificationCode' })).toBeDisabled()
    expect(getSessionEpoch()).toBe(epoch)
    const request = requestsTo('/api/auth/verify-code')[0]?.[1]
    const submitted: unknown = JSON.parse(typeof request?.body === 'string' ? request.body : '{}')
    expect(typeof submitted === 'object' && submitted !== null && 'email' in submitted && submitted.email === email && 'code' in submitted && submitted.code === code).toBe(true)
    expect(verificationSignal?.aborted).toBe(false)

    await act(async () => { releaseVerification(Response.json(success)) })
    await waitFor(() => expect(screen.getByLabelText('Current URL')).toHaveTextContent('/calendar'))
    expect(useAuthStore.getState().user?.userId === success.userId).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getSessionEpoch()).toBe(epoch + 1)
    expect(controls.destinations).toEqual(['/calendar'])
    expect(requestsTo('/api/auth/verify-code')).toHaveLength(1)
    expect(requestsTo('/api/auth/send-code')).toHaveLength(0)
  })

  it.each(['protection', 'offline'])('retains the cleaned owner while waiting for %s admission', async (waiting) => {
    if (waiting === 'protection') vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'synthetic-site-key')
    else controls.online = false
    const view = render(<OwningRoutes initialUrl={link} />)
    await expectCleanCodeOwner()
    expect(requestsTo('/api/auth/verify-code')).toHaveLength(0)
    if (waiting === 'protection') fireEvent.click(screen.getByRole('button', { name: 'Solve security check' }))
    else { controls.online = true; view.rerender(<OwningRoutes initialUrl={link} />) }
    await waitFor(() => expect(requestsTo('/api/auth/verify-code')).toHaveLength(1))
    await expectCleanCodeOwner()
    view.rerender(<OwningRoutes initialUrl={link} />)
    await act(async () => {})
    expect(requestsTo('/api/auth/verify-code')).toHaveLength(1)
    expect(verificationSignal?.aborted).toBe(false)
  })

  it.each(['wrong', 'expired'])('keeps %s recovery, explicit actions and email editing after cleanup', async (failure) => {
    render(<OwningRoutes initialUrl={link} />)
    await expectCleanCodeOwner()
    await waitFor(() => expect(requestsTo('/api/auth/verify-code')).toHaveLength(1))
    await act(async () => {
      releaseVerification(Response.json({ error: failure === 'expired' ? 'Verification code expired or not found' : 'Invalid verification code' }, { status: 400 }))
    })
    const input = screen.getByRole('textbox', { name: 'auth.verificationCode' })
    await waitFor(() => failure === 'expired' ? expect(input).toBeDisabled() : expect(input).toBeEnabled())
    await expectCleanCodeOwner()
    expect(requestsTo('/api/auth/verify-code')).toHaveLength(1)
    if (failure === 'expired') {
      fireEvent.click(screen.getByRole('button', { name: 'auth.resendCode' }))
      await waitFor(() => expect(requestsTo('/api/auth/send-code')).toHaveLength(1))
      await waitFor(() => expect(input).toBeEnabled())
    } else {
      expect(screen.getByRole('button', { name: 'auth.verify' })).toBeEnabled()
      fireEvent.input(input, { target: { value: '12' } })
      expect(input).toHaveValue('12')
      expect(screen.getByRole('button', { name: 'auth.verify' })).toBeDisabled()
    }
    fireEvent.click(screen.getByRole('button', { name: 'auth.changeEmail' }))
    expect(await screen.findByRole('textbox', { name: 'auth.email' })).toBeEnabled()
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(cleanLink)
    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(false)
    expect(controls.destinations).toEqual([])
  })

  it.each(['departure', 'unmount', 'account replacement'])('still cancels held verification on genuine %s', async (cancellation) => {
    const view = render(<OwningRoutes initialUrl={link} />)
    await expectCleanCodeOwner()
    await waitFor(() => expect(requestsTo('/api/auth/verify-code')).toHaveLength(1))
    if (cancellation === 'unmount') view.unmount()
    else if (cancellation === 'departure') fireEvent.click(screen.getByRole('button', { name: 'Leave login' }))
    else act(() => holdAccount('replacement-account'))
    expect(verificationSignal?.aborted).toBe(true)
    const epoch = getSessionEpoch()
    await act(async () => { releaseVerification(Response.json(success)) })
    expect(getSessionEpoch()).toBe(epoch)
    expect(useAuthStore.getState().user?.userId === success.userId).toBe(false)
    expect(controls.destinations).not.toContain('/calendar')
    if (cancellation === 'departure') {
      fireEvent.click(screen.getByRole('button', { name: 'Open ordinary login' }))
      await waitFor(() => expect(controls.destinations).toContain('/onboarding'))
      expect(screen.queryByRole('textbox', { name: 'auth.verificationCode' })).toBeNull()
      expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(false)
    }
  })
})
