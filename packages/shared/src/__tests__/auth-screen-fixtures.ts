import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { resolveMotionPreset } from '../theme'
import { backendLoginResponseSchema } from '../types/auth'
import type { LoginCodeFailure } from '../utils/auth-login'

export const authScreenStates = ['email', 'email invalid', 'referred', 'from onboarding', 'sending', 'send failed',
  'code', 'code typing', 'from link', 'code wrong', 'code expired', 'locked out', 'resend ready', 'verifying',
  'google', 'google failed', 'account back', 'offline'] as const
export type AuthScreenState = typeof authScreenStates[number]
export const authLocales = ['en', 'pt-BR'] as const

export function authTranslator(locale: typeof authLocales[number]) {
  const catalog = locale === 'en' ? en : ptBR
  return (key: string, params?: Record<string, unknown>): string => {
    let value: unknown = catalog
    for (const part of key.split('.')) value = (value as Record<string, unknown>)[part]
    if (typeof value !== 'string') throw new Error('Missing translation: ' + key)
    return value.replace(/\{(\w+)\}/g, (_, name: string) => {
      const parameter = params?.[name]
      return typeof parameter === 'string' || typeof parameter === 'number' ? String(parameter) : '{' + name + '}'
    })
  }
}

export function createLoginScreenFixture(state: AuthScreenState, locale: typeof authLocales[number]) {
  const t = authTranslator(locale)
  const codeStates: readonly AuthScreenState[] = ['code', 'code typing', 'from link', 'code wrong', 'code expired', 'locked out', 'resend ready', 'verifying']
  const step: 'email' | 'code' = codeStates.includes(state) ? 'code' : 'email'
  const failures: Partial<Record<AuthScreenState, string>> = {
    'email invalid': 'auth.errors.invalidEmail', 'send failed': 'auth.errors.sendFailed',
    'code wrong': 'auth.errors.invalidCode', 'code expired': 'auth.errors.codeExpired', 'google failed': 'auth.errors.googleError',
  }
  const errorKey = failures[state] ?? null
  const codeFailure: LoginCodeFailure = state === 'locked out' ? 'locked' : state === 'code expired' ? 'expired' : state === 'code wrong' ? 'wrong' : null
  const code = state === 'code typing' ? '1234' : ['from link', 'verifying', 'code wrong', 'code expired'].includes(state) ? '123456' : ''
  return {
    t, step, email: state === 'email' ? '' : 'person@example.com',
    codeDigits: Array.from({ length: 6 }, (_, index) => code[index] ?? ''),
    isSubmitting: state === 'sending' || state === 'verifying', isGoogleLoading: state === 'google',
    errorKey, errorMessage: errorKey ? t(errorKey) : null, codeFailure,
    successMessage: state === 'code' ? t('auth.codeSent') : null, lockCountdown: 900,
    canResend: state === 'resend ready', resendCountdown: 42,
    referralCode: state === 'referred' ? 'REF123' : undefined, showReferralBanner: state === 'referred',
    fromOnboarding: state === 'from onboarding', pendingHabitCount: 4, plannedHabitCount: 4,
    isOnline: state !== 'offline', authStepMotion: resolveMotionPreset('route-replace', true),
    accountBack: state === 'account back' ? backendLoginResponseSchema.parse({
      userId: 'person-id', name: 'Person', email: 'person@example.com', token: 'test-token', refreshToken: null, wasReactivated: true,
    }) : null,
  }
}
