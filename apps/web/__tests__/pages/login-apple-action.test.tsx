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

describe('web Apple sign-in action', () => {
  it('shows Apple sign-in as busy while it starts, as the Google action and the mobile Apple action do', () => {
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <EmailStep email="ana@example.com" emailFocusRequest={0} onEmailChange={vi.fn()} isSubmitting={false} isGoogleLoading={false} isAppleLoading
        isOnline canSubmitTurnstile turnstileWidget={null} errorKey={null} errorMessage={null} onSendCode={vi.fn()} onSignInWithGoogle={vi.fn()}
        onSignInWithApple={vi.fn()} t={t} />
    </NextIntlClientProvider>)
    expect(screen.getByRole('button', { name: en.auth.signInWithApple })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: en.auth.signInWithGoogle })).not.toHaveAttribute('aria-busy')
  })
})
