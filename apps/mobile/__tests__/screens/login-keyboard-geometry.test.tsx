import React, { useLayoutEffect } from 'react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { formatLoginCountdown } from '@orbit/shared/utils'
import { LoginContent } from '@/components/auth/login-content'
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { measureSafeArea, type GeometryHost } from '@/__tests__/support/safe-area-geometry'
import { __emitKeyboardEvent, __resetTestHostConfig, __setMeasureInWindowImpl, __setScrollToImpl, __setWindowDimensions } from '../../test-mocks/react-native'

const { act, create } = require('react-test-renderer')

const SE = { width: 375, height: 667, top: 20, bottom: 0, keyboardTop: 432 }
const IPHONE_17 = { width: 402, height: 874, top: 62, bottom: 34, keyboardTop: 572 }
const device = { ...SE }
const FLEXIBLE_CHALLENGE_HEIGHT = 65
const STEP_GAP = 24
type CheckState = 'none' | 'challenge'
const CHECK_HEIGHTS: Record<CheckState, number> = { none: 0, challenge: FLEXIBLE_CHALLENGE_HEIGHT }

const mocks = vi.hoisted((): { flow: Record<string, unknown>; check: 'none' | 'challenge'; insets: { top: number; bottom: number } } =>
  ({ flow: {}, check: 'challenge', insets: { top: 0, bottom: 0 } }))
vi.mock('react-i18next', async (importActual) => ({
  ...(await importActual<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ ...mocks.insets, left: 0, right: 0 }) }))
vi.mock('@/app/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/components/auth/turnstile-widget', () => ({
  TurnstileWidget: ({ onLayout, onSpaceChange }: { onLayout?: (event: LayoutChangeEvent) => void; onSpaceChange?: (height: number) => void }) => {
    useLayoutEffect(() => onSpaceChange?.(CHECK_HEIGHTS[mocks.check]))
    return React.createElement(View, { testID: 'check', onLayout, style: mocks.check === 'none'
      ? { position: 'absolute', left: 0, right: 0, height: 0 } : { height: CHECK_HEIGHTS[mocks.check] } })
  },
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'light' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true, toAnimatedEasing: (value: unknown) => value, useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, true) }))

interface Node { type: unknown; props: Record<string, unknown>; findAll: (predicate: (node: Node) => boolean) => Node[] }
type Tree = { root: Node; unmount: () => void; update: (element: React.ReactElement) => void; toJSON: () => GeometryHost }

const geometry: { tree: Tree | null; scrollY: number } = { tree: null, scrollY: 0 }
const INSIDE_LOGIN_SCROLL = new Set(['login-column', 'login-field-action', 'check', 'last-line'])

function lastLineText() {
  const t = mocks.flow.t as (key: string, params?: Record<string, unknown>) => string
  return t('auth.resendIn', { time: formatLoginCountdown(mocks.flow.resendCountdown as number) })
}

function keyOf(type: unknown, props: Record<string, unknown>, children?: unknown): string | undefined {
  if (type === 'ScrollView') return (props.testID as string | undefined) ?? 'login-scroll'
  if (type === 'Text' && [children].flat(Infinity).join('') === lastLineText()) return 'last-line'
  return props.testID as string | undefined
}

function withIosKeyboardAvoidingPadding(host: GeometryHost | string): GeometryHost | string {
  if (typeof host === 'string') return host
  const style = host.type === 'KeyboardAvoidingView' ? StyleSheet.flatten([host.props.style as object, { paddingBottom: 0 }]) : host.props.style
  return { ...host, props: { ...host.props, style }, children: host.children?.map(withIosKeyboardAvoidingPadding) ?? null }
}

function layout() {
  const root = withIosKeyboardAvoidingPadding(geometry.tree!.toJSON()) as GeometryHost
  return measureSafeArea(root, (host) => keyOf(host.type, host.props, host.children), { width: device.width, height: device.height })
}

