import { createRequire } from 'node:module'
import React from 'react'
import { StyleSheet } from 'react-native'
import { expect, it, onTestFinished, vi } from 'vitest'
import type * as WebViewShared from 'react-native-webview/lib/WebViewShared'
import type { ShouldStartLoadRequestEvent } from 'react-native-webview/lib/WebViewTypes'
import { addBreadcrumb } from '@sentry/react-native'
import { TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS } from '@orbit/shared/hooks/turnstile-token-core'
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
const bridgeMounts = vi.hoisted(() => ({ count: 0 }))
vi.mock('react-native-webview', () => ({
  WebView: (props: Record<string, unknown>) => {
    React.useEffect(() => { bridgeMounts.count += 1 }, [])
    return React.createElement('WebView', props)
  },
}))
const linking = vi.hoisted(() => ({ canOpenURL: vi.fn(() => Promise.resolve(true)), openURL: vi.fn(() => Promise.resolve(true)) }))
const webViewSharedSource: string = 'react-native-webview/src/WebViewShared'
vi.mock('react-native', async () => ({ ...(await import('../../test-mocks/react-native')), Linking: linking }))

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
  expect(first.props.containerStyle).toMatchObject({ width: '100%', height: 65, flex: 0 })
  expect(first.props.style).toMatchObject({ width: '100%', height: 65, flex: 0 })
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
  expect(StyleSheet.flatten(renderer!.toJSON().props.style).position).not.toBe('absolute')
  expect(renderer!.root.findAllByType('Text').some((node: { props: { children: unknown } }) =>
    node.props.children === 'auth.turnstileLoading')).toBe(true)

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
  expect(renderer!.root.findAllByType('WebView')).toHaveLength(0)
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

it('loads the iOS challenge frames and keeps the top frame on the bridge without opening another app', async () => {
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  const webView = renderer.root.findByType('WebView').props
  const bridgeUrl: string = webView.source.uri
  const { createOnShouldStartLoadWithRequest, defaultOriginWhitelist } = await import(webViewSharedSource) as typeof WebViewShared
  const loadRequest = vi.fn()
  const decide = createOnShouldStartLoadWithRequest(loadRequest, webView.originWhitelist ?? defaultOriginWhitelist, webView.onShouldStartLoadWithRequest)
  const challengeFrame = 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/abc/0x4AAA/dark/fbE/new/normal/auto/'
  const requests = [
    { url: bridgeUrl, isTopFrame: true },
    { url: challengeFrame, isTopFrame: false },
    { url: 'about:srcdoc', isTopFrame: false },
    { url: 'about:blank', isTopFrame: false },
    { url: 'https://www.cloudflare.com/privacypolicy/', isTopFrame: true },
    { url: 'mailto:privacy@cloudflare.com', isTopFrame: true },
    { url: 'https://example.org/frame', isTopFrame: false },
  ]
  requests.forEach(({ url, isTopFrame }, lockIdentifier) => decide({ nativeEvent: {
    url, isTopFrame, mainDocumentURL: bridgeUrl, navigationType: 'other', lockIdentifier,
    title: '', loading: true, canGoBack: false, canGoForward: false,
  } } as ShouldStartLoadRequestEvent))
  expect(loadRequest.mock.calls).toEqual([
    [true, bridgeUrl, 0],
    [true, challengeFrame, 1],
    [true, 'about:srcdoc', 2],
    [true, 'about:blank', 3],
    [false, 'https://www.cloudflare.com/privacypolicy/', 4],
    [false, 'mailto:privacy@cloudflare.com', 5],
    [false, 'https://example.org/frame', 6],
  ])
  expect(linking.canOpenURL).not.toHaveBeenCalled()
  expect(linking.openURL).not.toHaveBeenCalled()
})

it('never scrolls the bridge inside its frame', async () => {
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  expect(renderer.root.findByType('WebView').props).toMatchObject({ scrollEnabled: false, bounces: false, overScrollMode: 'never' })
})

