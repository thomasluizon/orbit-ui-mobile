import React from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { LoginContent } from '@/components/auth/login-content'
import { measureSafeArea, type GeometryHost } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '../../test-mocks/react-native'

const { act, create } = require('react-test-renderer')

type CheckState = 'none' | 'loading' | 'challenge'
const CHECK_STYLES: Record<CheckState, object> = {
  none: { position: 'absolute', left: 0, right: 0, height: 0 },
  loading: { height: 21 },
  challenge: { height: 65 },
}
const SE = { width: 375, height: 667, statusBar: 20, keyboardTop: 432 }
const REVEAL_MARGIN = 24

const mocks = vi.hoisted((): { flow: Record<string, unknown>; check: CheckState } => ({ flow: {}, check: 'loading' }))
vi.mock('react-i18next', async (importActual) => ({
  ...(await importActual<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/app/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('@/components/auth/turnstile-widget', () => ({
  TurnstileWidget: ({ onLayout }: { onLayout: (event: LayoutChangeEvent) => void }) =>
    React.createElement(View, { testID: 'check', onLayout, style: CHECK_STYLES[mocks.check] }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => true, toAnimatedEasing: (value: unknown) => value, useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, true) }))
vi.mock('@/components/ui/keyboard-aware-scroll-view', async () => {
  const { View: HostView } = await import('react-native')
  return { useKeyboardAwareInputReveal: () => null, KeyboardAwareScrollView: ({ children, contentContainerStyle, onLayout }: {
    children: React.ReactNode; contentContainerStyle: unknown; onLayout: (event: LayoutChangeEvent) => void
  }) => <HostView testID="login-scroll-content" onLayout={onLayout} style={contentContainerStyle as React.ComponentProps<typeof View>['style']}>{children}</HostView> }
})

interface Node { type: unknown; props: Record<string, unknown>; findAll: (predicate: (node: Node) => boolean) => Node[] }
type Tree = { root: Node; unmount: () => void; update: (element: React.ReactElement) => void; toJSON: () => GeometryHost }

function textOf(node: Node): string {
  return node.findAll((child) => child.type === 'Text')
    .flatMap((child) => [child.props.children].flat(Infinity)).filter((child) => typeof child === 'string').join('')
}

function screen() {
  return <View style={{ width: SE.width, height: SE.height - SE.statusBar }}><LoginContent /></View>
}

function hostWith(tree: Tree, testID: string) {
  return tree.root.findAll((node) => node.type === 'View' && node.props.testID === testID)[0]
}

function layoutOnce(tree: Tree) {
  return measureSafeArea(tree.toJSON(), (host) => {
    const testID = host.props.testID
    return testID === 'login-column' || testID === 'check' || testID === 'login-field-action' ? testID : undefined
  }, { width: SE.width, height: SE.height - SE.statusBar })
}

function settle(tree: Tree) {
  const layout = (testID: string, height: number) => hostWith(tree, testID)?.props.onLayout
    && act(() => (hostWith(tree, testID)!.props.onLayout as (event: { nativeEvent: { layout: { height: number } } }) => void)(
      { nativeEvent: { layout: { height } } }))
  for (let pass = 0; pass < 3; pass += 1) {
    const bounds = layoutOnce(tree)
    layout('login-scroll-content', SE.height - SE.statusBar)
    for (const testID of ['login-column', 'check']) {
      const box = bounds.get(testID)
      if (box) layout(testID, box.bottom - box.top)
    }
  }
  return layoutOnce(tree)
}

function render(step: 'email' | 'code') {
  mocks.flow = { ...createLoginScreenFixture(step, 'pt-BR'), turnstileSiteKey: 'site-key', turnstileResetKey: 0, onTurnstileToken: vi.fn(),
    setEmail: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), backToEmail: vi.fn(), onCodeChange: vi.fn() }
  let tree!: Tree
  act(() => { tree = create(screen()) })
  return tree
}

describe('mobile sign-in at 375 x 667', () => {
  afterEach(() => {
    mocks.check = 'loading'
    __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
  })

  it.each(['email', 'code'] as const)('keeps the %s column still while the check appears, changes and leaves', (step) => {
    __setWindowDimensions({ width: SE.width, height: SE.height, scale: 2, fontScale: 1 })
    const tree = render(step)
    const tops = (['none', 'loading', 'challenge', 'loading', 'none'] as const).map((check) => {
      mocks.check = check
      act(() => tree.update(screen()))
      const bounds = settle(tree)
      return bounds.get('login-column')!.top
    })
    expect(new Set(tops).size).toBe(1)
    act(() => tree.unmount())
  })

  it.each(['email', 'code'] as const)('fits the %s field, its check and its primary action above the keyboard', (step) => {
    __setWindowDimensions({ width: SE.width, height: SE.height, scale: 2, fontScale: 1 })
    mocks.check = 'challenge'
    const tree = render(step)
    const group = settle(tree).get('login-field-action')!
    expect(group.bottom - group.top).toBeLessThanOrEqual(SE.keyboardTop - SE.statusBar - 2 * REVEAL_MARGIN)
    const groupHost = hostWith(tree, 'login-field-action')!
    const t = mocks.flow.t as (key: string) => string
    expect(groupHost.findAll((node) => node.type === 'TextInput')).toHaveLength(1)
    const primaryLabel = t(step === 'email' ? 'auth.sendCode' : 'auth.verify')
    expect(groupHost.findAll((node) => node.type === 'Pressable' && textOf(node) === primaryLabel)).toHaveLength(1)
    act(() => tree.unmount())
  })
})
