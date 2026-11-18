import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { EmailStep } from '@/app/(auth)/login/email-step'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

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
    for (const action of [apple, google]) {
      expect(action.style).toMatchObject({ height: '', minHeight: `${SMALL_PILL_VISIBLE_MIN}px`, borderRadius: `${SMALL_PILL_VISIBLE_MIN / 2}px`, whiteSpace: 'normal' })
    }
    expect(apple.style.fontSize).toBe(`${Math.round(SMALL_PILL_VISIBLE_MIN * 0.43) / 16}rem`)
    expect(apple.style.paddingBlock).toBe('0px')
    expect(apple.style.backgroundColor).toBe('var(--apple-sign-in-fill)')
    expect(apple.style.color).toBe('var(--apple-sign-in-ink)')
    expect(apple.style.boxShadow).toBe('none')
    const logo = apple.querySelector('svg[data-asset="apple-sign-in-logo"]')
    expect(logo?.getAttribute('height')).toBe(String(SMALL_PILL_VISIBLE_MIN))
    expect(logo?.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
  })

  it.each([['dark', '#FFFFFF', '#000000'], ['light', '#000000', '#FFFFFF']] as const)('gives the %s theme Apple\'s button and title colours in every browser', (theme, fill, ink) => {
    expect(resolveWebThemeVariables('orange', theme)).toMatchObject({ '--apple-sign-in-fill': fill, '--apple-sign-in-ink': ink })
  })

  it('shows Apple sign-in as busy while it starts, as the Google action and the mobile Apple action do', () => {
    const { apple, google } = renderEmailStep(true)
    expect(apple).toHaveAttribute('aria-busy', 'true')
    expect(google).not.toHaveAttribute('aria-busy')
  })

  it('keeps Apple\'s face, logo and title on a busy action and dims it to the disabled opacity, as the iPhone control does', () => {
    const { apple } = renderEmailStep(true)
    expect(apple).toBeDisabled()
    expect(apple).toHaveAttribute('aria-busy', 'true')
    expect(apple.style.backgroundColor).toBe('var(--apple-sign-in-fill)')
    expect(apple.style.color).toBe('var(--apple-sign-in-ink)')
    expect(apple.querySelector('[data-slot="skeleton-face"]'), 'no skeleton face covers Apple\'s face').toBeNull()
    expect(apple.querySelector('svg[data-asset="apple-sign-in-logo"] path')?.getAttribute('fill')).toBe('currentColor')
    expect(apple.className.split(' ')).toContain('disabled:opacity-40')
  })
})
