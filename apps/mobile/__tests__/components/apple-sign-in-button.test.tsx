import React from 'react'
import * as ReactNative from 'react-native'
import { Platform, StyleSheet, View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GOOGLE_SIGN_IN_BUTTON, SMALL_PILL_VISIBLE_MIN, SPACING } from '@orbit/shared/theme'
import { AppleSignInButton } from '@/components/auth/apple-sign-in-button'
import { AppleSignInLogo } from '@/components/auth/apple-sign-in-logo'
import { PillButton } from '@/components/ui/pill-button'
import { GoogleMark } from '@/components/auth/google-mark'
import { pressableStyle } from '@/__tests__/support/press-feedback'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

const TestRenderer = require('react-test-renderer')
/** Layout engines round positions to 1/64 of a pixel. */
const LAYOUT_UNIT = 1 / 64
const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))
const copy = vi.hoisted((): { words: Record<string, string> } => ({ words: {} }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => copy.words[key] ?? key }) }))
vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: (props: Record<string, unknown>) => React.createElement('NativeAppleButton', props),
}))
beforeEach(() => { Platform.OS = 'ios'; theme.mode = 'dark'; copy.words = {} })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); Platform.OS = 'android' })

function renderBesideGoogle(props: { disabled: boolean; loading?: boolean; onPress: () => void }, googleLabel = 'auth.signInWithGoogle') {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<View style={{ gap: 12 }}>
    <PillButton brand="google" leadingIcon={<GoogleMark />} variant="ghost" onClick={vi.fn()}>{googleLabel}</PillButton>
    <AppleSignInButton disabled={props.disabled} loading={props.loading ?? false} onPress={props.onPress} />
  </View>) })
  return tree
}

/** The view that wraps Apple's iPhone control: the element VoiceOver reads and activates. */
function iPhoneAccessibilityElement(tree: ReturnType<typeof TestRenderer.create>) {
  return tree.root.findAll((node: { type: unknown; props: { accessible?: boolean }; findAllByType: (type: string) => unknown[] }) =>
    node.type === View && node.props.accessible === true && node.findAllByType('NativeAppleButton').length === 1)[0]!
}

