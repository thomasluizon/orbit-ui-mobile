import { useLayoutEffect } from 'react'
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

type ListSource = 'habits' | 'goals'
const mountedLists = new Set<{ source: ListSource; reduced: boolean; dragging: boolean }>()

export function prepareListLayoutMotion(source: ListSource) {
  const lists = [...mountedLists].filter((list) => list.source === source)
  if (lists.length === 0 || lists.some((list) => list.dragging)) return
  LayoutAnimation.configureNext(createListLayoutConfig(lists.some((list) => list.reduced)))
}

export function useListLayoutMotion(source: ListSource, dragging = false) {
  const reduced = usePrefersReducedMotion()
  useLayoutEffect(() => {
    const list = { source, reduced, dragging }
    mountedLists.add(list)
    return () => { mountedLists.delete(list) }
  }, [dragging, reduced, source])
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
