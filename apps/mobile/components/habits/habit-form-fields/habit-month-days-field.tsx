import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { formatHabitMonthDaySchedule, HABIT_MONTH_DAY_OPTIONS, resolveHabitMonthDaySelection } from '@orbit/shared/utils'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useHabitFormInteraction } from './habit-form-interaction'

const SHORT_MONTH_DAY = 29
const DAYS_PER_ROW = 7
const DAY_GAP = 8

interface HabitMonthDaysFieldProps {
  visible: boolean
  monthDays: readonly number[]
  anchorDay: number
  quantity: number
  disabled?: boolean
  proposed?: boolean
  onToggle: (day: number) => void
}

const DAY_ROWS = Array.from({ length: Math.ceil(HABIT_MONTH_DAY_OPTIONS.length / DAYS_PER_ROW) }, (_, row) =>
  HABIT_MONTH_DAY_OPTIONS.slice(row * DAYS_PER_ROW, (row + 1) * DAYS_PER_ROW))

export function HabitMonthDaysField({ visible, monthDays, anchorDay, quantity, disabled = false, proposed = false, onToggle }: Readonly<HabitMonthDaysFieldProps>) {
  const { t } = useTranslation()
  const { disabled: formDisabled } = useHabitFormInteraction()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (!visible) return null
  const locked = disabled || formDisabled
  const selected = resolveHabitMonthDaySelection(monthDays, anchorDay)
  const question = t('habits.form.monthDaysQuestion')
  const summary = formatHabitMonthDaySchedule(selected, quantity, (key, values) => t(key, values))
  return (
    <View testID="habit-month-days" style={styles.container}>
      <Text style={[styles.label, { color: tokens.fg2 }]}>{question}</Text>
      <View accessibilityLabel={question} accessibilityHint={summary} style={styles.grid}>
        {DAY_ROWS.map((row) => (
          <View key={row[0]} style={styles.row}>
            {Array.from({ length: DAYS_PER_ROW }, (_, index) => {
              const day = row[index]
              if (day === undefined) return <View key={`empty-${index}`} style={styles.target} />
              const chosen = selected.includes(day)
              return <Pressable key={day} focusInset selectionRingWidth={1.5} selectionRingColor={proposed ? tokens.fg3 : tokens.primary}
                accessibilityRole="button" accessibilityLabel={String(day)} accessibilityState={{ selected: chosen, ...(locked ? { disabled: true } : {}) }} disabled={locked}
                style={({ pressed }) => [styles.target, {
                  backgroundColor: pressed && !locked ? tokens.bgHover : chosen && !proposed ? tokens.primaryDim : tokens.bgWell,
                  borderColor: tokens.hairline,
                  borderWidth: chosen ? 0 : 1,
                }, locked ? styles.disabled : null]} onPress={() => onToggle(day)}>
                <Text style={[styles.day, { color: chosen && !proposed ? tokens.fg1 : tokens.fg2 }]}>{day}</Text>
              </Pressable>
            })}
          </View>
        ))}
      </View>
      <Text testID="month-days-summary" style={[styles.text, { color: proposed ? tokens.fg3 : tokens.fg2 }]}>{summary}</Text>
      {selected.some((day) => day >= SHORT_MONTH_DAY) ? <Text style={[styles.text, { color: tokens.fg3 }]}>{t('habits.form.monthDaysShortMonth')}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 8, minWidth: 0 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  grid: { gap: DAY_GAP, width: '100%', maxWidth: DAYS_PER_ROW * TOUCH_TARGET_MIN + (DAYS_PER_ROW - 1) * DAY_GAP },
  row: { flexDirection: 'row', flexWrap: 'nowrap', gap: DAY_GAP },
  target: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 24, minHeight: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, overflow: 'hidden' },
  day: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  text: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  disabled: { opacity: 0.4 },
})
