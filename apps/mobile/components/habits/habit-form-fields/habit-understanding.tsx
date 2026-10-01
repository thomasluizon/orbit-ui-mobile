import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useMemo, useState, type Ref } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { HabitUnderstandingProps, HabitRepeatIntervalProps } from '@orbit/shared/utils'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { segmentHabitPhrase } from '@orbit/shared/utils'
import { Minus, Plus } from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitEmojiSelector } from './habit-emoji-selector'
import { createStyles as createFormStyles } from './styles'

type HabitUnderstandingWithDisabledEmojiProps = HabitUnderstandingProps & {
  inputRef?: Ref<TextInput>
  isSuggestionDisabled?: boolean
}

export function HabitUnderstanding({
  inputRef,
  value,
  error,
  emoji,
  days,
  daily = false,
  dayOptions,
  quantity,
  mode,
  sentence,
  consumed,
  proposed = false,
  scheduleLocked = false,
  onValueChange,
  onEmojiSelect,
  isSuggestionDisabled = false,
  onToggleDay,
  onQuantityChange,
  labels,
}: Readonly<HabitUnderstandingWithDisabledEmojiProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const [focused, setFocused] = useState(false)
  const hasValue = value.trim().length > 0
  const segments = useMemo(() => segmentHabitPhrase(value, consumed), [consumed, value])

  return (
    <View style={styles.container}>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{labels.field}</Text>
        <View style={[styles.inputLayer, {
          borderColor: focused ? tokens.primary : tokens.borderControl,
          borderWidth: focused ? 2 : 1,
        }]}>
          <Text aria-hidden style={styles.inputMirror}>
            {hasValue ? segments.map((segment, index) => (
              <Text key={`${segment.text}-${index}`} style={segment.consumed ? styles.consumed : null}>
                {segment.text}
              </Text>
            )) : <Text style={styles.placeholder}>{labels.placeholder}</Text>}
          </Text>
          <TextInput
            ref={inputRef}
            value={value}
            multiline
            maxLength={200}
            spellCheck={false}
            accessibilityLabel={labels.field}
            accessibilityHint={error}
            accessibilityState={{ disabled: false }}
            selectionColor={tokens.primary}
            style={styles.input}
            onChangeText={onValueChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        ) : null}
      </View>

      <Proposed inset proposed={proposed && sentence !== null} scope="block" label={labels.proposed}>
        <View accessibilityLabel={sentence !== null ? labels.understood : undefined} style={sentence !== null ? styles.preview : undefined}>
          <View style={styles.previewHeader}>
            <HabitEmojiSelector
              selectedEmoji={emoji}
              tokens={tokens}
              styles={formStyles}
              wellSize={46}
              onSelect={onEmojiSelect}
              isDisabled={isSuggestionDisabled}
            />
            {sentence !== null ? <Text style={styles.meta}>{proposed ? labels.understoodAstra : labels.understood}</Text> : null}
          </View>

          {sentence !== null ? (
            <>
              <Text style={styles.sentence}>{sentence}</Text>

              <ScheduleCorrections days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} showCount={mode === 'flexible'} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} labels={labels} tokens={tokens} styles={styles} />
            </>
          ) : null}
        </View>
      </Proposed>
      {hasValue && sentence === null ? (
        <View style={{ gap: 16 }}>
          <Text style={{ borderRadius: 12, backgroundColor: tokens.bgWell, color: tokens.fg2, padding: 12, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 }}>{labels.unresolved}</Text>
          <ScheduleCorrections days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} showCount scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} labels={labels} tokens={tokens} styles={styles} />
        </View>
      ) : null}
    </View>
  )
}

