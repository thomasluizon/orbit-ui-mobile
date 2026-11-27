import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS } from '@orbit/shared/hooks/turnstile-token-core'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  document.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/"]').forEach((script) => script.remove())
})

const SCRIPT = 'script[src^="https://challenges.cloudflare.com/turnstile/"]'

async function failScriptLoad() {
  const script = document.querySelector<HTMLScriptElement>(SCRIPT)!
  await act(async () => { fireEvent.error(script) })
  return script
}

it('loads the script again every 2 s after a load failure until the shared load deadline, then shows a retry and accepts a token from the reloaded widget', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  const onToken = vi.fn()
  const onStateChange = vi.fn()
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} onStateChange={onStateChange} />)
  expect(document.querySelector<HTMLScriptElement>(SCRIPT)!.src).toContain('render=explicit')
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()

  const scripts = [await failScriptLoad()]
  for (let elapsed = 0; elapsed + TURNSTILE_RETRY_INTERVAL_MS < TURNSTILE_LOAD_DEADLINE_MS; elapsed += TURNSTILE_RETRY_INTERVAL_MS) {
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
    expect(onStateChange).toHaveBeenLastCalledWith('loading')
    expect(onToken).toHaveBeenLastCalledWith(null)
    act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS - 1) })
    expect(document.querySelector(SCRIPT), 'the next load waits for 2 s').toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(scripts).not.toContain(document.querySelector(SCRIPT))
    scripts.push(await failScriptLoad())
  }
  expect(scripts).toHaveLength(TURNSTILE_LOAD_DEADLINE_MS / TURNSTILE_RETRY_INTERVAL_MS)
  expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
  act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS - 1) })
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  act(() => { vi.advanceTimersByTime(1) })
  expect(screen.getByRole('alert'), 'the deadline ends the loading state').toHaveTextContent('auth.turnstileFailed')
  expect(onStateChange).toHaveBeenLastCalledWith('failed')
  expect(onToken).toHaveBeenLastCalledWith(null)
  act(() => { vi.runAllTimers() })
  expect(document.querySelector(SCRIPT), 'no load runs after the deadline').toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'auth.turnstileRetry' }))
  scripts.push(await failScriptLoad())
  expect(onStateChange, 'Retry reports the loading state').toHaveBeenLastCalledWith('loading')
  expect(screen.queryByRole('button', { name: 'auth.turnstileRetry' })).toBeNull()
  act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  const retryScript = document.querySelector<HTMLScriptElement>(SCRIPT)!
  expect(scripts).not.toContain(retryScript)
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-2')
  ;(window as Window & { turnstile?: unknown }).turnstile = {
    render: renderWidget,
    reset: vi.fn(),
    remove: vi.fn(),
  }
  await act(async () => { fireEvent.load(retryScript) })
  expect(renderWidget).toHaveBeenCalledOnce()
  act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(screen.getByRole('alert'), 'a loaded script ends the script load deadline, and the first run has its own 60 s').toBeEmptyDOMElement()
  const callbacks = renderWidget.mock.calls[0]![1] as { callback: (token: string) => void }
  act(() => callbacks.callback('reloaded-token'))
  expect(onToken).toHaveBeenLastCalledWith('reloaded-token')
})

it('fails a script load that never ends at the shared load deadline, and a late script cannot change the failed state', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  const onStateChange = vi.fn()
  vi.resetModules()
  const { TurnstileWidget: FreshWidget } = await import('@/components/auth/turnstile-widget')
  await act(async () => { render(<FreshWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} onStateChange={onStateChange} />) })
  const script = document.querySelector<HTMLScriptElement>(SCRIPT)!
  act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
  act(() => { vi.advanceTimersByTime(1) })
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')

  const renderWidget = vi.fn((..._args: unknown[]) => 'late-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  await act(async () => { fireEvent.load(script) })
  expect(renderWidget).not.toHaveBeenCalled()
  expect(onStateChange).toHaveBeenLastCalledWith('failed')
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')
})

