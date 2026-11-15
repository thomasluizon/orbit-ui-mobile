import React from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authTranslator, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { resolveMotionPreset, SPACING, type MotionScenario } from '@orbit/shared/theme'
import { LoginContent } from '@/components/auth/login-content'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { committedHost, type GeometryHost } from '@/__tests__/support/safe-area-geometry'
import { __resetTestHostConfig, __setMeasureInWindowImpl, __setWindowDimensions } from '../../test-mocks/react-native'

const { act, create } = require('react-test-renderer')

/** The bridge states that the human check posts to the app. `interactive` is the Cloudflare checkbox, 65 dp high in every proof dump. */
type CheckState = 'loading' | 'interactive' | 'failed' | 'solved'
/** The proof devices: an Android phone with a 24 dp status bar and a 24 dp gesture bar, the iPhone SE with a 20 pt status bar and a home button, and an iPad. */
const SMALL_ANDROID = { name: '320 x 640 Android', width: 320, height: 640, top: 24, bottom: 24, keyboardTop: 0 }
const SE_SIZE_ANDROID = { name: '375 x 667 Android', width: 375, height: 667, top: 24, bottom: 24, keyboardTop: 0 }
const IPHONE_SE = { name: '375 x 667 iPhone SE', width: 375, height: 667, top: 20, bottom: 0, keyboardTop: 432 }
const IPAD = { name: '820 x 1180 iPad', width: 820, height: 1180, top: 24, bottom: 20, keyboardTop: 0 }
type Device = typeof IPHONE_SE
const REVEAL_MARGIN = 24
/** The drawn space above the Orbit mark and below the last line of the compact column (`Orbit Entrar.dc.html`, compact `padding:16px`). */
const DRAWN_SPACE = SPACING.s16
/** Layout engines round positions to 1/64 of a pixel. */
const LAYOUT_UNIT = 1 / 64

const mocks = vi.hoisted((): { flow: Record<string, unknown>; insets: { top: number; bottom: number }; words: (key: string, params?: Record<string, string | number>) => string } =>
  ({ flow: {}, insets: { top: 0, bottom: 0 }, words: (key) => key }))
vi.mock('react-i18next', async () => {
  const { default: catalog } = await import('@orbit/shared/i18n/pt-BR.json')
  const sentence = (key: string) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], catalog) as string
  return {
    useTranslation: () => ({ t: mocks.words, i18n: { language: 'pt-BR' } }),
    Trans: ({ i18nKey }: { i18nKey: string }) => sentence(i18nKey).replaceAll(/<\/?\w+>/g, ''),
  }
})
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ ...mocks.insets, left: 0, right: 0 }) }))
vi.mock('@/app/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('react-native-webview', () => ({ WebView: (props: Record<string, unknown>) => React.createElement('WebView', props) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true, toAnimatedEasing: (value: unknown) => value, useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, true) }))
/** A scroll view: the viewport fills the space under the status bar, measures in the window and lays out its content, which grows past the viewport when it does not fit. */
vi.mock('@/components/ui/keyboard-aware-scroll-view', async () => {
  const { View: HostView } = await import('react-native')
  const { useImperativeHandle, useRef } = await import('react')
  const viewportStyle = { flex: 1 }
  return { useKeyboardAwareInputReveal: () => null, KeyboardAwareScrollView: ({ children, containerStyle, contentContainerStyle, onLayout, ref }: {
    children: React.ReactNode; containerStyle: React.ComponentProps<typeof View>['style']; contentContainerStyle: React.ComponentProps<typeof View>['style']
    onLayout?: (event: LayoutChangeEvent) => void; ref?: React.Ref<{ getNativeScrollRef: () => View | null }>
  }) => {
    const viewport = useRef<View>(null)
    useImperativeHandle(ref, () => ({ getNativeScrollRef: () => viewport.current }))
    return <HostView testID="login-scroll" style={containerStyle}><HostView ref={viewport} testID="login-viewport" onLayout={onLayout} style={viewportStyle}>
      <HostView testID="login-scroll-content" style={contentContainerStyle}>{children}</HostView>
    </HostView></HostView>
  } }
})

interface Node { type: unknown; props: Record<string, unknown>; findAll: (predicate: (node: Node) => boolean) => Node[] }
type Host = Parameters<typeof measureProfileRow>[0]
type Tree = { root: Node; unmount: () => void; update: (element: React.ReactElement) => void; toJSON: () => GeometryHost }
type Box = ReturnType<typeof measureProfileRow>['boxes'][number]

const rendered: { tree: Tree | null; device: Device } = { tree: null, device: IPHONE_SE }

function isCheckRoot(host: GeometryHost) {
  return (host.children ?? []).some((child) => typeof child !== 'string' && child.props.testID === 'turnstile-challenge')
}

/** React Native SVG sizes its view from the width and height props, and the layout reads only the style. The root of the human check gets the name `check`. */
function forLayout(host: GeometryHost | string): GeometryHost | string {
  if (typeof host === 'string') return host
  const { width, height } = host.props as { width?: unknown; height?: unknown }
  const style = host.type === 'Svg' && typeof width === 'number' && typeof height === 'number' ? { width, height } : host.props.style
  const testID = host.props.testID ?? (isCheckRoot(host) ? 'check' : undefined)
  return { ...host, props: { ...host.props, style, testID }, children: host.children?.map(forLayout) ?? null }
}

function layout(tree: Tree, device: Device) {
  const measured = measureProfileRow(forLayout(tree.toJSON()) as Host, device.width, 1, undefined, true)
  return (testID: string) => measured.boxes.find((candidate) => candidate.testID === testID)
}

/** Replays the laid-out boxes to every `measureInWindow` call and every `onLayout` handler, as React Native does after each layout. */
function replayMeasure(callback: (x: number, y: number, width: number, height: number) => void, props: Record<string, unknown>, name: string) {
  const host = rendered.tree ? committedHost(rendered.tree.toJSON(), name, props) : undefined
  const testID = host && (host.props.testID ?? (isCheckRoot(host) ? 'check' : undefined))
  const box = testID ? layout(rendered.tree!, rendered.device)(testID) : undefined
  if (box) callback(box.left, box.top, box.width, box.height)
  else callback(0, 0, 0, 0)
}

function settle(tree: Tree) {
  for (let pass = 0; pass < 3; pass += 1) {
    const box = layout(tree, rendered.device)
    for (const node of tree.root.findAll((candidate) => typeof candidate.type === 'string' && typeof candidate.props.onLayout === 'function')) {
      const bounds = typeof node.props.testID === 'string' ? box(node.props.testID) : undefined
      if (bounds) act(() => (node.props.onLayout as (event: object) => void)({ nativeEvent: { layout: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height } } }))
    }
  }
}

