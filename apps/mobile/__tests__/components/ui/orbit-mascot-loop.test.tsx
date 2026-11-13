import type { Context, ReactElement } from 'react'
import { AppState, View } from 'react-native'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { orbitScreenLayout } from '@/components/ui/orbit-screen-focus'
import { createTokensV2 } from '@/lib/theme'
import { reanimatedTestState } from '@/test-mocks/react-native-reanimated'

/** The route focus a navigator gives each screen; `useIsFocused` reads it as the real hook reads its route. */
const route = vi.hoisted(() => ({ Focus: require('react').createContext(true) as Context<boolean> }))
vi.mock('expo-router', () => ({ useIsFocused: () => require('react').useContext(route.Focus) }))

const TestRenderer = require('react-test-renderer')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestTree {
  readonly root: TestNode
  update(element: ReactElement): void
  unmount(): void
}

const moonFill = createTokensV2('purple', 'dark').primary
const appStateListeners: ((status: string) => void)[] = []

function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

function mascots(tree: TestTree) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')
}

function loops(tree: TestTree) {
  return mascots(tree).map((node) => node.props['data-orbit-loop'])
}

function moonOf(tree: TestTree) {
  const moon = tree.root.findAll((node) => typeof node.type === 'string' && node.props.fill === moonFill && node.props.cx !== undefined)[0]
  return `${String(moon?.props.cx)},${String(moon?.props.cy)}`
}

function advance(milliseconds: number) {
  TestRenderer.act(() => { vi.advanceTimersByTime(milliseconds) })
}

beforeEach(() => {
  appStateListeners.length = 0
  reanimatedTestState.reducedMotion = false
  vi.useFakeTimers()
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.push(listener as (status: string) => void)
    return { remove: () => {} }
  })
})

afterEach(() => {
  setOrbitMotionEnabled(undefined)
  reanimatedTestState.reducedMotion = false
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Orbit idle loop on Android', () => {
  it('draws at most one frame in 33ms and moves the moon', () => {
    const tree = render(<OrbitMascot size={96} />)
    expect(loops(tree)).toEqual(['running'])
    const rest = moonOf(tree)
    advance(10)
    expect(moonOf(tree)).toBe(rest)
    advance(400)
    expect(moonOf(tree)).not.toBe(rest)
    tree.unmount()
  })

  it('stays still and swaps the face at once under reduced motion', () => {
    reanimatedTestState.reducedMotion = true
    const tree = render(<OrbitMascot size={96} />)
    const rest = moonOf(tree)
    advance(400)
    expect(loops(tree)).toEqual(['still'])
    expect(moonOf(tree)).toBe(rest)
    TestRenderer.act(() => tree.update(<OrbitMascot size={96} state="descansando" />))
    expect(mascots(tree)[0]?.props['data-orbit-state']).toBe('descansando')
    tree.unmount()
  })

  it('pauses while the app is in the background and resumes in the foreground', () => {
    const tree = render(<OrbitMascot size={96} />)
    TestRenderer.act(() => { for (const listener of appStateListeners) listener('background') })
    expect(loops(tree)).toEqual(['still'])
    TestRenderer.act(() => { for (const listener of appStateListeners) listener('active') })
    expect(loops(tree)).toEqual(['running'])
    tree.unmount()
  })

  it('pauses under an open overlay, runs inside it, and resumes when it closes', () => {
    const tree = render(<View><OrbitMascot size={96} /><OrbitOverlayLayer active={false}><OrbitMascot size={48} /></OrbitOverlayLayer></View>)
    expect(loops(tree)).toEqual(['running', 'still'])
    TestRenderer.act(() => tree.update(<View><OrbitMascot size={96} /><OrbitOverlayLayer active><OrbitMascot size={48} /></OrbitOverlayLayer></View>))
    expect(loops(tree)).toEqual(['still', 'running'])
    TestRenderer.act(() => tree.update(<View><OrbitMascot size={96} /><OrbitOverlayLayer active={false}>{null}</OrbitOverlayLayer></View>))
    expect(loops(tree)).toEqual(['running'])
    tree.unmount()
  })

  it('pauses on a screen that is not focused, gives the live slot to the focused screen, and resumes on focus', () => {
    const screen = (focused: boolean) => <route.Focus value={focused}>{orbitScreenLayout({ children: <OrbitMascot size={96} /> })}</route.Focus>
    const screens = (firstFocused: boolean) => <View>{screen(firstFocused)}{screen(!firstFocused)}</View>
    const tree = render(screens(false))
    expect(loops(tree)).toEqual(['still', 'running'])
    TestRenderer.act(() => tree.update(screens(true)))
    expect(loops(tree)).toEqual(['running', 'still'])
    tree.unmount()
  })

  it('runs outside a navigator, where no screen focus exists', () => {
    const tree = render(<OrbitMascot size={96} />)
    expect(loops(tree)).toEqual(['running'])
    tree.unmount()
  })

  it('runs one live Orbit per view and keeps a still Orbit inside a control', () => {
    const tree = render(<View><OrbitMascot size={96} /><OrbitMascot size={48} /><OrbitMascot size={48} still /></View>)
    expect(loops(tree)).toEqual(['running', 'still', 'still'])
    tree.unmount()
  })

  it('lets the conversation entry lead the view when it returns after another Orbit', () => {
    const tree = render(<View><OrbitMascot size={96} />{null}</View>)
    TestRenderer.act(() => tree.update(<View><OrbitMascot size={96} /><OrbitMascot size={48} lead /></View>))
    expect(loops(tree)).toEqual(['still', 'running'])
    tree.unmount()
  })

  it('stops every loop when Orbit em movimento is off', () => {
    const tree = render(<OrbitMascot size={96} />)
    TestRenderer.act(() => setOrbitMotionEnabled(false))
    expect(loops(tree)).toEqual(['still'])
    tree.unmount()
  })

  it('cancels its frame when it unmounts', () => {
    const tree = render(<OrbitMascot size={96} />)
    advance(100)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    TestRenderer.act(() => tree.unmount())
    expect(vi.getTimerCount()).toBe(0)
  })
})
