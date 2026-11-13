import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppleSignInButton } from '@/components/auth/apple-sign-in-button'
import { PillButton } from '@/components/ui/pill-button'
import { GoogleMark } from '@/components/auth/google-mark'
import { pressableStyle } from '@/__tests__/support/press-feedback'

const TestRenderer = require('react-test-renderer')
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
beforeEach(() => { Platform.OS = 'ios' })
afterEach(() => { vi.unstubAllEnvs(); Platform.OS = 'android' })

describe('Apple sign-in controls', () => {
  it('renders no control without public client configuration', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', '')
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<AppleSignInButton disabled={false} loading={false} onPress={vi.fn()} />) })
    expect(tree.toJSON()).toBeNull()
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['ios', 'android'] as const)('draws the Apple action at the same text size and height as the Google action on %s', (platform) => {
    Platform.OS = platform
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', 'client-id')
    const onPress = vi.fn()
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<>
      <PillButton brand="google" leadingIcon={<GoogleMark />} variant="ghost" onClick={vi.fn()}>auth.signInWithGoogle</PillButton>
      <AppleSignInButton disabled={false} loading={false} onPress={onPress} />
    </>) })
    const [google, apple] = tree.root.findAllByType('Pressable') as { props: Record<string, unknown> & { onPress: () => void } }[]
    const label = (text: string) => StyleSheet.flatten(tree.root.find((node: { type: unknown; props: { children: unknown } }) =>
      node.type === 'Text' && node.props.children === text).props.style)
    expect(label('auth.signInWithApple')).toMatchObject({ fontSize: label('auth.signInWithGoogle').fontSize, fontFamily: label('auth.signInWithGoogle').fontFamily })
    expect(pressableStyle(apple!, false).height).toBe(pressableStyle(google!, false).height)
    TestRenderer.act(() => apple!.props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })
})
