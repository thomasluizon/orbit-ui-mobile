import React from 'react'
import { expect, it, vi } from 'vitest'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'pt-BR' } }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('react-native-webview', () => ({
  WebView: (props: Record<string, unknown>) => React.createElement('WebView', props),
}))

it('passes WebView tokens to the login flow and reloads after consumption', async () => {
  const onToken = vi.fn()
  let renderer: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(TurnstileWidget, { siteKey: 'site-key', resetKey: 0, onToken }),
    )
    await Promise.resolve()
  })

  const first = renderer!.root.findByType('WebView')
  expect(first.props.source.uri).toContain('/turnstile-bridge?siteKey=site-key')
  expect(first.props.source.uri).toContain('&language=pt-BR')
  expect(first.props.containerStyle).toMatchObject({ width: 256, height: 160, flex: 0 })
  expect(first.props.style).toMatchObject({ width: 256, height: 160, flex: 0 })
  await TestRenderer.act(async () => {
    first.props.onMessage({ nativeEvent: { data: JSON.stringify({ token: 'fresh-token' }) } })
    await Promise.resolve()
  })
  expect(onToken).toHaveBeenCalledWith('fresh-token')

  await TestRenderer.act(async () => {
    renderer!.update(React.createElement(TurnstileWidget, {
      siteKey: 'site-key', resetKey: 1, onToken,
    }))
    await Promise.resolve()
  })
  expect(renderer!.root.findByType('WebView')).not.toBe(first)

  const second = renderer!.root.findByType('WebView')
  await TestRenderer.act(async () => {
    second.props.onMessage({ nativeEvent: { data: JSON.stringify({ state: 'expired', token: null }) } })
    await Promise.resolve()
  })
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'alert' }).length).toBeGreaterThan(0)
  await TestRenderer.act(async () => {
    renderer!.root.findAllByProps({ accessibilityRole: 'button' })[0]!.props.onPress()
    await Promise.resolve()
  })
  expect(renderer!.root.findByType('WebView')).not.toBe(second)

  const third = renderer!.root.findByType('WebView')
  await TestRenderer.act(async () => {
    third.props.onMessage({ nativeEvent: { data: 'malformed-message' } })
    await Promise.resolve()
  })
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'alert' }).length).toBeGreaterThan(0)

  await TestRenderer.act(async () => {
    third.props.onHttpError()
    await Promise.resolve()
  })
  expect(onToken).toHaveBeenLastCalledWith(null)
})

it('keeps the WebView mounted when the token callback changes', async () => {
  const firstToken = vi.fn()
  const nextToken = vi.fn()
  let renderer: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(TurnstileWidget, { siteKey: 'site-key', resetKey: 0, onToken: firstToken }),
    )
    await Promise.resolve()
  })
  const first = renderer!.root.findByType('WebView')
  await TestRenderer.act(async () => {
    renderer!.update(React.createElement(TurnstileWidget, {
      siteKey: 'site-key', resetKey: 0, onToken: nextToken,
    }))
    await Promise.resolve()
  })
  const current = renderer!.root.findByType('WebView')
  expect(current).toBe(first)
  await TestRenderer.act(async () => {
    current.props.onMessage({ nativeEvent: { data: JSON.stringify({ token: 'fresh-token' }) } })
    await Promise.resolve()
  })
  expect(nextToken).toHaveBeenCalledWith('fresh-token')
  expect(firstToken).not.toHaveBeenCalled()

  await TestRenderer.act(async () => {
    renderer!.update(React.createElement(TurnstileWidget, {
      siteKey: 'new-site-key', resetKey: 0, onToken: nextToken,
    }))
    await Promise.resolve()
  })
  expect(renderer!.root.findByType('WebView').props.source.uri).toContain('siteKey=new-site-key')
})
