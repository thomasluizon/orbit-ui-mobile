import type { Context, ReactElement } from 'react'
import { AccessibilityInfo, AppState, View } from 'react-native'
import { ORBIT_MASCOT_FACES, ORBIT_MASCOT_VIEW_BOX, ORBIT_SMALL_FACES, orbitMascotFrame, orbitOutlineCutout } from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { NativeDialog } from '@/components/ui/native-dialog'
import { OverlayHost } from '@/components/ui/overlay-host'
import { orbitScreenLayout } from '@/components/navigation/orbit-screen-layout'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setMeasureInWindowImpl } from '@/test-mocks/react-native'
import { getPrefersReducedMotion, usePrefersReducedMotion } from '@/lib/motion'

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
const reduceMotionListeners = new Set<(enabled: boolean) => void>()

/** Holds one reduced motion listener for the whole test, so a change reaches the shared preference even before a mascot mounts. */
function ReducedMotionProbe() {
  usePrefersReducedMotion()
  return null
}
let probe: TestTree | undefined

/** Changes the system reduced motion setting the way Android reports it: one `reduceMotionChanged` event. */
function setReducedMotion(enabled: boolean) {
  TestRenderer.act(() => { for (const listener of [...reduceMotionListeners]) listener(enabled) })
}

/** The vertical scale of the eyes: 1 is open, and the blink closes them toward 0.1. */
function eyeScaleOf(tree: TestTree) {
  const eye = tree.root.findAll((node) => typeof node.type === 'string' && typeof node.props.transform === 'string' && String(node.props.transform).startsWith('matrix('))[0]
  return Number(/^matrix\(1 0 0 ([\d.]+) /.exec(String(eye?.props.transform))?.[1])
}

const mounted: TestTree[] = []

/** Mounts a tree and remembers it, so a failed test cannot leave a live claim that steals the slot from the next test. */
function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  mounted.push(tree!)
  return tree!
}

function mascots(tree: TestTree) {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')
}

function loops(tree: TestTree) {
  return mascots(tree).map((node) => node.props['data-orbit-loop'])
}

/** Each mascot's loop state, keyed by its face. */
function loopsByState(tree: TestTree) {
  return Object.fromEntries(mascots(tree).map((node) => [node.props['data-orbit-state'], node.props['data-orbit-loop']]))
}

function moonOf(tree: TestTree) {
  const moon = tree.root.findAll((node) => typeof node.type === 'string' && node.props.fill === moonFill && node.props.cx !== undefined)[0]
  return `${String(moon?.props.cx)},${String(moon?.props.cy)}`
}

function advance(milliseconds: number) {
  TestRenderer.act(() => { vi.advanceTimersByTime(milliseconds) })
}

beforeAll(async () => {
  await getPrefersReducedMotion()
})

beforeEach(() => {
  appStateListeners.length = 0
  reduceMotionListeners.clear()
  AppState.currentState = 'active'
  vi.useFakeTimers()
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.push(listener as (status: string) => void)
    return { remove: () => {} }
  })
  const listen = (event: string, listener: unknown) => {
    const reduce = listener as (enabled: boolean) => void
    if (event === 'reduceMotionChanged') reduceMotionListeners.add(reduce)
    return { remove: () => { reduceMotionListeners.delete(reduce) } }
  }
  vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(listen as unknown as typeof AccessibilityInfo.addEventListener)
  probe = render(<ReducedMotionProbe />)
})

