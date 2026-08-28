import type { DayStripProps } from '@orbit/shared/contracts/dates'
import { getDayStripStateWord } from '@orbit/shared/utils'
import { StyleSheet, View } from 'react-native'
import { Snowflake } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function DayStrip(props: Readonly<DayStripProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const size = props.size ?? 20
  const count = props.length === undefined ? props.days.length : Math.max(props.length, 0)
  const firstIndex = Math.max(props.days.length - count, 0)
  const days = props.days.slice(firstIndex)
  const labels = props.labels?.slice(firstIndex)

  return (
    <View accessibilityRole="summary" accessibilityLabel={props.label} testID={`day-strip-${props.scope}`} style={styles.row}>
      {days.map((state, index) => {
        const cellLabel = labels?.[index] ?? String(firstIndex + index + 1)
        const filled = state === 'done' || state === 'active'
        const backgroundColor = filled ? tokens.fg1 : state === 'frozen' ? tokens.fg2 : state === 'not-scheduled' ? tokens.bgWell : 'transparent'
        const borderColor = state === 'today' ? tokens.primary : state === 'missed' ? tokens.fg4 : 'transparent'
        return (
          <View
            key={`${cellLabel}-${index}`}
            accessibilityRole="image"
            accessibilityLabel={`${cellLabel}, ${getDayStripStateWord(props, state)}`}
            accessibilityState={{ selected: state === 'today' }}
            testID={`day-strip-cell-${state}`}
            style={{ width: size, height: size, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor, borderColor, borderWidth: borderColor === 'transparent' ? 0 : state === 'today' ? 2 : 1 }}
          >
            {state === 'frozen' ? <Snowflake size={16} strokeWidth={2} color={tokens.bg} /> : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 } })