function textOf(node: Node): string {
  return node.findAll((child) => child.type === 'Text')
    .flatMap((child) => [child.props.children].flat(Infinity)).filter((child) => typeof child === 'string').join('')
}

function screen(device: Device) {
  return <View style={{ width: device.width, height: device.height }}><LoginContent /></View>
}

async function render(step: 'email' | 'code', device: Device) {
  vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
  __setWindowDimensions({ width: device.width, height: device.height, scale: 2, fontScale: 1 })
  rendered.device = device
  mocks.insets = { top: device.top, bottom: device.bottom }
  mocks.words = authTranslator('pt-BR')
  mocks.flow = { ...createLoginScreenFixture(step, 'pt-BR'), turnstileSiteKey: 'site-key', turnstileResetKey: 0, onTurnstileToken: vi.fn(),
    setEmail: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), backToEmail: vi.fn(), onCodeChange: vi.fn() }
  await act(async () => { rendered.tree = create(screen(device)); await Promise.resolve() })
  settle(rendered.tree!)
  return rendered.tree!
}

/** Posts a state from the bridge page, as the human check does. */
function showCheck(tree: Tree, check: CheckState) {
  const bridge = tree.root.findAll((node) => node.type === 'WebView')[0]!
  act(() => (bridge.props.onMessage as (event: object) => void)({ nativeEvent: { data: JSON.stringify({ state: check }) } }))
  settle(tree)
  return placement(tree, rendered.device)
}

/** The boxes of the first and the last in-flow child of the column: the Orbit mark and the last line of the step. */
function contentEdges(tree: Tree, box: (testID: string) => Box | undefined) {
  const column = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'login-column')[0]!
  const json = committedHost(tree.toJSON(), 'View', column.props)!
  const inFlow = (json.children ?? []).filter((child): child is GeometryHost => typeof child !== 'string'
    && (StyleSheet.flatten(child.props.style as object) as { position?: string } | undefined)?.position !== 'absolute')
  return { first: box(layoutName(inFlow[0]!))!, last: box(layoutName(inFlow.at(-1)!))! }
}

/** Every host gets a name for the layout: its test ID, or its native tag. */
function layoutName(host: GeometryHost) {
  return host.props.testID ?? `native-${(host.props as { __nativeTag: number }).__nativeTag}`
}

function placement(tree: Tree, device: Device) {
  const json = forLayout(tree.toJSON()) as GeometryHost
  const named = (host: GeometryHost | string): GeometryHost | string => typeof host === 'string' ? host
    : { ...host, props: { ...host.props, testID: layoutName(host) }, children: host.children?.map(named) ?? null }
  const measured = measureProfileRow(named(json) as Host, device.width, 1, undefined, true)
  const box = (testID: string) => measured.boxes.find((candidate) => candidate.testID === testID)
  const column = box('login-column')!
  const { first, last } = contentEdges(tree, box)
  const safeHeight = device.height - device.top - device.bottom
  const scrollOverflow = Math.max(0, box('login-scroll-content')!.bottom - device.height)
  return {
    group: box('login-field-action')!, column, first, last, safeHeight, scrollOverflow,
    topGap: column.top - device.top, bottomGap: device.height - device.bottom - column.bottom,
    /** The space above the Orbit mark with the scroll at the top, and below the last line with the scroll at the end. */
    markSpace: first.top - device.top, lastLineSpace: device.height - device.bottom - (last.bottom - scrollOverflow),
  }
}

