import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

const appLocale = vi.hoisted(() => ({ value: 'en' }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => appLocale.value }))

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  appLocale.value = 'en'
})

it('renders the challenge in the language Orbit shows, not the browser language', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
  appLocale.value = 'pt-BR'
  const { unmount } = render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
  expect(renderWidget.mock.calls[0]![1]).toMatchObject({ language: 'pt-br' })
  unmount()

  render(<TurnstileWidget siteKey="site-key" resetKey={0} language="en" onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2))
  expect(renderWidget.mock.calls[1]![1]).toMatchObject({ language: 'en' })
})

it('clears failed and expired tokens and offers retry', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  const reset = vi.fn()
  const remove = vi.fn()
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset, remove }
  const onToken = vi.fn()
  const { rerender } = render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))

  const callbacks = renderWidget.mock.calls[0]![1] as {
    callback: (token: string) => void
    'error-callback': () => boolean
    'expired-callback': () => void
  }
  act(() => callbacks.callback('fresh-token'))
  expect(onToken).toHaveBeenLastCalledWith('fresh-token')

  rerender(<TurnstileWidget siteKey="site-key" resetKey={1} onToken={onToken} />)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading'))
  expect(reset).toHaveBeenCalledWith('widget-1')

  act(() => callbacks['expired-callback']())
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileExpired')
  fireEvent.click(screen.getByRole('button', { name: 'auth.turnstileRetry' }))
  expect(reset).toHaveBeenCalledWith('widget-1')

  act(() => { callbacks['error-callback']() })
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')
})

it('keeps the active challenge when callbacks change and delivers to the latest callback', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  const remove = vi.fn()
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove }
  const firstToken = vi.fn()
  const nextToken = vi.fn()
  const firstState = vi.fn()
  const nextState = vi.fn()
  const { rerender } = render(
    <TurnstileWidget siteKey="site-key" resetKey={0} onToken={firstToken} onStateChange={firstState} />,
  )
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))
  const callbacks = renderWidget.mock.calls[0]![1] as { callback: (token: string) => void }

  rerender(
    <TurnstileWidget siteKey="site-key" resetKey={0} onToken={nextToken} onStateChange={nextState} />,
  )
  expect(remove).not.toHaveBeenCalled()
  expect(renderWidget).toHaveBeenCalledTimes(1)

  act(() => callbacks.callback('fresh-token'))
  expect(nextToken).toHaveBeenCalledWith('fresh-token')
  expect(nextState).toHaveBeenCalledWith('solved')
  expect(firstToken).not.toHaveBeenCalled()
  expect(firstState).not.toHaveBeenCalled()
})
