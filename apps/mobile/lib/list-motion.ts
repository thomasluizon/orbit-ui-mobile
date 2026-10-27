import { useLayoutEffect, useRef } from 'react'
import { LayoutAnimation, type LayoutAnimationConfig } from 'react-native'
import { Easing, Keyframe, ReduceMotion } from 'react-native-reanimated'
import { motionDurations, motionSprings, resolveMotionPreset } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

export function createListLayoutConfig(reduced: boolean): LayoutAnimationConfig {
  return {
    duration: reduced ? motionDurations.instant : motionDurations.base,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  }
}

export function useListLayoutMotion(signature: string, dragging = false) {
  const reduced = usePrefersReducedMotion()
  const previous = useRef(signature)
  useLayoutEffect(() => {
    if (previous.current !== signature || reduced) {
      previous.current = signature
      if (!dragging) LayoutAnimation.configureNext(createListLayoutConfig(reduced))
    }
  }, [dragging, reduced, signature])
  return reduced
}

export function createListCellMotion(reduced: boolean) {
  const enter = resolveMotionPreset('list-enter', reduced)
  const exit = resolveMotionPreset('list-exit', reduced)
  return {
    itemEnteringAnimation: new Keyframe({
      0: { opacity: 0, transform: [{ translateY: enter.shift }] },
      100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.bezier(...enter.enterEasing) },
    }).duration(reduced ? 0 : enter.enterDuration).reduceMotion(ReduceMotion.System),
    itemExitingAnimation: new Keyframe({
      0: { opacity: 1, transform: [{ translateY: 0 }] },
      100: { opacity: 0, transform: [{ translateY: exit.shift }], easing: Easing.bezier(...exit.exitEasing) },
    }).duration(reduced ? 0 : exit.exitDuration).reduceMotion(ReduceMotion.System),
    animationConfig: { ...motionSprings.soft, overshootClamping: true, reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.System },
  }
}
