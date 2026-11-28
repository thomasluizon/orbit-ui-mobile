import { createRequire } from 'node:module'
import React from 'react'
import { Animated, AppState, StyleSheet } from 'react-native'
import { expect, it, onTestFinished, vi } from 'vitest'
import type * as WebViewShared from 'react-native-webview/lib/WebViewShared'
import type { ShouldStartLoadRequestEvent } from 'react-native-webview/lib/WebViewTypes'
import { addBreadcrumb, captureMessage } from '@sentry/react-native'
import { motionDurations } from '@orbit/shared/theme'
import { TURNSTILE_CHALLENGE_HEIGHT, TURNSTILE_LOAD_DEADLINE_MS, TURNSTILE_RETRY_INTERVAL_MS } from '@orbit/shared/hooks/turnstile-token-core'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import type appJson from '../../app.json'

const TestRenderer = require('react-test-renderer')
const createConfig = createRequire(import.meta.url)('../../app.config.js') as () => typeof appJson.expo
const variantConfig = vi.hoisted(() => ({ current: null as typeof appJson.expo | null }))
vi.mock('expo-constants', () => ({ default: { get expoConfig() { return variantConfig.current } } }))

const motionPreference = vi.hoisted(() => ({ reduced: true }))
vi.mock('@/lib/motion', async (importActual) => ({ ...(await importActual<typeof import('@/lib/motion')>()), usePrefersReducedMotion: () => motionPreference.reduced }))
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
  expect(StyleSheet.flatten(renderer!.root.findByProps({ testID: 'turnstile-challenge' }).props.style).height).toBe(0)
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

it('shows the loading sentence only while no challenge waits for the person, and shows the challenge only while it waits', async () => {
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
  expect(challengeHostHeight()).toBe(0)
})

function renderSlot(stackGap = 0) {
  let renderer!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} stackGap={stackGap} />)
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  const slotStyle = () => StyleSheet.flatten(renderer.root.findByProps({ testID: 'turnstile-slot' }).props.style)
  const slotHeight = () => slotStyle().height.value
  const slotMargin = () => slotStyle().marginTop.value
  const send = (state: string) => TestRenderer.act(async () => {
    renderer.root.findByType('WebView').props.onMessage({ nativeEvent: { data: JSON.stringify({ state }) } })
    await Promise.resolve()
  })
  return { slotHeight, slotMargin, send, settle: () => TestRenderer.act(() => Promise.resolve()) }
}

it('gives the slot no height when nothing shows, and the challenge height only while something shows', async () => {
  motionPreference.reduced = true
  onTestFinished(() => { motionPreference.reduced = true })
  const { slotHeight, send, settle } = renderSlot()
  expect(slotHeight(), 'idle').toBe(0)
  await settle()
  expect(slotHeight(), 'the wait shows while the check runs').toBe(TURNSTILE_CHALLENGE_HEIGHT)
  await send('interactive')
  expect(slotHeight(), 'interactive').toBe(TURNSTILE_CHALLENGE_HEIGHT)
  await send('loading')
  expect(slotHeight(), 'loading after the tap').toBe(TURNSTILE_CHALLENGE_HEIGHT)
  await send('solved')
  expect(slotHeight(), 'passed').toBe(0)
  await send('expired')
  expect(slotHeight(), 'expired shows the message and Retry').toBe(TURNSTILE_CHALLENGE_HEIGHT)
  await send('failed')
  expect(slotHeight(), 'failed shows the message and Retry').toBe(TURNSTILE_CHALLENGE_HEIGHT)
  expect(TURNSTILE_CHALLENGE_HEIGHT).toBe(65)
})

it('closes the slot when the check passes with no interaction', async () => {
  const { slotHeight, send, settle } = renderSlot()
  await settle()
  await send('solved')
  expect(slotHeight()).toBe(0)
})

it('takes back the gap of the parent column while the slot is closed, and gives it back while something shows', async () => {
  const { slotMargin, send, settle } = renderSlot(24)
  expect(slotMargin(), 'idle').toBe(-24)
  await settle()
  expect(slotMargin(), 'the wait shows while the check runs').toBe(0)
  await send('solved')
  expect(slotMargin(), 'passed').toBe(-24)
  await send('failed')
  expect(slotMargin(), 'failed').toBe(0)
})

