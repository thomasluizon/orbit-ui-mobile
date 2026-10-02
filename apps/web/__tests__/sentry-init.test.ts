import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}))

beforeEach(() => {
  vi.resetModules()
  vi.mocked(Sentry.init).mockClear()
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe.each([
  ['browser', () => import('../instrumentation-client'), 'NEXT_PUBLIC_SENTRY_DSN'],
  ['server', () => import('../sentry.server.config'), 'SENTRY_DSN'],
  ['edge', () => import('../sentry.edge.config'), 'SENTRY_DSN'],
] as const)('Sentry %s deployment environment', (_runtime, initialize, dsnKey) => {
  it.each(['staging', 'production', undefined, ''])(
    'reports the build environment %s with a production default',
    async (environment) => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', environment)
      vi.stubEnv(dsnKey, 'https://public@example.com/1')

      await initialize()
      const { beforeSendEvent } = await import('@/lib/sentry-scrub')

      expect(Sentry.init).toHaveBeenCalledExactlyOnceWith({
        dsn: 'https://public@example.com/1',
        enabled: true,
        environment: environment || 'production',
        tracesSampleRate: 0,
        sendDefaultPii: false,
        beforeSend: beforeSendEvent,
      })
    },
  )

  it.each([undefined, ''])('stays disabled without a DSN (%s)', async (dsn) => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv(dsnKey, dsn)

    await initialize()

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      dsn,
      enabled: false,
    }))
  })
})
