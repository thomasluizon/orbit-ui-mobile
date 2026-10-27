import { MovingDaySelection, useMonthSelection } from './month-selection'
import { SelectionIndicator } from '@/components/ui/selection-indicator'
import { Children } from 'react'
import type { MonthGridProps } from '@orbit/shared/contracts/dates'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function MonthGrid({
  weekdayLabels = [],
  children,
  gap = 8,
  label,
  loadingLabel,
  minimumDayGridHeight,
  selectionIndex,
}: Readonly<MonthGridProps & { selectionIndex?: number }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const selection = useMonthSelection(selectionIndex)
  const columns = weekdayLabels.length
  const numericGap = typeof gap === 'number' ? gap : Number.parseFloat(gap)
  const dayChildren = Children.toArray(children)
  const rows = columns > 0
    ? Array.from({ length: Math.ceil(dayChildren.length / columns) }, (_, rowIndex) =>
        dayChildren.slice(rowIndex * columns, (rowIndex + 1) * columns),
      )
    : []

  return (
    <MovingDaySelection.Provider value={Boolean(selection.bounds)}><View accessibilityRole="summary" accessibilityLabel={label} testID={`month-grid-${columns}-columns`} style={{ rowGap: 8 }}>
      {columns > 0 ? (
        <View testID="month-grid-header" accessibilityElementsHidden={Boolean(loadingLabel)} importantForAccessibility={loadingLabel ? "no-hide-descendants" : "auto"} style={[styles.row, { columnGap: numericGap, opacity: loadingLabel ? 0 : undefined }]}>
          {weekdayLabels.map((weekday, index) => (
            <View key={`${weekday}-${index}`} style={styles.cellSlot}>
              <Text style={[styles.weekday, { color: tokens.fg3 }]}>{weekday}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View testID="month-grid-days" accessibilityRole={loadingLabel ? "progressbar" : undefined} accessibilityLabel={loadingLabel} accessibilityState={loadingLabel ? { busy: true } : undefined} style={{ rowGap: numericGap, minHeight: minimumDayGridHeight }}>
        <SelectionIndicator bounds={selection.bounds} color={tokens.selectionBg} borderColor={tokens.primary} radius={999} />
        {columns > 0
          ? rows.map((row, rowIndex) => (
              <View onLayout={(event) => selection.measureRow(rowIndex, event)} key={rowIndex} testID={`month-grid-row-${rowIndex}`} style={[styles.row, { columnGap: numericGap }]}>
                {row.map((child, columnIndex) => (
                  <View onLayout={(event) => selection.measureCell(rowIndex * columns + columnIndex, event)} key={columnIndex} style={styles.cellSlot}>
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
    </View></MovingDaySelection.Provider>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cellSlot: { flex: 1, alignItems: 'center' },
  weekday: { fontFamily: 'GeistMono_500Medium', fontSize: 12, fontVariant: ['tabular-nums'] },
})
