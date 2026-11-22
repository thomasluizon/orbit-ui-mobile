
import { useHabitFormInteraction } from './habit-form-interaction'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { HabitUnderstandingProps, HabitRepeatIntervalProps } from '@orbit/shared/utils'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { Minus, Plus } from '@/components/ui/icons'
import { WeekdayPicker } from '@/components/ui/weekday-picker'
import { createTokensV2, radius } from '@/lib/theme'
import { insetHairlineRing } from '@/components/ui/inset-hairline-ring'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

function createStyles(tokens: AppTokens, measuredLineHeight: number) {
  const singleLineHeight = Math.max(54, measuredLineHeight + SPACING.s12 * 2)
  const titleTextStyle = {
    minHeight: singleLineHeight,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 23,
    includeFontPadding: false,
    paddingHorizontal: SPACING.s16,
    paddingVertical: (singleLineHeight - measuredLineHeight) / 2,
  }
  return StyleSheet.create({
    container: { gap: 24 },
    fieldGroup: { gap: 8 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    label: { color: tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 14 },
    inputLayer: {
      flex: 1,
      minWidth: 0,
      minHeight: singleLineHeight,
      borderRadius: radius.md,
      ...insetHairlineRing,
      outlineColor: tokens.borderControl,
      backgroundColor: tokens.bgField,
    },
    inputMirror: {
      ...titleTextStyle,
      color: 'transparent',
    },
    input: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...titleTextStyle,
      textAlignVertical: 'top',
    },
    consumed: {
      backgroundColor: tokens.bgWell,
      color: tokens.hairlineStrong,
      textDecorationLine: 'underline',
    },
    error: { color: tokens.statusBadText, fontFamily: 'Geist_400Regular', fontSize: 14 },
    preview: {
      gap: 16,
      padding: SPACING.s24,
      borderRadius: radius.xl,
      ...insetHairlineRing,
      outlineColor: tokens.hairline,
      backgroundColor: tokens.bgCard,
    },
    meta: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12 },
    sentence: {
      color: tokens.fg1,
      fontFamily: 'Geist_500Medium',
      fontSize: 17,
      lineHeight: 24,
    },
    stepper: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    stepButton: {
      overflow: 'hidden',
      alignItems: 'center',
      backgroundColor: tokens.bgWell,
      borderColor: tokens.hairline,
      borderRadius: radius.full,
      borderWidth: 1,
      height: TOUCH_TARGET_MIN,
      justifyContent: 'center',
      width: TOUCH_TARGET_MIN,
    },
    quantity: {
      color: tokens.fg1,
      fontFamily: 'GeistMono_500Medium',
      fontSize: 20,
      minWidth: 28,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    pressed: { backgroundColor: tokens.bgHover },
    disabled: { opacity: 0.4 },
  })
}

interface ScheduleCorrectionProps extends Pick<HabitUnderstandingProps, 'days' | 'daily' | 'dayOptions' | 'quantity' | 'scheduleLocked' | 'onToggleDay' | 'onQuantityChange' | 'labels' | 'proposed'> {
  hidden?: boolean
  showCount: boolean
  tokens: AppTokens
  styles: ReturnType<typeof createStyles>
}

function ScheduleCorrections({ hidden = false, proposed = false, days, daily = false, dayOptions, quantity, showCount, scheduleLocked = false, onToggleDay, onQuantityChange, labels, tokens, styles }: Readonly<ScheduleCorrectionProps>) {
  const { disabled } = useHabitFormInteraction()
  scheduleLocked = scheduleLocked || disabled
  if (hidden) return null
  return (
    <>
      <WeekdayPicker label={labels.days} days={days} daily={daily} dayOptions={dayOptions} proposed={proposed} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} />
      {showCount ? (
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.less} disabled={scheduleLocked} style={({ pressed }) => [styles.stepButton, scheduleLocked ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onQuantityChange(Math.max(1, quantity - 1))}>
            <Minus size={20} strokeWidth={2} color={tokens.fg2} />
          </Pressable>
          <Text style={[styles.quantity, proposed ? { color: tokens.fg3 } : null]}>{quantity}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.more} disabled={scheduleLocked} style={({ pressed }) => [styles.stepButton, scheduleLocked ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onQuantityChange(quantity + 1)}>
            <Plus size={20} strokeWidth={2} color={tokens.fg2} />
          </Pressable>
          <Text numberOfLines={1} style={styles.meta}>{labels.count(quantity)}</Text>
        </View>
      ) : null}
    </>
  )
}

/** The weekday picker and the count stepper of a repeat, with the tokens of the current theme. The repeat step of the guided flow hosts them. */
export function HabitScheduleCorrections(props: Readonly<Omit<ScheduleCorrectionProps, 'tokens' | 'styles'>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens, 23), [tokens])
  return <ScheduleCorrections {...props} tokens={tokens} styles={styles} />
}

export function HabitRepeatInterval({ visible, intervalWeeks, scheduleLocked = false, onIntervalWeeksChange, labels }: Readonly<HabitRepeatIntervalProps>) {
  const { disabled } = useHabitFormInteraction()
  scheduleLocked = scheduleLocked || disabled
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens, 23), [tokens])
  if (!visible) return null
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.repeatLess}
        disabled={scheduleLocked || intervalWeeks <= 1}
        style={({ pressed }) => [styles.stepButton, scheduleLocked ? styles.disabled : null, pressed ? styles.pressed : null]}
        onPress={() => onIntervalWeeksChange(Math.max(1, intervalWeeks - 1))}
      >
        <Minus size={20} strokeWidth={2} color={tokens.fg2} />
      </Pressable>
      <Text style={styles.quantity}>{intervalWeeks}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.repeatMore}
        disabled={scheduleLocked || intervalWeeks >= MAX_HABIT_INTERVAL_WEEKS}
        style={({ pressed }) => [styles.stepButton, scheduleLocked ? styles.disabled : null, pressed ? styles.pressed : null]}
        onPress={() => onIntervalWeeksChange(Math.min(MAX_HABIT_INTERVAL_WEEKS, intervalWeeks + 1))}
      >
        <Plus size={20} strokeWidth={2} color={tokens.fg2} />
      </Pressable>
      <Text numberOfLines={1} style={styles.meta}>{labels.repeat(intervalWeeks)}</Text>
    </View>
  )
}
