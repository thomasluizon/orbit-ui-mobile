import { useEffect, useState } from 'react'
import { Animated } from 'react-native'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { SHELL_ROOT_PATHS, resolveTabSwitchDirection } from '@orbit/shared/utils'
import { toAnimatedEasing } from '@/lib/motion'

interface TabPaths {
  readonly current: string
  readonly previous: string
  readonly instant: boolean
}

function getTabRoutePath(routeName: string): string {
  return routeName === 'index' ? '/' : `/${routeName}`
}

function createTabScene(visible: boolean) {
  const opacity = new Animated.Value(visible ? 1 : 0)
  const { shift } = resolveMotionPreset('tab-switch')
  const enterShift = (direction: -1 | 1) => opacity.interpolate({ inputRange: [0, 1], outputRange: [direction * shift, 0] })
  return { opacity, shiftForward: enterShift(1), shiftBack: enterShift(-1) }
}

type TabScene = ReturnType<typeof createTabScene>

function enterShiftFor(scene: TabScene, direction: -1 | 1 | null) {
  if (direction === null) return 0
  return direction > 0 ? scene.shiftForward : scene.shiftBack
}

function createTabScenes(focusedPath: string): ReadonlyMap<string, TabScene> {
  return new Map(SHELL_ROOT_PATHS.map((path) => [path, createTabScene(path === focusedPath)]))
}

function settleTabScenes(scenes: ReadonlyMap<string, TabScene>, focusedPath: string) {
  for (const [path, scene] of scenes) {
    scene.opacity.stopAnimation()
    scene.opacity.setValue(path === focusedPath ? 1 : 0)
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
      if (scene !== entering && scene !== leaving) scene.opacity.setValue(0)
    }
    const animation = Animated.parallel([
      Animated.timing(leaving.opacity, { duration: preset.exitDuration, easing: toAnimatedEasing(preset.exitEasing), toValue: 0, useNativeDriver: true }),
      Animated.timing(entering.opacity, { duration: preset.enterDuration, easing: toAnimatedEasing(preset.enterEasing), toValue: 1, useNativeDriver: true }),
    ])
    animation.start()
    return () => animation.stop()
  }, [paths, scenes])

  const enterDirection = paths.instant ? null : resolveTabSwitchDirection(paths.previous, paths.current)
  return (routeName: string) => {
    const path = getTabRoutePath(routeName)
    const scene = scenes.get(path)
    if (!scene) return {}
    return { opacity: scene.opacity, transform: [{ translateX: path === paths.current ? enterShiftFor(scene, enterDirection) : 0 }] }
  }
}
