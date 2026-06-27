import { useEffect, useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { buildYearRange } from '@orbit/shared/utils'
import { createTokensV2, radius } from '@/lib/theme'

type Tokens = ReturnType<typeof createTokensV2>

const COLUMNS = 3
const ROW_HEIGHT = 48

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
}: YearPickerProps) {
  const scrollRef = useRef<ScrollView>(null)
  const years = useMemo(() => buildYearRange(selectedYear), [selectedYear])

  useEffect(() => {
    const index = years.indexOf(selectedYear)
    if (index < 0) return
    const row = Math.floor(index / COLUMNS)
    scrollRef.current?.scrollTo({
      y: Math.max(0, (row - 1) * ROW_HEIGHT),
      animated: false,
    })
  }, [years, selectedYear])

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.grid}
      showsVerticalScrollIndicator={false}
    >
      {years.map((year) => {
        const isSelected = year === selectedYear
        return (
          <Pressable
            key={year}
            onPress={() => onSelectYear(year)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={String(year)}
            style={({ pressed }) => [
              styles.yearCell,
              isSelected && { backgroundColor: tokens.primary },
              pressed && !isSelected && { backgroundColor: tokens.bgElev },
            ]}
          >
            <Text
              style={[
                styles.yearText,
                { color: isSelected ? tokens.fgOnPrimary : tokens.fg1 },
              ]}
            >
              {year}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 240 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
  },
  yearCell: {
    width: `${100 / COLUMNS}%`,
    height: ROW_HEIGHT - 6,
    marginBottom: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  yearText: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
})
