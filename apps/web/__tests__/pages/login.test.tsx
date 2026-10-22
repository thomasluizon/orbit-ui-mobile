import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, queryAllByRole, render, screen, waitFor, within } from '@testing-library/react'
import { createContext, useContext, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { Page } from '@playwright/test'
import type { NamespaceKeys, NestedKeyOf } from 'next-intl'

const { smokeLocale } = vi.hoisted(() => ({ smokeLocale: { value: null as 'en' | 'pt-BR' | null } }))

const { mockResolveMotionPreset, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn(() => true),
  mockResolveMotionPreset: vi.fn(
    (scenario: string, reducedMotionEnabled = false) => ({
      scenario,
      enterDuration: 120,
      exitDuration: 90,
      enterEasing: [0, 0, 1, 1] as const,
      exitEasing: [0, 0, 1, 1] as const,
      shift: reducedMotionEnabled ? 0 : 12,
      scaleFrom: 1,
      scaleTo: 1,
      spring: 'soft' as const,
      reducedMotionEnabled,
    }),
  ),
}))

vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>()
  return {
    ...actual,
    useTranslations: (namespace?: NamespaceKeys<typeof en, NestedKeyOf<typeof en>>) => smokeLocale.value
      ? actual.createTranslator({ locale: smokeLocale.value, messages: smokeLocale.value === 'en' ? en : ptBR, namespace })
      : Object.assign(
      (key: string, params?: Record<string, unknown>) => params ? `${key}:${JSON.stringify(params)}` : key,
      { rich: actual.createTranslator({ locale: 'en', messages: en }).rich },
    ),
    useLocale: () => smokeLocale.value ?? 'en',
  }
})

vi.mock('motion/react', () => {
  const React = require('react')
  const motion = {
      div: function MockMotionComponent({
        children,
        ref,
        ...rest
      }: Record<string, unknown> & {
        children?: React.ReactNode
        ref?: React.Ref<unknown>
      }) {
        return React.createElement('div', { ...rest, ref }, children)
      },
  }

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: mockUseReducedMotion,
  }
})

vi.mock('@orbit/shared/theme', async (importActual) => ({
  ...(await importActual<typeof import('@orbit/shared/theme')>()),
  resolveMotionPreset: mockResolveMotionPreset,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/components/auth/turnstile-widget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" onClick={() => onToken('widget-token')}>Solve security check</button>
  ),
}))

const mockPush = vi.fn()
const NavigationContext = createContext<{ path: string; navigate: (destination: string) => void }>({ path: '/login', navigate: mockPush })
let searchParamValues: Record<string, string | null> = {
  email: 'person@example.com',
  code: '123456',
  returnUrl: '/',
}
const mockSearchParams = () => new URLSearchParams(Object.entries(searchParamValues).flatMap(([key, value]) => value === null ? [] : [[key, value]]))
vi.mock('next/navigation', () => ({
  useRouter: () => {
    const { navigate } = useContext(NavigationContext)
    return { push: navigate, replace: navigate }
  },
  usePathname: () => new URL(useContext(NavigationContext).path, 'https://example.test').pathname,
  useSearchParams: () => {
    const { navigate, path } = useContext(NavigationContext)
    return navigate === mockPush ? mockSearchParams() : new URL(path, 'https://example.test').searchParams
  },
}))

vi.mock('@/stores/auth-store', async (importActual) => {
  const actual = await importActual<typeof import('@/stores/auth-store')>()
  return {
    ...actual,
    useAuthStore: Object.assign((selector?: (state: { isAuthenticated: boolean; sessionInactive: boolean }) => unknown) => selector
      ? selector({ isAuthenticated: false, sessionInactive: false }) : { setAuth: vi.fn() }, {
      getState: actual.useAuthStore.getState,
      subscribe: actual.useAuthStore.subscribe,
    }),
  }
})

vi.mock('@/lib/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => children }))

const mockShowError = vi.fn()
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mockShowError }),
}))

const { mockIsOnline } = vi.hoisted(() => ({ mockIsOnline: { value: true } }))
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline.value }),
}))

import LoginPage from '@/app/(auth)/login/page'
import AuthLayout from '@/app/(auth)/layout'
import OnboardingLayout from '@/app/(onboarding)/layout'
import OnboardingPage from '@/app/(onboarding)/onboarding/page'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

