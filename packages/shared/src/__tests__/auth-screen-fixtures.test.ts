import { expect, it } from 'vitest'
import { authTranslator, createLoginScreenFixture } from './auth-screen-fixtures'

it('keeps Turnstile states readable in both auth locales', () => {
  for (const locale of ['en', 'pt-BR'] as const) {
    const translate = authTranslator(locale)
    expect(translate('auth.turnstileLoading').length).toBeGreaterThan(0)
    expect(translate('auth.turnstileFailed').length).toBeGreaterThan(0)
    expect(translate('auth.turnstileExpired').length).toBeGreaterThan(0)
    expect(translate('auth.turnstileRetry').length).toBeGreaterThan(0)
    expect(translate('notifications.openIn', { target: 'Orbit' })).toContain('Orbit')
  }
})

it('keeps code and offline login fixtures on their intended steps', () => {
  const code = createLoginScreenFixture('code typing', 'en')
  expect(code.step).toBe('code')
  expect(code.codeDigits.join('')).toBe('1234')
  expect(createLoginScreenFixture('offline', 'pt-BR')).toMatchObject({
    step: 'email', isOnline: false,
  })
  expect(createLoginScreenFixture('account back', 'en').accountBack?.wasReactivated).toBe(true)
})