it('animates the slot height over the shared base duration, and sets it with no animation under reduced motion', async () => {
  const timing = vi.spyOn(Animated, 'timing')
  onTestFinished(() => { timing.mockRestore(); motionPreference.reduced = true })
  motionPreference.reduced = false
  const { slotHeight, send, settle } = renderSlot(24)
  await settle()
  await send('solved')
  const heightTimings = () => timing.mock.calls.filter(([, config]) => config.useNativeDriver === false)
  expect(heightTimings().map(([, config]) => config.toValue), 'the height and the gap move together').toEqual([0, -24, TURNSTILE_CHALLENGE_HEIGHT, 0, 0, -24])
  expect(heightTimings().every(([, config]) => config.duration === motionDurations.base)).toBe(true)
  expect(motionDurations.base).toBe(220)

  timing.mockClear()
  motionPreference.reduced = true
  const reduced = renderSlot()
  await reduced.settle()
  expect(heightTimings()).toEqual([])
  expect(reduced.slotHeight()).toBe(TURNSTILE_CHALLENGE_HEIGHT)
  expect(slotHeight()).toBe(0)
})

it('hides the clipped check from screen readers in every state but the challenge', async () => {
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  const read = () => {
    const { importantForAccessibility, accessibilityElementsHidden } = renderer.root.findByProps({ testID: 'turnstile-challenge' }).props
    return { importantForAccessibility, accessibilityElementsHidden }
  }
  const send = (state: string) => TestRenderer.act(async () => {
    renderer.root.findByType('WebView').props.onMessage({ nativeEvent: { data: JSON.stringify({ state }) } })
    await Promise.resolve()
  })
  const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true }

  expect(read(), 'loading').toEqual(hidden)
  await send('interactive')
  expect(read(), 'interactive').toEqual({ importantForAccessibility: 'auto', accessibilityElementsHidden: false })
  await send('loading')
  expect(read(), 'loading after the tap').toEqual(hidden)
  await send('solved')
  expect(read(), 'solved').toEqual(hidden)
  await send('expired')
  expect(read(), 'expired').toEqual(hidden)
  await send('failed')
  expect(read(), 'failed').toEqual(hidden)
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

it('draws the wait as a skeleton in the box of the check, with its sentence kept, and never as text alone', async () => {
  let renderer!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={vi.fn()} />)
    await Promise.resolve()
  })
  onTestFinished(() => TestRenderer.act(() => renderer.unmount()))
  const webView = renderer.root.findByType('WebView')
  const send = (message: object) => TestRenderer.act(async () => {
    webView.props.onMessage({ nativeEvent: { data: JSON.stringify(message) } })
    await Promise.resolve()
  })
  const wait = renderer.root.findByProps({ testID: 'turnstile-wait' })
  expect(StyleSheet.flatten(wait.props.style).height).toBe(65)
  expect(wait.findAllByProps({ testID: 'skeleton-face' }).length).toBeGreaterThan(0)
  expect(wait.findAllByType('Text').some((node: { props: { children: unknown } }) => node.props.children === 'auth.turnstileLoading')).toBe(true)
  expect(renderer.root.findAllByType('ActivityIndicator')).toHaveLength(0)

  await send({ state: 'interactive' })
  expect(renderer.root.findAllByProps({ testID: 'turnstile-wait' })).toHaveLength(0)
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'turnstile-challenge' }).props.style).height).toBe(65)

  await send({ state: 'solved', token: 'fresh-token' })
  expect(renderer.root.findAllByProps({ testID: 'skeleton-face' })).toHaveLength(0)
})

function shownSentences(renderer: ReturnType<typeof TestRenderer.create>) {
  return renderer.root.findAllByType('Text').map((node: { props: { children: unknown } }) => node.props.children)
}

type BridgeNode = { props: { source: { uri: string }; onError: (event: object) => void; onHttpError: (event: object) => void; onMessage: (event: object) => void } }

function bridges(renderer: ReturnType<typeof TestRenderer.create>): BridgeNode[] {
  return renderer.root.findAllByType('WebView')
}

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

const EXPECTED_BRIDGE_BACKOFF_MS = [2_000, 4_000, 8_000, 8_000, 8_000, 8_000]

