import type { Context, ReactElement } from 'react'
import { AppState, View } from 'react-native'
import { ORBIT_MASCOT_FACES, ORBIT_MASCOT_VIEW_BOX, ORBIT_SMALL_FACES, orbitMascotFrame, orbitOutlineCutout } from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { orbitScreenLayout } from '@/components/navigation/orbit-screen-layout'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setMeasureInWindowImpl } from '@/test-mocks/react-native'
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
  __resetTestHostConfig()
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

  it('pauses off screen, gives the live slot to the next Orbit in view, and resumes on screen', () => {
    const offScreen = new Set(['parado'])
    __setMeasureInWindowImpl((callback, props) => callback(0, offScreen.has(String(props['data-orbit-state'])) ? 2000 : 100, 96, 69))
    const tree = render(<View><OrbitMascot size={96} /><OrbitMascot size={96} state="feliz" /></View>)
    advance(100)
    expect(loops(tree)).toEqual(['still', 'running'])
    offScreen.add('feliz')
    advance(100)
    expect(loops(tree)).toEqual(['still', 'still'])
    offScreen.delete('parado')
    advance(100)
    expect(loops(tree)).toEqual(['running', 'still'])
    tree.unmount()
  })

  it('holds the pose while off screen and stops measuring in the background', () => {
    let measured = 0
    let onScreen = true
    __setMeasureInWindowImpl((callback) => { measured += 1; callback(0, onScreen ? 100 : -500, 96, 69) })
    const tree = render(<OrbitMascot size={96} />)
    advance(400)
    onScreen = false
    advance(100)
    const held = moonOf(tree)
    advance(400)
    expect(loops(tree)).toEqual(['still'])
    expect(moonOf(tree)).toBe(held)
    expect(held).not.toBe(moonOf(render(<OrbitMascot size={96} still />)))
    TestRenderer.act(() => { for (const listener of appStateListeners) listener('background') })
    const before = measured
    advance(400)
    expect(measured).toBe(before)
    tree.unmount()
  })
})

describe('Orbit ring outline on Android', () => {
  it('cuts the outline out of the planet, so the surface behind shows through on any fill', () => {
    const tree = render(<View><OrbitMascot size={96} /><OrbitMascot size={16} /></View>)
    const cutouts = tree.root.findAll((node) => node.type === 'ClipPath').map((clip) => clip.findAll((node) => node.type === 'Path')[0]?.props)
    expect(cutouts.map((props) => props?.clipRule)).toEqual(['evenodd', 'evenodd'])
    expect(String(cutouts[0]?.d)).toBe(orbitOutlineCutout(ORBIT_MASCOT_VIEW_BOX, orbitMascotFrame(0, mascotMotion).ringOutline))
    expect(String(cutouts[1]?.d)).toBe(orbitOutlineCutout(ORBIT_SMALL_FACES[16].viewBox, ORBIT_SMALL_FACES[16].ringOutline))
    const clipped = tree.root.findAll((node) => node.type === 'G' && typeof node.props.clipPath === 'string')
    expect(clipped.map((group) => group.props.clipRule)).toEqual(['evenodd', 'evenodd'])
    const eyes = new Set([...ORBIT_MASCOT_FACES.parado.eyes.map((eye) => eye.d), ...ORBIT_SMALL_FACES[16].eyes])
    const canvasPaints = tree.root.findAll((node) => typeof node.type === 'string' && node.props.fill === createTokensV2('purple', 'dark').bg)
    expect(canvasPaints).toHaveLength(4)
    expect(canvasPaints.every((node) => eyes.has(String(node.props.d)))).toBe(true)
    tree.unmount()
  })
})