describe('mobile sign-in on a small screen', () => {
  beforeEach(() => { __setMeasureInWindowImpl(replayMeasure) })

  afterEach(() => {
    if (rendered.tree) act(() => rendered.tree!.unmount())
    rendered.tree = null
    vi.unstubAllEnvs()
    __resetTestHostConfig()
    __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
  })

  const centreCases = [IPHONE_SE, SE_SIZE_ANDROID, SMALL_ANDROID].flatMap((device) => (['email', 'code'] as const).map((step) => ({ step, device, name: device.name })))
  it.each(centreCases)('centres the $step column in the safe area of the $name in every state of the check', async ({ step, device }) => {
    const tree = await render(step, device)
    for (const check of ['loading', 'interactive', 'solved', 'interactive', 'failed'] as const) {
      const { topGap, bottomGap, column, safeHeight } = showCheck(tree, check)
      const centred = Math.max(0, (safeHeight - column.height) / 2)
      expect(Math.abs(topGap - centred), `${check}: the column starts ${topGap} under the status bar, and the centre is ${centred}`).toBeLessThanOrEqual(LAYOUT_UNIT)
      if (centred > 0) expect(Math.abs(topGap - bottomGap), `${check}: off centre with a top gap of ${topGap} and a bottom gap of ${bottomGap}`).toBeLessThanOrEqual(LAYOUT_UNIT)
    }
  })

  const fitCases = [SE_SIZE_ANDROID, IPHONE_SE].flatMap((device) => (['email', 'code'] as const).map((step) => ({ step, device, name: device.name })))
  it.each(fitCases)('fits the whole $step content of the $name with the drawn space while the check shows, without a scroll', async ({ step, device }) => {
    const tree = await render(step, device)
    for (const check of ['loading', 'interactive', 'solved'] as const) {
      const { markSpace, lastLineSpace, scrollOverflow } = showCheck(tree, check)
      expect(markSpace, `${check}: the drawn space stays above the Orbit mark`).toBeGreaterThanOrEqual(DRAWN_SPACE - LAYOUT_UNIT)
      expect(lastLineSpace, `${check}: the drawn space stays below the last line`).toBeGreaterThanOrEqual(DRAWN_SPACE - LAYOUT_UNIT)
      expect(scrollOverflow, `${check}: the content fits, so the screen does not scroll`).toBe(0)
    }
  })

  it.each(['email', 'code'] as const)('keeps the drawn space around the %s content of a 320 x 640 phone and scrolls by no more than that space', async (step) => {
    const tree = await render(step, SMALL_ANDROID)
    for (const check of ['loading', 'interactive', 'solved'] as const) {
      const { markSpace, lastLineSpace, scrollOverflow } = showCheck(tree, check)
      expect(markSpace, `${check}: the drawn space stays above the Orbit mark at the top of the scroll`).toBeGreaterThanOrEqual(DRAWN_SPACE - LAYOUT_UNIT)
      expect(lastLineSpace, `${check}: the drawn space stays below the last line at the end of the scroll`).toBeGreaterThanOrEqual(DRAWN_SPACE - LAYOUT_UNIT)
      expect(scrollOverflow, `${check}: only the drawn space can need a scroll`).toBeLessThanOrEqual(2 * DRAWN_SPACE)
    }
  })

  it.each(['email', 'code'] as const)('gives the %s panel of an iPad the drawn 32 dp inside its hairline on every edge', async (step) => {
    const tree = await render(step, IPAD)
    const { column, first, last, group } = showCheck(tree, 'interactive')
    const hairline = 1
    const inLayoutUnits = (length: number) => Math.round(length / LAYOUT_UNIT) * LAYOUT_UNIT
    expect({ top: inLayoutUnits(first.top - column.top), bottom: inLayoutUnits(column.bottom - last.bottom), left: inLayoutUnits(group.left - column.left), right: inLayoutUnits(column.right - group.right) })
      .toEqual({ top: hairline + SPACING.s32, bottom: hairline + SPACING.s32, left: hairline + SPACING.s32, right: hairline + SPACING.s32 })
  })

  it.each(['email', 'code'] as const)('fits the %s field, its check and its primary action above the keyboard', async (step) => {
    const tree = await render(step, IPHONE_SE)
    const { group } = showCheck(tree, 'interactive')
    expect(group.bottom - group.top).toBeLessThanOrEqual(IPHONE_SE.keyboardTop - IPHONE_SE.top - 2 * REVEAL_MARGIN)
    const groupHost = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'login-field-action')[0]!
    const t = mocks.flow.t as (key: string) => string
    expect(groupHost.findAll((node) => node.type === 'TextInput')).toHaveLength(1)
    const primaryLabel = t(step === 'email' ? 'auth.sendCode' : 'auth.verify')
    expect(groupHost.findAll((node) => node.type === 'Pressable' && textOf(node) === primaryLabel)).toHaveLength(1)
  })
})
