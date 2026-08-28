import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayDateControlProps {
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  previousLabel: string
  todayLabel: string
  nextLabel: string
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
}

export function TodayDateControl({
  dayName,
  numericDate,
  isTodaySelected,
  nextDisabled,
  previousLabel,
  todayLabel,
  nextLabel,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
}: Readonly<TodayDateControlProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        onPress={onGoToPreviousDay}
        style={styles.iconButton}
      >
        <ChevronLeft size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
      <View style={styles.dateText}>
        <Text numberOfLines={1} style={[styles.dayName, { color: tokens.fg1 }]}>{dayName}</Text>
        <Text numberOfLines={1} style={[styles.numericDate, { color: tokens.fg3 }]}>{numericDate}</Text>
      </View>
      {!isTodaySelected ? (
        <Pressable accessibilityRole="button" onPress={onGoToToday} style={styles.todayButton}>
          <Text style={[styles.todayText, { color: tokens.fg1 }]}>{todayLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onGoToNextDay}
        style={[styles.iconButton, nextDisabled ? styles.disabled : null]}
      >
        <ChevronRight size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 53,
    paddingHorizontal: 16,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dateText: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  dayName: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  numericDate: {
    fontFamily: 'RobotoMono_400Regular',
    fontSize: 12,
  },
  todayButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  todayText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  disabled: {
    opacity: 0.5,
  },
})
