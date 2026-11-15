import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

it('loads the script again by itself after a load failure, at most twice and 2 s apart, then shows a retry and accepts a token from the reloaded widget', async () => {
  const onToken = vi.fn()
  const onStateChange = vi.fn()
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} onStateChange={onStateChange} />)
  await waitFor(() => expect(document.querySelector(SCRIPT)).not.toBeNull())
  expect(document.querySelector<HTMLScriptElement>(SCRIPT)!.src).toContain('render=explicit')
  expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  vi.useFakeTimers()
  onTestFinished(() => { vi.useRealTimers() })

  const scripts = [await failScriptLoad()]
  for (const _run of [1, 2]) {
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
    expect(onStateChange).toHaveBeenLastCalledWith('loading')
    expect(onToken).toHaveBeenLastCalledWith(null)
    act(() => { vi.advanceTimersByTime(1999) })
    expect(document.querySelector(SCRIPT), 'the next load waits for 2 s').toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(scripts).not.toContain(document.querySelector(SCRIPT))
    scripts.push(await failScriptLoad())
  }
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')
  expect(onStateChange).toHaveBeenLastCalledWith('failed')
  expect(onToken).toHaveBeenLastCalledWith(null)
  act(() => { vi.runAllTimers() })
  expect(document.querySelector(SCRIPT), 'no load runs after the last allowed one').toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'auth.turnstileRetry' }))
  scripts.push(await failScriptLoad())
  expect(onStateChange, 'the retry of the person gives two automatic loads again').toHaveBeenLastCalledWith('loading')
  expect(screen.queryByRole('button', { name: 'auth.turnstileRetry' })).toBeNull()
  act(() => { vi.advanceTimersByTime(2000) })
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
  const callbacks = renderWidget.mock.calls[0]![1] as { callback: (token: string) => void }
  act(() => callbacks.callback('reloaded-token'))
  expect(onToken).toHaveBeenLastCalledWith('reloaded-token')
})
