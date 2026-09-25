import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
})

it('clears failed and expired tokens and offers retry', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-1')
  const reset = vi.fn()
  const remove = vi.fn()
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset, remove }
  const onToken = vi.fn()
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1))

  const callbacks = renderWidget.mock.calls[0]![1] as {
    callback: (token: string) => void
    'error-callback': () => boolean
    'expired-callback': () => void
  }
  act(() => callbacks.callback('fresh-token'))
  expect(onToken).toHaveBeenLastCalledWith('fresh-token')

  act(() => callbacks['expired-callback']())
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileExpired')
  fireEvent.click(screen.getByRole('button', { name: 'auth.turnstileRetry' }))
  expect(reset).toHaveBeenCalledWith('widget-1')

  act(() => { callbacks['error-callback']() })
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')
})