type AppTokens = ReturnType<typeof createTokensV2>

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: { gap: 24 },
    fieldGroup: { gap: 8 },
    label: { color: tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 14 },
    inputLayer: {
      minHeight: 92,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tokens.borderControl,
      backgroundColor: tokens.bgField,
    },
    inputMirror: {
      minHeight: 90,
      color: tokens.fg1,
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 23,
      padding: 16,
    },
    input: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      minHeight: 90,
      color: 'transparent',
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 23,
      padding: 16,
      textAlignVertical: 'top',
    },
    consumed: {
      backgroundColor: tokens.bgWell,
      textDecorationLine: 'underline',
      textDecorationColor: tokens.hairlineStrong,
    },
    placeholder: { color: tokens.fg3 },
    error: { color: tokens.statusBadText, fontFamily: 'Geist_400Regular', fontSize: 14 },
    preview: {
      gap: 16,
      padding: 24,
      borderRadius: radius.xl,
      outlineWidth: 1,
      outlineOffset: -1,
      outlineColor: tokens.hairline,
      outlineStyle: 'solid',
      backgroundColor: tokens.bgCard,
    },
    previewHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    meta: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12 },
    sentence: {
      color: tokens.fg1,
      fontFamily: 'Geist_500Medium',
      fontSize: 17,
      lineHeight: 24,
    },
    days: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    day: { overflow: 'hidden', alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
    dayIdle: { backgroundColor: tokens.bgWell, borderColor: tokens.hairline, borderWidth: 1 },
    daySelected: { backgroundColor: tokens.primaryDim, borderColor: tokens.primary, borderWidth: 1.5 },
    dayText: { color: tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 14 },
    dayTextSelected: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 },
    stepper: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    stepButton: {
      overflow: 'hidden',
      alignItems: 'center',
      backgroundColor: tokens.bgWell,
      borderColor: tokens.hairline,
      borderRadius: radius.full,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    quantity: {
      color: tokens.fg1,
      fontFamily: 'GeistMono_500Medium',
      fontSize: 20,
      minWidth: 28,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
    disabled: { opacity: 0.4 },
  })
}

interface ScheduleCorrectionProps extends Pick<HabitUnderstandingProps, 'days' | 'daily' | 'dayOptions' | 'quantity' | 'scheduleLocked' | 'onToggleDay' | 'onQuantityChange' | 'labels'> {
  showCount: boolean
  tokens: AppTokens
  styles: ReturnType<typeof createStyles>
}

function ScheduleCorrections({ days, daily = false, dayOptions, quantity, showCount, scheduleLocked = false, onToggleDay, onQuantityChange, labels, tokens, styles }: Readonly<ScheduleCorrectionProps>) {
  return (
    <>
      <View accessibilityLabel={labels.days} style={styles.days}>
        {dayOptions.map((day) => {
          const selected = daily || days.includes(day.value)
          return (
            <Pressable key={day.value} accessibilityRole="button" accessibilityLabel={day.accessibleLabel} accessibilityState={{ selected, ...(scheduleLocked ? { disabled: true } : {}) }} disabled={scheduleLocked} style={({ pressed }) => [styles.day, selected ? styles.daySelected : styles.dayIdle, scheduleLocked ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onToggleDay(day.value)}>
              <Text style={selected ? styles.dayTextSelected : styles.dayText}>{day.label.charAt(0)}</Text>
            </Pressable>
          )
        })}
      </View>
      {showCount ? (
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.less} disabled={scheduleLocked} style={({ pressed }) => [styles.stepButton, scheduleLocked ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onQuantityChange(Math.max(1, quantity - 1))}>
            <Minus size={20} strokeWidth={2} color={tokens.fg2} />
          </Pressable>
          <Text style={styles.quantity}>{quantity}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={labels.more} disabled={scheduleLocked} style={({ pressed }) => [styles.stepButton, scheduleLocked ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onQuantityChange(quantity + 1)}>
            <Plus size={20} strokeWidth={2} color={tokens.fg2} />
          </Pressable>
          <Text numberOfLines={1} style={styles.meta}>{labels.count(quantity)}</Text>
        </View>
      ) : null}
    </>
  )
}

export function HabitRepeatInterval({ visible, intervalWeeks, scheduleLocked = false, onIntervalWeeksChange, labels }: Readonly<HabitRepeatIntervalProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens), [tokens])
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
