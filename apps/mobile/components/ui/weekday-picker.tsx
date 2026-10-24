import type { HabitUnderstandingProps } from '@orbit/shared/utils'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet, Text, View } from 'react-native'
import { MotionPressable as Pressable } from './motion-pressable'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type WeekdayPickerProps = Pick<HabitUnderstandingProps, 'days' | 'daily' | 'dayOptions' | 'onToggleDay' | 'proposed' | 'scheduleLocked'> & { label: string }

export function WeekdayPicker({ days, daily = false, dayOptions, onToggleDay, proposed = false, scheduleLocked = false, label }: Readonly<WeekdayPickerProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View accessibilityLabel={label} style={styles.days}>
    {dayOptions.map((day) => {
      const selected = daily || days.includes(day.value)
      return <Pressable key={day.value} focusInset selectionRingWidth={1.5} selectionRingColor={proposed ? tokens.fg3 : tokens.primary}
        accessibilityRole="button" accessibilityLabel={day.accessibleLabel} accessibilityState={{ selected, ...(scheduleLocked ? { disabled: true } : {}) }} disabled={scheduleLocked}
        style={({ pressed }) => [styles.target, {
          backgroundColor: pressed && !scheduleLocked ? tokens.bgHover : selected && !proposed ? tokens.primaryDim : tokens.bgWell,
          borderColor: tokens.hairline,
          borderWidth: selected ? 0 : 1,
        }, scheduleLocked ? styles.disabled : null]} onPress={() => onToggleDay(day.value)}>
        <Text style={[styles.text, { color: selected && !proposed ? tokens.fg1 : tokens.fg2 }]}>{day.label.charAt(0)}</Text>
      </Pressable>
    })}
  </View>
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4, width: '100%', maxWidth: 7 * TOUCH_TARGET_MIN + 6 * 4 },
  target: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 24, minHeight: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, overflow: 'hidden' },
  text: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  disabled: { opacity: 0.4 },
})
