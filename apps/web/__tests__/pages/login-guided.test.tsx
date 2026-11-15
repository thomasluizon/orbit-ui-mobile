import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import { authLocales, authScreenStates, createLoginScreenFixture, type AuthScreenState } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { motionDurations } from '@orbit/shared/theme'
import { LoginContent, type LoginCallback } from '@/app/(auth)/login/login-content'
import { AuthPageFrame } from '@/components/auth/auth-page-frame'
import { GuidedSignInContext } from '@/components/auth/guided-sign-in'
import { useAuthStore } from '@/stores/auth-store'

type Locale = typeof authLocales[number]
const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown>, captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn(), reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({ ...await importOriginal<typeof import('motion/react')>(), useReducedMotion: () => mocks.reduced }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => <div data-turnstile="" /> }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: mocks.captureGuidedFlowEvent, captureGuidedFlowCompleted: mocks.captureGuidedFlowCompleted }))

const handlers = {
  setEmail: vi.fn(), sendCode: vi.fn(), refuseEmptyEmail: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), backToEmail: vi.fn(),
  signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), onCodeChange: vi.fn(), continueAccount: vi.fn(),
}

function stubMedia(matching: readonly string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.some((feature) => query.includes(feature)), media: query,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  }))
}

function setFixture(state: AuthScreenState, locale: Locale, overrides: Record<string, unknown> = {}) {
  const fixture = createLoginScreenFixture(state, locale)
  mocks.flow = { ...fixture, t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }), ...handlers, ...overrides }
  return fixture
}

function show(state: AuthScreenState, locale: Locale, options: { guided?: boolean; callback?: LoginCallback; overrides?: Record<string, unknown> } = {}) {
  const fixture = setFixture(state, locale, options.overrides)
  const view = render(<GuidedSignInContext value={options.guided ?? true}><AuthPageFrame><LoginContent callback={options.callback} /></AuthPageFrame></GuidedSignInContext>)
  return { ...view, t: fixture.t }
}

/** The names of every button and link a person can use, so the two surfaces compare by what they offer. */
function reachableControls(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('button:not(:disabled), a')].map((control) => control.getAttribute('aria-label') ?? control.textContent).sort((first, second) => first.localeCompare(second))
}