afterEach(() => {
  setReducedMotion(false)
  TestRenderer.act(() => { for (const tree of mounted.splice(0)) tree.unmount() })
  __resetTestHostConfig()
  setOrbitMotionEnabled(undefined)
  AppState.currentState = 'active'
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Orbit idle loop on Android', () => {
  it('draws at most one frame in 33ms and moves the moon', () => {
    const tree = render(<OrbitMascot size={96} />)
    expect(loops(tree)).toEqual(['running'])
    const rest = moonOf(tree)
    advance(48)
    const drawn = moonOf(tree)
    expect(drawn).not.toBe(rest)
    advance(16)
    expect(moonOf(tree)).toBe(drawn)
    advance(32)
    expect(moonOf(tree)).not.toBe(drawn)
    tree.unmount()
  })

  it.each([
    ['Orbit em movimento turns off', () => setOrbitMotionEnabled(false)],
    ['the app goes to the background', () => { for (const listener of appStateListeners) listener('background') }],
  ])('opens its eyes when %s in the middle of a blink', (_cause, pause) => {
    const tree = render(<OrbitMascot size={96} />)
    for (let step = 0; step < 100 && eyeScaleOf(tree) >= 0.5; step += 1) advance(48)
    expect(eyeScaleOf(tree)).toBeLessThan(0.5)
    TestRenderer.act(() => { pause() })
    expect(loops(tree)).toEqual(['still'])
    expect(eyeScaleOf(tree)).toBe(1)
    tree.unmount()
  })

  it('stops the loop at once when the person turns on reduced motion while the app runs, and resumes when it turns off', () => {
    const tree = render(<OrbitMascot size={96} />)
    expect(loops(tree)).toEqual(['running'])
    setReducedMotion(true)
    expect(loops(tree)).toEqual(['still'])
    setReducedMotion(false)
    expect(loops(tree)).toEqual(['running'])
    tree.unmount()
  })

  it('reads the foreground again when its app state listener starts, so a missed resume does not keep it still', () => {
    setReducedMotion(true)
    AppState.currentState = 'background'
    const tree = render(<OrbitMascot size={96} />)
    AppState.currentState = 'active'
    setReducedMotion(false)
    expect(loops(tree)).toEqual(['running'])
    tree.unmount()
  })

  it('stays still and swaps the face at once under reduced motion', () => {
    setReducedMotion(true)
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

  it('runs the Orbit inside an open native dialog and pauses the page Orbit under it', () => {
    const page = (open: boolean) => (
      <OverlayHost>
        <OrbitMascot size={96} />
        <NativeDialog open={open} title="Welcome" onOpenChange={() => {}}><OrbitMascot size={96} state="feliz" /></NativeDialog>
      </OverlayHost>
    )
    const tree = render(page(true))
    const byState = () => Object.fromEntries(mascots(tree).map((node) => [node.props['data-orbit-state'], node.props['data-orbit-loop']]))
    expect(byState()).toEqual({ parado: 'still', feliz: 'running' })
    TestRenderer.act(() => tree.update(page(false)))
    advance(1000)
    expect(byState()).toEqual({ parado: 'running' })
    tree.unmount()
  })

  it('runs only the Orbit in the overlay opened last when two overlays sit side by side', () => {
    const view = (second: boolean) => <View>
      <OrbitMascot size={96} />
      <OrbitOverlayLayer><OrbitMascot size={48} state="feliz" /></OrbitOverlayLayer>
      {second ? <OrbitOverlayLayer><OrbitMascot size={48} state="pensando" /></OrbitOverlayLayer> : null}
    </View>
    const tree = render(view(false))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'running' })
    TestRenderer.act(() => tree.update(view(true)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'still', pensando: 'running' })
    TestRenderer.act(() => tree.update(view(false)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'running' })
    tree.unmount()
  })

  it('keeps the top overlay Orbit running when an overlay under it closes out of order', () => {
    const view = (nested: boolean, sibling: boolean) => <View>
      <OrbitMascot size={96} />
      <OrbitOverlayLayer>
        <OrbitMascot size={48} state="feliz" />
        {nested ? <OrbitOverlayLayer><OrbitMascot size={48} state="descansando" /></OrbitOverlayLayer> : null}
      </OrbitOverlayLayer>
      {sibling ? <OrbitOverlayLayer><OrbitMascot size={48} state="pensando" /></OrbitOverlayLayer> : null}
    </View>
    const tree = render(view(false, false))
    TestRenderer.act(() => tree.update(view(true, false)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'still', descansando: 'running' })
    TestRenderer.act(() => tree.update(view(true, true)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'still', descansando: 'still', pensando: 'running' })
    TestRenderer.act(() => tree.update(view(false, true)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'still', pensando: 'running' })
    TestRenderer.act(() => tree.update(view(false, false)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'running' })
    tree.unmount()
  })

  it('runs the Orbit in the inner overlay when an overlay and an overlay inside it open together', () => {
    const view = (open: boolean) => <View>
      <OrbitMascot size={96} />
      <OrbitOverlayLayer active={open}>
        <OrbitMascot size={48} state="feliz" />
        <OrbitOverlayLayer active={open}><OrbitMascot size={48} state="pensando" /></OrbitOverlayLayer>
      </OrbitOverlayLayer>
    </View>
    const tree = render(view(false))
    TestRenderer.act(() => tree.update(view(true)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'still', pensando: 'running' })
    tree.unmount()
    const opened = render(view(true))
    expect(loopsByState(opened)).toEqual({ parado: 'still', feliz: 'still', pensando: 'running' })
    opened.unmount()
  })

  it('runs the Orbit in the native dialog opened last when two dialogs sit side by side', () => {
    const page = (second: boolean) => (
      <OverlayHost>
        <OrbitMascot size={96} />
        <NativeDialog open title="First" onOpenChange={() => {}}><OrbitMascot size={96} state="feliz" /></NativeDialog>
        <NativeDialog open={second} title="Second" onOpenChange={() => {}}><OrbitMascot size={96} state="pensando" /></NativeDialog>
      </OverlayHost>
    )
    const tree = render(page(false))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'running' })
    TestRenderer.act(() => tree.update(page(true)))
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'still', pensando: 'running' })
    TestRenderer.act(() => tree.update(page(false)))
    advance(1000)
    expect(loopsByState(tree)).toEqual({ parado: 'still', feliz: 'running' })
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
    advance(250)
    expect(loops(tree)).toEqual(['still', 'running'])
    offScreen.add('feliz')
    advance(250)
    expect(loops(tree)).toEqual(['still', 'still'])
    offScreen.delete('parado')
    advance(250)
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
    advance(250)
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

