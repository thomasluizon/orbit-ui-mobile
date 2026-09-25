import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  document.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/"]').forEach((script) => script.remove())
})

it('shows a retry after script failure, then accepts a token from the reloaded widget', async () => {
  const onToken = vi.fn()
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} />)

  const firstScript = await waitFor(() => {
    const script = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/"]')
    expect(script).not.toBeNull()
    return script!
  })
  expect(firstScript.src).toContain('render=explicit')
  fireEvent.error(firstScript)
  expect(await screen.findByRole('alert')).toHaveTextContent('auth.turnstileFailed')
  expect(onToken).toHaveBeenLastCalledWith(null)

  fireEvent.click(screen.getByRole('button', { name: 'auth.turnstileRetry' }))
  const retryScript = await waitFor(() => {
    const script = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/"]')
    expect(script).not.toBe(firstScript)
    return script!
  })
  const renderWidget = vi.fn((..._args: unknown[]) => 'widget-2')
  ;(window as Window & { turnstile?: unknown }).turnstile = {
    render: renderWidget,
    reset: vi.fn(),
    remove: vi.fn(),
  }
  fireEvent.load(retryScript)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const callbacks = renderWidget.mock.calls[0]![1] as { callback: (token: string) => void }
  callbacks.callback('reloaded-token')
  expect(onToken).toHaveBeenLastCalledWith('reloaded-token')
})
