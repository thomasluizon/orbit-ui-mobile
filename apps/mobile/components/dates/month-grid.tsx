import { Children } from 'react'
import type { MonthGridProps } from '@orbit/shared/contracts/dates'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function MonthGrid({ weekdayLabels = [], children, gap = 8, label }: Readonly<MonthGridProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const columns = weekdayLabels.length
  const numericGap = typeof gap === 'number' ? gap : Number.parseFloat(gap)
  const dayChildren = Children.toArray(children)
  const rows = columns > 0
    ? Array.from({ length: Math.ceil(dayChildren.length / columns) }, (_, rowIndex) =>
        dayChildren.slice(rowIndex * columns, (rowIndex + 1) * columns),
      )
    : []

  return (
    <View accessibilityRole="summary" accessibilityLabel={label} testID={`month-grid-${columns}-columns`}>
      {columns > 0 ? (
        <View testID="month-grid-header" style={[styles.row, { columnGap: numericGap, marginBottom: numericGap }]}>
          {weekdayLabels.map((weekday, index) => (
            <View key={`${weekday}-${index}`} style={styles.cellSlot}>
              <Text style={[styles.weekday, { color: tokens.fg3 }]}>{weekday}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View testID="month-grid-days" style={{ rowGap: numericGap }}>
        {columns > 0
          ? rows.map((row, rowIndex) => (
              <View key={rowIndex} testID={`month-grid-row-${rowIndex}`} style={[styles.row, { columnGap: numericGap }]}>
                {row.map((child, columnIndex) => (
                  <View key={columnIndex} style={styles.cellSlot}>
                    {child}
                  </View>
                ))}
                {Array.from({ length: columns - row.length }, (_, emptyIndex) => (
                  <View key={`empty-${emptyIndex}`} style={styles.cellSlot} />
                ))}
              </View>
            ))
          : dayChildren}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cellSlot: { flex: 1, alignItems: 'center' },
  weekday: { fontFamily: 'GeistMono_500Medium', fontSize: 12, fontVariant: ['tabular-nums'] },
})