describe('Orbit on-screen probe on Android', () => {
  function countMeasures() {
    const counter = { measured: 0 }
    __setMeasureInWindowImpl((callback) => { counter.measured += 1; callback(0, 100, 96, 69) })
    return counter
  }

  it.each([
    ['Orbit em movimento is off', () => setOrbitMotionEnabled(false)],
    ['reduced motion is on', () => setReducedMotion(true)],
    ['the app is in the background', () => {}],
  ] as const)('never measures its window position while %s', (name, arrange) => {
    const counter = countMeasures()
    arrange()
    const tree = render(<OrbitMascot size={96} />)
    if (name === 'the app is in the background') TestRenderer.act(() => { for (const listener of appStateListeners) listener('background') })
    const before = counter.measured
    advance(1000)
    expect(counter.measured - before).toBe(0)
    tree.unmount()
  })

  it('stops measuring when the switch turns off and starts again when it turns on', () => {
    const counter = countMeasures()
    const tree = render(<OrbitMascot size={96} />)
    advance(1000)
    expect(counter.measured).toBeGreaterThan(0)
    TestRenderer.act(() => setOrbitMotionEnabled(false))
    const before = counter.measured
    advance(1000)
    expect(counter.measured).toBe(before)
    TestRenderer.act(() => setOrbitMotionEnabled(true))
    advance(1000)
    expect(counter.measured).toBeGreaterThan(before)
    tree.unmount()
  })

  it('measures at most four times a second while it can animate, not once per drawn frame', () => {
    const counter = countMeasures()
    const tree = render(<OrbitMascot size={96} />)
    advance(1000)
    expect(counter.measured).toBeGreaterThan(0)
    expect(counter.measured).toBeLessThanOrEqual(5)
    expect(loops(tree)).toEqual(['running'])
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
