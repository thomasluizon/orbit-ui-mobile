import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TURNSTILE_RETRY_INTERVAL_MS } from '@orbit/shared/hooks/turnstile-token-core'
import { TurnstileBridge } from '@/app/turnstile-bridge/turnstile-bridge'
import TurnstileBridgePage from '@/app/turnstile-bridge/page'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))

const SCRIPT = 'script[src^="https://challenges.cloudflare.com/turnstile/"]'

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  delete window.ReactNativeWebView
  document.querySelectorAll(SCRIPT).forEach((script) => script.remove())
})

function postedMessages(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.map(([message]) => JSON.parse(message as string))
}

it('asks Cloudflare for the dark challenge when the dark app opens the bridge', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  document.documentElement.style.colorScheme = 'light'
  try {
    const page = await TurnstileBridgePage({ searchParams: Promise.resolve({ siteKey: 'mobile-site-key', theme: 'dark', language: 'pt-BR' }) })
    render(page!)
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
    expect(renderWidget.mock.calls[0]![1]).toMatchObject({ theme: 'dark', sitekey: 'mobile-site-key' })
  } finally {
    document.documentElement.style.colorScheme = ''
  }
})

it('draws only the Cloudflare challenge and leaves status and retry to the native host', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  const postMessage = vi.fn()
  window.ReactNativeWebView = { postMessage }
  render(<TurnstileBridge siteKey="mobile-site-key" theme="dark" language="pt-BR" />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
  const challengeContainer = renderWidget.mock.calls[0]![0] as HTMLElement
  expect(document.body).toContainElement(challengeContainer)

  function expectNoStatusSurface() {
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/^auth\.turnstile/)).toBeNull()
  }
  expectNoStatusSurface()

  const callbacks = renderWidget.mock.calls[0]![1] as { 'error-callback': (code: string) => boolean; 'expired-callback': () => void }
  act(() => { callbacks['error-callback']('200100') })
  expectNoStatusSurface()
  act(() => callbacks['expired-callback']())
  expectNoStatusSurface()
  expect(postedMessages(postMessage)).toEqual([
    { stage: 'script_started' },
    { stage: 'script_loaded' },
    { failure: { kind: 'challenge', code: '200100' } },
    { state: 'failed' },
    { token: null },
    { state: 'expired' },
    { token: null },
  ])
})

it('tells the native host the check is still loading, and no failure yet, while the widget runs a failed first challenge again', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  const postMessage = vi.fn()
  window.ReactNativeWebView = { postMessage }
  render(<TurnstileBridge siteKey="mobile-site-key" theme="dark" language="en" />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
  const callbacks = renderWidget.mock.calls[0]![1] as {
    'error-callback': (code: string) => boolean
    'before-interactive-callback': () => void
  }

  act(() => { callbacks['error-callback']('600010') })
  act(() => callbacks['before-interactive-callback']())

  expect(postedMessages(postMessage)).toEqual([
    { stage: 'script_started' },
    { stage: 'script_loaded' },
    { state: 'loading' },
    { token: null },
    { state: 'interactive' },
    { token: null },
  ])
})

it('tells the native host the check failed when the challenge frame keeps failing to load, so the host offers Retry', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  const reset = vi.fn()
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset, remove: vi.fn() }
  const postMessage = vi.fn()
  window.ReactNativeWebView = { postMessage }
  render(<TurnstileBridge siteKey="mobile-site-key" theme="dark" language="en" />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
  const callbacks = renderWidget.mock.calls[0]![1] as { 'error-callback': (code: string) => boolean }
  vi.useFakeTimers()
  onTestFinished(() => { vi.useRealTimers() })

  for (let run = 0; run < 3; run++) {
    act(() => { callbacks['error-callback']('200500') })
    act(() => { vi.advanceTimersByTime(2000) })
  }

  expect(reset).toHaveBeenCalledTimes(2)
  expect(postedMessages(postMessage).filter((message) => 'state' in message))
    .toEqual([{ state: 'loading' }, { state: 'loading' }, { state: 'failed' }])
})

it('tells the native host when the Cloudflare script load starts and when the script has loaded, so the host names its deadline as the web widget does', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  vi.resetModules()
  const { TurnstileBridge: FreshBridge } = await import('@/app/turnstile-bridge/turnstile-bridge')
  const postMessage = vi.fn()
  window.ReactNativeWebView = { postMessage }
  render(<FreshBridge siteKey="mobile-site-key" theme="dark" language="en" />)
  expect(postedMessages(postMessage), 'the script request posts the first stage').toEqual([{ stage: 'script_started' }])

  await act(async () => { fireEvent.error(document.querySelector(SCRIPT)!) })
  act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  await act(async () => { fireEvent.load(document.querySelector(SCRIPT)!) })
  expect(renderWidget).toHaveBeenCalledOnce()
  expect(postedMessages(postMessage), 'a script request again in the same load does not start a new stage').toEqual([
    { stage: 'script_started' },
    { state: 'loading' },
    { token: null },
    { stage: 'script_loaded' },
  ])
})
