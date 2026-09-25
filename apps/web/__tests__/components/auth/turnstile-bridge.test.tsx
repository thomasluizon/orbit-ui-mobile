import { afterEach, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TurnstileBridge } from '@/app/turnstile-bridge/turnstile-bridge'
import TurnstileBridgePage from '@/app/turnstile-bridge/page'
import { neutralColors } from '@orbit/shared/theme'

const widget = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))

vi.mock('@/components/auth/turnstile-widget', () => ({
  TurnstileWidget: (props: Record<string, unknown>) => {
    widget.props = props
    return null
  },
}))

afterEach(() => {
  delete window.ReactNativeWebView
  widget.props = null
})

it('posts widget state and tokens through the native bridge', () => {
  const postMessage = vi.fn()
  window.ReactNativeWebView = { postMessage }
  const { container } = render(<TurnstileBridge siteKey="mobile-site-key" theme="light" />)
  expect(widget.props?.siteKey).toBe('mobile-site-key')
  expect(widget.props?.theme).toBe('light')
  expect(widget.props?.resetKey).toBe(0)
  expect(container.firstElementChild).toHaveStyle({ backgroundColor: neutralColors.light.bg, colorScheme: 'light' })
  expect(container.firstElementChild).toHaveStyle({ '--fg-2': neutralColors.light.fg2 })

  const onStateChange = widget.props?.onStateChange as (state: string) => void
  const onToken = widget.props?.onToken as (token: string | null) => void
  onStateChange('expired')
  onToken(null)
  onToken('new-token')
  expect(postMessage.mock.calls.map(([message]) => JSON.parse(message as string))).toEqual([
    { state: 'expired' },
    { token: null },
    { token: 'new-token' },
  ])
})

it('renders the bridge only when a site key is supplied', async () => {
  expect(await TurnstileBridgePage({ searchParams: Promise.resolve({}) })).toBeNull()
  const page = await TurnstileBridgePage({ searchParams: Promise.resolve({ siteKey: 'site-key', theme: 'light' }) })
  expect(page?.props.siteKey).toBe('site-key')
  expect(page?.props.theme).toBe('light')
  const unknownTheme = await TurnstileBridgePage({ searchParams: Promise.resolve({ siteKey: 'site-key', theme: 'unknown' }) })
  expect(unknownTheme?.props.theme).toBe('dark')
})
