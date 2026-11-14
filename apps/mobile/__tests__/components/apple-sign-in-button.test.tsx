import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppleSignInButton } from '@/components/auth/apple-sign-in-button'
import { PillButton } from '@/components/ui/pill-button'
import { GoogleMark } from '@/components/auth/google-mark'
import { pressableStyle } from '@/__tests__/support/press-feedback'

const TestRenderer = require('react-test-renderer')
const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: (props: Record<string, unknown>) => React.createElement('NativeAppleButton', props),
}))
beforeEach(() => { Platform.OS = 'ios'; theme.mode = 'dark' })
afterEach(() => { vi.unstubAllEnvs(); Platform.OS = 'android' })

function renderBesideGoogle(props: { disabled: boolean; onPress: () => void }) {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<>
    <PillButton brand="google" leadingIcon={<GoogleMark />} variant="ghost" onClick={vi.fn()}>auth.signInWithGoogle</PillButton>
    <AppleSignInButton disabled={props.disabled} loading={false} onPress={props.onPress} />
  </>) })
  return tree
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
    const googleHeight = pressableStyle(tree.root.findByType('Pressable'), false).height as number
    const control = tree.root.findByType('NativeAppleButton')
    expect(control.props).toMatchObject({ buttonType: 1, buttonStyle, cornerRadius: googleHeight / 2, style: { width: '100%', height: googleHeight } })
    expect(tree.root.findAll((node: { type: unknown; props: { children: unknown } }) => node.type === 'Text' && node.props.children === 'auth.signInWithApple')).toHaveLength(0)
    TestRenderer.act(() => control.props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })

  it('blocks a disabled iPhone action', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const onPress = vi.fn()
    const tree = renderBesideGoogle({ disabled: true, onPress })
    TestRenderer.act(() => tree.root.findByType('NativeAppleButton').props.onPress())
    expect(onPress).not.toHaveBeenCalled()
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
    expect(appleStyle).toMatchObject({ height: googleStyle.height, borderRadius: googleStyle.borderRadius, backgroundColor: fill })
    expect(appleStyle.borderWidth ?? 0).toBe(0)
    const title = StyleSheet.flatten(tree.root.find((node: { type: unknown; props: { children: unknown } }) =>
      node.type === 'Text' && node.props.children === 'auth.signInWithApple').props.style)
    expect(title).toMatchObject({ color: ink, fontSize: Math.round(googleStyle.height * 0.43) })
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'apple-sign-in-logo' }).props.style)).toMatchObject({ height: googleStyle.height })
    TestRenderer.act(() => apple!.props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })
})
