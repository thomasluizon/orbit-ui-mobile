import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HABIT_CHECK_PATH, HABIT_CHECK_PERIMETER, habitCheckProgress } from '@orbit/shared/utils/habit-row-status'
import { useEffect, useState } from 'react'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { motionDurations, motionSprings, resolveMotionPreset } from '@orbit/shared/theme'
import { toCssTransition, usePrefersReducedMotion } from '@/lib/motion'
import { StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Check } from '@/components/ui/icons'
import { useListScope } from '@/components/motion/list-scope'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitCheckProps {
  status: HabitStatus
  label?: string
  unavailable?: boolean
  feedback?: boolean
  progress?: { done: number; total: number }
}

function useCompletionSettle(done: boolean, reduced: boolean) {
  const scope = useListScope()
  const [previous, setPrevious] = useState({ done, scope })
  const [logged, setLogged] = useState(false)
  if (done !== previous.done || scope !== previous.scope) {
    setPrevious({ done, scope })
    setLogged(done && scope === previous.scope)
  }
  const settleScale = useSharedValue(1)
  const settleStyle = useAnimatedStyle(() => ({ transform: [{ scale: settleScale.value }] }))
  useEffect(() => {
    if (!logged || reduced) return
    settleScale.value = resolveMotionPreset('success-feedback').scaleFrom
    settleScale.value = withSpring(1, { ...motionSprings.completion, overshootClamping: true })
    return () => {
      cancelAnimation(settleScale)
      settleScale.value = 1
    }
  }, [logged, reduced, settleScale])
  return settleStyle
}

export function HabitCheck({ status, label, unavailable = false, feedback = false, progress }: Readonly<HabitCheckProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reduced = usePrefersReducedMotion()
  const ratio = habitCheckProgress(progress)
  const done = status === 'done' || (status !== 'bad' && progress !== undefined && ratio === 1)
  const settleStyle = useCompletionSettle(done, reduced)
  const accessibilityRole = label ? 'image' : undefined
  if (unavailable) return (
    <View testID="unavailable-status-dot"
      accessibilityRole={accessibilityRole} accessibilityLabel={label}
      style={{ width: 28, height: 28, borderRadius: 12, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
        backgroundColor: tokens.bgWell, borderWidth: 0 }} />
  )
  const emptyFill = feedback ? tokens.bgHover : 'transparent'
  const { graphic: color } = progress ? { graphic: tokens.trackEmpty } : {
    empty: { graphic: tokens.statusEmpty }, done: { graphic: tokens.fg1 }, overdue: { graphic: tokens.statusOverdue }, bad: { graphic: tokens.statusBad },
  }[status]
  return (
    <Animated.View testID="habit-check"
      accessibilityRole={accessibilityRole} accessibilityLabel={label}
      style={[{ width: 28, height: 28, borderRadius: 12, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
        backgroundColor: done ? tokens.fg1 : emptyFill,
        transition: toCssTransition(['background-color'], reduced ? motionDurations.instant : motionDurations.press),
        borderWidth: done ? 0 : 1, borderColor: color }, settleStyle]}>
      {done ? <CompletedCheck feedback={feedback} fill={tokens.bgHoverOpaque} color={tokens.bg} /> : null}
      {!done && ratio > 0 ? <Svg width={28} height={28} style={{ position: 'absolute', top: -1, left: -1 }}>
        <Path d={HABIT_CHECK_PATH} fill="none" stroke={status === 'bad' ? tokens.statusBad : tokens.primary}
          strokeWidth={1} strokeDasharray={`${ratio * HABIT_CHECK_PERIMETER} ${HABIT_CHECK_PERIMETER}`} strokeLinecap="round" />
      </Svg> : null}
    </Animated.View>
  )
}

function CompletedCheck({ feedback, fill, color }: Readonly<{ feedback: boolean; fill: string; color: string }>) {
  return <>
    {feedback ? <View testID="habit-check-feedback" pointerEvents="none" accessible={false}
      style={[StyleSheet.absoluteFill, { borderRadius: 12, backgroundColor: fill }]} /> : null}
    <Check size={16} strokeWidth={3} color={color} />
  </>
}