it('names the challenge without making it one element, so screen readers reach the web content', async () => {
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  await TestRenderer.act(async () => {
    renderer.root.findByType('WebView').props.onMessage({ nativeEvent: { data: JSON.stringify({ state: 'interactive' }) } })
    await Promise.resolve()
  })
  type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null }
  const webView = renderer.root.findByType('WebView') as Node
  expect(webView.props.accessibilityLabel).toBe('auth.turnstileLabel')
  for (let node: Node | null = webView; node; node = node.parent) {
    expect(node.props.accessible).not.toBe(true)
    expect(node.props.importantForAccessibility).not.toBe('no-hide-descendants')
    expect(node.props.accessibilityElementsHidden).not.toBe(true)
  }
})

it('keeps one native root in every state, so a pass never moves the check into a root Android creates in that commit', async () => {
  let renderer!: ReturnType<typeof TestRenderer.create>
  const rootStates: unknown[] = []
  const record = () => rootStates.push(renderer.toJSON().props.collapsable)
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  record()
  await TestRenderer.act(() => Promise.resolve())
  record()
  for (const state of ['interactive', 'solved', 'expired', 'loading', 'failed']) {
    await TestRenderer.act(async () => {
      renderer.root.findByType('WebView').props.onMessage({ nativeEvent: { data: JSON.stringify({ state }) } })
      await Promise.resolve()
    })
    record()
  }
  expect(rootStates).toEqual(Array(7).fill(false))
})

it('shows the loading sentence only while no challenge waits for the person and takes no space otherwise', async () => {
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  const webView = renderer.root.findByType('WebView')
  const loadingSentence = () => renderer.root.findAllByType('Text').some((node: { props: { children: unknown } }) =>
    node.props.children === 'auth.turnstileLoading')
  const challengeHostHeight = () => StyleSheet.flatten(renderer.root.findByProps({ testID: 'turnstile-challenge' }).props.style).height
  const send = (message: object) => TestRenderer.act(async () => {
    webView.props.onMessage({ nativeEvent: { data: JSON.stringify(message) } })
    await Promise.resolve()
  })

  expect(loadingSentence()).toBe(true)
  expect(challengeHostHeight()).toBe(0)

  await send({ state: 'interactive' })
  expect(loadingSentence()).toBe(false)
  expect(challengeHostHeight()).toBe(65)

  await send({ state: 'loading' })
  expect(loadingSentence()).toBe(true)
  expect(challengeHostHeight()).toBe(0)

  await send({ state: 'solved' })
  expect(loadingSentence()).toBe(false)
  expect(StyleSheet.flatten(renderer.toJSON().props.style)).toMatchObject({ position: 'absolute' })
})

it('offers Retry when the bridge stops its own retries with failed, and Retry loads a fresh bridge', async () => {
  const onToken = vi.fn()
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  const failedBridge = renderer.root.findByType('WebView')
  for (const message of [{ state: 'loading' }, { state: 'loading' }, { state: 'failed', token: null }]) {
    await TestRenderer.act(async () => {
      failedBridge.props.onMessage({ nativeEvent: { data: JSON.stringify(message) } })
      await Promise.resolve()
    })
  }

  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' }).length).toBeGreaterThan(0)
  const retryButton = renderer.root.findByProps({ label: 'auth.turnstileRetry' })
  await TestRenderer.act(async () => {
    retryButton.props.onClick()
    await Promise.resolve()
  })
  expect(renderer.root.findByType('WebView')).not.toBe(failedBridge)
  expect(renderer.root.findAllByType('Text').some((node: { props: { children: unknown } }) =>
    node.props.children === 'auth.turnstileLoading')).toBe(true)
})

function shownSentences(renderer: ReturnType<typeof TestRenderer.create>) {
  return renderer.root.findAllByType('Text').map((node: { props: { children: unknown } }) => node.props.children)
}

type BridgeNode = { props: { source: { uri: string }; onError: (event: object) => void; onHttpError: (event: object) => void; onMessage: (event: object) => void } }

function bridges(renderer: ReturnType<typeof TestRenderer.create>): BridgeNode[] {
  return renderer.root.findAllByType('WebView')
}

/** The Android shape of `onReceivedHttpError` in react-native-webview 14.0.1 (`RNCWebViewClient.java`): the event base, the status code and the reason phrase. */
function httpError(url: string, statusCode: number, description: string) {
  return { nativeEvent: { url, statusCode, description, title: '', loading: false, canGoBack: false, canGoForward: false, lockIdentifier: 0 } }
}

