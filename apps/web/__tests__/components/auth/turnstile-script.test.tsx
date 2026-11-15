import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS } from '@orbit/shared/hooks/turnstile-token-core'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

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
  expect(onStateChange, 'the retry of the person starts a new load deadline').toHaveBeenLastCalledWith('loading')
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
  act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(screen.getByRole('alert'), 'a loaded script ends the load deadline').toBeEmptyDOMElement()
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