function screenBox(key: string) {
  const box = layout().get(key)
  if (!box) throw new Error(`No layout for ${key}`)
  const offset = INSIDE_LOGIN_SCROLL.has(key) ? geometry.scrollY : 0
  return { top: box.top - offset, bottom: box.bottom - offset, left: box.left, width: box.width }
}

function hosts(tree: Tree, predicate: (node: Node) => boolean) {
  return tree.root.findAll((node) => typeof node.type === 'string' && predicate(node))
}

function loginScroll(tree: Tree) {
  return hosts(tree, (node) => node.type === 'ScrollView' && node.props.testID === undefined)[0]!
}

function maxLoginScroll(tree: Tree) {
  const viewport = screenBox('login-scroll')
  const column = layout().get('login-column')!
  const paddingBottom = (StyleSheet.flatten(loginScroll(tree).props.contentContainerStyle as object) as { paddingBottom?: number }).paddingBottom ?? 0
  return Math.max(0, column.bottom + paddingBottom - viewport.bottom)
}

function settle(tree: Tree) {
  for (let pass = 0; pass < 4; pass += 1) {
    const boxes = layout()
    for (const node of hosts(tree, (host) => typeof host.props.onLayout === 'function')) {
      const key = keyOf(node.type, node.props)
      const box = key ? boxes.get(key) : undefined
      if (!box) continue
      act(() => (node.props.onLayout as (event: object) => void)({ nativeEvent: { layout: { x: box.left, y: box.top, width: box.width, height: box.bottom - box.top } } }))
    }
  }
}

function screen() {
  return <View style={{ width: device.width, height: device.height }}>
    <KeyboardAwareSheetScrollView testID="flow-viewport" style={{ flex: 1 }} contentContainerStyle={{ flex: 1 }}>
      <LoginContent />
    </KeyboardAwareSheetScrollView>
  </View>
}

function render(step: 'email' | 'code', check: CheckState) {
  mocks.check = check
  mocks.flow = { ...createLoginScreenFixture(step, 'pt-BR'), turnstileSiteKey: 'site-key', turnstileResetKey: 0, onTurnstileToken: vi.fn(),
    setEmail: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), backToEmail: vi.fn(), onCodeChange: vi.fn() }
  act(() => { geometry.tree = create(screen()) })
  const tree = geometry.tree!
  __setScrollToImpl(({ y = 0 }) => {
    geometry.scrollY = Math.min(y, maxLoginScroll(tree))
    ;(loginScroll(tree).props.onScroll as (event: object) => void)({ nativeEvent: { contentOffset: { y: geometry.scrollY } } })
  })
  settle(tree)
  return tree
}

function setCheck(tree: Tree, check: CheckState) {
  mocks.check = check
  act(() => tree.update(screen()))
  settle(tree)
}

function textInput(tree: Tree, index: number) {
  return hosts(tree, (node) => node.type === 'TextInput')[index]!
}

function openKeyboard(tree: Tree) {
  act(() => {
    __emitKeyboardEvent('keyboardWillShow', { endCoordinates: { screenY: device.keyboardTop } })
    __emitKeyboardEvent('keyboardDidChangeFrame', { endCoordinates: { screenY: device.keyboardTop } })
  })
  settle(tree)
}

function closeKeyboard(tree: Tree) {
  act(() => {
    __emitKeyboardEvent('keyboardWillHide')
    __emitKeyboardEvent('keyboardDidChangeFrame', { endCoordinates: { screenY: device.height } })
    __emitKeyboardEvent('keyboardDidHide')
  })
  geometry.scrollY = Math.min(geometry.scrollY, maxLoginScroll(tree))
  settle(tree)
}

function useDevice(next: typeof SE) {
  Object.assign(device, next)
  mocks.insets = { top: next.top, bottom: next.bottom }
  __setWindowDimensions({ width: next.width, height: next.height, scale: 2, fontScale: 1 })
}

