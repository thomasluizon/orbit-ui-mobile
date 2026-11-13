import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

const appLocale = vi.hoisted(() => ({ value: 'en' }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => appLocale.value }))

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  document.documentElement.style.removeProperty('color-scheme')
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
    'error-callback': (code: string) => boolean
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

  act(() => { callbacks['error-callback']('110200') })
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
  const callbacks = renderWidget.mock.calls[0]![1] as { 'error-callback': (code: string) => boolean }
  act(() => { callbacks['error-callback']('110200') })
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

it('restores visible challenge space and collapses it again', async () => {
  let resize = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  const renderWidget = vi.fn((..._args: unknown[]) => 'resizing-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  const { container, unmount } = render(<TurnstileWidget siteKey="site-key" resetKey={0} quiet onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const challenge = renderWidget.mock.calls[0]![0] as HTMLElement
  let height = 65
  vi.spyOn(challenge, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect)
  act(() => resize())
  expect(getComputedStyle(container.firstElementChild!).position).toBe('static')
  height = 0
  act(() => resize())
  expect(getComputedStyle(container.firstElementChild!).position).toBe('absolute')
  unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})

it.each([false, true])('renders a full-width challenge that only shows when interaction is needed, quiet %s', async (quiet) => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'options-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  render(<TurnstileWidget siteKey="site-key" resetKey={0} quiet={quiet} onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  expect(renderWidget.mock.calls[0]![1]).toMatchObject({ size: 'flexible', appearance: 'interaction-only' })
})

it.each(['light', 'dark'] as const)('follows the %s theme the page rendered when the caller omits theme', async (pageTheme) => {
  document.documentElement.style.setProperty('color-scheme', pageTheme)
  const renderWidget = vi.fn((..._args: unknown[]) => 'theme-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  expect(renderWidget.mock.calls[0]![1]).toMatchObject({ theme: pageTheme })
})

it('keeps the explicit theme of the caller over the page theme', async () => {
  document.documentElement.style.setProperty('color-scheme', 'light')
  const renderWidget = vi.fn((..._args: unknown[]) => 'explicit-theme-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  render(<TurnstileWidget siteKey="site-key" resetKey={0} theme="dark" onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  expect(renderWidget.mock.calls[0]![1]).toMatchObject({ theme: 'dark' })
})

it.each([false, true])('hides the challenge after it passes and shows it again when it needs a new pass, quiet %s', async (quiet) => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'success-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  render(<TurnstileWidget siteKey="site-key" resetKey={0} quiet={quiet} onToken={vi.fn()} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const challenge = renderWidget.mock.calls[0]![0] as HTMLElement
  const callbacks = renderWidget.mock.calls[0]![1] as {
    callback: (token: string) => void
    'expired-callback': () => void
  }
  expect(getComputedStyle(challenge).display).not.toBe('none')
  act(() => callbacks.callback('fresh-token'))
  expect(getComputedStyle(challenge).display).toBe('none')
  act(() => callbacks['expired-callback']())
  expect(getComputedStyle(challenge).display).not.toBe('none')
})

it('shows the loading sentence only while no challenge waits for the person', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'interactive-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading'))
  const callbacks = renderWidget.mock.calls[0]![1] as {
    'before-interactive-callback': () => void
    'after-interactive-callback': () => void
  }
  act(() => callbacks['before-interactive-callback']())
  expect(screen.getByRole('status')).toHaveTextContent('')
  act(() => callbacks['after-interactive-callback']())
  expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
})

it('keeps checking while Turnstile runs a failed challenge again and reports the failure when that run fails too', async () => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'retried-widget')
  const reset = vi.fn()
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset, remove: vi.fn() }
  const onToken = vi.fn()
  const onStateChange = vi.fn()
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} onStateChange={onStateChange} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const callbacks = renderWidget.mock.calls[0]![1] as {
    'error-callback': (code: string) => boolean
    'before-interactive-callback': () => void
  }

  act(() => { expect(callbacks['error-callback']('600010')).toBe(true) })
  expect(onStateChange).toHaveBeenLastCalledWith('loading')
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(screen.getByRole('status')).toHaveTextContent('auth.turnstileLoading')
  expect(screen.queryByRole('button', { name: 'auth.turnstileRetry' })).toBeNull()

  act(() => callbacks['before-interactive-callback']())
  expect(onStateChange).toHaveBeenLastCalledWith('interactive')
  act(() => { callbacks['error-callback']('600010') })
  expect(onStateChange).toHaveBeenLastCalledWith('loading')

  act(() => { callbacks['error-callback']('600010') })
  expect(onStateChange).toHaveBeenLastCalledWith('failed')
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')
  act(() => { callbacks['error-callback']('600010') })
  expect(onStateChange).toHaveBeenLastCalledWith('failed')

  fireEvent.click(screen.getByRole('button', { name: 'auth.turnstileRetry' }))
  expect(reset).toHaveBeenCalledWith('retried-widget')
  act(() => { callbacks['error-callback']('600010') })
  expect(onStateChange).toHaveBeenLastCalledWith('loading')
  expect(renderWidget.mock.calls[0]![1]).toMatchObject({ retry: 'auto' })
})

it.each(['200100', '110200'])('reports at once the failure %s that Cloudflare marks as not retried', async (code) => {
  const renderWidget = vi.fn((..._args: unknown[]) => 'final-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  const onStateChange = vi.fn()
  render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} onStateChange={onStateChange} />)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  const callbacks = renderWidget.mock.calls[0]![1] as { 'error-callback': (code: string) => boolean }
  act(() => { callbacks['error-callback'](code) })
  expect(onStateChange).toHaveBeenLastCalledWith('failed')
  expect(screen.getByRole('alert')).toHaveTextContent('auth.turnstileFailed')
})
