import { useEffect, useState } from 'react'
import { Animated } from 'react-native'
import {
  primaryTabPaths,
  resolveMotionPreset,
  resolveTabSwitchDirection,
} from '@orbit/shared/theme'
import { toAnimatedEasing } from '@/lib/motion'

interface TabScene {
  readonly opacity: Animated.Value
  readonly translateX: Animated.Value
}

interface TabPaths {
  readonly current: string
  readonly previous: string
  readonly instant: boolean
}

export function getTabRoutePath(routeName: string): string {
  return routeName === 'index' ? '/' : `/${routeName}`
}

function createTabScenes(focusedPath: string): ReadonlyMap<string, TabScene> {
  return new Map(primaryTabPaths.map((path) => [path, {
    opacity: new Animated.Value(path === focusedPath ? 1 : 0),
    translateX: new Animated.Value(0),
  }]))
}

function settleTabScenes(scenes: ReadonlyMap<string, TabScene>, focusedPath: string) {
  for (const [path, scene] of scenes) {
    scene.opacity.stopAnimation()
    scene.translateX.stopAnimation()
    scene.opacity.setValue(path === focusedPath ? 1 : 0)
    scene.translateX.setValue(0)
  }
}

export function useTabSceneMotion(pathname: string, instant: boolean) {
  const [scenes] = useState(() => createTabScenes(pathname))
  const [paths, setPaths] = useState<TabPaths>({ current: pathname, previous: pathname, instant })
  if (scenes.has(pathname) && pathname !== paths.current) {
    setPaths({ current: pathname, previous: paths.current, instant })
  }

  const focusedPath = paths.current
  useEffect(() => {
    if (instant) settleTabScenes(scenes, focusedPath)
  }, [focusedPath, instant, scenes])

  useEffect(() => {
    const entering = scenes.get(paths.current)
    const leaving = scenes.get(paths.previous)
    const direction = resolveTabSwitchDirection(paths.previous, paths.current)
    if (!entering || !leaving || direction === null || paths.instant) {
      settleTabScenes(scenes, paths.current)
      return
    }

    const preset = resolveMotionPreset('tab-switch')
    for (const scene of scenes.values()) {
      scene.opacity.stopAnimation()
      scene.translateX.stopAnimation()
      scene.translateX.setValue(0)
      if (scene !== entering && scene !== leaving) scene.opacity.setValue(0)
    }
    entering.translateX.setValue(direction * preset.shift)
    const exitTiming = { duration: preset.exitDuration, easing: toAnimatedEasing(preset.exitEasing), useNativeDriver: true }
    const enterTiming = { duration: preset.enterDuration, easing: toAnimatedEasing(preset.enterEasing), useNativeDriver: true }
    const animation = Animated.parallel([
      Animated.timing(leaving.opacity, { ...exitTiming, toValue: 0 }),
      Animated.timing(entering.opacity, { ...enterTiming, toValue: 1 }),
      Animated.timing(entering.translateX, { ...enterTiming, toValue: 0 }),
    ])
    animation.start()
    return () => animation.stop()
  }, [paths, scenes])

  return (routeName: string) => {
    const scene = scenes.get(getTabRoutePath(routeName))
    return scene ? { opacity: scene.opacity, transform: [{ translateX: scene.translateX }] } : {}
  }
}
