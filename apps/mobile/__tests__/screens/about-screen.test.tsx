import React from 'react'
import { StyleSheet } from 'react-native'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AboutScreen from '@/app/about'
import { ShellScrollerClearanceContext } from '@/components/shell/shell-scroller-clearance'
import en from '@orbit/shared/i18n/en.json'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted((): {
  nativeVersion: string | null
  configVersion: string | undefined
  email: string
  isAuthenticated: boolean
  push: ReturnType<typeof vi.fn>
  useProfile: ReturnType<typeof vi.fn>
} => ({
  nativeVersion: '1.0.0',
  configVersion: '1.0.0',
  email: 'profile-account-with-a-long-address@example.com',
  isAuthenticated: true,
  push: vi.fn(),
  useProfile: vi.fn(() => ({ profile: { email: 'profile-account-with-a-long-address@example.com' } })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('.').reduce<unknown>(
    (value, part) => (value as Record<string, unknown>)[part],
    en,
  ) as string }),
}))

vi.mock('expo-application', () => ({ get nativeApplicationVersion() { return mocks.nativeVersion } }))
vi.mock('expo-constants', () => ({ default: { get expoConfig() { return { version: mocks.configVersion } } } }))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => boolean) =>
    selector({ isAuthenticated: mocks.isAuthenticated }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: mocks.useProfile,
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: React.PropsWithChildren<{ edges?: readonly string[] }>) =>
    React.createElement('SafeAreaView', props, props.children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? React.createElement('View', { testID: 'guide-sheet' }, React.createElement('Text', null, title), children) : null,
}))

function flattenedStyle(node: TestNode) {
  return StyleSheet.flatten(node.props.style) as Record<string, unknown>
}

function textContent(node: TestNode): string {
  return node.findAll((child) => typeof child.props.children === 'string')
    .map((child) => child.props.children)
    .join(' ')
}

describe('AboutScreen', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.useProfile.mockClear()
    mocks.isAuthenticated = true
    mocks.nativeVersion = '1.0.0'
    mocks.configVersion = '1.0.0'
  })

  it('shows the installed APK version the API header sends, not the bundled config version', () => {
    mocks.nativeVersion = '1.3.39'
    mocks.configVersion = '1.1.4'
    let tree!: { root: TestNode }
    TestRenderer.act(() => { tree = TestRenderer.create(<AboutScreen />) })
    expect(textContent(tree.root)).toContain('1.3.39')
    expect(textContent(tree.root)).not.toContain('1.1.4')
  })

  it('renders no version row when no version resolves', () => {
    mocks.nativeVersion = null
    mocks.configVersion = undefined
    let tree!: { root: TestNode }
    TestRenderer.act(() => { tree = TestRenderer.create(<AboutScreen />) })
    expect(textContent(tree.root)).toContain('Orbit')
    expect(tree.root.findAll((node) => node.props.testID === 'about-fact-version')).toHaveLength(0)
  })

  it.each([412, 768])('renders the drawn identity size at %ipx', (width) => {
    __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
    let tree!: { root: TestNode; unmount: () => void }
    TestRenderer.act(() => { tree = TestRenderer.create(<AboutScreen />) })
    const name = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'Orbit')[0]!
    expect(flattenedStyle(name).fontSize).toBe(width >= 768 ? 34 : 28)
    TestRenderer.act(() => tree.unmount())
  })

  it('renders the About identity, real facts, and four destinations in order', () => {
    let tree!: { root: TestNode }
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AboutScreen />)
    })

    expect(
      tree.root.findAll(
        (node) => node.type === 'Svg' && node.props.testID === 'orbit-mark-accent',
      ),
    ).toHaveLength(1)
    expect(textContent(tree.root)).toContain('Orbit')
    expect(textContent(tree.root)).toContain(en.about.tagline)
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'header')
      .map(textContent)).toContain('About')
    expect(textContent(tree.root)).toContain('1.0.0')
    expect(textContent(tree.root)).toContain(mocks.email)
    expect(tree.root.findAll((node) => node.props.testID === 'about-credit')).toHaveLength(0)

    const destinations = tree.root.findAll(
      (node) =>
        node.type === 'Pressable' &&
        node.props.accessibilityRole === 'button' &&
        typeof node.props.accessibilityLabel === 'string',
    )
    expect(destinations.map((node) => node.props.accessibilityLabel)).toEqual([
      en.common.backToProfile,
      'Orbit guide',
      'Contact support',
      'Terms of use',
      'Privacy policy',
    ])

    TestRenderer.act(() => {
      const onPress = destinations[1]!.props.onPress as () => void
      onPress()
    })
    expect(textContent(tree.root.findAll((node) => node.props.testID === 'guide-sheet')[0]!))
      .toContain('Orbit guide')

    TestRenderer.act(() => {
      destinations.slice(2).forEach((destination) => {
        const onPress = destination.props.onPress as () => void
        onPress()
      })
    })
    expect(mocks.push.mock.calls).toEqual([['/support'], ['/terms'], ['/privacy']])
  })

  it('keeps every 412px column shrinkable and lets fact values wrap', () => {
    let tree!: { root: TestNode }
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AboutScreen />)
    })

    for (const testID of ['about-content', 'about-identity', 'about-destinations', 'about-facts']) {
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === testID)[0]!)).toMatchObject({
        minWidth: 0,
      })
    }

    for (const fact of ['version', 'account']) {
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === `about-fact-${fact}`)[0]!)).toMatchObject({
        flexDirection: 'row',
        flexWrap: 'wrap',
        minWidth: 0,
      })
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === `about-fact-${fact}-label`)[0]!)).toMatchObject({
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
      })
      expect(flattenedStyle(tree.root.findAll((node) => node.props.testID === `about-fact-${fact}-value`)[0]!)).toMatchObject({
        flexShrink: 1,
        minWidth: 0,
        maxWidth: '100%',
      })
    }
  })

  it('hides the account fact and skips the profile hook while signed out', () => {
    mocks.isAuthenticated = false

    let tree!: { root: TestNode }
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AboutScreen />)
    })

    expect(
      tree.root.findAll((node) => node.props.testID === 'about-fact-account'),
    ).toHaveLength(0)
    expect(mocks.useProfile).not.toHaveBeenCalled()
  })
  it.each([
    [0, 24, ['top', 'bottom']],
    [96, 96, ['top']],
  ] as const)('ends clear of the system bar or the pinned chrome at shell clearance %i', (clearance, paddingBottom, edges) => {
    let tree!: { root: TestNode }
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <ShellScrollerClearanceContext.Provider value={clearance}>
          <AboutScreen />
        </ShellScrollerClearanceContext.Provider>,
      )
    })

    expect(tree.root.findAll((node) => node.type === 'SafeAreaView')[0]!.props.edges).toEqual(edges)
    const scroll = tree.root.findAll((node) => node.props.contentContainerStyle !== undefined)[0]!
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ paddingBottom })
  })
})