it('keeps the loading state while a waking bridge host answers 503, loads the bridge again after 2, 4 and 8 s and then every 8 s, and shows the check the bridge then posts', async () => {
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  const loaded: BridgeNode[] = []
  for (const [load, delay] of EXPECTED_BRIDGE_BACKOFF_MS.entries()) {
    const [bridge] = bridges(renderer)
    expect(loaded, `a new WebView loads the bridge for load ${load}`).not.toContain(bridge)
    loaded.push(bridge!)
    TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 503, 'Service Unavailable')))
    expect(onToken).toHaveBeenLastCalledWith(null)
    expect(shownSentences(renderer), `after the 503 of load ${load}`).toEqual(['auth.turnstileLoading'])
    expect(renderer.root.findAllByProps({ label: 'auth.turnstileRetry' })).toHaveLength(0)
    TestRenderer.act(() => { vi.advanceTimersByTime(delay - 1) })
    expect(bridges(renderer), `the next load waits for ${delay} ms`).toEqual([bridge])
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

function post(bridge: BridgeNode, message: object) {
  TestRenderer.act(() => bridge.props.onMessage({ nativeEvent: { data: JSON.stringify(message) } }))
}

it('keeps a bridge that runs its challenge again: each loading message starts the load deadline again, so a second run that ends after 60 s shows the check', async () => {
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  const [bridge] = bridges(renderer)
  const firstRunMs = 38_000
  TestRenderer.act(() => { vi.advanceTimersByTime(firstRunMs) })
  post(bridge!, { failure: { kind: 'challenge', code: '300010' } })
  post(bridge!, { state: 'loading' })
  post(bridge!, { token: null })
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - firstRunMs) })
  expect(shownSentences(renderer), 'at 60 s after the mount the second run still has time').toEqual(['auth.turnstileLoading'])
  expect(bridges(renderer), 'the bridge that runs the challenge again stays').toEqual([bridge])
  expect(renderer.root.findAllByProps({ label: 'auth.turnstileRetry' })).toHaveLength(0)

  TestRenderer.act(() => { vi.advanceTimersByTime(2_000) })
  post(bridge!, { state: 'interactive' })
  expect(shownSentences(renderer)).toEqual([])
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'turnstile-challenge' }).props.style).height).toBe(TURNSTILE_CHALLENGE_HEIGHT)
})

it('shows the failure 60 s after the last loading message of a bridge that then gives no sign, and removes the WebView', async () => {
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  for (const delay of EXPECTED_BRIDGE_BACKOFF_MS) {
    const [bridge] = bridges(renderer)
    TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 503, 'Service Unavailable')))
    TestRenderer.act(() => { vi.advanceTimersByTime(delay) })
  }

  const [awake] = bridges(renderer)
  post(awake!, { state: 'loading' })
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer), 'the woken bridge has the full deadline from its loading message').toEqual(['auth.turnstileLoading'])
  expect(bridges(renderer)).toEqual([awake])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer), 'a bridge that gives no sign for 60 s fails').toEqual(['auth.turnstileFailed'])
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(bridges(renderer)).toHaveLength(0)
})

it('gives the check 60 s after the tap of the person, then shows the failure when the bridge gives no sign', async () => {
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  post(bridge!, { state: 'interactive' })
  TestRenderer.act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer), 'a challenge that waits for the person has no deadline').toEqual([])
  post(bridge!, { state: 'loading' })
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
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

it.each([502, 503, 504])('reports nothing when a %s answer of the bridge host is followed by a bridge that loads', async (status) => {
  vi.mocked(captureMessage).mockClear()
  vi.mocked(addBreadcrumb).mockClear()
  const renderer = await renderWithFakeClock()
  const [asleep] = bridges(renderer)
  TestRenderer.act(() => asleep!.props.onHttpError(httpError(asleep!.props.source.uri, status, 'Service Unavailable')))
  TestRenderer.act(() => { vi.advanceTimersByTime(2_000) })
  const [awake] = bridges(renderer)
  expect(awake).not.toBe(asleep)
  post(awake!, { stage: 'script_started' })
  post(awake!, { stage: 'script_loaded' })
  post(awake!, { state: 'interactive' })
  TestRenderer.act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual([])
  expect(vi.mocked(captureMessage).mock.calls, 'a retry that works sends no Sentry event, not at once and not at the deadline').toEqual([])
  expect(vi.mocked(addBreadcrumb).mock.calls.map(([breadcrumb]) => breadcrumb.data?.statusCode), 'the breadcrumb of the status stays').toEqual([status])
})

