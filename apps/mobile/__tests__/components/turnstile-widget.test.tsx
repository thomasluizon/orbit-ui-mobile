import { createRequire } from 'node:module'
import React from 'react'
import { StyleSheet } from 'react-native'
import { expect, it, onTestFinished, vi } from 'vitest'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import type appJson from '../../app.json'

const TestRenderer = require('react-test-renderer')
const createConfig = createRequire(import.meta.url)('../../app.config.js') as () => typeof appJson.expo
const variantConfig = vi.hoisted(() => ({ current: null as typeof appJson.expo | null }))
vi.mock('expo-constants', () => ({ default: { get expoConfig() { return variantConfig.current } } }))

const appLanguage = vi.hoisted(() => ({ value: 'pt-BR' }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: appLanguage.value } }),
}))
const appTheme = vi.hoisted<{ currentTheme: 'dark' | 'light' }>(() => ({ currentTheme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: appTheme.currentTheme }),
}))
vi.mock('react-native-webview', () => ({
  WebView: (props: Record<string, unknown>) => React.createElement('WebView', props),
}))

it.each(['production', 'staging'])('loads the Turnstile bridge from the %s App Link origin', async (variant) => {
  vi.stubEnv('ORBIT_APP_VARIANT', variant)
  variantConfig.current = createConfig()
  onTestFinished(() => { vi.unstubAllEnvs(); variantConfig.current = null })
  vi.resetModules()
  const { TurnstileWidget: VariantWidget } = await import('@/components/auth/turnstile-widget')
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<VariantWidget siteKey="site key/+" resetKey={0} onToken={vi.fn()} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  const bridge = new URL(renderer.root.findByType('WebView').props.source.uri)
  expect(bridge.origin).toBe(variantConfig.current.extra.router.origin)
  expect(bridge.pathname).toBe('/turnstile-bridge')
  expect(bridge.searchParams.get('siteKey')).toBe('site key/+')
  expect(bridge.searchParams.get('theme')).toBe('dark')
  expect(bridge.searchParams.get('language')).toBe('pt-BR')
})

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
  expect(first.props.accessibilityLabel).toBe('auth.turnstileLabel')
  expect(first.props.source.uri).toContain('/turnstile-bridge?siteKey=site-key')
  expect(first.props.source.uri).toContain('&theme=dark')
  expect(first.props.source.uri).toContain('&language=pt-BR')
  expect(first.props.containerStyle).toMatchObject({ width: 256, height: 160, flex: 0 })
  expect(first.props.style).toMatchObject({ width: 256, height: 160, flex: 0 })
  appTheme.currentTheme = 'light'
  await TestRenderer.act(async () => {
    renderer!.update(React.createElement(TurnstileWidget, { siteKey: 'site-key', resetKey: 0, onToken }))
    await Promise.resolve()
  })
  expect(renderer!.root.findByType('WebView').props.source.uri).toContain('&theme=light')
  appTheme.currentTheme = 'dark'
  await TestRenderer.act(async () => {
    first.props.onMessage({ nativeEvent: { data: JSON.stringify({ token: 'fresh-token' }) } })
    await Promise.resolve()
  })
  expect(onToken).toHaveBeenCalledWith('fresh-token')

  await TestRenderer.act(async () => {
    first.props.onMessage({ nativeEvent: { data: JSON.stringify({ state: 'solved' }) } })
    await Promise.resolve()
  })
  expect(renderer!.root.findByType('WebView').props.containerStyle.height).toBe(0)
  const solvedHost = renderer!.toJSON()
  expect(StyleSheet.flatten(solvedHost.props.style)).toMatchObject({ position: 'absolute', height: 0 })
  expect(renderer!.root.findByType('WebView')).toBe(first)

  await TestRenderer.act(async () => {
    renderer!.update(React.createElement(TurnstileWidget, {
      siteKey: 'site-key', resetKey: 1, onToken,
    }))
    await Promise.resolve()
  })
  expect(renderer!.root.findByType('WebView')).not.toBe(first)
  expect(renderer!.root.findByType('WebView').props.containerStyle.height).toBe(160)
  expect(StyleSheet.flatten(renderer!.toJSON().props.style).position).not.toBe('absolute')
  expect(renderer!.root.findAllByType('Text').some((node: { props: { children: unknown } }) =>
    node.props.children === 'auth.turnstileLoading')).toBe(true)

  const second = renderer!.root.findByType('WebView')
  await TestRenderer.act(async () => {
    second.props.onMessage({ nativeEvent: { data: JSON.stringify({ state: 'expired', token: null }) } })
    await Promise.resolve()
  })
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(renderer!.root.findByType('WebView').props.containerStyle.height).toBe(160)
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
})
