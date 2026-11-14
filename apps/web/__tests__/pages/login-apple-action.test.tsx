import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { EmailStep } from '@/app/(auth)/login/email-step'

vi.mock('motion/react-m', async () => {
  const React = await import('react')
  return { div: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children) }
})
vi.mock('motion/react', () => ({ useReducedMotion: () => true }))

const t = createTranslator({ locale: 'en', messages: en })

afterEach(() => { vi.unstubAllEnvs() })

function renderEmailStep(isAppleLoading: boolean) {
  vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'client-id')
  render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <EmailStep email="ana@example.com" emailFocusRequest={0} onEmailChange={vi.fn()} isSubmitting={false} isGoogleLoading={false} isAppleLoading={isAppleLoading}
      isOnline canSubmitTurnstile turnstileWidget={null} errorKey={null} errorMessage={null} onSendCode={vi.fn()} onSignInWithGoogle={vi.fn()}
      onSignInWithApple={vi.fn()} t={t} />
  </NextIntlClientProvider>)
  return { apple: screen.getByRole('button', { name: en.auth.signInWithApple }), google: screen.getByRole('button', { name: en.auth.signInWithGoogle }) }
}

describe('web Apple sign-in action', () => {
  it('draws Apple\'s custom button rules at the Google pill height and shape', () => {
    const { apple, google } = renderEmailStep(false)
    expect(apple.style.height).toBe(google.style.height)
    expect(apple.className).toContain('rounded-full')
    expect(apple.style.fontSize).toBe(`${Math.round(Number.parseFloat(google.style.height) * 0.43)}px`)
    expect(apple.style.backgroundColor).toBe('light-dark(rgb(0, 0, 0), rgb(255, 255, 255))')
    expect(apple.style.color).toBe('light-dark(rgb(255, 255, 255), rgb(0, 0, 0))')
    expect(apple.style.boxShadow).toBe('none')
    const logo = apple.querySelector('svg[data-asset="apple-sign-in-logo"]')
    expect(logo?.getAttribute('height')).toBe(Number.parseFloat(google.style.height).toString())
    expect(logo?.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
  })

  it('shows Apple sign-in as busy while it starts, as the Google action and the mobile Apple action do', () => {
    const { apple, google } = renderEmailStep(true)
    expect(apple).toHaveAttribute('aria-busy', 'true')
    expect(google).not.toHaveAttribute('aria-busy')
  })
})
