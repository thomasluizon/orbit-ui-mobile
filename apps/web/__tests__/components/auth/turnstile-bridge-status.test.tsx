import { afterEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { TurnstileBridge } from '@/app/turnstile-bridge/turnstile-bridge'
import TurnstileBridgePage from '@/app/turnstile-bridge/page'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  delete window.ReactNativeWebView
})

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

  const callbacks = renderWidget.mock.calls[0]![1] as { 'error-callback': () => boolean; 'expired-callback': () => void }
  act(() => { callbacks['error-callback']() })
  expectNoStatusSurface()
  act(() => callbacks['expired-callback']())
  expectNoStatusSurface()
  expect(postMessage.mock.calls.map(([message]) => JSON.parse(message as string))).toEqual([
    { state: 'failed' },
    { token: null },
    { state: 'expired' },
    { token: null },
  ])
})
