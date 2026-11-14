import { act, render, screen } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { EmailStep } from '@/app/(auth)/login/email-step'
import { CodeStep } from '@/app/(auth)/login/code-step'
import { SupportForm } from '@/app/(app)/support/_components/support-form'

vi.mock('motion/react-m', async () => {
  const React = await import('react')
  return { div: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children) }
})
vi.mock('motion/react', () => ({ useReducedMotion: () => true }))

const t = createTranslator({ locale: 'en', messages: en })
const check = <div data-testid="check" />
const scrollIntoView = vi.fn()

class FakeVisualViewport extends EventTarget {
  width = 375
  height = 667
  scale = 1
}

function withIntl(children: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{children}</NextIntlClientProvider>)
}

const surfaces = {
  'sign-in e-mail step': {
    render: () => withIntl(<EmailStep email="ana@example.com" emailFocusRequest={0} onEmailChange={vi.fn()} isSubmitting={false} isGoogleLoading={false}
      isOnline canSubmitTurnstile turnstileWidget={check} errorKey={null} errorMessage={null} onSendCode={vi.fn()} onSignInWithGoogle={vi.fn()} t={t} />),
    field: () => screen.getByRole('textbox', { name: en.auth.email }),
    action: () => screen.getByRole('button', { name: en.auth.sendCode }),
    group: 'login-field-action',
  },
  'sign-in code step': {
    render: () => withIntl(<CodeStep email="ana@example.com" codeDigits={['1', '2', '3', '4', '5', '6']} isSubmitting={false} isResending={false} canResend={false}
      resendCountdown={30} lockCountdown={0} codeFailure={null} errorSignal={null} successMessage={null} isOnline canSubmitTurnstile turnstileWidget={check}
      onVerifyCode={vi.fn()} onCodeChange={vi.fn()} onBackToEmail={vi.fn()} onResendCode={vi.fn()} t={t} />),
    field: () => screen.getByRole('textbox', { name: en.auth.verificationCode }),
    action: () => screen.getByRole('button', { name: en.auth.verify }),
    group: 'login-field-action',
  },
  'support form': {
    render: () => withIntl(<SupportForm email="ana@example.com" subject="problem" message="It stops" messageAsked appVersion="1.0.0" messageMaxLength={2000}
      messageOverLimitHint={null} error={null} subjectError={null} messageError={null} isSending={false} isOnline disabled={false} disabledReason={null}
      subjectFocusRequest={0} messageFocusRequest={0} onSubjectChange={vi.fn()} onMessageChange={vi.fn()} onSubjectBlur={vi.fn()} onMessageBlur={vi.fn()} onSend={vi.fn()} />),
    field: () => screen.getByRole('textbox', { name: new RegExp(en.profile.support.message) }),
    action: () => screen.getByRole('button', { name: en.profile.support.send }),
    group: 'support-field-action',
  },
} as const

describe('web field and action groups', () => {
  let viewport: FakeVisualViewport
  beforeEach(() => {
    viewport = new FakeVisualViewport()
    vi.stubGlobal('visualViewport', viewport)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 667 })
    scrollIntoView.mockReset()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document.documentElement, 'clientHeight')
  })

  it.each(Object.keys(surfaces) as (keyof typeof surfaces)[])('brings the field and the main action of the %s above the keyboard together', (name) => {
    const surface = surfaces[name]
    surface.render()
    const group = screen.getByTestId(surface.group)
    expect(group.contains(surface.field())).toBe(true)
    expect(group.contains(surface.action())).toBe(true)
    if (name !== 'support form') expect(group.contains(screen.getByTestId('check'))).toBe(true)
    act(() => surface.field().focus())
    act(() => {
      viewport.height = 380
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(group)
  })
})
