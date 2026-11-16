import { expect, it, onTestFinished, vi } from 'vitest'
import {
  clearTurnstileToken,
  createTurnstileLoadFailureReporter,
  createTurnstileTokenState,
  receiveTurnstileToken,
  takeTurnstileToken,
  TurnstileTokenController,
} from '../hooks/turnstile-token-core'

it('consumes each token once and advances the widget reset for every request', () => {
  const initial = createTurnstileTokenState()
  expect(takeTurnstileToken(initial, 'site-key').protection).toBeNull()

  const ready = receiveTurnstileToken(initial, 'first-token')
  expect(ready.token).toBe('first-token')
  const first = takeTurnstileToken(ready, 'site-key')
  expect(first.protection).toEqual({ turnstileToken: 'first-token' })
  expect(first.state).toEqual({ token: null, resetKey: 1 })
  expect(takeTurnstileToken(first.state, 'site-key').protection).toBeNull()

  const second = takeTurnstileToken(receiveTurnstileToken(first.state, 'second-token'), 'site-key')
  expect(second.protection).toEqual({ turnstileToken: 'second-token' })
  expect(second.state.resetKey).toBe(2)
  expect(clearTurnstileToken(receiveTurnstileToken(second.state, 'offline-token')).token).toBeNull()
})

it('omits the token field when no site key is configured', () => {
  const ready = receiveTurnstileToken(createTurnstileTokenState(), 'unused-token')
  const result = takeTurnstileToken(ready, undefined)
  expect(result.protection).toEqual({})
  expect(result.state).toEqual(ready)
})

it('publishes consumed state immediately after receiving a token', () => {
  const published = [] as ReturnType<typeof createTurnstileTokenState>[]
  const controller = new TurnstileTokenController((state) => published.push(state))
  const view = controller.view(createTurnstileTokenState(), 'site-key')

  view.onToken('bridge-token')
  expect(view.takeToken()).toEqual({ turnstileToken: 'bridge-token' })
  expect(view.takeToken()).toBeNull()
  expect(published).toEqual([
    { token: 'bridge-token', resetKey: 0 },
    { token: null, resetKey: 1 },
  ])

  controller.receive('offline-token')
  controller.clear()
  expect(controller.take('site-key')).toBeNull()
  expect(published.at(-1)?.token).toBeNull()
})

it('rejects callbacks from a replaced widget without consuming its successor token', () => {
  let state = createTurnstileTokenState()
  const controller = new TurnstileTokenController((next) => { state = next })
  const stale = controller.view(state, 'site-key')
  stale.resetToken()
  const current = controller.view(state, 'site-key')
  expect(stale.onToken('stale-token')).toBe(false)
  expect(current.takeToken()).toBeNull()
  expect(current.onToken('fresh-token')).toBe(true)
  expect(current.takeToken()).toEqual({ turnstileToken: 'fresh-token' })
  expect(current.onToken('replayed-token')).toBe(false)
})

it('sends one event for each different failure of one load, with the kind, the status or code, the host and the time since the load started', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  const capture = vi.fn()
  const report = createTurnstileLoadFailureReporter(capture)
  vi.advanceTimersByTime(1500)
  report({ kind: 'http', host: 'app.useorbit.org', statusCode: 503, description: 'Service Unavailable' })
  vi.advanceTimersByTime(2000)
  report({ kind: 'http', host: 'app.useorbit.org', statusCode: 503, description: 'Service Unavailable' })
  report({ kind: 'http', host: 'app.useorbit.org', statusCode: 429 })
  vi.advanceTimersByTime(34_500)
  report({ kind: 'challenge', host: 'challenges.cloudflare.com', code: '300030' })
  report({ kind: 'challenge', host: 'challenges.cloudflare.com', code: '300030' })
  report({ kind: 'script_deadline', host: 'challenges.cloudflare.com' })
  report({ kind: 'run_deadline', host: 'challenges.cloudflare.com' })

  expect(capture.mock.calls).toEqual([
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'http', host: 'app.useorbit.org', status_code: 503, code: null },
      extra: { description: 'Service Unavailable', elapsed_ms: 1500 }, fingerprint: ['turnstile_load_failed', 'http', '503'] }],
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'http', host: 'app.useorbit.org', status_code: 429, code: null },
      extra: { description: null, elapsed_ms: 3500 }, fingerprint: ['turnstile_load_failed', 'http', '429'] }],
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'challenge', host: 'challenges.cloudflare.com', status_code: null, code: '300030' },
      extra: { description: null, elapsed_ms: 38_000 }, fingerprint: ['turnstile_load_failed', 'challenge', '300030'] }],
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'script_deadline', host: 'challenges.cloudflare.com', status_code: null, code: null },
      extra: { description: null, elapsed_ms: 38_000 }, fingerprint: ['turnstile_load_failed', 'script_deadline', ''] }],
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'run_deadline', host: 'challenges.cloudflare.com', status_code: null, code: null },
      extra: { description: null, elapsed_ms: 38_000 }, fingerprint: ['turnstile_load_failed', 'run_deadline', ''] }],
  ])
})

it('reports a failure again in the next load', () => {
  const capture = vi.fn()
  createTurnstileLoadFailureReporter(capture)({ kind: 'script', host: 'challenges.cloudflare.com' })
  createTurnstileLoadFailureReporter(capture)({ kind: 'script', host: 'challenges.cloudflare.com' })
  expect(capture).toHaveBeenCalledTimes(2)
})
