import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { beforeSendEvent } from '@/lib/sentry-scrub'

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  startInactiveSpan: vi.fn(() => ({ setAttribute: vi.fn(), end: vi.fn() })),
  captureRouterTransitionStart: vi.fn(),
}))

/** Retains the real scrubber across entry-module resets so cold loading finishes during collection. */
vi.mock('@/lib/sentry-scrub', (importOriginal) => importOriginal())

let initialization: Promise<unknown> | undefined
let recoveryListener = vi.spyOn(window, 'addEventListener')

beforeEach(() => {
  recoveryListener = vi.spyOn(window, 'addEventListener')
  vi.resetModules()
  vi.mocked(Sentry.init).mockClear()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', 'a'.repeat(40))
})

afterEach(async () => {
  try {
    await initialization
  } finally {
    initialization = undefined
    for (const [type, listener] of recoveryListener.mock.calls) {
      if (type === 'error' || type === 'unhandledrejection') window.removeEventListener(type, listener)
    }
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  }
})

describe.each([
  ['browser', () => import('../instrumentation-client'), 'NEXT_PUBLIC_SENTRY_DSN'],
  ['server', () => import('../sentry.server.config'), 'SENTRY_DSN'],
  ['edge', () => import('../sentry.edge.config'), 'SENTRY_DSN'],
] as const)('Sentry %s deployment environment', (runtime, initialize, dsnKey) => {
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
        release: 'a'.repeat(40),
        environment: environment || 'production',
        ...(runtime === 'browser' ? { tracesSampler: expect.any(Function) } : { tracesSampleRate: 0 }),
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


it.each(['/habits/new', '/profile', '/login'])('recovers a missing webpack module once on %s', async (pathname) => {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { pathname, reload } })
  sessionStorage.clear()
  initialization = import('../instrumentation-client')
  await initialization
  const failure = new TypeError('o[e] is not a function')
  failure.stack = 'TypeError: o[e] is not a function\n    at i (https://app.example.test/_next/static/chunks/webpack-build.js:1:491)'
  dispatchRecoveryError(failure)
  dispatchRecoveryError(failure)
  expect(reload).toHaveBeenCalledOnce()
})

it('leaves application errors on the error path without reloading', async () => {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { pathname: '/', reload } })
  sessionStorage.clear()
  initialization = import('../instrumentation-client')
  await initialization
  dispatchRecoveryError(new TypeError('handler is not a function'))
  expect(reload).not.toHaveBeenCalled()
})


function dispatchRecoveryError(error: Error) {
  const listeners = recoveryListener.mock.calls.filter(([type]) => type === 'error')
  for (const [, listener] of listeners) {
    if (typeof listener === 'function') listener.call(window, new ErrorEvent('error', { error }))
  }
}


it('retains the reload guard across entry reloads and permits a later build to recover', async () => {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { pathname: '/', reload } })
  sessionStorage.clear()
  const failure = new Error('Loading chunk 17 failed')
  failure.name = 'ChunkLoadError'
  initialization = import('../instrumentation-client')
  await initialization
  dispatchRecoveryError(failure)
  vi.resetModules()
  initialization = import('../instrumentation-client')
  await initialization
  dispatchRecoveryError(failure)
  expect(reload).toHaveBeenCalledOnce()
  vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', 'b'.repeat(40))
  dispatchRecoveryError(failure)
  expect(reload).toHaveBeenCalledTimes(2)
})
