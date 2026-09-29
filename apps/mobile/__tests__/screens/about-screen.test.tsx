import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AboutScreen from '@/app/about'
import en from '@orbit/shared/i18n/en.json'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  nativeVersion: null as string | null,
  configVersion: undefined as string | undefined,
  push: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const message = key.split('.').reduce<unknown>(
        (value, part) => (value as Record<string, unknown>)[part],
        en,
      ) as string
      return message.replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? '')
    },
  }),
}))

vi.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mocks.nativeVersion
  },
}))

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { version: mocks.configVersion }
    },
  },
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({
  FeatureGuideDrawer: ({ open }: { open: boolean }) =>
    open ? React.createElement('View', { testID: 'feature-guide' }) : null,
}))

function renderScreen() {
  let tree!: { root: TestNode }
  TestRenderer.act(() => {
    tree = TestRenderer.create(<AboutScreen />)
  })
  return tree
}

function textContent(node: TestNode): string {
  return node.findAll((child) => typeof child.props.children === 'string')
    .map((child) => child.props.children)
    .join(' ')
}

describe('AboutScreen', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.nativeVersion = null
    mocks.configVersion = undefined
  })

  it('shows the installed APK version the API header sends, not the bundled config version', () => {
    mocks.nativeVersion = '1.3.39'
    mocks.configVersion = '1.1.4'

    const tree = renderScreen()

    expect(textContent(tree.root)).toContain('Version 1.3.39')
    expect(textContent(tree.root)).not.toContain('1.1.4')
  })

  it('renders no version row when no version resolves', () => {
    const tree = renderScreen()

    expect(textContent(tree.root)).toContain('Orbit')
    expect(textContent(tree.root)).not.toContain('Version')
  })

  it('opens the feature guide and routes the other destinations', () => {
    const tree = renderScreen()
    const destinations = tree.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
    )
    expect(destinations.map((node) => node.props.accessibilityLabel)).toEqual([
      en.onboarding.featureGuide.openButton,
      en.profile.support.title,
      en.terms.title,
      en.privacy.title,
    ])

    TestRenderer.act(() => {
      destinations.forEach((destination) => {
        const onPress = destination.props.onPress as () => void
        onPress()
      })
    })

    expect(tree.root.findAll((node) => node.props.testID === 'feature-guide')).toHaveLength(1)
    expect(mocks.push.mock.calls).toEqual([['/support'], ['/terms'], ['/privacy']])
  })
})
