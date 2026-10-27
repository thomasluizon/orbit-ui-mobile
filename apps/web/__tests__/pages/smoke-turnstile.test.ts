import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Page, Route } from '@playwright/test'
import { installTurnstileStub } from '@/e2e/support/turnstile'

interface SmokeTurnstile {
  render: (container: HTMLElement, options: { callback: (token: string) => void }) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

async function loadStub(): Promise<SmokeTurnstile> {
  let script = ''
  const route = { fulfill: async (options: Parameters<Route['fulfill']>[0]) => {
    expect(options?.contentType).toBe('application/javascript')
    if (typeof options?.body !== 'string') throw new Error('Expected a widget script body')
    script = options.body
  } } as unknown as Route
  const page = { route: async (pattern: string, handler: (route: Route) => Promise<void>) => {
    expect(pattern).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js*')
    await handler(route)
  } } as unknown as Page
  await installTurnstileStub(page)
  window.eval(script)
  const turnstile = (window as Window & { turnstile?: SmokeTurnstile }).turnstile
  if (!turnstile) throw new Error('Widget script did not initialize Turnstile')
  return turnstile
}

beforeEach(() => { vi.useFakeTimers() })

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  delete (window as Window & { turnstile?: SmokeTurnstile }).turnstile
})

it('delivers the documented dummy token on the next task after render', async () => {
  const turnstile = await loadStub()
  const callback = vi.fn()
  const widgetId = turnstile.render(document.createElement('div'), { callback })

  expect(widgetId).toEqual(expect.any(String))
  expect(callback).not.toHaveBeenCalled()
  await vi.runAllTimersAsync()
  expect(callback.mock.calls).toEqual([['XXXX.DUMMY.TOKEN.XXXX']])
})

it('delivers a fresh callback only for the reset widget', async () => {
  const turnstile = await loadStub()
  const first = vi.fn()
  const second = vi.fn()
  const firstId = turnstile.render(document.createElement('div'), { callback: first })
  const secondId = turnstile.render(document.createElement('div'), { callback: second })
  expect(firstId).not.toBe(secondId)
  await vi.runAllTimersAsync()

  turnstile.reset(firstId)
  expect(first).toHaveBeenCalledTimes(1)
  await vi.runAllTimersAsync()
  expect(first.mock.calls).toEqual([['XXXX.DUMMY.TOKEN.XXXX'], ['XXXX.DUMMY.TOKEN.XXXX']])
  expect(second.mock.calls).toEqual([['XXXX.DUMMY.TOKEN.XXXX']])
})

it.each(['render', 'reset'] as const)('cancels pending %s delivery and future resets after removal', async (phase) => {
  const turnstile = await loadStub()
  const callback = vi.fn()
  const widgetId = turnstile.render(document.createElement('div'), { callback })
  if (phase === 'reset') {
    await vi.runAllTimersAsync()
    callback.mockClear()
    turnstile.reset(widgetId)
  }

  turnstile.remove(widgetId)
  await vi.runAllTimersAsync()
  turnstile.reset(widgetId)
  await vi.runAllTimersAsync()
  expect(callback).not.toHaveBeenCalled()
})

it('ignores unknown widget ids without solving another widget', async () => {
  const turnstile = await loadStub()
  const callback = vi.fn()
  const widgetId = turnstile.render(document.createElement('div'), { callback })
  await vi.runAllTimersAsync()
  callback.mockClear()

  turnstile.reset('unknown-widget')
  turnstile.remove('unknown-widget')
  await vi.runAllTimersAsync()
  expect(callback).not.toHaveBeenCalled()

  turnstile.reset(widgetId)
  await vi.runAllTimersAsync()
  expect(callback.mock.calls).toEqual([['XXXX.DUMMY.TOKEN.XXXX']])
})
