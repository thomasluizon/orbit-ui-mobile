import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { HabitUnderstandingProps } from '@orbit/shared/utils'
import { segmentHabitPhrase } from '@orbit/shared/utils'
import { Minus, Plus } from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HabitEmojiSelector } from './habit-emoji-selector'
import { createStyles as createFormStyles } from './styles'

export function HabitUnderstanding({
  value,
  error,
  emoji,
  days,
  dayOptions,
  quantity,
  sentence,
  consumed,
  proposed = false,
  onValueChange,
  onEmojiSelect,
  onToggleDay,
  onQuantityChange,
  labels,
}: Readonly<HabitUnderstandingProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const hasValue = value.trim().length > 0
  const segments = useMemo(() => segmentHabitPhrase(value, consumed), [consumed, value])

  return (
    <View style={styles.container}>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{labels.field}</Text>
        <View style={styles.inputLayer}>
          <Text aria-hidden style={styles.inputMirror}>
            {hasValue ? segments.map((segment, index) => (
              <Text key={`${segment.text}-${index}`} style={segment.consumed ? styles.consumed : null}>
                {segment.text}
              </Text>
            )) : <Text style={styles.placeholder}>{labels.placeholder}</Text>}
          </Text>
          <TextInput
            value={value}
            multiline
            maxLength={200}
            spellCheck={false}
            accessibilityLabel={labels.field}
            accessibilityState={{ disabled: false }}
            selectionColor={tokens.primary}
            style={styles.input}
            onChangeText={onValueChange}
          />
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        ) : null}
      </View>

      {hasValue ? (
        <Proposed proposed={proposed} scope="block" label={labels.proposed}>
          <View accessibilityLabel={labels.understood} style={styles.preview}>
            <View style={styles.previewHeader}>
              <HabitEmojiSelector
                selectedEmoji={emoji}
                tokens={tokens}
                styles={formStyles}
                wellSize={46}
                onSelect={onEmojiSelect}
              />
              <Text style={styles.meta}>{proposed ? labels.understoodAstra : labels.understood}</Text>
            </View>

            <Text style={styles.sentence}>{sentence ?? labels.unresolved}</Text>

            <View accessibilityLabel={labels.days} style={styles.days}>
              {dayOptions.map((day) => {
                const selected = days.includes(day.value)
                return (
                  <Pressable
                    key={day.value}
                    accessibilityRole="button"
                    accessibilityLabel={day.accessibleLabel}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.day,
                      selected ? styles.daySelected : styles.dayIdle,
                      pressed ? styles.pressed : null,
                    ]}
                    onPress={() => onToggleDay(day.value)}
                  >
                    <Text style={selected ? styles.dayTextSelected : styles.dayText}>
                      {day.label.charAt(0)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.less}
                style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
                onPress={() => onQuantityChange(Math.max(1, quantity - 1))}
              >
                <Minus size={20} strokeWidth={2} color={tokens.fg2} />
              </Pressable>
              <Text style={styles.quantity}>{quantity}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.more}
                style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
                onPress={() => onQuantityChange(Math.min(7, quantity + 1))}
              >
                <Plus size={20} strokeWidth={2} color={tokens.fg2} />
              </Pressable>
              <Text style={styles.meta}>{labels.count}</Text>
            </View>
          </View>
        </Proposed>
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
      borderColor: tokens.hairline,
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
    placeholder: { color: tokens.fg4 },
    error: { color: tokens.statusBad, fontFamily: 'Geist_400Regular', fontSize: 14 },
    preview: {
      gap: 16,
      padding: 24,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: tokens.hairline,
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
    days: { flexDirection: 'row', gap: 4 },
    day: { alignItems: 'center', borderRadius: radius.full, height: 44, justifyContent: 'center', width: 44 },
    dayIdle: { backgroundColor: tokens.bgWell, borderColor: tokens.hairline, borderWidth: 1 },
    daySelected: { backgroundColor: tokens.primaryDim, borderColor: tokens.primary, borderWidth: 1.5 },
    dayText: { color: tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 14 },
    dayTextSelected: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 },
    stepper: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    stepButton: {
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
      fontFamily: 'Roboto_500Medium',
      fontSize: 20,
      minWidth: 28,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    pressed: { opacity: 0.72 },
  })
}
