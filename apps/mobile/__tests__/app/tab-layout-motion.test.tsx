import React from 'react'
import { Animated } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionPresets } from '@orbit/shared/theme'
import TabLayout from '@/app/(tabs)/_layout'

type ScreenOptions = Record<string, unknown> | ((props: { route: { name: string } }) => Record<string, unknown>)
type SceneStyle = { opacity: { value: number }; transform: [{ translateX: { value: number } }] }
type TimingConfig = { duration: number; easing: { points: readonly number[] }; toValue: number }

const state = vi.hoisted(() => ({
  reducedMotion: false,
  pathname: '/',
  screenOptions: null as null | ScreenOptions,
}))

vi.mock('@/lib/motion', async (original) => ({
  ...await original<typeof import('@/lib/motion')>(),
  usePrefersReducedMotion: () => state.reducedMotion,
  toAnimatedEasing: (points: readonly number[]) => ({ points }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ surfaces: { screen: { backgroundColor: 'black' } } }) }))
vi.mock('@/lib/capture-mode', () => ({ captureBuildEnabled: false }))
vi.mock('expo-router', () => {
  const Navigator = ({ children, screenOptions }: { children: React.ReactNode; screenOptions: ScreenOptions }) => {
    state.screenOptions = screenOptions
    return <>{children}</>
  }
  return { Tabs: Object.assign(Navigator, { Screen: () => null }), usePathname: () => state.pathname }
})

const tabSwitch = motionPresets['tab-switch']

function optionsFor(name: string) {
  const screenOptions = state.screenOptions!
  return typeof screenOptions === 'function' ? screenOptions({ route: { name } }) : screenOptions
}

function sceneFor(name: string): SceneStyle {
  const interpolator = optionsFor(name).sceneStyleInterpolator as (props: { current: { progress: Animated.Value } }) => { sceneStyle: SceneStyle }
  return interpolator({ current: { progress: new Animated.Value(0) } }).sceneStyle
}

function timingFor(value: unknown): TimingConfig[] {
  return (vi.mocked(Animated.timing).mock.calls as unknown as [unknown, TimingConfig][])
    .filter(([target]) => target === value)
    .map(([, config]) => config)
}

async function switchTab(tree: ReactTestRenderer, pathname: string) {
  state.pathname = pathname
  await act(() => tree.update(<TabLayout />))
}

describe('TabLayout tab switch motion', () => {
  let tree: ReactTestRenderer

  beforeEach(() => {
    state.reducedMotion = false
    state.pathname = '/'
    vi.spyOn(Animated, 'timing')
  })

  afterEach(async () => {
    await act(() => tree.update(<></>))
    vi.restoreAllMocks()
  })

  it('keeps the old tab attached for the longer leg and lets the scene layer animate it', async () => {
    await act(() => { tree = create(<TabLayout />) })

    expect(optionsFor('index')).toMatchObject({
      transitionSpec: { animation: 'timing', config: { duration: Math.max(tabSwitch.enterDuration, tabSwitch.exitDuration) } },
    })
    expect(optionsFor('index').animation).toBeUndefined()
    expect(sceneFor('index').opacity.value).toBe(1)
    expect(sceneFor('calendar').opacity.value).toBe(0)
  })

  it('fades the old tab out on the exit duration and easing with no travel', async () => {
    await act(() => { tree = create(<TabLayout />) })
    const leaving = sceneFor('index')

    await switchTab(tree, '/calendar')

    expect(timingFor(leaving.opacity)).toEqual([expect.objectContaining({
      duration: tabSwitch.exitDuration,
      easing: { points: tabSwitch.exitEasing },
      toValue: 0,
    })])
    expect(timingFor(leaving.transform[0].translateX)).toEqual([])
    expect(leaving.transform[0].translateX.value).toBe(0)
  })

  it.each([
    ['/', '/calendar', tabSwitch.shift],
    ['/profile', '/progress', -tabSwitch.shift],
  ])('enters from %s to %s with the tab shift on the enter timing', async (from, to, shift) => {
    state.pathname = from
    await act(() => { tree = create(<TabLayout />) })
    const entering = sceneFor(to.slice(1))

    await switchTab(tree, to)

    expect(timingFor(entering.opacity)).toEqual([expect.objectContaining({
      duration: tabSwitch.enterDuration,
      easing: { points: tabSwitch.enterEasing },
      toValue: 1,
    })])
    expect(timingFor(entering.transform[0].translateX)).toEqual([expect.objectContaining({ toValue: 0 })])
    expect(entering.transform[0].translateX.value).toBe(shift)
  })

  it('returns to a half-faded tab with only the travel it still has left', async () => {
    await act(() => { tree = create(<TabLayout />) })
    await switchTab(tree, '/calendar')
    const today = sceneFor('index')
    today.opacity.value = 0.5

    await switchTab(tree, '/')

    expect(today.transform[0].translateX.value).toBe(-tabSwitch.shift * 0.5)
    expect(timingFor(today.opacity).at(-1)).toMatchObject({ duration: tabSwitch.enterDuration, toValue: 1 })
  })

  it('leaves the tab scenes alone when a route is pushed above the tabs', async () => {
    await act(() => { tree = create(<TabLayout />) })

    await switchTab(tree, '/habits/habit-1')

    expect(Animated.timing).not.toHaveBeenCalled()
    expect(sceneFor('index').opacity.value).toBe(1)
  })

  it('switches at once under reduced motion and leaves the scenes settled', async () => {
    state.reducedMotion = true
    await act(() => { tree = create(<TabLayout />) })

    expect(optionsFor('index')).toMatchObject({ animation: 'none' })
    expect(optionsFor('index').sceneStyleInterpolator).toBeUndefined()
    expect(optionsFor('index').transitionSpec).toBeUndefined()
    await switchTab(tree, '/progress')
    expect(Animated.timing).not.toHaveBeenCalled()

    state.reducedMotion = false
    await act(() => tree.update(<TabLayout />))
    expect(Animated.timing).not.toHaveBeenCalled()
    expect(sceneFor('progress').opacity.value).toBe(1)
    expect(sceneFor('index').opacity.value).toBe(0)
    expect(sceneFor('progress').transform[0].translateX.value).toBe(0)
  })

  it('settles a running switch when reduced motion turns on', async () => {
    await act(() => { tree = create(<TabLayout />) })
    await switchTab(tree, '/calendar')
    const entering = sceneFor('calendar')
    const leaving = sceneFor('index')
    expect(entering.transform[0].translateX.value).toBe(tabSwitch.shift)

    state.reducedMotion = true
    await act(() => tree.update(<TabLayout />))

    expect(entering.opacity.value).toBe(1)
    expect(entering.transform[0].translateX.value).toBe(0)
    expect(leaving.opacity.value).toBe(0)
  })
})
