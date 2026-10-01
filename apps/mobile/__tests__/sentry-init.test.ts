import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react-native'

vi.mock('@sentry/react-native', () => ({ init: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.mocked(Sentry.init).mockClear()
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('initSentry deployment environment', () => {
  it.each(['staging', 'production', undefined, ''])(
    'reports the build environment %s with a production default',
    async (environment) => {
      vi.stubEnv('EXPO_PUBLIC_SENTRY_ENVIRONMENT', environment)
      vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://public@example.com/1')

      const { initSentry, scrubEvent } = await import('@/lib/sentry')
      initSentry()

      expect(Sentry.init).toHaveBeenCalledExactlyOnceWith({
        dsn: 'https://public@example.com/1',
        enabled: true,
        environment: environment || 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend: scrubEvent,
      })
    },
  )

  it.each([undefined, ''])('stays disabled without a DSN (%s)', async (dsn) => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', dsn)

    const { initSentry } = await import('@/lib/sentry')
    initSentry()

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      dsn,
      enabled: false,
    }))
  })
})
