import React from 'react'
import { View } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authTranslator, createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { LoginContent } from '@/components/auth/login-content'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '../../test-mocks/react-native'

const { act, create } = require('react-test-renderer')

type CheckState = 'none' | 'loading' | 'challenge'
// WHY: Cloudflare sizes the flexible widget at 65px height https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
const FLEXIBLE_CHALLENGE_HEIGHT = 65
const LOADING_SENTENCE_HEIGHT = 19
const CHECK_STYLES: Record<CheckState, object> = {
  none: { position: 'absolute', left: 0, right: 0, height: 0 },
  loading: { height: LOADING_SENTENCE_HEIGHT },
  challenge: { height: FLEXIBLE_CHALLENGE_HEIGHT },
}
/** The proof devices: an Android phone with a 24 dp status bar and a 24 dp gesture bar, and the iPhone SE with a 20 pt status bar and a home button. */
const SMALL_ANDROID = { name: '320 x 640 Android', width: 320, height: 640, top: 24, bottom: 24, keyboardTop: 0 }
const SE_SIZE_ANDROID = { name: '375 x 667 Android', width: 375, height: 667, top: 24, bottom: 24, keyboardTop: 0 }
const IPHONE_SE = { name: '375 x 667 iPhone SE', width: 375, height: 667, top: 20, bottom: 0, keyboardTop: 432 }
type Device = typeof IPHONE_SE
const REVEAL_MARGIN = 24
/** Layout engines round positions to 1/64 of a pixel. */
const LAYOUT_UNIT = 1 / 64

const mocks = vi.hoisted((): { flow: Record<string, unknown>; check: CheckState; insets: { top: number; bottom: number }; words: (key: string, params?: Record<string, string | number>) => string } =>
  ({ flow: {}, check: 'none', insets: { top: 0, bottom: 0 }, words: (key) => key }))
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
vi.mock('@/components/auth/turnstile-widget', () => ({
  TurnstileWidget: () => React.createElement(View, { testID: 'check', style: CHECK_STYLES[mocks.check] }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true, toAnimatedEasing: (value: unknown) => value, useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, true) }))
vi.mock('@/components/ui/keyboard-aware-scroll-view', async () => {
  const { View: HostView } = await import('react-native')
  return { useKeyboardAwareInputReveal: () => null, KeyboardAwareScrollView: ({ children, containerStyle, contentContainerStyle }: {
    children: React.ReactNode; containerStyle: React.ComponentProps<typeof View>['style']; contentContainerStyle: React.ComponentProps<typeof View>['style']
  }) => <HostView testID="login-scroll" style={containerStyle}><HostView testID="login-scroll-content" style={contentContainerStyle}>{children}</HostView></HostView> }
})

interface Node { type: unknown; props: Record<string, unknown>; findAll: (predicate: (node: Node) => boolean) => Node[] }
type Host = Parameters<typeof measureProfileRow>[0]
type Tree = { root: Node; unmount: () => void; update: (element: React.ReactElement) => void; toJSON: () => Host }

/** React Native SVG sizes its view from the width and height props, and the layout reads only the style. */
function withSvgSizes(host: Host | string): Host | string {
  if (typeof host === 'string') return host
  const { width, height } = host.props as { width?: unknown; height?: unknown }
  const style = host.type === 'Svg' && typeof width === 'number' && typeof height === 'number' ? { width, height } : host.props.style
  return { ...host, props: { ...host.props, style }, children: host.children?.map(withSvgSizes) ?? null }
}

function textOf(node: Node): string {
  return node.findAll((child) => child.type === 'Text')
    .flatMap((child) => [child.props.children].flat(Infinity)).filter((child) => typeof child === 'string').join('')
}

function screen(device: Device) {
  return <View style={{ width: device.width, height: device.height }}><LoginContent /></View>
}

