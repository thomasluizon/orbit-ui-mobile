import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { UpgradeRequiredScreen } from '@/components/upgrade-required-screen'
import Constants from 'expo-constants'
import { useUIStore } from '@/stores/ui-store'
import { OverlayHost } from '@/components/ui/overlay-host'

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
  unmount(): void
}

interface TestRendererApi {
  create(element: React.ReactNode): TestInstance
  act(callback: () => Promise<void> | void): Promise<void>
}


const TestRenderer: TestRendererApi = require('react-test-renderer')
const mountedTrees: TestInstance[] = []

function renderBlocker() {
  const tree = TestRenderer.create(<OverlayHost><UpgradeRequiredScreen /></OverlayHost>)
  mountedTrees.push(tree)
  return tree
}

const { openUrlMock, stateRef } = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
  stateRef: { upgradeRequired: false, minVersion: null as string | null },
}))

vi.mock('react-native', async () => ({
  ...await import('../../test-mocks/react-native'),
  Linking: { openURL: openUrlMock },
}))
vi.mock('@/lib/app-version', () => ({ getAppVersion: () => '1.0.0' }))

vi.mock('expo-constants', () => ({
  default: { expoConfig: require('../../app.config.js')() },
}))

vi.mock('@/lib/i18n', () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock('@/lib/theme', () => ({
  radius: { full: 9999 },
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

vi.mock('@/components/ui/orbit-mark', () => {

  const React = require('react')
  return {
    OrbitMark: (props: Record<string, unknown>) =>
      React.createElement('OrbitMark', props),
  }
})

vi.mock('@/stores/version-gate-store', () => ({
  useVersionGateStore: <T,>(selector: (state: typeof stateRef) => T) =>
    selector(stateRef),
}))

function findPressables(root: TestTreeRoot): TestNode[] {
  return root.findAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
  )
}

describe('UpgradeRequiredScreen', () => {
  beforeEach(() => {
    openUrlMock.mockReset().mockResolvedValue(undefined)
    vi.stubEnv('ORBIT_APP_VARIANT', 'production')
    Constants.expoConfig = require('../../app.config.js')()
    stateRef.upgradeRequired = false
    stateRef.minVersion = null
    useUIStore.setState({ openOverlayIds: [] })
  })

  afterEach(async () => {
    await TestRenderer.act(() => { for (const tree of mountedTrees.splice(0)) tree.unmount() })
    vi.unstubAllEnvs()
  })

  it('renders nothing when no upgrade is required', async () => {
    let tree: TestInstance | null = null
    await TestRenderer.act(() => {
      tree = renderBlocker()
    })
    expect(tree!.root.findAll(() => true).length).toBeGreaterThanOrEqual(0)
    expect(findPressables(tree!.root)).toHaveLength(0)
  })

  it('renders the blocker title and CTA when an upgrade is required', async () => {
    stateRef.upgradeRequired = true
    let tree: TestInstance | null = null
    await TestRenderer.act(() => {
      tree = renderBlocker()
    })

    const texts = tree!.root.findAll(
      (node) =>
        node.type === 'Text' &&
        typeof node.props.children === 'string',
    )
    const rendered = texts.map((node) => node.props.children as string)
    expect(rendered).toContain('forceUpdate.title')
    expect(rendered).toContain('forceUpdate.cta')
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1)
    const windows = tree!.root.findAll((node) => node.type === 'Modal' && node.props.visible === true)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.props).toMatchObject({ transparent: true, statusBarTranslucent: true, navigationBarTranslucent: true })
    expect(tree!.root.findAll((node) => node.type === 'View' && node.props.role === 'dialog' && node.props.accessibilityLabel === 'forceUpdate.title')).toHaveLength(1)
    await TestRenderer.act(() => (windows[0]!.props.onRequestClose as () => void)())
    expect(stateRef.upgradeRequired).toBe(true)
    expect(windows[0]!.props.visible).toBe(true)
  })

  it('opens the Play listing when the CTA is pressed', async () => {
    stateRef.upgradeRequired = true
    let tree: TestInstance | null = null
    await TestRenderer.act(() => {
      tree = renderBlocker()
    })

    const [pressable] = findPressables(tree!.root)
    expect(pressable).toBeDefined()
    await TestRenderer.act(() => {
      pressable!.props.onPress?.()
    })

    expect(openUrlMock).toHaveBeenCalledWith('market://details?id=org.useorbit.app')
  })
  it.each([false, true])('opens only the staging listing with web fallback %s', async (webFallback) => {
    vi.stubEnv('ORBIT_APP_VARIANT', 'staging')
    Constants.expoConfig = require('../../app.config.js')()
    stateRef.upgradeRequired = true
    if (webFallback) openUrlMock.mockRejectedValueOnce(new Error('No market handler'))
    let tree: TestInstance | null = null
    await TestRenderer.act(() => { tree = renderBlocker() })
    const [pressable] = findPressables(tree!.root)
    await TestRenderer.act(() => { pressable!.props.onPress?.() })
    expect(openUrlMock).toHaveBeenCalledWith('market://details?id=org.useorbit.app.staging')
    if (webFallback) expect(openUrlMock).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=org.useorbit.app.staging')
    expect(openUrlMock).not.toHaveBeenCalledWith('market://details?id=org.useorbit.app')
    expect(openUrlMock).not.toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=org.useorbit.app')
  })

  it('opens the production listing when the runtime manifest is unavailable', async () => {
    Constants.expoConfig = null
    stateRef.upgradeRequired = true
    let tree: TestInstance | null = null
    await TestRenderer.act(() => { tree = renderBlocker() })
    const [pressable] = findPressables(tree!.root)
    await TestRenderer.act(() => { pressable!.props.onPress?.() })
    expect(openUrlMock).toHaveBeenCalledWith('market://details?id=org.useorbit.app')
  })

})