async function renderWithFakeClock(onToken = vi.fn(), resetKey = 0) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={resetKey} onToken={onToken} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  return renderer
}

it('keeps the loading state while a waking bridge host answers 503, loads the bridge again every 2 s, and shows the check the bridge then posts', async () => {
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  const loaded: BridgeNode[] = []
  for (let elapsed = 0; elapsed < 23_500; elapsed += TURNSTILE_RETRY_INTERVAL_MS) {
    const [bridge] = bridges(renderer)
    expect(loaded, `a new WebView loads the bridge at ${elapsed} ms`).not.toContain(bridge)
    loaded.push(bridge!)
    TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 503, 'Service Unavailable')))
    expect(onToken).toHaveBeenLastCalledWith(null)
    expect(shownSentences(renderer), `after the 503 at ${elapsed} ms`).toEqual(['auth.turnstileLoading'])
    expect(renderer.root.findAllByProps({ label: 'auth.turnstileRetry' })).toHaveLength(0)
    TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS - 1) })
    expect(bridges(renderer), 'the next load waits for 2 s').toEqual([bridge])
    TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  }

  const [awake] = bridges(renderer)
  TestRenderer.act(() => awake!.props.onMessage({ nativeEvent: { data: JSON.stringify({ state: 'interactive' }) } }))
  expect(shownSentences(renderer)).toEqual([])
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'turnstile-challenge' }).props.style).height).toBe(65)
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(bridges(renderer), 'the posted bridge ends the load deadline').toEqual([awake])
  expect(shownSentences(renderer)).toEqual([])
})

it('shows the failure only at the shared load deadline and removes the WebView, so a late bridge page cannot replace the failure', async () => {
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  let last!: BridgeNode
  for (let elapsed = 0; elapsed < TURNSTILE_LOAD_DEADLINE_MS; elapsed += TURNSTILE_RETRY_INTERVAL_MS) {
    expect(shownSentences(renderer), `at ${elapsed} ms`).toEqual(['auth.turnstileLoading'])
    last = bridges(renderer)[0]!
    TestRenderer.act(() => last.props.onError({ nativeEvent: { url: last.props.source.uri, code: -2, description: 'net::ERR_NAME_NOT_RESOLVED', title: '', loading: false, canGoBack: false, canGoForward: false, lockIdentifier: 0 } }))
    TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  }

  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(bridges(renderer), 'the failed state has no WebView left to post').toHaveLength(0)
  TestRenderer.act(() => { vi.runAllTimers() })
  expect(bridges(renderer), 'no load runs after the deadline').toHaveLength(0)

  TestRenderer.act(() => renderer.root.findByProps({ label: 'auth.turnstileRetry' }).props.onClick())
  const fresh = bridges(renderer)[0]!
  expect(fresh).not.toBe(last)
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer), 'a bridge that never answers after Retry keeps the loading state until the new deadline').toEqual(['auth.turnstileLoading'])
  expect(bridges(renderer)).toEqual([fresh])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer), 'Retry starts a new load deadline').toEqual(['auth.turnstileFailed'])
  expect(bridges(renderer)).toHaveLength(0)
})

it('loads one bridge under one load deadline when the form mounts the widget with a new reset key', async () => {
  bridgeMounts.count = 0
  const renderer = await renderWithFakeClock(vi.fn(), 1)
  await TestRenderer.act(async () => { await Promise.resolve() })
  expect(bridgeMounts.count, 'the mount loads one bridge').toBe(1)
  expect(bridges(renderer)).toHaveLength(1)
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(bridgeMounts.count).toBe(1)
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer), 'the mount starts one load deadline').toEqual(['auth.turnstileFailed'])
})

it('loads a fresh bridge under a new load deadline when the form asks for a new challenge after the load failed', async () => {
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  const [stalled] = bridges(renderer)
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(bridges(renderer)).toHaveLength(0)

  await TestRenderer.act(async () => {
    renderer.update(<TurnstileWidget siteKey="site-key" resetKey={1} onToken={onToken} />)
    await Promise.resolve()
  })
  const fresh = bridges(renderer)
  expect(fresh, 'the new challenge loads one bridge').toHaveLength(1)
  expect(fresh[0], 'the new challenge does not keep the stalled bridge').not.toBe(stalled)
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer), 'the new challenge starts a new load deadline').toEqual(['auth.turnstileFailed'])
})