it('reports the 503 status once, with the load deadline event, when every load of the bridge answers 503 until the deadline', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const bridgeUrl = bridges(renderer)[0]!.props.source.uri
  const host = new URL(bridgeUrl).hostname
  let elapsed = 0
  for (const delay of EXPECTED_BRIDGE_BACKOFF_MS) {
    TestRenderer.act(() => bridges(renderer)[0]!.props.onHttpError(httpError(bridgeUrl, 503, 'Service Unavailable')))
    expect(vi.mocked(captureMessage).mock.calls, `no event after the 503 at ${elapsed} ms`).toEqual([])
    TestRenderer.act(() => { vi.advanceTimersByTime(delay) })
    elapsed += delay
  }
  TestRenderer.act(() => bridges(renderer)[0]!.props.onHttpError(httpError(bridgeUrl, 503, 'Service Unavailable')))
  expect(vi.mocked(captureMessage).mock.calls).toEqual([])
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - elapsed) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(bridges(renderer)).toHaveLength(0)
  expect(vi.mocked(captureMessage).mock.calls).toEqual([
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind: 'http', host, status_code: 503, code: null },
      extra: { description: 'Service Unavailable', elapsed_ms: TURNSTILE_LOAD_DEADLINE_MS }, fingerprint: ['turnstile_load_failed', 'http', '503'] }],
    deadlineEvent('bridge_deadline', host, TURNSTILE_LOAD_DEADLINE_MS),
  ])
})

it('starts the 2 s backoff again after a sign from a bridge page, and after Retry', async () => {
  const renderer = await renderWithFakeClock()
  for (const delay of EXPECTED_BRIDGE_BACKOFF_MS.slice(0, 2)) {
    TestRenderer.act(() => bridges(renderer)[0]!.props.onHttpError(httpError('https://app.example/x', 503, 'Service Unavailable')))
    TestRenderer.act(() => { vi.advanceTimersByTime(delay) })
  }
  post(bridges(renderer)[0]!, { state: 'loading' })
  const [again] = bridges(renderer)
  TestRenderer.act(() => again!.props.onHttpError(httpError('https://app.example/x', 503, 'Service Unavailable')))
  TestRenderer.act(() => { vi.advanceTimersByTime(1_999) })
  expect(bridges(renderer), 'a sign resets the backoff to 2 s').toEqual([again])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(bridges(renderer)[0]).not.toBe(again)

  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  TestRenderer.act(() => renderer.root.findByProps({ label: 'auth.turnstileRetry' }).props.onClick())
  const [fresh] = bridges(renderer)
  TestRenderer.act(() => fresh!.props.onHttpError(httpError('https://app.example/x', 503, 'Service Unavailable')))
  TestRenderer.act(() => { vi.advanceTimersByTime(2_000) })
  expect(bridges(renderer)[0], 'Retry starts the backoff at 2 s').not.toBe(fresh)
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
    { category: 'auth.turnstile', level: 'warning', message: 'Human check bridge load error', data: { statusCode: undefined, code: '-1009', description: 'The Internet connection appears to be offline.', host } },
    { category: 'auth.turnstile', level: 'warning', message: 'Human check bridge HTTP error', data: { statusCode: 429, code: undefined, description: undefined, host } },
  ])
  expect(JSON.stringify(vi.mocked(addBreadcrumb).mock.calls)).not.toMatch(/site-key|siteKey|turnstile-bridge/)
})