describe('Apple sign-in controls', () => {
  it('renders no control without public client configuration', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', '')
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<AppleSignInButton disabled={false} loading={false} onPress={vi.fn()} />) })
    expect(tree.toJSON()).toBeNull()
    TestRenderer.act(() => tree.unmount())
  })

  it.each([['dark', 0], ['light', 2]] as const)('draws the iPhone action as Apple\'s own control at the Google pill height and shape in the %s theme', (mode, buttonStyle) => {
    theme.mode = mode
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const onPress = vi.fn()
    const tree = renderBesideGoogle({ disabled: false, onPress })
    const googleStyle = pressableStyle(tree.root.findByType('Pressable'), false)
    expect(googleStyle).toMatchObject({ minHeight: SMALL_PILL_VISIBLE_MIN, borderRadius: SMALL_PILL_VISIBLE_MIN / 2 })
    const control = tree.root.findByType('NativeAppleButton')
    expect(control.props).toMatchObject({ buttonType: 1, buttonStyle, cornerRadius: googleStyle.borderRadius, style: { width: '100%', height: googleStyle.minHeight } })
    expect(tree.root.findAll((node: { type: unknown; props: { children: unknown } }) => node.type === 'Text' && node.props.children === 'auth.signInWithApple')).toHaveLength(0)
    TestRenderer.act(() => control.props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })

  it('blocks a disabled iPhone action, for a tap and for VoiceOver', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const onPress = vi.fn()
    const tree = renderBesideGoogle({ disabled: true, onPress })
    TestRenderer.act(() => tree.root.findByType('NativeAppleButton').props.onPress())
    TestRenderer.act(() => iPhoneAccessibilityElement(tree).props.onAccessibilityTap())
    expect(onPress).not.toHaveBeenCalled()
    expect(iPhoneAccessibilityElement(tree).props.accessibilityState).toEqual({ disabled: true, busy: false })
    TestRenderer.act(() => tree.unmount())
  })

  it('blocks a busy iPhone action, for a tap and for VoiceOver, as the Android and web pills do', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const onPress = vi.fn()
    const tree = renderBesideGoogle({ disabled: false, loading: true, onPress })
    TestRenderer.act(() => tree.root.findByType('NativeAppleButton').props.onPress())
    TestRenderer.act(() => iPhoneAccessibilityElement(tree).props.onAccessibilityTap())
    expect(onPress).not.toHaveBeenCalled()
    expect(iPhoneAccessibilityElement(tree).props.accessibilityState).toEqual({ disabled: true, busy: true })
    expect(StyleSheet.flatten(iPhoneAccessibilityElement(tree).props.style)).toMatchObject({ opacity: 0.4, pointerEvents: 'none' })
    TestRenderer.act(() => tree.unmount())
  })

  it('lets VoiceOver read the title that Apple\'s iPhone control draws, not the app language', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    copy.words = { 'auth.signInWithApple': ptBR.auth.signInWithApple }
    const tree = renderBesideGoogle({ disabled: false, onPress: vi.fn() })
    const element = iPhoneAccessibilityElement(tree)
    expect(element.props.accessibilityLabel, 'React Native names the element from the control title only when it sets no label').toBeUndefined()
    expect(tree.root.findAll((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === ptBR.auth.signInWithApple)).toHaveLength(0)
    const hidden = element.findAll((node: { props: { accessibilityElementsHidden?: boolean; importantForAccessibility?: string } }) =>
      node.props.accessibilityElementsHidden === true || node.props.importantForAccessibility === 'no-hide-descendants')
    expect(hidden, 'nothing hides the control title from the element name').toHaveLength(0)
    TestRenderer.act(() => tree.unmount())
  })

  it('gives VoiceOver one Apple button that reads busy while sign-in starts and starts it on activation', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const onPress = vi.fn()
    let tree = renderBesideGoogle({ disabled: true, loading: true, onPress })
    expect(iPhoneAccessibilityElement(tree).props).toMatchObject({ accessibilityRole: 'button', accessibilityState: { disabled: true, busy: true } })
    TestRenderer.act(() => tree.unmount())
    tree = renderBesideGoogle({ disabled: false, onPress })
    expect(iPhoneAccessibilityElement(tree).props.accessibilityState).toEqual({ disabled: false, busy: false })
    TestRenderer.act(() => iPhoneAccessibilityElement(tree).props.onAccessibilityTap())
    expect(onPress).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })

  it.each([['dark', '#FFFFFF', '#000000'], ['light', '#000000', '#FFFFFF']] as const)('draws the Android action by Apple\'s custom button rules at the Google pill height and shape in the %s theme', (mode, fill, ink) => {
    Platform.OS = 'android'
    theme.mode = mode
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const onPress = vi.fn()
    const tree = renderBesideGoogle({ disabled: false, onPress })
    const [google, apple] = tree.root.findAllByType('Pressable') as { props: Record<string, unknown> & { onPress: () => void } }[]
    const googleStyle = pressableStyle(google!, false)
    const appleStyle = pressableStyle(apple!, false)
    expect(googleStyle).toMatchObject({ minHeight: SMALL_PILL_VISIBLE_MIN, borderRadius: SMALL_PILL_VISIBLE_MIN / 2 })
    expect(appleStyle).toMatchObject({ minHeight: googleStyle.minHeight, borderRadius: googleStyle.borderRadius, paddingVertical: 0, backgroundColor: fill })
    expect(appleStyle.borderWidth ?? 0).toBe(0)
    const title = StyleSheet.flatten(tree.root.find((node: { type: unknown; props: { children: unknown } }) =>
      node.type === 'Text' && node.props.children === 'auth.signInWithApple').props.style)
    expect(title).toMatchObject({ color: ink, fontSize: Math.round(SMALL_PILL_VISIBLE_MIN * 0.43) })
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'apple-sign-in-logo' }).props.style)).toMatchObject({ height: SMALL_PILL_VISIBLE_MIN })
    TestRenderer.act(() => apple!.props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })

  /** The opaque background of each Apple logo tile (`apple-sign-in-logo-on-white.png` for the dark theme, `-on-black` for the light). */
  const LOGO_TILE_BACKGROUND = { dark: '#FFFFFF', light: '#000000' } as const

  it.each([['dark', '#FFFFFF', '#000000'], ['light', '#000000', '#FFFFFF']] as const)('keeps Apple\'s face, logo and title on a busy Android action in the %s theme and dims it to the disabled opacity, as the iPhone control does', (mode, fill, ink) => {
    Platform.OS = 'android'
    theme.mode = mode
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const tree = renderBesideGoogle({ disabled: false, loading: true, onPress: vi.fn() })
    const [, apple] = tree.root.findAllByType('Pressable') as { props: Record<string, unknown>; findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[] }[]
    expect(apple!.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    expect(pressableStyle(apple!, false)).toMatchObject({ backgroundColor: fill, opacity: 0.4 })
    expect(apple!.findAll((node) => node.props.testID === 'skeleton-face'), 'no skeleton face covers Apple\'s face').toHaveLength(0)
    const logo = tree.root.findByType(AppleSignInLogo)
    expect(LOGO_TILE_BACKGROUND[logo.props.theme as 'dark' | 'light'], 'the opaque logo tile sits on its own colour, so it draws no square').toBe(fill)
    const title = StyleSheet.flatten(tree.root.find((node: { type: unknown; props: { children: unknown } }) =>
      node.type === 'Text' && node.props.children === 'auth.signInWithApple').props.style)
    expect(title).toMatchObject({ color: ink })
    TestRenderer.act(() => tree.unmount())
  })

  const largeTextCases = [320, 360, 384, 412].flatMap((width) => ([['pt-BR', ptBR], ['en', en]] as const)
    .flatMap(([locale, words]) => [1, 1.3, 2].map((fontScale) => ({ width, locale, words, fontScale }))))
  it.each(largeTextCases)('keeps the Android Apple and Google titles whole at $width dp in $locale at font scale $fontScale', ({ width, words, fontScale }) => {
    Platform.OS = 'android'
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale })
    copy.words = { 'auth.signInWithApple': words.auth.signInWithApple }
    const tree = renderBesideGoogle({ disabled: false, onPress: vi.fn() }, words.auth.signInWithGoogle)
    const column = width - 2 * (width < 336 ? SPACING.s8 : SPACING.s16)
    const measured = measureProfileRow(tree.toJSON(), column, fontScale)
    for (const [label, markID] of [[words.auth.signInWithGoogle, 'google-mark'], [words.auth.signInWithApple, 'apple-sign-in-logo']] as const) {
      const pill = measured.controls.find((control) => control.labels.includes(label))!
      const title = measured.texts.find((text) => text.label === label)!
      const mark = measured.boxes.find((box) => box.testID === markID)!
      expect((mark.top + mark.bottom) / 2 - pill.top, `${label} mark stays on the first line`).toBeCloseTo(SMALL_PILL_VISIBLE_MIN / 2, 4)
      if (fontScale === 2) expect(pill.height, `${label} pill grows around its large title`).toBeGreaterThan(SMALL_PILL_VISIBLE_MIN)
      expect(title.clipped, `${label} is not truncated`).toBe(false)
      expect(pill.inlineClearance, `${label} keeps its inline padding`).toBeGreaterThanOrEqual(GOOGLE_SIGN_IN_BUTTON.paddingX)
      expect(title.left).toBeGreaterThanOrEqual(pill.left)
      expect(title.right).toBeLessThanOrEqual(pill.right)
      expect(title.top).toBeGreaterThanOrEqual(pill.top)
      expect(title.bottom).toBeLessThanOrEqual(pill.bottom)
      if (label === words.auth.signInWithApple) expect(pill.right - title.right, 'Apple title keeps 8% of the width before the trailing edge').toBeGreaterThanOrEqual(pill.width * 0.08 - LAYOUT_UNIT)
      if (fontScale === 1) {
        expect({ height: pill.height, lines: title.lines }, `${label} rests on one line`).toEqual({ height: SMALL_PILL_VISIBLE_MIN, lines: 1 })
        expect(Math.abs(pill.startClearance - pill.endClearance), `${label} mark and title rest centred`).toBeLessThanOrEqual(LAYOUT_UNIT)
      }
    }
    TestRenderer.act(() => tree.unmount())
  })
})
