import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useMemo, useRef, useState } from 'react'
import { InsetFocusPressable } from './inset-focus-pressable'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Gesture, GestureDetector, GestureHandlerRootView, type NativeGesture } from 'react-native-gesture-handler'
import type { TimeFieldProps } from '@orbit/shared/contracts/forms'
import {
  DAY_PERIODS,
  resolveHourCycle,
  changeTimeFieldInput,
  commitTimeFieldPickerDraft,
  initialTimeFieldPickerDraft,
  presentTimeFieldValue,
  selectTimeFieldHour,
  selectTimeFieldMinute,
  selectTimeFieldPeriod,
  HOURS_12,
  HOURS_24,
  MINUTES,
  padTimePart,
  to12Hour,
  type DayPeriod,
} from '@orbit/shared/utils'
import { Clock3, X } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'

const ROW_HEIGHT = TOUCH_TARGET_MIN
const COLUMN_HEIGHT = 220

type Tokens = ReturnType<typeof createTokensV2>

type MobileTimeFieldProps = TimeFieldProps & {
  containerStyle?: StyleProp<ViewStyle>
}

interface TimeColumnProps {
  values: readonly (number | string)[]
  selected: number | string
  formatValue: (value: number | string) => string
  label: string
  tokens: Tokens
  onSelect: (value: number | string) => void
}

function pressedOptionBackground(tokens: Tokens, selected: boolean, pressed: boolean) {
  return selected || pressed ? tokens.bgHover : 'transparent'
}

function TimeOption({
  formattedValue,
  onSelect,
  selected,
  scrollGesture,
  tokens,
}: Readonly<{
  formattedValue: string
  onSelect: () => void
  selected: boolean
  scrollGesture: NativeGesture
  tokens: Tokens
}>) {
  const [touchPressed, setTouchPressed] = useState(false)
  const { elementRef, onActivate, ...navigationProps } = useRadioGroupItem({
    disabled: false,
    onSelect,
    selected,
  })
  const tapGesture = Gesture.Tap()
    .maxDistance(8)
    .maxDuration(2 ** 31 - 1)
    .simultaneousWithExternalGesture(scrollGesture)
    .runOnJS(true)
    .onBegin(() => setTouchPressed(true))
    .onEnd((_event, success) => { if (success) onActivate() })
    .onFinalize(() => setTouchPressed(false))
  return (
    <GestureDetector gesture={tapGesture}>
      <InsetFocusPressable
        {...navigationProps}
        focusColor={tokens.fg1}
        ref={elementRef}
        accessibilityLabel={formattedValue}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        onPress={onActivate}
        style={({ pressed }) => [
          styles.option,
          { backgroundColor: pressedOptionBackground(tokens, selected, pressed || touchPressed) },
        ]}
      >
        {selected ? <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: tokens.primary, borderRadius: 12 }]} /> : null}
        <Text
          style={[
            styles.optionLabel,
            { color: tokens.fg1 },
          ]}
        >
          {formattedValue}
        </Text>
      </InsetFocusPressable>
    </GestureDetector>
  )
}

