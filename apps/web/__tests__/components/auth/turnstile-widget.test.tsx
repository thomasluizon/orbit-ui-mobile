import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

const appLocale = vi.hoisted(() => ({ value: 'en' }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => appLocale.value }))

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  appLocale.value = 'en'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

it('keeps onboarding verification managed and reports failure without extra copy', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'onboarding-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  const onStateChange = vi.fn()
  render(<TurnstileWidget siteKey="site-key" resetKey={0} quiet onToken={vi.fn()} onStateChange={onStateChange} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  expect(renderWidget.mock.calls[0]![1]).toMatchObject({ appearance: 'interaction-only' })
  expect(screen.queryByRole('status')).toBeNull()
  const callbacks = renderWidget.mock.calls[0]![1] as { 'error-callback': () => boolean }
  act(() => { callbacks['error-callback']() })
  expect(onStateChange).toHaveBeenCalledWith('failed')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText('auth.turnstileFailed')).toBeNull()
})

it.each([false, true])('removes the invisible widget from the form gap flow, quiet %s', async (quiet) => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'layout-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  const { container } = render(<form style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <input name="email" />
    <TurnstileWidget siteKey="site-key" resetKey={0} quiet={quiet} onToken={vi.fn()} />
    <button type="submit">Continue</button>
  </form>)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const callbacks = renderWidget.mock.calls[0]![1] as { callback: (token: string) => void }
  act(() => callbacks.callback('fresh-token'))
  const widget = container.querySelector('form')!.children[1]!
  expect(getComputedStyle(widget).position).toBe('absolute')
})

it.each([false, true])('restores visible challenge space and collapses it again, quiet %s', async (quiet) => {
  let resize = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  const renderWidget = vi.fn((..._args: unknown[]) => 'resizing-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  const { container, unmount } = render(<TurnstileWidget siteKey="site-key" resetKey={0} quiet={quiet} onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const challenge = renderWidget.mock.calls[0]![0] as HTMLElement
  let height = 160
  vi.spyOn(challenge, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect)
  const callbacks = renderWidget.mock.calls[0]![1] as { callback: (token: string) => void }
  act(() => { callbacks.callback('fresh-token'); resize() })
  expect(getComputedStyle(container.firstElementChild!).position).toBe('static')
  height = 0
  act(() => resize())
  expect(getComputedStyle(container.firstElementChild!).position).toBe('absolute')
  unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
