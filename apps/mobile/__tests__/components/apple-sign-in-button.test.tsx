import React from 'react'
import { Platform } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppleSignInButton } from '@/components/auth/apple-sign-in-button'
import { NativeAppleSignInButton } from '@/components/auth/native-apple-sign-in-button'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ isAvailable: vi.fn() }))
vi.mock('expo-apple-authentication', () => ({
  isAvailableAsync: mocks.isAvailable,
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: (props: Record<string, unknown>) => React.createElement('NativeAppleButton', props),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
beforeEach(() => { mocks.isAvailable.mockReset().mockResolvedValue(true); Platform.OS = 'ios' })
afterEach(() => { vi.unstubAllEnvs(); Platform.OS = 'android' })

describe('Apple sign-in controls', () => {
  it('renders no control without public client configuration', () => {
    vi.stubEnv('EXPO_PUBLIC_APPLE_CLIENT_ID', '')
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<AppleSignInButton disabled={false} loading={false} onPress={vi.fn()} />) })
    expect(tree.toJSON()).toBeNull()
    expect(mocks.isAvailable).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it('uses the native continue control and blocks disabled activation', async () => {
    const onPress = vi.fn()
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = TestRenderer.create(<NativeAppleSignInButton disabled loading onPress={onPress} />); await Promise.resolve() })
    const control = tree.root.findByType('NativeAppleButton')
    expect(control.props).toMatchObject({ buttonType: 1, buttonStyle: 1, style: { height: 48, width: '100%' } })
    control.props.onPress()
    expect(onPress).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { tree.update(<NativeAppleSignInButton disabled={false} loading={false} onPress={onPress} />); await Promise.resolve() })
    tree.root.findByType('NativeAppleButton').props.onPress()
    expect(onPress).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })

  it('hides the native control on unsupported devices', async () => {
    mocks.isAvailable.mockResolvedValue(false)
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => { tree = TestRenderer.create(<NativeAppleSignInButton disabled={false} loading={false} onPress={vi.fn()} />); await Promise.resolve() })
    expect(tree.toJSON()).toBeNull()
    TestRenderer.act(() => tree.unmount())
  })
})