function TimeColumn({
  values,
  selected,
  formatValue,
  label,
  tokens,
  onSelect,
}: Readonly<TimeColumnProps>) {
  const scrollGesture = useMemo(() => Gesture.Native()
    .shouldActivateOnStart(true)
    .disallowInterruption(true)
    .shouldCancelWhenOutside(false)
    .runOnJS(true), [])
  const listRef = useRef<ScrollView>(null)
  const viewportHeightRef = useRef(0)
  const selectedIndex = values.indexOf(selected)

  function revealSelected(height: number) {
    if (selectedIndex < 0 || height <= 0) return
    const contentHeight = values.length * ROW_HEIGHT + 8
    const centeredOffset = 4 + selectedIndex * ROW_HEIGHT - height / 2 + ROW_HEIGHT / 2
    listRef.current?.scrollTo({
      y: Math.max(0, Math.min(centeredOffset, contentHeight - height)),
      animated: false,
    })
  }

  return (
    <RadioGroup accessibilityLabel={label} style={styles.column}>
      <GestureHandlerRootView style={styles.columnScroll}>
        <GestureDetector gesture={scrollGesture}>
          <ScrollView
            ref={listRef}
            contentContainerStyle={styles.columnContent}
            nestedScrollEnabled={false}
            overScrollMode="never"
            onLayout={(event) => {
              viewportHeightRef.current = event.nativeEvent.layout.height
              revealSelected(viewportHeightRef.current)
            }}
            onContentSizeChange={() => revealSelected(viewportHeightRef.current)}
            showsVerticalScrollIndicator
            style={styles.columnScroll}
          >
            {values.map((option) => (
              <TimeOption
                key={String(option)}
                formattedValue={formatValue(option)}
                selected={option === selected}
                scrollGesture={scrollGesture}
                tokens={tokens}
                onSelect={() => onSelect(option)}
              />
            ))}
          </ScrollView>
        </GestureDetector>
      </GestureHandlerRootView>
    </RadioGroup>
  )
}

interface TimeEntryProps {
  canClear: boolean
  clearLabel: string
  disabled: boolean
  error?: string
  focused: boolean
  hint?: string
  inputValue: string
  label: string
  onBlur: () => void
  onChange: (value: string) => void
  onClear?: () => void
  onFocus: () => void
  onOpenPicker: () => void
  placeholder?: string
  selectTimeLabel: string
  tokens: Tokens
  usesNumericKeyboard: boolean
}

