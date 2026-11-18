import React from 'react'
import { Platform, StyleSheet, type TextStyle } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { LoginContent } from '@/components/auth/login-content'
import { AppTextInput } from '@/components/ui/app-text-input'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { Input } from '@/components/ui/input'
import { TypedTextInput } from '@/components/ui/typed-text-input'

interface RenderedNode { type: unknown; props: { style: TextStyle; multiline?: boolean; keyboardType?: string; lineBreakModeIOS?: string }; findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] }
interface RenderedTree { root: RenderedNode; unmount: () => void }
const renderer: {
  create: (element: React.ReactElement) => RenderedTree
  act: (callback: () => void | Promise<void>) => void | Promise<void>
} = require('react-test-renderer')

const mocks = vi.hoisted((): { flow: Record<string, unknown> } => ({ flow: {} }))
vi.mock('react-i18next', async (importActual) => ({
  ...(await importActual<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
vi.mock('@/app/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('react-native-webview', () => ({ WebView: (props: Record<string, unknown>) => React.createElement('WebView', props) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true, toAnimatedEasing: (value: unknown) => value, useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, true) }))

const fields = [
  { name: 'Input', element: (multiline: boolean) => multiline ? <Input label="Name" value="" onChange={vi.fn()} multiline /> : <Input label="Name" value="" onChange={vi.fn()} /> },
  { name: 'TypedTextInput', element: (multiline: boolean) => <TypedTextInput accessibilityLabel="Name" value="" multiline={multiline} style={{ fontSize: 16, lineHeight: 24 }} /> },
  { name: 'AppTextInput', element: (multiline: boolean) => <AppTextInput accessibilityLabel="Name" value="" multiline={multiline} style={{ lineHeight: 24 }} /> },
  { name: 'BottomSheetAppTextInput', element: (multiline: boolean) => <BottomSheetAppTextInput accessibilityLabel="Name" value="" multiline={multiline} style={{ lineHeight: 24 }} /> },
]

function usePlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os })
}

function nativeField(element: React.ReactElement) {
  let tree!: RenderedTree
  void renderer.act(() => { tree = renderer.create(element) })
  const [field] = tree.root.findAll((node) => node.type === 'TextInput')
  const style = StyleSheet.flatten(field!.props.style)
  const lineBreakMode = field!.props.lineBreakModeIOS
  void renderer.act(() => tree.unmount())
  return { style, lineBreakMode }
}

describe('a single-line field on iOS gives React Native the paragraph style that the native text field keeps', () => {
  afterEach(() => usePlatform('android'))

  it('gives the sign-in email field no line height and the tail line break mode on iOS, so the typed text equals the React tree text', async () => {
    usePlatform('ios')
    mocks.flow = { ...createLoginScreenFixture('email', 'en'), turnstileSiteKey: undefined, setEmail: vi.fn(), sendCode: vi.fn() }
    let tree!: RenderedTree
    await renderer.act(async () => { tree = renderer.create(<LoginContent />); await Promise.resolve() })
    const [email] = tree.root.findAll((node) => node.type === 'TextInput')
    expect(email!.props.keyboardType).toBe('email-address')
    expect(email!.props.multiline).toBeUndefined()
    expect(StyleSheet.flatten(email!.props.style)).not.toHaveProperty('lineHeight')
    expect(email!.props.lineBreakModeIOS).toBe('tail')
    expect(StyleSheet.flatten(email!.props.style)).toMatchObject({ fontSize: 16, minHeight: 54 })
    void renderer.act(() => tree.unmount())
  })

  it.each(fields)('gives a single-line $name no line height and the tail line break mode on iOS, and keeps the other styles', ({ element }) => {
    usePlatform('ios')
    const { style, lineBreakMode } = nativeField(element(false))
    expect(style).not.toHaveProperty('lineHeight')
    expect(lineBreakMode).toBe('tail')
    expect(style.fontSize).toBe(16)
  })

  it.each(fields)('keeps the line height of a multiline $name on iOS and sets no line break mode', ({ element }) => {
    usePlatform('ios')
    const { style, lineBreakMode } = nativeField(element(true))
    expect(style.lineHeight).toBe(24)
    expect(lineBreakMode).toBeUndefined()
  })

  it.each(fields.flatMap((field) => [false, true].map((multiline) => ({ ...field, multiline }))))('keeps the line height of $name multiline=$multiline on Android and sets no line break mode', ({ element, multiline }) => {
    usePlatform('android')
    const { style, lineBreakMode } = nativeField(element(multiline))
    expect(style.lineHeight).toBe(24)
    expect(lineBreakMode).toBeUndefined()
  })
})