function render(step: 'email' | 'code', device: Device) {
  vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
  __setWindowDimensions({ width: device.width, height: device.height, scale: 2, fontScale: 1 })
  mocks.insets = { top: device.top, bottom: device.bottom }
  mocks.words = authTranslator('pt-BR')
  mocks.flow = { ...createLoginScreenFixture(step, 'pt-BR'), turnstileSiteKey: 'site-key', turnstileResetKey: 0, onTurnstileToken: vi.fn(),
    setEmail: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), backToEmail: vi.fn(), onCodeChange: vi.fn() }
  let tree!: Tree
  act(() => { tree = create(screen(device)) })
  return tree
}

/** The column holds the sign-in content from the Orbit mark to the last line of the step, with no space of its own above or below. */
function placement(tree: Tree, device: Device) {
  const measured = measureProfileRow(withSvgSizes(tree.toJSON()) as Host, device.width, 1, undefined, true)
  const box = (testID: string) => measured.boxes.find((candidate) => candidate.testID === testID)!
  const column = box('login-column')
  return { group: box('login-field-action'), topGap: column.top - device.top, bottomGap: device.height - device.bottom - column.bottom,
    scrollOverflow: Math.max(0, box('login-scroll-content').bottom - device.height) }
}

function showCheck(tree: Tree, device: Device, check: CheckState) {
  mocks.check = check
  act(() => tree.update(screen(device)))
  return placement(tree, device)
}

describe('mobile sign-in on a small screen', () => {
  afterEach(() => {
    mocks.check = 'none'
    vi.unstubAllEnvs()
    __resetTestHostConfig()
    __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
  })

  const centreCases = [IPHONE_SE, SE_SIZE_ANDROID].flatMap((device) => (['email', 'code'] as const).map((step) => ({ step, device, name: device.name })))
  it.each(centreCases)('centres the $step content in the safe area of the $name with and without the check block', ({ step, device }) => {
    const tree = render(step, device)
    for (const check of ['none', 'loading', 'challenge', 'none'] as const) {
      const { topGap, bottomGap } = showCheck(tree, device, check)
      expect(topGap, `${check}: the content starts inside the safe area`).toBeGreaterThanOrEqual(0)
      expect(Math.abs(topGap - bottomGap) / 2, `${check}: off centre with a top gap of ${topGap} and a bottom gap of ${bottomGap}`).toBeLessThanOrEqual(LAYOUT_UNIT)
    }
    act(() => tree.unmount())
  })

  const clearanceCases = [SMALL_ANDROID, SE_SIZE_ANDROID, IPHONE_SE].flatMap((device) => (['email', 'code'] as const).map((step) => ({ step, device, name: device.name })))
  it.each(clearanceCases)('keeps the whole $step content above the bottom safe area edge of the $name while the check shows, without a scroll', ({ step, device }) => {
    const tree = render(step, device)
    for (const check of ['none', 'loading', 'challenge'] as const) {
      const { topGap, bottomGap, scrollOverflow } = showCheck(tree, device, check)
      expect(topGap, `${check}: the Orbit mark stays under the status bar`).toBeGreaterThanOrEqual(0)
      expect(bottomGap, `${check}: the last line stays above the bottom safe area edge`).toBeGreaterThanOrEqual(0)
      expect(scrollOverflow, `${check}: the content fits, so the screen does not scroll`).toBe(0)
    }
    act(() => tree.unmount())
  })

  it.each(['email', 'code'] as const)('fits the %s field, its check and its primary action above the keyboard', (step) => {
    const tree = render(step, IPHONE_SE)
    const { group } = showCheck(tree, IPHONE_SE, 'challenge')
    expect(group.bottom - group.top).toBeLessThanOrEqual(IPHONE_SE.keyboardTop - IPHONE_SE.top - 2 * REVEAL_MARGIN)
    const groupHost = tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'login-field-action')[0]!
    const t = mocks.flow.t as (key: string) => string
    expect(groupHost.findAll((node) => node.type === 'TextInput')).toHaveLength(1)
    const primaryLabel = t(step === 'email' ? 'auth.sendCode' : 'auth.verify')
    expect(groupHost.findAll((node) => node.type === 'Pressable' && textOf(node) === primaryLabel)).toHaveLength(1)
    act(() => tree.unmount())
  })
})
