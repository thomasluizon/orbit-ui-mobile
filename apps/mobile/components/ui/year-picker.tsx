import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { InsetFocusPressable as Pressable } from './inset-focus-pressable'
import { buildYearRange } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'

type Tokens = ReturnType<typeof createTokensV2>

const COLUMNS = 3
const ROW_HEIGHT = 52
const ROW_GAP = 4
const GRID_PADDING = 4

interface YearPickerProps {
  selectedYear: number
  onSelectYear: (year: number) => void
  tokens: Tokens
}

/** Compact, scrollable grid of selectable years. Surfaces (the calendar header
 *  and the date picker) wrap it in their own overlay; this owns only the grid,
 *  the selected highlight, and scrolling the selection into view. */
export function YearPicker({
  selectedYear,
  onSelectYear,
  tokens,
}: Readonly<YearPickerProps>) {
  const scrollRef = useRef<ScrollView>(null)
  const viewportHeight = useRef(240)
  const years = useMemo(() => buildYearRange(selectedYear), [selectedYear])

  const revealSelection = useCallback(() => {
    const index = years.indexOf(selectedYear)
    if (index < 0) return
    const row = Math.floor(index / COLUMNS)
    scrollRef.current?.scrollTo({
      y: Math.max(0, (row - 1) * ROW_HEIGHT, GRID_PADDING + row * ROW_HEIGHT + ROW_HEIGHT - ROW_GAP - viewportHeight.current),
      animated: false,
    })
  }, [years, selectedYear])

  useEffect(revealSelection, [revealSelection])

  return (
    <ScrollView
      ref={scrollRef}
      testID="year-picker-scroll"
      style={styles.scroll}
      contentContainerStyle={styles.grid}
      nestedScrollEnabled
      onLayout={(event) => {
        viewportHeight.current = event.nativeEvent.layout.height
        revealSelection()
      }}
      onContentSizeChange={revealSelection}
      showsVerticalScrollIndicator={false}
    >
      {/* react-doctor-disable-next-line rn-no-scrollview-mapped-list -- bounded year-range grid with programmatic scroll-to-selection via scrollTo(row); FlatList virtualization breaks the row-offset centering https://github.com/thomasluizon/orbit-ui-mobile/issues/243 */}
      {years.map((year) => {
        const isSelected = year === selectedYear
        return (
          <Pressable
            focusColor={isSelected ? tokens.fgOnPrimary : tokens.fg1}
            key={year}
            onPress={() => onSelectYear(year)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={String(year)}
            style={({ pressed }) => [
              styles.yearCell,
              { backgroundColor: isSelected ? (pressed ? tokens.primaryPressed : tokens.primary) : tokens.bgField },
              pressed && !isSelected ? { backgroundColor: tokens.bgHover } : null,
              pressed ? styles.yearCellPressed : null,
            ]}
          >
            <Text style={[styles.yearText, isSelected && styles.yearTextSelected, { color: isSelected ? tokens.fgOnPrimary : tokens.fg1 }]}>{year}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 240, minHeight: 0 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: GRID_PADDING,
  },
  yearCell: {
    width: `${100 / COLUMNS}%`,
    minHeight: ROW_HEIGHT - ROW_GAP,
    marginBottom: ROW_GAP,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  yearCellPressed: {
    transform: [{ scale: 0.96 }],
  },
  yearText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  yearTextSelected: {
    fontFamily: 'GeistMono_500Medium',
  },
})
