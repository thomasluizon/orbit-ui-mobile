import { describe, expect, it, vi, beforeEach } from 'vitest'

import { UpgradeRequiredScreen } from '@/components/upgrade-required-screen'
import { useVersionGateStore } from '@/stores/version-gate-store'

interface TestNode {
  type: unknown
  props: {
    children?: unknown
    onPress?: (...args: unknown[]) => unknown
    [key: string]: unknown
  }
}

interface TestTreeRoot extends TestNode {
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestInstance {
  root: TestTreeRoot
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}


const TestRenderer: TestRendererApi = require('react-test-renderer')

const { openUrlMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
}))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Linking: { openURL: openUrlMock },
  Pressable: 'Pressable',
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    absoluteFill: {},
  },
  Text: 'Text',
  View: 'View',
}))

vi.mock('expo-constants', () => ({
  default: { expoConfig: { android: { package: 'org.useorbit.app' } } },
}))

vi.mock('@/lib/i18n', () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock('@/lib/theme', () => ({
  radius: { full: 9999 },
  primaryGlow: () => ({}),
  createTokensV2: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (prop === 'fgOnPrimary' ? '#ffffff' : '#111111'),
      },
    ),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/components/ui/satellite-glyph', () => {

  const React = require('react')
  return {
    SatelliteGlyph: (props: Record<string, unknown>) =>
      React.createElement('SatelliteGlyph', props),
  }
})

function findPressables(root: TestTreeRoot): TestNode[] {
  return root.findAll(
    (node) => node.type === 'Pressable' && typeof node.props.onPress === 'function',
  )
}

describe('UpgradeRequiredScreen', () => {
  beforeEach(() => {
    openUrlMock.mockClear()
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
  })

  it('renders nothing when no upgrade is required', async () => {
    let tree: TestInstance | null = null
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<UpgradeRequiredScreen />)
    })
    expect(tree!.root.findAll(() => true).length).toBeGreaterThanOrEqual(0)
    expect(findPressables(tree!.root)).toHaveLength(0)
  })

  it('renders the blocker title and CTA when an upgrade is required', async () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    let tree: TestInstance | null = null
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<UpgradeRequiredScreen />)
    })

    const texts = tree!.root.findAll(
      (node) =>
        node.type === 'Text' &&
        typeof node.props.children === 'string',
    )
    const rendered = texts.map((node) => node.props.children as string)
    expect(rendered.filter((text) => text === 'forceUpdate.title')).toHaveLength(1)
    expect(rendered.filter((text) => text === 'forceUpdate.description')).toHaveLength(1)
    expect(rendered.filter((text) => text === 'forceUpdate.cta')).toHaveLength(1)
    await TestRenderer.act(() => {
      useVersionGateStore.getState().markUpgradeRequired('1.6.0')
    })
    expect(tree!.root.findAll((node) => node.type === 'Text'
      && node.props.children === 'forceUpdate.title')).toHaveLength(1)
    expect(findPressables(tree!.root)).toHaveLength(1)
  })

  it('opens the Play listing when the CTA is pressed', async () => {
    useVersionGateStore.getState().markUpgradeRequired('1.5.0')
    let tree: TestInstance | null = null
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<UpgradeRequiredScreen />)
    })

    const [pressable] = findPressables(tree!.root)
    expect(pressable).toBeDefined()
    await TestRenderer.act(() => {
      pressable!.props.onPress?.()
    })

    expect(openUrlMock).toHaveBeenCalledWith('market://details?id=org.useorbit.app')
  })
})
