import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { authLocales, authScreenStates, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { LoginContent } from '@/app/(auth)/login/login-content'

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown>, action: vi.fn() }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('motion/react', async () => {
  const React = await import('react')
  return { useReducedMotion: () => true,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children) } }
})

function setFixture(state: Parameters<typeof createLoginScreenFixture>[0], locale: typeof authLocales[number]) {
  const fixture = createLoginScreenFixture(state, locale)
  mocks.flow = { ...fixture, setEmail: mocks.action, sendCode: mocks.action, verifyCode: mocks.action,
    resendCode: mocks.action, backToEmail: mocks.action, signInWithGoogle: mocks.action,
    onCodeChange: mocks.action, continueAccount: mocks.action }
  return fixture
}

describe.each(authLocales)('auth screen composition in %s', (locale) => {
  beforeEach(() => vi.clearAllMocks())
  it.each(['resend ready', 'code expired'] as const)('puts the busy state on resend for %s', (state) => {
    const { t } = setFixture(state, locale)
    mocks.flow.isSubmitting = true
    mocks.flow.isResending = true
    render(<LoginContent />)
    expect(screen.getByRole('button', { name: t('auth.resendCode') })).toHaveAttribute('aria-busy', 'true')
    if (state === 'code expired') expect(screen.queryByRole('button', { name: t('auth.verify') })).not.toBeInTheDocument()
    else expect(screen.getByRole('button', { name: t('auth.verify') })).not.toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  describe.each(['dark', 'light'])('%s theme', (theme) => {
    it.each(authScreenStates)('renders %s with its available recovery actions', (state) => {
      document.documentElement.className = theme
      const fixture = setFixture(state, locale)
      const { t } = fixture
      const { container } = render(<LoginContent />)
      expect(container.querySelector('[data-asset="orbit-lockup"]')).toBeInTheDocument()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
      if (state === 'account back') {
        expect(screen.getByRole('heading')).toHaveTextContent(t('auth.accountBack.title'))
        expect(screen.getAllByRole('button')).toHaveLength(1)
        fireEvent.click(screen.getByRole('button', { name: t('auth.accountBack.action') }))
        expect(mocks.action).toHaveBeenCalledTimes(1)
        return
      }
      if (fixture.errorMessage) expect(screen.getByRole('alert')).toHaveTextContent(fixture.errorMessage)
      if (fixture.step === 'email') { assertEmailState(state, fixture); return }
      const input = screen.getByRole('textbox', { name: t('auth.verificationCode') })
      expect(input).toHaveValue(fixture.codeDigits.join(''))
      expect(screen.getAllByRole('textbox')).toHaveLength(1)
      const blocked = ['locked out', 'code expired'].includes(state)
      if (blocked || state === 'verifying') expect(input).toBeDisabled()
      else expect(input).toBeEnabled()
      expect(screen.queryByRole('button', { name: t('auth.verify') }) !== null).toBe(!blocked)
      expect(screen.queryByRole('button', { name: t('auth.resendCode') }) !== null).toBe(['resend ready', 'code expired'].includes(state))
      expect(screen.getByRole('button', { name: t('auth.changeEmail') })).toBeInTheDocument()
      if (state === 'locked out') {
        expect(container.querySelector('[data-capacity-notice]')).toHaveTextContent(t('auth.errors.tooManyAttempts'))
        expect(container.textContent).not.toMatch(/\d+:\d{2}/)
      }
      if (state === 'code wrong' || state === 'code expired') expect(container.querySelectorAll('[data-otp-cell][data-error]')).toHaveLength(6)
    })
  })

  it('keeps offline neutral on the code step and explains disabled actions', () => {
    const { t } = setFixture('code wrong', locale)
    mocks.flow.isOnline = false
    mocks.flow.canResend = true
    render(<LoginContent />)
    expect(screen.getByText(t('auth.errors.offline'))).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('auth.verify') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('auth.resendCode') })).toBeDisabled()
  })

  it('uses the singular habit count and retains referral on the code step', () => {
    const { t } = setFixture('from onboarding', locale)
    mocks.flow.pendingHabitCount = 1
    const view = render(<LoginContent />)
    expect(screen.getByText(t('auth.onboarding.habitOne'))).toBeInTheDocument()
    setFixture('code', locale)
    mocks.flow.referralCode = 'REF123'
    view.rerender(<LoginContent />)
    expect(screen.getByText(t('referral.loginBanner'))).toBeInTheDocument()
  })
})


it('lets a callback failure yield to the next email validation result', () => {
  const { t } = setFixture('email', 'en')
  const callback = { state: 'failed' as const, onContinue: mocks.action }
  const view = render(<LoginContent callback={callback} />)
  expect(screen.getByRole('alert')).toHaveTextContent(t('auth.errors.googleError'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'incomplete' } })
  setFixture('email invalid', 'en')
  view.rerender(<LoginContent callback={callback} />)
  expect(screen.getByRole('alert')).toHaveTextContent(t('auth.errors.invalidEmail'))
})

function assertEmailState(state: Parameters<typeof setFixture>[0], fixture: ReturnType<typeof setFixture>) {
  const { t } = fixture
        expect(screen.getByRole('button', { name: t('auth.signInWithGoogle') })).toBeInTheDocument()
        const submit = screen.getByRole('button', { name: t(fixture.fromOnboarding ? 'auth.onboarding.continue' : 'auth.sendCode') })
        if (['sending', 'google', 'offline', 'email'].includes(state)) expect(submit).toBeDisabled()
        expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/about', '/about'])
        if (fixture.fromOnboarding) expect(screen.getByText(t('auth.onboarding.habits', { count: 4 }))).toBeInTheDocument()
        if (state === 'referred') expect(screen.getByText(t('referral.loginBanner')).closest('[role="status"]')).toBeInTheDocument()
        if (state === 'offline') {
          expect(screen.getByText(t('auth.errors.offline'))).toBeInTheDocument()
          expect(screen.getByText(t('auth.googleOffline'))).toBeInTheDocument()
          expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        }
}
