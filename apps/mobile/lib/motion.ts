import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'
import {
  motionDurations,
  motionEasings,
  motionLayerTiming,
  motionPresets,
  orbitalMotion,
  motionSprings,
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

export function setReducedMotionPreferenceForTests(value: boolean) {
  cachedReducedMotionPreference = value
  hasLoadedReducedMotionPreference = true
  reducedMotionRequest = null
}

export function resetReducedMotionPreferenceForTests() {
  cachedReducedMotionPreference = false
  hasLoadedReducedMotionPreference = false
  reducedMotionRequest = null
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

export function getReanimatedEasing(
  easing: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  return easing
}

export function getSpringConfig(
  spring: keyof typeof motionSprings,
  prefersReducedMotion: boolean,
) {
  if (prefersReducedMotion) {
    return {
      stiffness: 420,
      damping: 42,
      mass: 1,
      restSpeedThreshold: 2,
      restDisplacementThreshold: 2,
    }
  }

  return motionSprings[spring]
}

export const mobileMotion = {
  durations: motionDurations,
  easings: motionEasings,
  layerTiming: motionLayerTiming,
  orbital: orbitalMotion,
  presets: motionPresets,
} as const
