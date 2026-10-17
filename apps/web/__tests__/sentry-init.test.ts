import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { beforeSendEvent } from '@/lib/sentry-scrub'

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}))

/** Retains the real scrubber across entry-module resets so cold loading finishes during collection. */
vi.mock('@/lib/sentry-scrub', (importOriginal) => importOriginal())

let initialization: Promise<unknown> | undefined

beforeEach(() => {
  vi.resetModules()
  vi.mocked(Sentry.init).mockClear()
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(async () => {
  try {
    await initialization
  } finally {
    initialization = undefined
    vi.unstubAllEnvs()
  }
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

      initialization = initialize()
      await initialization

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

    initialization = initialize()
    await initialization

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      dsn,
      enabled: false,
    }))
  })
})
