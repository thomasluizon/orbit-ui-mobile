import { Children } from 'react'
import type { MonthGridProps } from '@orbit/shared/contracts/dates'
import { StyleSheet, Text, View, type DimensionValue } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function MonthGrid({ weekdayLabels = [], children, gap = 8, label }: Readonly<MonthGridProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const columns = weekdayLabels.length
  const width: DimensionValue = columns > 0 ? `${100 / columns}%` : 'auto'
  const numericGap = typeof gap === 'number' ? gap : Number.parseFloat(gap)

  return (
    <View accessibilityRole="summary" accessibilityLabel={label} testID={`month-grid-${columns}-columns`}>
      {columns > 0 ? (
        <View testID="month-grid-header" style={styles.row}>
          {weekdayLabels.map((weekday, index) => (
            <View key={`${weekday}-${index}`} style={{ width, alignItems: 'center', paddingBottom: numericGap }}>
              <Text style={[styles.weekday, { color: tokens.fg3 }]}>{weekday}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View testID="month-grid-days" style={styles.row}>
        {Children.toArray(children).map((child, index) => (
          <View key={index} style={{ width, alignItems: 'center', paddingBottom: numericGap }}>
            {child}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { fontFamily: 'RobotoMono_500Medium', fontSize: 12, fontVariant: ['tabular-nums'] },
})
