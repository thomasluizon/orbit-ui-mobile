import { TypedTextInput } from '@/components/ui/typed-text-input'
import { useHabitFormInteraction } from './habit-form-interaction'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useMemo, useState, type ReactNode, type Ref } from 'react'
import { StyleSheet, Text, type TextInput, View } from 'react-native'
import type { HabitUnderstandingProps, HabitRepeatIntervalProps } from '@orbit/shared/utils'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { segmentHabitPhrase } from '@orbit/shared/utils'
import { Minus, Plus } from '@/components/ui/icons'
import { WeekdayPicker } from '@/components/ui/weekday-picker'
import { Proposed } from '@/components/ui/proposed'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitEmojiSelector } from './habit-emoji-selector'
import { createStyles as createFormStyles } from './styles'

type HabitUnderstandingWithDisabledEmojiProps = HabitUnderstandingProps & {
  children?: ReactNode
  inputRef?: Ref<TextInput>
  isSuggestionDisabled?: boolean
}

function useEmojiProposal(onSuggestEmoji: HabitUnderstandingProps['onSuggestEmoji'], onEmojiSelect: HabitUnderstandingProps['onEmojiSelect']) {
  const [emojiProposed, setEmojiProposed] = useState(false)
  async function suggestEmoji() {
    const result = await onSuggestEmoji?.()
    if (result?.setup) setEmojiProposed(true)
  }
  function selectEmoji(value: string) {
    setEmojiProposed(false)
    onEmojiSelect(value)
  }
  return { emojiProposed, selectEmoji, requestEmoji: onSuggestEmoji ? () => { void suggestEmoji() } : undefined }
}

export function HabitUnderstanding({
  children,
  inputRef,
  onSuggestEmoji,
  canSuggestEmoji = false,
  isEmojiSuggesting = false,
  emojiSuggestionHint,
  emojiSuggestionError,
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
  showSchedule = true,
  showCountCorrection = true,
  onValueChange,
  onEmojiSelect,
  isSuggestionDisabled = false,
  onToggleDay,
  onQuantityChange,
  labels,
}: Readonly<HabitUnderstandingWithDisabledEmojiProps>) {
  const { disabled, guard } = useHabitFormInteraction()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [titleLineHeight, setTitleLineHeight] = useState(23)
  const styles = useMemo(() => createStyles(tokens, titleLineHeight), [tokens, titleLineHeight])
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const [focused, setFocused] = useState(false)
  const { emojiProposed, selectEmoji, requestEmoji } = useEmojiProposal(onSuggestEmoji, onEmojiSelect)
  const hasValue = value.trim().length > 0
  const showPreview = showSchedule && hasValue && !isSuggestionDisabled && Boolean(sentence)
  const segments = useMemo(() => segmentHabitPhrase(value, consumed), [consumed, value])

  const emojiControl = (
    <HabitEmojiSelector
      proposed={emojiProposed || proposed}
      selectedEmoji={emoji}
      tokens={tokens}
      styles={formStyles}
      wellSize={styles.input.minHeight}
      onSelect={selectEmoji}
      onSuggest={requestEmoji}
      canSuggest={canSuggestEmoji}
      isSuggesting={isEmojiSuggesting}
      isDisabled={disabled || isSuggestionDisabled || isEmojiSuggesting}
      suggestionHint={emojiSuggestionHint}
      suggestionError={emojiSuggestionError}
    />
  )

  return (
    <View style={styles.container}>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{labels.field}</Text>
        <View testID="habit-title-row" style={styles.titleRow}>
          <View style={[styles.inputLayer, {
            outlineColor: focused ? tokens.primary : tokens.borderControl,
            outlineWidth: focused ? 2 : 1,
            outlineOffset: focused ? -2 : -1,
          }]}>
            <Text aria-hidden pointerEvents="none" style={styles.inputMirror} onTextLayout={({ nativeEvent }) => {
              const firstLine = nativeEvent.lines[0]
              if (firstLine) setTitleLineHeight(firstLine.height)
            }}>
              {hasValue ? segments.map((segment, index) => (
                <Text key={`${segment.text}-${index}`} style={segment.consumed ? styles.consumed : null}>
                  {segment.text}
                </Text>
              )) : labels.placeholder}{'\u200b'}
            </Text>
            <TypedTextInput
              ref={inputRef}
              value={value}
              multiline
              maxLength={200}
              spellCheck={false}
              accessibilityLabel={labels.field}
              accessibilityHint={error}
              editable={!disabled}
              accessibilityState={{ disabled }}
              placeholder={labels.placeholder}
              placeholderTextColor={tokens.fg3}
              selectionColor={tokens.primary}
              style={styles.input}
              onChangeText={guard(onValueChange)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </View>
          {emojiControl}
        </View>
        {onSuggestEmoji ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.error, !emojiSuggestionError ? { position: 'absolute', width: 0, height: 0 } : null]}>{emojiSuggestionError}</Text> : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        ) : null}
      </View>

      {children}

      {showPreview ? (
        <Proposed inset proposed={proposed} scope="block" label={labels.proposed}>
          <View accessibilityLabel={labels.understood} style={styles.preview}>
            <Text style={[styles.sentence, proposed ? { color: tokens.fg3 } : null]}>{sentence}</Text>
            <ScheduleCorrections hidden={!showSchedule} proposed={proposed} days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} showCount={mode === 'flexible' && showCountCorrection} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} labels={labels} tokens={tokens} styles={styles} />
          </View>
        </Proposed>
      ) : null}
      {showSchedule && hasValue && sentence === null ? (
        <View style={{ gap: 16 }}>
          <Text style={{ borderRadius: 12, backgroundColor: tokens.bgWell, color: tokens.fg2, padding: SPACING.s12, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 }}>{labels.unresolved}</Text>
          <ScheduleCorrections days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} showCount={showCountCorrection} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} labels={labels} tokens={tokens} styles={styles} />
        </View>
      ) : null}
    </View>
  )
}

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
      outlineWidth: 1,
      outlineOffset: -1,
      outlineStyle: 'solid',
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
      outlineWidth: 1,
      outlineOffset: -1,
      outlineColor: tokens.hairline,
      outlineStyle: 'solid',
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
    pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
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
