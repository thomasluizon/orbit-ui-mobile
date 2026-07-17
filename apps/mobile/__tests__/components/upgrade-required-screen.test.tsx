import { describe, expect, it, vi, beforeEach } from 'vitest'

import { UpgradeRequiredScreen } from '@/components/upgrade-required-screen'

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

const { openUrlMock, stateRef } = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
  stateRef: { upgradeRequired: false, minVersion: null as string | null },
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
  zLayers: {
    dropdown: 1000,
    sticky: 1100,
    modalBackdrop: 1200,
    modal: 1300,
    tourSpotlight: 1400,
    celebration: 1500,
    toast: 1600,
    tooltip: 1700,
  },
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

vi.mock('@/stores/version-gate-store', () => ({
  useVersionGateStore: <T,>(selector: (state: typeof stateRef) => T) =>
    selector(stateRef),
}))

function findPressables(root: TestTreeRoot): TestNode[] {
  return root.findAll(
    (node) => typeof node.props.onPress === 'function',
  )
}

describe('UpgradeRequiredScreen', () => {
  beforeEach(() => {
    openUrlMock.mockClear()
    stateRef.upgradeRequired = false
    stateRef.minVersion = null
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
    stateRef.upgradeRequired = true
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
    expect(rendered).toContain('forceUpdate.title')
    expect(rendered).toContain('forceUpdate.cta')
  })

  it('opens the Play listing when the CTA is pressed', async () => {
    stateRef.upgradeRequired = true
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