it('keeps the one load deadline when a woken bridge posts only its own loading state, so the failure shows at 60 s', async () => {
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  const wakeMs = 50_000
  for (let elapsed = 0; elapsed < wakeMs; elapsed += TURNSTILE_RETRY_INTERVAL_MS) {
    const [bridge] = bridges(renderer)
    TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 503, 'Service Unavailable')))
    TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  }

  const [awake] = bridges(renderer)
  TestRenderer.act(() => awake!.props.onMessage({ nativeEvent: { data: JSON.stringify({ state: 'loading' }) } }))
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - wakeMs - 1) })
  expect(shownSentences(renderer), `the woken bridge loads its own script again, and at ${TURNSTILE_LOAD_DEADLINE_MS - 1} ms the check still loads`).toEqual(['auth.turnstileLoading'])
  expect(bridges(renderer)).toEqual([awake])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer), 'a loading message from the bridge does not start a second deadline').toEqual(['auth.turnstileFailed'])
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(bridges(renderer)).toHaveLength(0)
})

it('fails at once on a status that does not pass, and removes the WebView', async () => {
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 404, 'Not Found')))
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(bridges(renderer)).toHaveLength(0)
  TestRenderer.act(() => { vi.runAllTimers() })
  expect(bridges(renderer)).toHaveLength(0)
})

it('keeps a bridge that posts while a new load waits, and a later load error starts a new load deadline', async () => {
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 503, 'Service Unavailable')))
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS - 1) })
  TestRenderer.act(() => bridge!.props.onMessage({ nativeEvent: { data: JSON.stringify({ state: 'interactive' }) } }))
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(bridges(renderer)).toEqual([bridge])
  expect(shownSentences(renderer)).toEqual([])

  TestRenderer.act(() => bridge!.props.onError({ nativeEvent: { url: bridge!.props.source.uri, code: -6, description: 'net::ERR_CONNECTION_REFUSED' } }))
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
})

it('leaves a Sentry breadcrumb for each main-frame load failure with the status or code, the description and the host only', async () => {
  vi.mocked(addBreadcrumb).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  const bridgeUrl = bridge!.props.source.uri
  expect(bridgeUrl).toContain('siteKey=site-key')
  TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridgeUrl, 503, 'Service Unavailable')))
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  const [next] = bridges(renderer)
  // WHY: the iOS load error event carries the NSError domain, code and localizedDescription https://github.com/react-native-webview/react-native-webview/blob/v14.0.1/apple/RNCWebViewImpl.m#L1519-L1526
  TestRenderer.act(() => next!.props.onError({ nativeEvent: { url: bridgeUrl, domain: 'NSURLErrorDomain', code: -1009, description: 'The Internet connection appears to be offline.', title: '', loading: false, canGoBack: false, canGoForward: false, lockIdentifier: 0 } }))
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  // WHY: the iOS HTTP error event carries the URL and the status code and no description https://github.com/react-native-webview/react-native-webview/blob/v14.0.1/apple/RNCWebViewImpl.m#L1462-L1471
  TestRenderer.act(() => bridges(renderer)[0]!.props.onHttpError({ nativeEvent: { url: bridgeUrl, statusCode: 429, title: '', loading: false, canGoBack: false, canGoForward: false, lockIdentifier: 0 } }))

  const host = new URL(bridgeUrl).hostname
  expect(vi.mocked(addBreadcrumb).mock.calls.map(([breadcrumb]) => breadcrumb)).toEqual([
    { category: 'auth.turnstile', level: 'warning', message: 'Human check bridge HTTP error', data: { statusCode: 503, code: undefined, description: 'Service Unavailable', host } },
    { category: 'auth.turnstile', level: 'warning', message: 'Human check bridge load error', data: { statusCode: undefined, code: -1009, description: 'The Internet connection appears to be offline.', host } },
    { category: 'auth.turnstile', level: 'warning', message: 'Human check bridge HTTP error', data: { statusCode: 429, code: undefined, description: undefined, host } },
  ])
  expect(JSON.stringify(vi.mocked(addBreadcrumb).mock.calls)).not.toMatch(/site-key|siteKey|turnstile-bridge/)
})