function TimeEntry({
  canClear,
  clearLabel,
  disabled,
  error,
  focused,
  hint,
  inputValue,
  label,
  onBlur,
  onChange,
  onClear,
  onFocus,
  onOpenPicker,
  placeholder,
  selectTimeLabel,
  tokens,
  usesNumericKeyboard,
}: Readonly<TimeEntryProps>) {
  return (
    <>
      <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: tokens.bgField,
            borderColor: focused ? tokens.primary : error ? tokens.statusBad : tokens.borderControl,
            borderWidth: error || focused ? 2 : 1,
          },
          disabled ? styles.disabled : null,
        ]}
      >
        <TextInput
          value={inputValue}
          onChangeText={onChange}
          editable={!disabled}
          keyboardType={usesNumericKeyboard ? 'number-pad' : 'default'}
          placeholder={placeholder}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          accessibilityState={{ disabled }}
          onFocus={onFocus}
          onBlur={onBlur}
          style={[styles.input, { color: tokens.fg1 }]}
        />
        <Pressable
          onPress={onOpenPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selectTimeLabel}`}
          accessibilityState={{ disabled }}
          style={styles.icon}
        >
          <Clock3 size={20} color={tokens.fg3} strokeWidth={1.8} />
        </Pressable>
        {canClear ? (
          <Pressable
            onPress={onClear}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            style={styles.icon}
          >
            <X size={20} color={tokens.fg3} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </View>
      {error || hint ? (
        <Text
          accessibilityRole={error ? 'alert' : undefined}
          style={[styles.caption, { color: error ? tokens.statusBadText : tokens.fg3 }]}
        >
          {error ?? hint}
        </Text>
      ) : null}
    </>
  )
}

export function TimeField({
  label,
  value,
  onChange,
  onClear,
  commitTypedClearOnBlur = false,
  placeholder,
  accessibilityLabel,
  hourCycle,
  hint,
  disabled = false,
  error,
  containerStyle,
}: Readonly<MobileTimeFieldProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const resolvedProfileHourCycle = resolveHourCycle(profile?.uses24HourClock, i18n.language)
  const resolvedHourCycle = hourCycle ?? resolvedProfileHourCycle
  const resolvedLabel = label ?? accessibilityLabel ?? placeholder ?? t('common.selectTime')
  const presentedValue = presentTimeFieldValue(value, resolvedHourCycle)
  const [focused, setFocused] = useState(false)
  const [inputDraft, setInputDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pickerDraft, setPickerDraft] = useState({ hour24: 9, minute: 0 })
  const { sheetRef, closeSheet } = useSheetHost()

  const canClear = !disabled && value.length > 0 && onClear != null
  const { hour12, period } = to12Hour(pickerDraft.hour24)

  function handleChange(displayValue: string) {
    const change = changeTimeFieldInput(displayValue, inputDraft ?? presentedValue, resolvedHourCycle)
    setInputDraft(change.draft)
    if (change.clear) {
      if (!commitTypedClearOnBlur) onClear?.()
      return
    }
    if (change.parsed) onChange(change.parsed)
  }

  function openPicker() {
    const now = new Date()
    setPickerDraft(initialTimeFieldPickerDraft(value, now))
    setOpen(true)
  }

  function applyDraft() {
    closeSheet(() => {
      setOpen(false)
      onChange(commitTimeFieldPickerDraft(pickerDraft))
    })
  }

  return (
    <View style={[styles.root, containerStyle]} data-error={error ? '' : undefined}>
      <TimeEntry
        canClear={canClear}
        clearLabel={t('common.clear')}
        disabled={disabled}
        error={error}
        focused={focused}
        hint={hint}
        inputValue={inputDraft ?? presentedValue}
        label={resolvedLabel}
        onBlur={() => {
          setFocused(false)
          if (commitTypedClearOnBlur && inputDraft === '') onClear?.()
          setInputDraft(null)
        }}
        onChange={handleChange}
        onClear={onClear}
        onFocus={() => {
            setFocused(true)
            setInputDraft(presentedValue)
        }}
        onOpenPicker={openPicker}
        placeholder={placeholder}
        selectTimeLabel={t('common.selectTime')}
        tokens={tokens}
        usesNumericKeyboard={resolvedHourCycle === 'h23'}
      />
      {open ? (
        <Sheet
          ref={sheetRef}
          boundedBody
          open
          title={t('common.selectTime')}
          onClose={() => setOpen(false)}
          actions={<PillButton size="sm" onClick={applyDraft}>{t('common.done')}</PillButton>}
        >
          <View style={styles.columns}>
            <TimeColumn
              values={resolvedHourCycle === 'h23' ? HOURS_24 : HOURS_12}
              selected={resolvedHourCycle === 'h23' ? pickerDraft.hour24 : hour12}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.hours')}
              tokens={tokens}
              onSelect={(option) =>
                setPickerDraft((current) => selectTimeFieldHour(current, Number(option), resolvedHourCycle))
              }
            />
            <TimeColumn
              values={MINUTES}
              selected={pickerDraft.minute}
              formatValue={(option) => padTimePart(Number(option))}
              label={t('common.minutes')}
              tokens={tokens}
              onSelect={(option) => setPickerDraft((current) => selectTimeFieldMinute(current, Number(option)))}
            />
            {resolvedHourCycle === 'h23' ? null : (
              <TimeColumn
                values={DAY_PERIODS}
                selected={period}
                formatValue={String}
                label={t('common.amPm')}
                tokens={tokens}
                onSelect={(option) =>
                  setPickerDraft((current) => selectTimeFieldPeriod(current, option as DayPeriod))
                }
              />
            )}
          </View>
        </Sheet>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 8 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  inputRow: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    minHeight: 54,
    width: '100%',
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    fontFamily: 'GeistMono_400Regular',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  icon: { alignItems: 'center', justifyContent: 'center', minHeight: 52, width: 48 },
  caption: { fontFamily: 'Geist_400Regular', fontSize: 12 },
  disabled: { opacity: 0.6 },
  columns: { flexDirection: 'row', gap: 8, height: COLUMN_HEIGHT, flexShrink: 1, minHeight: ROW_HEIGHT },
  column: { flex: 1 },
  columnScroll: { flex: 1 },
  columnContent: { paddingVertical: 4 },
  option: {
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    height: ROW_HEIGHT,
    justifyContent: 'center',
  },
  optionLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 16 },
})
