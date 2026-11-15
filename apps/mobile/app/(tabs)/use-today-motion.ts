import { useEffect, useMemo, useRef, useState } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated } from 'react-native'
import { resolveCalendarSlide, turnOrbitPage } from '@orbit/shared/utils'
import { useFlag } from '@/hooks/use-flag'
import { useUIStore } from '@/stores/ui-store'
import {
  createAnimatedTimingConfig,
  toAnimatedEasing,
  useResolvedMotionPreset,
} from '@/lib/motion'
import { resolveBulkActionBarEnterShift } from './today-model'

interface TodayMotionInput {
  filterMotionKey: string
}

/**
 * Owns the Today screen's transition motion: the date enter animation (with the guided flows on, the 12px slide and fade of the calendar, and one ring turn of Orbit) and the
 * bulk-action-bar enter/exit (including when the bar unmounts). A refetch or a
 * filter change never dims or moves the list.
 */
export function useTodayMotion({
  filterMotionKey,
}: TodayMotionInput) {
  const listMotion = useResolvedMotionPreset('list-enter')
  const selectionMotion = useResolvedMotionPreset('selection')
  const isSelectMode = useUIStore((state) => state.isSelectMode)

  const dayOpacityAnim = useMemo(() => new Animated.Value(1), [])
  const dayTranslateAnim = useMemo(() => new Animated.Value(0), [])
  const guided = useFlag('orbit_guided_flows')
  const [bulkBarAnim] = useState(() => new Animated.Value(isSelectMode ? 1 : 0))
  const previousFilterMotionKeyRef = useRef(filterMotionKey)
  const dayTransitionSequenceRef = useRef(0)
  const selectionTransitionSequenceRef = useRef(0)
  const [renderBulkActionBar, setRenderBulkActionBar] = useState(isSelectMode)
  const [previousSelectMode, setPreviousSelectMode] = useState(isSelectMode)

  if (isSelectMode !== previousSelectMode) {
    setPreviousSelectMode(isSelectMode)
    if (isSelectMode) {
      setRenderBulkActionBar(true)
    }
  }

  useEffect(() => {
    if (listMotion.reducedMotionEnabled) {
      previousFilterMotionKeyRef.current = filterMotionKey
      dayTransitionSequenceRef.current += 1
      dayOpacityAnim.stopAnimation()
      dayTranslateAnim.stopAnimation()
      dayOpacityAnim.setValue(1)
      dayTranslateAnim.setValue(0)
      return
    }

    if (filterMotionKey === previousFilterMotionKeyRef.current) {
      return
    }

    const direction = filterMotionKey > previousFilterMotionKeyRef.current ? 1 : -1
    previousFilterMotionKeyRef.current = filterMotionKey
    const sequence = dayTransitionSequenceRef.current + 1
    dayTransitionSequenceRef.current = sequence
    if (guided) turnOrbitPage()
    const slide = guided ? resolveCalendarSlide(direction > 0 ? 'right' : 'left', 0, false) : null
    const timingConfig = {
      duration: slide?.duration ?? listMotion.enterDuration,
      easing: toAnimatedEasing(slide?.easing ?? listMotion.enterEasing),
      useNativeDriver: true,
    } as const
    dayTranslateAnim.stopAnimation((liveTranslate) => {
      if (dayTransitionSequenceRef.current !== sequence) return
      dayOpacityAnim.stopAnimation((liveOpacity) => {
        if (dayTransitionSequenceRef.current !== sequence) return
        const isInFlight = Math.abs(liveTranslate) > 0.01 || liveOpacity < 0.999
        if (!isInFlight) {
          dayOpacityAnim.setValue(slide ? 0 : 0.9)
          dayTranslateAnim.setValue(slide?.from ?? direction * 8)
        }
        Animated.parallel([
          Animated.timing(dayTranslateAnim, { ...timingConfig, toValue: 0 }),
          Animated.timing(dayOpacityAnim, { ...timingConfig, toValue: 1 }),
        ]).start()
      })
    })
  }, [
    filterMotionKey,
    guided,
    dayOpacityAnim,
    dayTranslateAnim,
    listMotion.enterDuration,
    listMotion.enterEasing,
    listMotion.reducedMotionEnabled,
  ])

  useEffect(() => () => {
    dayTransitionSequenceRef.current += 1
    dayOpacityAnim.stopAnimation()
    dayTranslateAnim.stopAnimation()
  }, [dayOpacityAnim, dayTranslateAnim])

  useEffect(() => {
    const sequence = selectionTransitionSequenceRef.current + 1
    selectionTransitionSequenceRef.current = sequence
    if (isSelectMode) {
      bulkBarAnim.stopAnimation(() => {
        if (selectionTransitionSequenceRef.current !== sequence) {
          return
        }
        bulkBarAnim.setValue(selectionMotion.reducedMotionEnabled ? 1 : 0)
        Animated.timing(
          bulkBarAnim,
          createAnimatedTimingConfig(
            selectionMotion.enterDuration,
            selectionMotion.enterEasing,
          ),
        ).start()
      })
      return
    }

    bulkBarAnim.stopAnimation()
    if (!renderBulkActionBar) {
      return
    }
    Animated.timing(bulkBarAnim, {
      toValue: 0,
      duration: selectionMotion.exitDuration,
      easing: toAnimatedEasing(selectionMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && selectionTransitionSequenceRef.current === sequence) {
        setRenderBulkActionBar(false)
      }
    })
  }, [
    bulkBarAnim,
    isSelectMode,
    renderBulkActionBar,
    selectionMotion.enterDuration,
    selectionMotion.enterEasing,
    selectionMotion.exitDuration,
    selectionMotion.exitEasing,
    selectionMotion.reducedMotionEnabled,
  ])

  const dayAnimatedStyle = useMemo(
    () => ({
      opacity: dayOpacityAnim,
      transform: [guided ? { translateX: dayTranslateAnim } : { translateY: dayTranslateAnim }],
    }),
    [dayOpacityAnim, dayTranslateAnim, guided],
  )

  const bulkBarAnimatedStyle = useMemo(
    () => ({
      opacity: bulkBarAnim,
      transform: [
        {
          translateY: bulkBarAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [resolveBulkActionBarEnterShift(selectionMotion), 0],
          }),
        },
        {
          scale: bulkBarAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [selectionMotion.scaleFrom, 1],
          }),
        },
      ],
    }),
    [bulkBarAnim, selectionMotion],
  )

  return {
    dayAnimatedStyle,
    bulkBarAnimatedStyle,
    renderBulkActionBar: isSelectMode || renderBulkActionBar,
  }
}