it('sends one Sentry event for each different load failure, with the kind, the status or code, the host and the time, and never the site key, the token or the query', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const bridgeUrl = bridges(renderer)[0]!.props.source.uri
  const host = new URL(bridgeUrl).hostname
  for (let load = 0; load < 3; load += 1) {
    const [bridge] = bridges(renderer)
    TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridgeUrl, 429, 'Too Many Requests')))
    TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  }
  const [awake] = bridges(renderer)
  TestRenderer.act(() => { vi.advanceTimersByTime(30_000) })
  post(awake!, { failure: { kind: 'challenge', code: '300010' } })
  post(awake!, { state: 'loading', token: 'secret-token' })
  post(awake!, { failure: { kind: 'challenge', code: 'https://example.org/?token=secret-token' } })
  post(awake!, { failure: { kind: 'made-up', code: '1' } })
  post(awake!, { failure: { kind: 'run_deadline' } })
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])

  const event = (kind: string, eventHost: string, status_code: number | null, code: string | null, description: string | null, elapsed_ms: number) =>
    ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind, host: eventHost, status_code, code },
      extra: { description, elapsed_ms }, fingerprint: ['turnstile_load_failed', kind, String(status_code ?? code ?? '')] }]
  expect(vi.mocked(captureMessage).mock.calls).toEqual([
    event('http', host, 429, null, 'Too Many Requests', 0),
    event('challenge', 'challenges.cloudflare.com', null, '300010', null, 96_000),
    event('challenge', 'challenges.cloudflare.com', null, null, null, 96_000),
    event('bridge_deadline', host, null, null, null, 96_000),
  ])
  expect(JSON.stringify(vi.mocked(captureMessage).mock.calls)).not.toMatch(/site-key|siteKey|turnstile-bridge|secret-token|example\.org/)
})

const deadlineEvent = (kind: string, eventHost: string, elapsed_ms: number) =>
  ['turnstile_load_failed', { level: 'warning', tags: { operation: 'turnstile_load', kind, host: eventHost, status_code: null, code: null },
    extra: { description: null, elapsed_ms }, fingerprint: ['turnstile_load_failed', kind, ''] }]

it.each([
  ['a bridge page that posts no stage (an earlier web release, or a page that never ran)', [], 'bridge_deadline', 'bridge'],
  ['a Cloudflare script that starts and never loads', ['script_started'], 'script_deadline', 'challenges.cloudflare.com'],
  ['a run that gives no sign after the script loads', ['script_started', 'script_loaded'], 'run_deadline', 'challenges.cloudflare.com'],
])('names the app deadline from the last bridge stage, as the web widget does, for %s', async (_case, stages, kind, eventHost) => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  const bridgeHost = new URL(bridge!.props.source.uri).hostname
  for (const stage of stages) post(bridge!, { stage })
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(bridges(renderer)).toHaveLength(0)
  expect(vi.mocked(captureMessage).mock.calls).toEqual([
    deadlineEvent(kind, eventHost === 'bridge' ? bridgeHost : eventHost, TURNSTILE_LOAD_DEADLINE_MS),
  ])
})

it('starts the app deadline again at each bridge stage, so the run has its own 60 s after a slow script load, as on web', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  post(bridge!, { stage: 'script_started' })
  TestRenderer.act(() => { vi.advanceTimersByTime(50_000) })
  post(bridge!, { stage: 'script_loaded' })
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer), 'the run keeps its 60 s from the script load').toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(vi.mocked(captureMessage).mock.calls).toEqual([deadlineEvent('run_deadline', 'challenges.cloudflare.com', 50_000 + TURNSTILE_LOAD_DEADLINE_MS)])
})

it('forgets the stage of a bridge page when a new page loads, and never starts a deadline from a stage while the challenge waits for the person', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [first] = bridges(renderer)
  const bridgeHost = new URL(first!.props.source.uri).hostname
  post(first!, { stage: 'script_loaded' })
  TestRenderer.act(() => first!.props.onHttpError(httpError(first!.props.source.uri, 503, 'Service Unavailable')))
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  const [second] = bridges(renderer)
  expect(second).not.toBe(first)
  post(second!, { state: 'interactive' })
  post(second!, { stage: 'script_loaded' })
  TestRenderer.act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer), 'a stage does not start a deadline under a challenge that waits for the person').toEqual([])

  TestRenderer.act(() => second!.props.onHttpError(httpError(second!.props.source.uri, 503, 'Service Unavailable')))
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  expect(bridges(renderer)[0]).not.toBe(second)
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - TURNSTILE_RETRY_INTERVAL_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(vi.mocked(captureMessage).mock.calls.at(-1), 'the stage of the earlier page does not name the deadline of a page that posts none')
    .toEqual(deadlineEvent('bridge_deadline', bridgeHost, TURNSTILE_RETRY_INTERVAL_MS + 4 * TURNSTILE_LOAD_DEADLINE_MS))
})

