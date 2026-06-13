import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Easing, Platform } from 'react-native'
import {
  motionDurations,
  motionEasings,
  motionLayerTiming,
  motionPresets,
  orbitalMotion,
  resolveMotionPreset,
  type MotionScenario,
} from '@orbit/shared/theme'

let cachedReducedMotionPreference = false
let hasLoadedReducedMotionPreference = false
let reducedMotionRequest: Promise<boolean> | null = null

async function readReducedMotionPreference(): Promise<boolean> {
  if (Platform.OS === 'web') return false

  try {
    return await AccessibilityInfo.isReduceMotionEnabled()
  } catch {
    return false
  }
}

export async function getPrefersReducedMotion(): Promise<boolean> {
  if (hasLoadedReducedMotionPreference) {
    return cachedReducedMotionPreference
  }

  if (!reducedMotionRequest) {
    reducedMotionRequest = readReducedMotionPreference().then((nextValue) => {
      cachedReducedMotionPreference = nextValue
      hasLoadedReducedMotionPreference = true
      reducedMotionRequest = null
      return nextValue
    })
  }

  return reducedMotionRequest
}

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    hasLoadedReducedMotionPreference ? cachedReducedMotionPreference : false,
  )

  useEffect(() => {
    let active = true

    void getPrefersReducedMotion().then((nextValue) => {
      if (active) {
        setPrefersReducedMotion(nextValue)
      }
    })

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (nextValue) => {
        cachedReducedMotionPreference = nextValue
        hasLoadedReducedMotionPreference = true
        if (active) {
          setPrefersReducedMotion(nextValue)
        }
      },
    )

    return () => {
      active = false
      subscription?.remove?.()
    }
  }, [])

  return prefersReducedMotion
}

export function useResolvedMotionPreset(scenario: MotionScenario) {
  const prefersReducedMotion = usePrefersReducedMotion()

  return useMemo(
    () => resolveMotionPreset(scenario, prefersReducedMotion),
    [prefersReducedMotion, scenario],
  )
}

/** Converts shared bezier control points into an RN Animated easing function. */
export function toAnimatedEasing(
  controlPoints: readonly [number, number, number, number],
): (value: number) => number {
  return Easing.bezier(
    controlPoints[0],
    controlPoints[1],
    controlPoints[2],
    controlPoints[3],
  )
}

export const mobileMotion = {
  durations: motionDurations,
  easings: motionEasings,
  layerTiming: motionLayerTiming,
  orbital: orbitalMotion,
  presets: motionPresets,
} as const
