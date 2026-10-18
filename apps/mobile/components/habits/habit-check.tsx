import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HABIT_CHECK_PATH, HABIT_CHECK_PERIMETER, habitCheckProgress } from '@orbit/shared/utils/habit-row-status'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Check } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitCheckProps {
  status: HabitStatus
  label?: string
  unavailable?: boolean
  progress?: { done: number; total: number }
}

export function HabitCheck({ status, label, unavailable = false, progress }: Readonly<HabitCheckProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (unavailable) return (
    <View testID="unavailable-status-dot"
      accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}
      style={{ width: 28, height: 28, borderRadius: 12, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
        backgroundColor: tokens.bgWell, borderWidth: 0 }} />
  )
  const ratio = habitCheckProgress(progress)
  const done = status !== 'bad' && (progress ? ratio === 1 : status === 'done')
  const color = progress ? tokens.trackEmpty : {
    empty: { graphic: tokens.statusEmpty }, done: { graphic: tokens.fg1 }, overdue: { graphic: tokens.statusOverdue }, bad: { graphic: tokens.statusBad },
  }[status].graphic
  return (
    <View testID="habit-check"
      accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}
      style={{ width: 28, height: 28, borderRadius: 12, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
        backgroundColor: done ? tokens.fg1 : 'transparent',
        borderWidth: done ? 0 : 1, borderColor: color }}>
      {done ? <Check size={16} strokeWidth={3} color={tokens.bg} /> : null}
      {!done && ratio > 0 ? <Svg width={28} height={28} style={{ position: 'absolute', top: -1, left: -1 }}>
        <Path d={HABIT_CHECK_PATH} fill="none" stroke={status === 'bad' ? tokens.statusBad : tokens.primary}
          strokeWidth={1} strokeDasharray={`${ratio * HABIT_CHECK_PERIMETER} ${HABIT_CHECK_PERIMETER}`} strokeLinecap="round" />
      </Svg> : null}
    </View>
  )
}