describe('mobile sign-in on iPhone inside the flow viewport', () => {
  beforeEach(() => {
    __resetTestHostConfig()
    geometry.scrollY = 0
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })
    useDevice(SE)
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => { callback(0); return 0 })
    __setMeasureInWindowImpl(measureFromLayout)
  })

  afterEach(() => {
    act(() => geometry.tree?.unmount())
    geometry.tree = null
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
    __resetTestHostConfig()
    vi.unstubAllGlobals()
  })

  function directTop(check: CheckState) {
    const tree = render('email', check)
    const top = screenBox('login-column').top
    act(() => tree.unmount())
    geometry.tree = null
    geometry.scrollY = 0
    return top
  }

  it('rests the column where a direct launch puts it after the keyboard of the previous screen closes', () => {
    const expected = directTop('challenge')
    __emitKeyboardEvent('keyboardWillShow', { endCoordinates: { screenY: device.keyboardTop } })
    const tree = render('email', 'challenge')
    closeKeyboard(tree)
    expect(screenBox('login-column').top).toBe(expected)
  })

  it('rests the column where a direct launch puts it after the person passes the check with the keyboard open', () => {
    const expected = directTop('none')
    const tree = render('email', 'challenge')
    act(() => (textInput(tree, 0).props.onFocus as (event: object) => void)({ nativeEvent: {} }))
    openKeyboard(tree)
    setCheck(tree, 'none')
    act(() => (textInput(tree, 0).props.onBlur as (event: object) => void)({ nativeEvent: {} }))
    closeKeyboard(tree)
    expect(screenBox('login-column').top).toBe(expected)
  })

  it('ends the last line of the code step above the keyboard while the check shows, with no strip between the scroller and the keyboard', () => {
    const tree = render('code', 'challenge')
    act(() => (textInput(tree, 0).props.onFocus as (event: object) => void)({ nativeEvent: {} }))
    openKeyboard(tree)
    const scroller = screenBox('login-scroll')
    expect(scroller.bottom).toBe(device.keyboardTop)
    const lastLine = screenBox('last-line')
    expect(lastLine.top).toBeGreaterThanOrEqual(scroller.top)
    expect(lastLine.bottom).toBeLessThanOrEqual(device.keyboardTop)
    const field = screenBox('login-field-action')
    expect(field.top).toBeGreaterThanOrEqual(scroller.top)
  })

  it('lets the iPhone keyboard view replace the bottom padding of its own style', () => {
    const require = createRequire(import.meta.url)
    const source = readFileSync(join(dirname(require.resolve('react-native/package.json')), 'Libraries/Components/Keyboard/KeyboardAvoidingView.js'), 'utf8')
    expect(source).toContain('style={StyleSheet.compose(style, {paddingBottom: bottomHeight})}')
  })

  it.each(['none', 'challenge'] as const)('centres the column in the safe area of an iPhone with a home indicator (check: %s)', (check) => {
    useDevice(IPHONE_17)
    render('email', check)
    const column = screenBox('login-column')
    const topGap = column.top - IPHONE_17.top
    const bottomGap = IPHONE_17.height - IPHONE_17.bottom - column.bottom
    const checkSpace = check === 'none' ? 0 : FLEXIBLE_CHALLENGE_HEIGHT + STEP_GAP
    expect(Math.abs(topGap - (bottomGap + checkSpace))).toBeLessThanOrEqual(1)
  })
})

function measureFromLayout(callback: (x: number, y: number, width: number, height: number) => void, props: Record<string, unknown>, name: string) {
  if (!geometry.tree) return callback(0, 0, 0, 0)
  const key = keyOf(name, props)
  if (!key || !layout().has(key)) return callback(0, 0, 0, 0)
  const box = screenBox(key)
  callback(box.left, box.top, box.width, box.bottom - box.top)
}