it('reports a Cloudflare script that fails at once as one script event and one script deadline event with the Cloudflare host, and no app deadline', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  post(bridge!, { stage: 'script_started' })
  for (let elapsed = 0; elapsed + TURNSTILE_RETRY_INTERVAL_MS < TURNSTILE_LOAD_DEADLINE_MS; elapsed += TURNSTILE_RETRY_INTERVAL_MS) {
    post(bridge!, { failure: { kind: 'script' } })
    post(bridge!, { state: 'loading' })
    post(bridge!, { token: null })
    TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_RETRY_INTERVAL_MS) })
  }
  post(bridge!, { failure: { kind: 'script_deadline' } })
  post(bridge!, { state: 'failed' })
  TestRenderer.act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(vi.mocked(captureMessage).mock.calls).toEqual([
    deadlineEvent('script', 'challenges.cloudflare.com', TURNSTILE_LOAD_DEADLINE_MS - TURNSTILE_RETRY_INTERVAL_MS),
    deadlineEvent('script_deadline', 'challenges.cloudflare.com', TURNSTILE_LOAD_DEADLINE_MS - TURNSTILE_RETRY_INTERVAL_MS),
  ])
})

it('sends no Sentry event for a script or challenge failure that the bridge then passes, and one event for each failure when the bridge then fails', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  post(bridge!, { failure: { kind: 'script' } })
  post(bridge!, { failure: { kind: 'challenge', code: '300010' } })
  post(bridge!, { state: 'loading' })
  post(bridge!, { state: 'solved', token: 'passed-token' })
  TestRenderer.act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(vi.mocked(captureMessage).mock.calls, 'a pass drops the held failures').toEqual([])
})

it('reports the held bridge failures and the held 503 status when the widget unmounts before the load ends', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 503, 'Service Unavailable')))
  post(bridges(renderer)[0]!, { failure: { kind: 'script' } })
  expect(vi.mocked(captureMessage).mock.calls).toEqual([])
  TestRenderer.act(() => renderer.unmount())
  expect(vi.mocked(captureMessage).mock.calls.map(([, context]) => (context as { tags: { kind: string } }).tags.kind)).toEqual(['http', 'script'])
})

it('drops the held script failure when the bridge posts that the script loaded, as the web widget does, and keeps the challenge failures', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  post(bridge!, { failure: { kind: 'script' } })
  post(bridge!, { state: 'loading' })
  post(bridge!, { stage: 'script_loaded' })
  post(bridge!, { failure: { kind: 'challenge', code: '110200' } })
  post(bridge!, { state: 'failed' })
  expect(vi.mocked(captureMessage).mock.calls.map(([, context]) => (context as { tags: { kind: string } }).tags.kind)).toEqual(['challenge'])
})

it('sends no event for a script failure that the next script load passed when the widget unmounts after the script loaded', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  post(bridge!, { failure: { kind: 'script' } })
  post(bridge!, { stage: 'script_loaded' })
  TestRenderer.act(() => renderer.unmount())
  expect(vi.mocked(captureMessage).mock.calls).toEqual([])
})

it('reports the held bridge failures when the bridge posts failed', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  post(bridge!, { failure: { kind: 'challenge', code: '300010' } })
  post(bridge!, { state: 'loading' })
  expect(vi.mocked(captureMessage).mock.calls, 'a challenge that runs again waits for the result').toEqual([])
  post(bridge!, { failure: { kind: 'challenge', code: '110200' } })
  post(bridge!, { state: 'failed' })
  expect(vi.mocked(captureMessage).mock.calls.map(([, context]) => (context as { tags: { code: string } }).tags.code)).toEqual(['300010', '110200'])
})

it('reports a failure again after Retry, because Retry starts a new load', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  TestRenderer.act(() => bridge!.props.onHttpError(httpError(bridge!.props.source.uri, 404, 'Not Found')))
  TestRenderer.act(() => renderer.root.findByProps({ label: 'auth.turnstileRetry' }).props.onClick())
  const [fresh] = bridges(renderer)
  TestRenderer.act(() => fresh!.props.onHttpError(httpError(fresh!.props.source.uri, 404, 'Not Found')))
  expect(vi.mocked(captureMessage).mock.calls.map(([, context]) => (context as { tags: { status_code: number } }).tags.status_code)).toEqual([404, 404])
})