it('sends a new script request on Retry after a script load that never ends, under a new load deadline', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  vi.resetModules()
  const { TurnstileWidget: FreshWidget } = await import('@/components/auth/turnstile-widget')
  await act(async () => { render(<FreshWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />) })
  const stalled = document.querySelector<HTMLScriptElement>(SCRIPT)!
  act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')

  fireEvent.click(screen.getByRole('button', { name: 'auth.turnstileRetry' }))
  const requested = [...document.querySelectorAll<HTMLScriptElement>(SCRIPT)]
  expect(requested, 'one script request runs after Retry').toHaveLength(1)
  expect(requested[0], 'Retry sends a new request and does not wait on the stalled one').not.toBe(stalled)
  act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  act(() => { vi.advanceTimersByTime(1) })
  expect(screen.getByRole('alert'), 'Retry starts a new load deadline').toHaveTextContent('auth.turnstileFailed')
})

it('sends a new script request under a new load deadline when the form asks for a new challenge after the load failed', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  vi.resetModules()
  const { TurnstileWidget: FreshWidget } = await import('@/components/auth/turnstile-widget')
  const view = render(<FreshWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
  const stalled = document.querySelector<HTMLScriptElement>(SCRIPT)!
  act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')

  await act(async () => { view.rerender(<FreshWidget siteKey="site-key" resetKey={1} onToken={vi.fn()} />) })
  const requested = [...document.querySelectorAll<HTMLScriptElement>(SCRIPT)]
  expect(requested, 'the new challenge sends one script request').toHaveLength(1)
  expect(requested[0], 'the new challenge does not wait on the stalled request').not.toBe(stalled)
  expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
  act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  act(() => { vi.advanceTimersByTime(1) })
  expect(screen.getByRole('alert'), 'the new challenge starts a new load deadline').toHaveTextContent('auth.turnstileFailed')
})

it('sends one Sentry event for the script load failures of a load and one for the script load deadline, only when the deadline ends the load, with the kind and the host that did not answer', async () => {
  sentry.captureMessage.mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  vi.resetModules()
  const { TurnstileWidget: FreshWidget } = await import('@/components/auth/turnstile-widget')
  render(<FreshWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
  await failScriptLoad()
  for (let elapsed = TURNSTILE_RETRY_INTERVAL_MS; elapsed < TURNSTILE_LOAD_DEADLINE_MS; elapsed += TURNSTILE_RETRY_INTERVAL_MS) {
    act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
    await failScriptLoad()
  }
  act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')

  expect(sentry.captureMessage.mock.calls).toEqual([
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'script', host: 'challenges.cloudflare.com', status_code: null, code: null },
      extra: { description: null, elapsed_ms: TURNSTILE_LOAD_DEADLINE_MS }, fingerprint: ['turnstile_load_failed', 'script', ''] }],
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'script_deadline', host: 'challenges.cloudflare.com', status_code: null, code: null },
      extra: { description: null, elapsed_ms: TURNSTILE_LOAD_DEADLINE_MS }, fingerprint: ['turnstile_load_failed', 'script_deadline', ''] }],
  ])
})

it('sends no Sentry event for a script load failure that the next script load passes', async () => {
  sentry.captureMessage.mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  vi.resetModules()
  const { TurnstileWidget: FreshWidget } = await import('@/components/auth/turnstile-widget')
  render(<FreshWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
  await failScriptLoad()
  act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  await failScriptLoad()
  act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  const renderWidget = vi.fn((..._args: unknown[]) => 'passed-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  await act(async () => { fireEvent.load(document.querySelector<HTMLScriptElement>(SCRIPT)!) })
  expect(renderWidget).toHaveBeenCalledOnce()
  const callbacks = renderWidget.mock.calls[0]![1] as { callback: (token: string) => void }
  act(() => callbacks.callback('passed-token'))
  act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(sentry.captureMessage).not.toHaveBeenCalled()
})