function SmokeRoutes({ visits }: { visits: string[] }) {
  const [path, setPath] = useState('/login')
  const navigation = useMemo(() => ({ path, navigate: (destination: string) => {
    visits.push(destination)
    setPath(destination)
  } }), [path, visits])
  const [queryClient] = useState(() => new QueryClient())
  return <QueryClientProvider client={queryClient}><NavigationContext.Provider value={navigation}>
    <output aria-label="Current URL">{path}</output>
    {path.startsWith('/onboarding')
      ? <OnboardingLayout><OnboardingPage /></OnboardingLayout>
      : <AuthLayout><LoginPage /></AuthLayout>}
  </NavigationContext.Provider></QueryClientProvider>
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mockPush.mockClear()
    mockShowError.mockClear()
    mockResolveMotionPreset.mockClear()
    mockUseReducedMotion.mockReset()
    mockUseReducedMotion.mockReturnValue(true)
    mockIsOnline.value = true
    searchParamValues = {
      email: 'person@example.com',
      code: '123456',
      returnUrl: '/',
    }
  })

  it('disables send until the web widget supplies a token', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')
    searchParamValues = { email: null, code: null, returnUrl: '/' }
    render(<LoginPage />)
    fireEvent.input(screen.getByLabelText('auth.email'), { target: { value: 'user@test.com' } })
    expect(screen.getByRole('button', { name: 'auth.sendCode' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Solve security check' }))
    expect(screen.getByRole('button', { name: 'auth.sendCode' })).toBeEnabled()
  })

  it('renders the lockup and no navigation shell', () => {
    const { container } = render(<LoginPage />)

    expect(container.querySelector('[data-asset=orbit-lockup]')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('renders one verification code input and exposes one-time-code autocomplete', async () => {
    render(<LoginPage />)

    const input = await screen.findByRole('textbox', { name: 'auth.verificationCode' })
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('name', 'verificationCode')
  })

  it('resolves auth motion presets with the reduced-motion preference', () => {
    render(<LoginPage />)

    expect(mockResolveMotionPreset).toHaveBeenCalledWith('route-replace', true)
  })

  it('renders a spaced stack for send code, divider, and Google sign-in', () => {
    searchParamValues = {
      email: null,
      code: null,
      returnUrl: '/',
    }

    render(<LoginPage />)

    const stack = screen.getByTestId('login-email-step-stack')
    expect(within(stack).getByRole('button', { name: 'auth.sendCode' })).toBeInTheDocument()
    expect(within(stack).getByText('auth.orContinueWith')).toBeInTheDocument()
    expect(within(stack).getByRole('button', { name: 'auth.signInWithGoogle' })).toBeInTheDocument()
  })

  it('renders invalid email beside the field without a duplicate toast', async () => {
    searchParamValues = {
      email: null,
      code: null,
      returnUrl: '/',
    }

    render(<LoginPage />)

    fireEvent.input(screen.getByLabelText('auth.email'), {
      target: { value: 'not-an-email' },
    })
    const input = screen.getByLabelText('auth.email')
    const submit = screen.getByRole('button', { name: 'auth.sendCode' })
    submit.focus()
    fireEvent.submit(screen.getByLabelText('auth.email').closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('auth.errors.invalidEmail')
    })
    expect(mockShowError).not.toHaveBeenCalled()
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('name', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('spellcheck', 'false')
    submit.focus()
    fireEvent.input(input, { target: { value: 'still-invalid' } })
    expect(submit).toHaveFocus()
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('surfaces the offline state and disables sending when the device is offline', () => {
    searchParamValues = {
      email: null,
      code: null,
      returnUrl: '/',
    }
    mockIsOnline.value = false

    render(<LoginPage />)

    expect(screen.getByText('auth.errors.offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'auth.sendCode' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'auth.signInWithGoogle' })).toBeDisabled()
  })
})


const { authRequests } = vi.hoisted(() => ({ authRequests: vi.fn() }))
vi.mock('@/app/(auth)/login/login-form-helpers', async (importActual) => ({
  ...(await importActual<typeof import('@/app/(auth)/login/login-form-helpers')>()),
  fetchAuthEndpoint: authRequests,
}))

vi.mock('@playwright/test', () => ({
  expect: (locator: SmokeDomLocator) => ({ toBeVisible: () => locator.assertVisible() }),
}))

import { authenticate } from '@/e2e/support/auth'

class SmokeDomLocator {
  constructor(readonly selector: string, readonly root: () => ParentNode = () => document,
    readonly matches = () => Array.from(root().querySelectorAll<HTMLElement>(selector))) {}

  element(): HTMLElement {
    const elements = this.matches()
    if (elements.length !== 1) throw new Error(`Actual rendered DOM has ${elements.length} matches for ${this.selector}`)
    return elements[0] as HTMLElement
  }

  locator(selector: string) {
    return new SmokeDomLocator(selector, () => this.element())
  }

  or(other: SmokeDomLocator) {
    return new SmokeDomLocator(`${this.selector} or ${other.selector}`, () => document,
      () => [...new Set([...this.matches(), ...other.matches()])])
  }

  async isVisible() {
    return this.matches().some((element) => !element.closest('[hidden]')
      && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
  }

  async fill(value: string) {
    const element = this.element()
    if (!(element instanceof HTMLInputElement)) throw new Error('fill requires an actual input')
    expect(element).toBeEnabled()
    if (element.name === 'verificationCode') {
      expect(value).toBe('123456')
      expect(element.value).toBe('')
    }
    await act(async () => { fireEvent.input(element, { target: { value } }) })
  }

  async click() {
    const element = this.element()
    expect(element).toBeEnabled()
    await act(async () => { fireEvent.click(element) })
  }

  async assertVisible() {
    await waitFor(() => {
      const element = this.element()
      expect(element).toBeInTheDocument()
      expect(element.closest('[hidden]')).toBeNull()
      expect(getComputedStyle(element).display).not.toBe('none')
      expect(getComputedStyle(element).visibility).not.toBe('hidden')
    })
  }
}

const verificationRequestBoundary = new Error('Real verification request started; session response remains pending')

class SmokeDomPage {
  readonly visits: string[] = []
  private view?: ReturnType<typeof render>

  constructor(readonly withRouteGate = false) {}

  async goto(path: string) {
    expect(path).toBe('/login')
    await act(async () => {
      this.view?.unmount()
      this.view = render(this.withRouteGate ? <SmokeRoutes visits={this.visits} />
        : <><form aria-label="Unrelated form"><button type="submit">Unrelated submit</button></form><LoginPage /></>)
    })
  }

  locator(selector: string) { return new SmokeDomLocator(selector) }

  getByRole(role: 'button', options: { name: string; exact: boolean }) {
    return new SmokeDomLocator(`${role} named ${options.name}`, () => document,
      () => queryAllByRole(document.body, role, options))
  }

  async waitForURL(predicate: (url: URL) => boolean, options?: { timeout: number }) {
    if (!options) {
      await waitFor(() => expect(predicate(new URL(screen.getByLabelText('Current URL').textContent!, 'https://example.test'))).toBe(true))
      return
    }
    expect(predicate(new URL('https://example.test/login'))).toBe(false)
    expect(predicate(new URL('https://example.test/'))).toBe(true)
    expect(options).toEqual({ timeout: 30_000 })
    await waitFor(() => expect(authRequests).toHaveBeenCalledTimes(2))
    throw verificationRequestBoundary
  }
}

describe('production smoke helper against LoginPage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    vi.stubEnv('SMOKE_TEST_EMAIL', 'smoke@example.test')
    vi.stubEnv('SMOKE_TEST_CODE', '123456')
    mockIsOnline.value = true
    mockPush.mockClear()
    searchParamValues = { email: null, code: null, returnUrl: '/' }
    authRequests.mockReset()
    authRequests.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/api/auth/send-code') return
      if (endpoint === '/api/auth/verify-code') return new Promise(() => {})
      throw new Error(`Unexpected auth endpoint ${endpoint}`)
    })
    localStorage.clear()
    useOnboardingDraftStore.setState(useOnboardingDraftStore.getInitialState())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    smokeLocale.value = null
  })

  it.each([
    ['en', null], ['pt-BR', null], ['en', 'onboarding'], ['pt-BR', 'onboarding'],
  ] as const)('submits one complete code through the actual %s form with origin %s', async (locale, from) => {
    smokeLocale.value = locale
    searchParamValues.from = from

    await expect(authenticate(new SmokeDomPage() as unknown as Page)).rejects.toBe(verificationRequestBoundary)

    expect(authRequests.mock.calls).toEqual([
      ['/api/auth/send-code', { email: 'smoke@example.test', language: locale }],
      ['/api/auth/verify-code', { email: 'smoke@example.test', code: '123456', language: locale }, expect.objectContaining({ isCurrent: expect.any(Function), signal: expect.any(AbortSignal), onSuccess: expect.any(Function) })],
    ])
    const label = (locale === 'en' ? en : ptBR).auth.verificationCode
    const input = screen.getByRole('textbox', { name: label })
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(input).toHaveAttribute('name', 'verificationCode')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(document.querySelectorAll('[data-otp-cell][aria-hidden="true"]')).toHaveLength(6)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'] as const)('enters through the real fresh-browser %s gate and returns directly to email', async (locale) => {
    smokeLocale.value = locale
    const page = new SmokeDomPage(true)

    await expect(authenticate(page as unknown as Page)).rejects.toBe(verificationRequestBoundary)

    expect(page.visits).toEqual(['/onboarding', '/login'])
    expect(authRequests.mock.calls).toEqual([
      ['/api/auth/send-code', { email: 'smoke@example.test', language: locale }],
      ['/api/auth/verify-code', { email: 'smoke@example.test', code: '123456', language: locale }, expect.objectContaining({ isCurrent: expect.any(Function), signal: expect.any(AbortSignal), onSuccess: expect.any(Function) })],
    ])
    authRequests.mockClear()
    page.visits.length = 0

    await expect(authenticate(page as unknown as Page)).rejects.toBe(verificationRequestBoundary)

    expect(page.visits).toEqual([])
    expect(authRequests).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: (locale === 'en' ? en : ptBR).onboarding.flow.what.haveAccount })).not.toBeInTheDocument()
  })

  it('preserves the configured security gate instead of forcing a disabled submit', async () => {
    smokeLocale.value = 'en'
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key')

    await expect(authenticate(new SmokeDomPage() as unknown as Page)).rejects.toThrow(/enabled/)

    expect(authRequests).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: en.auth.sendCode })).toBeDisabled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('stops at the existing configuration boundary when the email secret is missing', async () => {
    vi.stubEnv('SMOKE_TEST_EMAIL', '')

    await expect(authenticate(new SmokeDomPage() as unknown as Page)).rejects.toThrow('SMOKE_TEST_EMAIL is required')

    expect(authRequests).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
