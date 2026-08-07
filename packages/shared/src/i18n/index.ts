import type { SupportedLocale } from '../types/profile'

export const defaultLocale: SupportedLocale = 'en'
export const supportedLocales: readonly SupportedLocale[] = ['en', 'pt-BR'] as const

export const webPrivacyThirdPartyKeys = [
  'google',
  'stripe',
  'firebase',
  'openai',
  'resend',
  'googlePlay',
  'admob',
  'sentry',
  'posthog',
  'vercel',
] as const
export const webPrivacyRetentionKeys = [
  'account',
  'sessions',
  'ai',
  'reminderHistory',
  'syncRecords',
  'calendarSuggestions',
  'billingRecords',
  'afterDeletion',
] as const

export const mobilePrivacyThirdPartyKeys = [
  'google',
  'stripe',
  'firebase',
  'openai',
  'resend',
  'googlePlay',
  'admob',
  'sentry',
  'posthog',
  'vercel',
] as const
export const mobilePrivacyRetentionKeys = [
  'account',
  'sessions',
  'ai',
  'reminderHistory',
  'syncRecords',
  'calendarSuggestions',
  'billingRecords',
  'afterDeletion',
] as const

export async function loadLocale(locale: SupportedLocale): Promise<Record<string, unknown>> {
  switch (locale) {
    case 'en':
      return import('./en.json')
    case 'pt-BR':
      return import('./pt-BR.json')
  }
}
