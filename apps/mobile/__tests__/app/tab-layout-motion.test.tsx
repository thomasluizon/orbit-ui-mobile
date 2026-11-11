import React from 'react'
import { Animated } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { motionPresets } from '@orbit/shared/theme'
import TabLayout from '@/app/(tabs)/_layout'

type ScreenOptions = Record<string, unknown> | ((props: { route: { name: string } }) => Record<string, unknown>)
type LiveValue = { value: number }
type SceneStyle = { opacity: LiveValue; transform: [{ translateX: LiveValue | number }] }
type TimingConfig = { duration: number; easing: { points: readonly number[] }; toValue: number }
type InterpolationConfig = { inputRange: [number, number]; outputRange: [number, number] }

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
const nativeReadBacks: (() => void)[] = []
const valuePrototype = Animated.Value.prototype as unknown as {
  interpolate: (config: InterpolationConfig) => LiveValue
  stopAnimation: (callback?: (value: number) => void) => void
}

function interpolateLive(this: LiveValue, { inputRange, outputRange }: InterpolationConfig): LiveValue {
  const readSource = () => this.value
  return {
    get value() {
      const progress = (readSource() - inputRange[0]) / (inputRange[1] - inputRange[0])
      return outputRange[0] + (outputRange[1] - outputRange[0]) * progress
    },
  }
}

function readNativeValueLater(this: LiveValue, callback?: (value: number) => void) {
  if (callback) nativeReadBacks.push(() => callback(this.value))
}

function optionsFor(name: string) {
  const screenOptions = state.screenOptions!
  return typeof screenOptions === 'function' ? screenOptions({ route: { name } }) : screenOptions
}

function sceneFor(name: string): SceneStyle {
  const interpolator = optionsFor(name).sceneStyleInterpolator as (props: { current: { progress: Animated.Value } }) => { sceneStyle: SceneStyle }
  return interpolator({ current: { progress: new Animated.Value(0) } }).sceneStyle
}

function translateXOf(scene: SceneStyle): number {
  const { translateX } = scene.transform[0]
  return typeof translateX === 'number' ? translateX : translateX.value
}

function answerNativeReadBacks() {
  for (const readBack of nativeReadBacks.splice(0)) readBack()
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
    nativeReadBacks.length = 0
    vi.spyOn(Animated, 'timing')
    vi.spyOn(valuePrototype, 'interpolate').mockImplementation(interpolateLive)
    vi.spyOn(valuePrototype, 'stopAnimation').mockImplementation(readNativeValueLater)
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
    const leaving = sceneFor('index').opacity

    await switchTab(tree, '/calendar')

    expect(timingFor(leaving)).toEqual([expect.objectContaining({
      duration: tabSwitch.exitDuration,
      easing: { points: tabSwitch.exitEasing },
      toValue: 0,
    })])
    leaving.value = 0.4
    expect(translateXOf(sceneFor('index'))).toBe(0)
  })

  it.each([
    ['/', '/calendar', tabSwitch.shift],
    ['/profile', '/progress', -tabSwitch.shift],
  ])('enters from %s to %s with the tab shift tied to the enter fade', async (from, to, shift) => {
    state.pathname = from
    await act(() => { tree = create(<TabLayout />) })

    await switchTab(tree, to)
    const entering = sceneFor(to.slice(1))

    expect(translateXOf(entering)).toBe(shift)
    expect(timingFor(entering.opacity)).toEqual([expect.objectContaining({
      duration: tabSwitch.enterDuration,
      easing: { points: tabSwitch.enterEasing },
      toValue: 1,
    })])
    expect(Animated.timing).toHaveBeenCalledTimes(2)
    entering.opacity.value = 0.5
    expect(translateXOf(entering)).toBe(shift * 0.5)
    entering.opacity.value = 1
    expect(translateXOf(entering)).toBe(0)
  })

  it('returns to a half-faded tab with only the travel it still has left and waits on no native read-back', async () => {
    await act(() => { tree = create(<TabLayout />) })
    await switchTab(tree, '/calendar')
    const today = sceneFor('index').opacity
    today.value = 0.5

    await switchTab(tree, '/')

    expect(nativeReadBacks).toEqual([])
    expect(translateXOf(sceneFor('index'))).toBe(-tabSwitch.shift * 0.5)
    expect(timingFor(today).at(-1)).toMatchObject({ duration: tabSwitch.enterDuration, toValue: 1 })
    answerNativeReadBacks()
    today.value = 1
    expect(translateXOf(sceneFor('index'))).toBe(0)
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
    expect(translateXOf(sceneFor('progress'))).toBe(0)
  })

  it('settles a running switch when reduced motion turns on', async () => {
    await act(() => { tree = create(<TabLayout />) })
    await switchTab(tree, '/calendar')
    const entering = sceneFor('calendar')
    const leaving = sceneFor('index')
    expect(translateXOf(entering)).toBe(tabSwitch.shift)

    state.reducedMotion = true
    await act(() => tree.update(<TabLayout />))

    expect(entering.opacity.value).toBe(1)
    expect(translateXOf(entering)).toBe(0)
    expect(leaving.opacity.value).toBe(0)
  })
})
