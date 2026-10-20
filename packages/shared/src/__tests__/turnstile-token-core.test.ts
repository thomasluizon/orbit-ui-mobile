import { expect, it } from 'vitest'
import {
  clearTurnstileToken,
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