beforeEach(() => {
  stubMedia([])
  mocks.reduced = false
  vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'org.useorbit.web')
  for (const handler of Object.values(handlers)) handler.mockClear()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe.each(authLocales)('guided sign-in in %s', (locale) => {
  it('asks the email question once: the heading, the label and the accessible name are one string', () => {
    const { t, container } = show('email', locale)
    const question = t('auth.email')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(question)
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: question })
    expect([...field.labels!].map((label) => label.textContent)).toEqual([question])
    expect(container).not.toHaveTextContent(t('auth.emailTitle'))
    expect(container.querySelector('[data-asset="orbit-lockup"]')).toBeNull()
  })

  it('offers Google and Apple as the options above the email field', () => {
    const { t, container } = show('email', locale)
    const group = container.querySelector<HTMLElement>('[data-option-group]')!
    const google = within(group).getByRole('button', { name: t('auth.signInWithGoogle') })
    const apple = within(group).getByRole('button', { name: t('auth.signInWithApple') })
    const field = screen.getByRole('textbox')
    expect(google.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(apple.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(google)
    fireEvent.click(apple)
    expect(handlers.signInWithGoogle).toHaveBeenCalledOnce()
    expect(handlers.signInWithApple).toHaveBeenCalledOnce()
  })

  it('keeps the continue action enabled: an empty submit asks for the hint and a typed address sends the code', () => {
    const { t, unmount } = show('email', locale)
    const action = screen.getByRole('button', { name: t('auth.sendCode') })
    expect(action).toBeEnabled()
    fireEvent.click(action)
    expect(handlers.refuseEmptyEmail).toHaveBeenCalledOnce()
    expect(handlers.sendCode).not.toHaveBeenCalled()
    unmount()
    show('send failed', locale)
    fireEvent.click(screen.getByRole('button', { name: t('auth.sendCode') }))
    expect(handlers.sendCode).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent(t('auth.errors.sendFailed'))
  })

  it('shows the empty or malformed address hint beside the field', () => {
    const { t } = show('email invalid', locale)
    const field = screen.getByRole('textbox', { name: t('auth.email') })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(t('auth.errors.invalidEmail'))
  })

  it('keeps the offline refusal with its visible reason on both steps', () => {
    const { t, container, unmount } = show('offline', locale)
    expect(container.querySelector('[data-offline-notice]')).toHaveTextContent(t('auth.errors.offline'))
    expect(screen.getByRole('button', { name: t('auth.sendCode') })).toHaveAccessibleDescription(t('auth.errors.offline'))
    expect(screen.getByRole('button', { name: t('auth.signInWithGoogle') })).toBeDisabled()
    expect(container).toHaveTextContent(t('auth.googleOffline'))
    unmount()
    const code = show('code', locale, { overrides: { isOnline: false } })
    expect(code.container.querySelector('[data-offline-notice]')).toHaveTextContent(t('auth.errors.offline'))
    expect(screen.getByRole('button', { name: t('auth.verify') })).toHaveAccessibleDescription(t('auth.errors.offline'))
  })

  it('keeps the email step and names the human check as the reason while it is not passed', () => {
    const { t, container, unmount } = show('email', locale, { overrides: { email: 'person@example.com', turnstileSiteKey: 'site-key', turnstileToken: null, turnstileResetKey: 0, onTurnstileToken: vi.fn() } })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('auth.email'))
    expect(screen.getByRole('button', { name: t('auth.sendCode') })).toHaveAccessibleDescription(t('auth.turnstileLabel'))
    expect(container.querySelector('form [data-turnstile]')).not.toBeNull()
    unmount()
    const code = show('code', locale, { overrides: { turnstileSiteKey: 'site-key', turnstileToken: null, turnstileResetKey: 0, onTurnstileToken: vi.fn() } })
    expect(code.container.querySelector('form [data-turnstile]')).not.toBeNull()
  })

  it('asks the code question, and the Orbit line states where the code went', () => {
    const { t, container } = show('code', locale)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(t('auth.verificationCode'))
    expect(screen.getByRole('textbox', { name: t('auth.verificationCode') })).toBeInTheDocument()
    expect(heading).toHaveAccessibleDescription(t('auth.line.codeSent', { email: 'person@example.com' }))
    expect(container.querySelector('[data-question-flow]')).toHaveAttribute('data-step', 'code')
    fireEvent.click(screen.getByRole('button', { name: t('auth.changeEmail') }))
    expect(handlers.backToEmail).toHaveBeenCalledOnce()
  })

  it('keeps the code step with the server message after a wrong code', () => {
    const { t } = show('code wrong', locale)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('auth.verificationCode'))
    expect(screen.getByRole('alert')).toHaveTextContent(t('auth.errors.invalidCode'))
    expect(screen.getByRole('textbox')).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: t('auth.verify') }))
    expect(handlers.verifyCode).toHaveBeenCalledOnce()
  })

  it('names the expired code in the Orbit line and offers the resend action, not a retype', () => {
    const { t } = show('code expired', locale)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription(t('auth.line.codeExpired'))
    expect(screen.queryByRole('button', { name: t('auth.verify') })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('auth.resendCode') }))
    expect(handlers.resendCode).toHaveBeenCalledOnce()
  })

  it('names the lock with its countdown and offers no action the server refuses', () => {
    const { t, container } = show('locked out', locale)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription(t('auth.line.codeLocked', { time: '15:00' }))
    expect(container.querySelector('[data-capacity-notice]')).toHaveTextContent(t('auth.errors.tooManyAttempts'))
    expect(screen.queryByRole('button', { name: t('auth.verify') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('auth.resendCode') })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('auth.changeEmail') })).toBeEnabled()
  })

  it('shows the resend countdown, then the resend action', () => {
    const { t, container, unmount } = show('code', locale)
    expect(container).toHaveTextContent(t('auth.resendIn', { time: '0:42' }))
    expect(screen.queryByRole('button', { name: t('auth.resendCode') })).not.toBeInTheDocument()
    unmount()
    show('resend ready', locale)
    expect(screen.getByRole('button', { name: t('auth.resendCode') })).toBeEnabled()
  })

  it.each([[1], [4]])('states the plan that waits with %i habits when the person comes from onboarding', (count) => {
    const { t } = show('from onboarding', locale, { overrides: { pendingHabitCount: count } })
    const line = t('auth.line.plan', { count })
    expect(line).toContain(String(count))
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleDescription(line)
    expect(screen.getByRole('button', { name: t('auth.onboarding.continue') })).toBeEnabled()
  })

  it('keeps the referral banner and the legal line with both links', () => {
    const { t, container } = show('referred', locale)
    expect(container).toHaveTextContent(t('referral.loginBanner'))
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/about', '/about'])
  })

  it('shows the account that came back as one centred block with its one action', () => {
    const { t, container } = show('account back', locale)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('auth.accountBack.title'))
    expect(container.querySelector('[data-account-back] [data-orbit-state]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: t('auth.accountBack.action') }))
    expect(handlers.continueAccount).toHaveBeenCalledOnce()
  })

  it.each(['google', 'apple'] as const)('shows a failed %s callback as a full-surface state with Orbit in Parado, the message and the way back to sign-in', (provider) => {
    const { t, container } = show('email', locale, { callback: { state: 'failed', provider, onContinue: vi.fn() } })
    const state = container.querySelector<HTMLElement>('[data-error-state]')!
    expect(state).toHaveTextContent(t(provider === 'apple' ? 'auth.errors.appleError' : 'auth.errors.googleError'))
    expect(state.querySelector('[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(state.querySelector('[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-face', 'rig')
    expect(container.querySelector('[data-question-flow]')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    expect(container.querySelector('[data-error-state]')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('auth.email'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    for (const name of [t('auth.signInWithGoogle'), t('auth.signInWithApple'), t('auth.sendCode')]) expect(screen.getByRole('button', { name })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: t('auth.signInWithGoogle') }))
    expect(handlers.signInWithGoogle).toHaveBeenCalledOnce()
  })

  it.each(['google', 'apple'] as const)('returns to the email step with Orbit in Parado and no error text after the person cancels %s', (provider) => {
    const { t, container } = show('email', locale, { callback: { state: 'cancelled', provider, onContinue: vi.fn() } })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('auth.email'))
    expect(container.querySelector('[data-question-flow]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(container.querySelector('[data-error-state]')).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent(t(provider === 'apple' ? 'auth.errors.appleError' : 'auth.errors.googleError'))
    for (const name of [t('auth.signInWithGoogle'), t('auth.signInWithApple'), t('auth.sendCode')]) expect(screen.getByRole('button', { name })).toBeEnabled()
  })

  it.each(['failed', 'cancelled'] as const)('keeps the provider line of the current surface with the flag off after a %s callback', (state) => {
    const { t, container } = show('email', locale, { guided: false, callback: { state, provider: 'google', onContinue: vi.fn() } })
    expect(container.querySelector('[data-error-state]')).toBeNull()
    expect(container).toHaveTextContent(t('auth.errors.googleError'))
  })

  it('keeps the provider action busy while the callback waits', () => {
    const { t } = show('email', locale, { callback: { state: 'pending', provider: 'google', onContinue: vi.fn() } })
    expect(screen.getByRole('button', { name: t('auth.signInWithGoogle') })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it.each(authScreenStates)('holds one main landmark in %s on the guided surface and on the current surface', (state) => {
    const guided = show(state, locale)
    expect(guided.container.querySelectorAll('main')).toHaveLength(1)
    guided.unmount()
    const current = show(state, locale, { guided: false })
    expect(current.container.querySelectorAll('main')).toHaveLength(1)
    expect(current.container.querySelector('main')).toHaveAttribute('data-auth-page-frame')
  })

  it.each(authScreenStates)('keeps every control of the current surface in %s, with Orbit never resting and no old name', (state) => {
    const current = show(state, locale, { guided: false })
    const currentControls = reachableControls(current.container)
    const currentFields = current.container.querySelectorAll('input').length
    current.unmount()
    const { container } = show(state, locale)
    const guidedControls = reachableControls(container)
    for (const control of currentControls) expect(guidedControls, `${state}: ${control}`).toContain(control)
    expect(container.querySelectorAll('input')).toHaveLength(currentFields)
    expect(container.querySelector('[data-orbit-state="descansando"]')).toBeNull()
    expect(container.querySelector('[data-orbit-state]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(container.textContent).not.toMatch(/astra/i)
    expect(container.querySelector('.animate-spin')).toBeNull()
  })
})

describe('guided sign-in field contract', () => {
  it.each([true, false])('keeps the name, the autocomplete value and the order of every field, guided %s', (guided) => {
    const email = show('email', 'en', { guided })
    const emailFields = [...email.container.querySelectorAll('form input')]
    expect(emailFields.map((field) => [field.getAttribute('name'), field.getAttribute('autocomplete'), field.getAttribute('type')])).toEqual([['email', 'email', 'email']])
    expect(email.container.querySelector('form')!.querySelector('input, button, select, textarea')).toBe(emailFields[0])
    email.unmount()
    const code = show('code', 'en', { guided })
    const codeFields = [...code.container.querySelectorAll('form input')]
    expect(codeFields.map((field) => [field.getAttribute('name'), field.getAttribute('autocomplete'), field.getAttribute('inputmode')])).toEqual([['verificationCode', 'one-time-code', 'numeric']])
    expect(code.container.querySelector('form')!.querySelector('input, button, select, textarea')).toBe(codeFields[0])
  })
})

describe('guided sign-in motion and flag', () => {
  it.each([[false, motionDurations.slow], [true, 0]])('changes step with reduced motion %s in %i ms and keeps the wrong code still under reduced motion', (reduced, duration) => {
    stubMedia(reduced ? ['prefers-reduced-motion'] : [])
    mocks.reduced = reduced
    const { container } = show('code wrong', 'pt-BR')
    expect(container.querySelector('[data-step-duration]')).toHaveAttribute('data-step-duration', String(duration))
    expect(container.querySelector('[data-code-shake]') !== null).toBe(!reduced)
  })

  it('reports the flow as sign_in with two steps and sends no typed text', () => {
    show('code', 'en')
    expect(mocks.captureGuidedFlowEvent).toHaveBeenCalledWith({ name: 'guided_flow_step_viewed', properties: { flow: 'sign_in', step: 'code', step_count: 2 } })
    expect(JSON.stringify(mocks.captureGuidedFlowEvent.mock.calls)).not.toContain('person@example.com')
  })

  it('reports the run as completed when the account came back or the session exists, and never on a step', () => {
    mocks.captureGuidedFlowCompleted.mockClear()
    const email = show('email', 'en')
    const code = show('code wrong', 'en')
    expect(mocks.captureGuidedFlowCompleted).not.toHaveBeenCalled()
    email.unmount()
    code.unmount()
    const account = show('account back', 'en')
    expect(mocks.captureGuidedFlowCompleted).toHaveBeenCalledExactlyOnceWith('sign_in', 2, false)
    account.unmount()
    mocks.captureGuidedFlowCompleted.mockClear()
    useAuthStore.setState({ isAuthenticated: true })
    onTestFinished(() => useAuthStore.setState({ isAuthenticated: false }))
    show('code', 'en')
    expect(mocks.captureGuidedFlowCompleted).toHaveBeenCalledExactlyOnceWith('sign_in', 2, false)
    mocks.captureGuidedFlowCompleted.mockClear()
    show('account back', 'en', { guided: false })
    expect(mocks.captureGuidedFlowCompleted).not.toHaveBeenCalled()
  })

  it('renders the current surface with the flag off', () => {
    const { t, container } = show('email', 'en', { guided: false })
    expect(container.querySelector('[data-question-flow]')).toBeNull()
    expect(container.querySelector('[data-asset="orbit-lockup"]')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('auth.emailTitle'))
    expect(screen.getByRole('button', { name: t('auth.sendCode') })).toBeDisabled()
  })
})