it('reports a malformed bridge message as a load failure', async () => {
  vi.mocked(captureMessage).mockClear()
  const renderer = await renderWithFakeClock()
  TestRenderer.act(() => bridges(renderer)[0]!.props.onMessage({ nativeEvent: { data: 'malformed-message' } }))
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
  expect(vi.mocked(captureMessage).mock.calls.map(([, context]) => (context as { tags: { kind: string } }).tags.kind)).toEqual(['message'])
  expect(JSON.stringify(vi.mocked(captureMessage).mock.calls)).not.toContain('malformed-message')
})

type AppStateName = 'active' | 'background' | 'inactive'

function watchAppState(initial: AppStateName = 'active') {
  const listeners = new Set<(state: AppStateName) => void>()
  const original = AppState.currentState
  AppState.currentState = initial
  const spy = vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener)
    return { remove: () => { listeners.delete(listener) } }
  })
  onTestFinished(() => { spy.mockRestore(); AppState.currentState = original })
  return {
    listeners,
    move: (next: AppStateName) => TestRenderer.act(() => {
      AppState.currentState = next
      for (const listener of [...listeners]) listener(next)
    }),
  }
}

it('stops the load deadline while the app is in the background and gives the bridge the full 60 s again on return, so a paused WebView reports no failure', async () => {
  vi.mocked(captureMessage).mockClear()
  const app = watchAppState()
  const onToken = vi.fn()
  const renderer = await renderWithFakeClock(onToken)
  TestRenderer.act(() => { vi.advanceTimersByTime(20_000) })
  app.move('background')
  TestRenderer.act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer), 'the deadline does not run in the background').toEqual(['auth.turnstileLoading'])
  expect(vi.mocked(captureMessage)).not.toHaveBeenCalled()
  expect(onToken).not.toHaveBeenCalled()
  expect(bridges(renderer)).toHaveLength(1)

  app.move('active')
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS - 1) })
  expect(shownSentences(renderer), 'the return starts the deadline again').toEqual(['auth.turnstileLoading'])
  TestRenderer.act(() => { vi.advanceTimersByTime(1) })
  expect(shownSentences(renderer), 'a deadline that passes in front still fails').toEqual(['auth.turnstileFailed'])
  expect(vi.mocked(captureMessage)).toHaveBeenCalledTimes(1)
  expect(vi.mocked(captureMessage).mock.calls[0]![1]).toMatchObject({ tags: { kind: 'bridge_deadline' } })
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(bridges(renderer)).toHaveLength(0)
})

it('stops the load deadline when the app is inactive, as iOS reports a covered app', async () => {
  const app = watchAppState()
  const renderer = await renderWithFakeClock()
  app.move('inactive')
  TestRenderer.act(() => { vi.advanceTimersByTime(2 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
})

it('starts no deadline for a widget that mounts in the background, and starts it when the app returns', async () => {
  vi.mocked(captureMessage).mockClear()
  const app = watchAppState('background')
  const renderer = await renderWithFakeClock()
  TestRenderer.act(() => { vi.advanceTimersByTime(2 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileLoading'])
  app.move('active')
  TestRenderer.act(() => { vi.advanceTimersByTime(TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual(['auth.turnstileFailed'])
})

it('starts no deadline on return when the load already ended, so a challenge that waits for the person never fails', async () => {
  vi.mocked(captureMessage).mockClear()
  const app = watchAppState()
  const renderer = await renderWithFakeClock()
  const [bridge] = bridges(renderer)
  app.move('background')
  post(bridge!, { state: 'interactive' })
  app.move('active')
  TestRenderer.act(() => { vi.advanceTimersByTime(3 * TURNSTILE_LOAD_DEADLINE_MS) })
  expect(shownSentences(renderer)).toEqual([])
  expect(vi.mocked(captureMessage)).not.toHaveBeenCalled()
})

it('stops listening to the app state when the widget unmounts', async () => {
  const app = watchAppState()
  const renderer = await renderWithFakeClock()
  expect(app.listeners.size).toBe(1)
  TestRenderer.act(() => renderer.unmount())
  expect(app.listeners.size).toBe(0)
})
