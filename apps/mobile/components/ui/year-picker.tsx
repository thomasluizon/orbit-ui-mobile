import { useEffect, useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { buildYearRange } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'

type Tokens = ReturnType<typeof createTokensV2>

const COLUMNS = 3
const ROW_HEIGHT = 48
const ROW_GAP = 4

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
      testID="year-picker-scroll"
      style={styles.scroll}
      contentContainerStyle={styles.grid}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      {/* react-doctor-disable-next-line rn-no-scrollview-mapped-list -- bounded year-range grid with programmatic scroll-to-selection via scrollTo(row); FlatList virtualization breaks the row-offset centering https://github.com/thomasluizon/orbit-ui-mobile/issues/243 */}
      {years.map((year) => {
        const isSelected = year === selectedYear
        return (
          <Pressable
            key={year}
            onPress={() => onSelectYear(year)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={String(year)}
            style={styles.yearCell}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.yearPill,
                  isSelected && { backgroundColor: tokens.primary },
                  pressed && !isSelected && { backgroundColor: tokens.bgHover },
                  pressed && styles.yearPillPressed,
                ]}
              >
                <Text
                  style={[
                    styles.yearText,
                    isSelected && styles.yearTextSelected,
                    { color: isSelected ? tokens.fgOnPrimary : tokens.fg1 },
                  ]}
                >
                  {year}
                </Text>
              </View>
            )}
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
    height: ROW_HEIGHT - ROW_GAP,
    marginBottom: ROW_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearPill: {
    width: '100%',
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  yearPillPressed: {
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
