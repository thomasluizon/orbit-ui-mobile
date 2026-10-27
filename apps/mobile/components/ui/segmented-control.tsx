import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import * as Primitive from '@rn-primitives/radio-group'
import { useState } from 'react'
import * as Menu from './dropdown-menu'
import { ChevronDown } from './icons'
import { getSegmentedControlLayout } from '@orbit/shared/utils'
import { SelectionFocusProvider, useSelectionFocusItem } from './selection-focus'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function SegmentOption<TValue extends string>({
  controlDisabled,
  onChange,
  option,
  selected,
  fontScale,
  minimumWidth,
  tokens,
}: Readonly<{
  controlDisabled: boolean
  onChange: (value: TValue) => void
  option: SegmentedControlOption<TValue>
  selected: boolean
  fontScale: number
  minimumWidth: number
  tokens: ReturnType<typeof createTokensV2>
}>) {
  const disabled = controlDisabled || Boolean(option.disabled)
  const select = () => {
    if (!disabled && !selected) onChange(option.value)
  }
  const { elementRef, onFocus, focusable } = useSelectionFocusItem({
    disabled,
    onSelect: select,
    selected,
  })
  return (
    <Primitive.Item value={option.value} disabled={disabled} asChild><Pressable focusInset selectionRingWidth={2}
      onFocus={onFocus} focusable={focusable}
      ref={elementRef}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      testID={`segment-${option.value}-${selected ? 'selected' : 'unselected'}-${disabled ? 'disabled' : 'enabled'}`}
      style={({ pressed }) => [
        styles.option,
        { minWidth: minimumWidth },
        selected
          ? { backgroundColor: tokens.bgHover }
          : styles.unselected,
        disabled ? styles.disabled : null,
        pressed ? [styles.pressed, { backgroundColor: tokens.bgHover }] : null,
      ]}
    >
      <Text numberOfLines={fontScale > 1.3 ? undefined : 1} style={[styles.label, { color: selected ? tokens.fg1 : tokens.fg2 }]}>
        {option.label}
      </Text>
    </Pressable></Primitive.Item>
  )
}

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  const { fontScale } = useWindowDimensions()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const signature = JSON.stringify([fontScale, props.options.map((option) => option.label)])
  const [measurement, setMeasurement] = useState<{ signature: string; words: Record<string, number> }>({ signature, words: {} })
  if (measurement.signature !== signature) setMeasurement({ signature, words: {} })
  const [availableWidth, setAvailableWidth] = useState(0)
  const words = props.options.map((option) => fontScale > 1.3 ? option.label.split(/\s+/) : [option.label])
  const measuredWords = measurement.signature === signature ? measurement.words : {}
  const layout = getSegmentedControlLayout(words.map((labelWords) => labelWords.map((word) => measuredWords[word] ?? 0)), availableWidth, 20)
  const { minimumWidths } = layout
  const ready = words.flat().every((word) => measuredWords[word] !== undefined)
  const folded = ready && layout.folded
  const selected = props.options.find((option) => option.value === props.value)!
  const changeSelection = (value: string) => {
    const option = props.options.find((candidate) => candidate.value === value && !candidate.disabled)
    if (option && !props.disabled && option.value !== props.value) props.onChange(option.value)
  }

  return (
    <View testID="segment-frame" onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)} style={[styles.frame, props.fullWidth ? styles.fullWidth : null]}>
      <View testID="segment-measurements" key={signature} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.measure}>
        {[...new Set(words.flat())].map((word) => <Text key={word} testID="segment-measure" style={[styles.label, styles.measureWord]}
          onTextLayout={(event) => {
            const width = Math.ceil(Math.max(...event.nativeEvent.lines.map((line) => line.width)))
            setMeasurement((previous) => previous.signature !== signature || previous.words[word] === width ? previous : { signature, words: { ...previous.words, [word]: width } })
          }}>{word}</Text>)}
      </View>
      {folded ? <Menu.Root>
        <Menu.Trigger asChild disabled={props.disabled}><Pressable accessibilityRole="button" accessibilityLabel={`${props.label}: ${selected.label}`} disabled={props.disabled} testID="segmented-trigger"
          style={[styles.trigger, { backgroundColor: tokens.bgWell }, props.disabled ? styles.disabled : null]}>
          <Text style={[styles.label, { color: tokens.fg1 }]}>{selected.label}</Text><ChevronDown size={20} color={tokens.fg1} accessible={false} />
        </Pressable></Menu.Trigger>
        <Menu.Content title={props.label} items={props.options.map((option) => ({ id: option.value, label: option.label, checked: option.value === props.value, disabled: props.disabled || option.disabled }))} onSelect={changeSelection} />
      </Menu.Root> : <SelectionFocusProvider><Primitive.Root disabled={props.disabled} value={props.value} onValueChange={changeSelection}
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      testID={`segmented-control-${props.disabled ? 'disabled' : 'enabled'}`}
      style={[
        styles.group,
        props.fullWidth ? styles.fullWidth : null,
        { backgroundColor: tokens.bgWell },
      ]}
    >
      {props.options.map((option, index) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          onChange={props.onChange}
          option={option}
          selected={option.value === props.value}
          fontScale={fontScale}
          minimumWidth={minimumWidths[index]!}
          tokens={tokens}
        />
      ))}
    </Primitive.Root></SelectionFocusProvider>}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'flex-start', maxWidth: '100%' },
  measure: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', opacity: 0, height: 0, overflow: 'hidden' },
  measureWord: { flexShrink: 0, maxWidth: undefined },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.s8, minHeight: TOUCH_TARGET_MIN, paddingHorizontal: SPACING.s12, paddingVertical: SPACING.s8, borderRadius: 12 },
  group: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    maxWidth: '100%',
    padding: SPACING.s4,
  },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  disabled: {
    opacity: 0.4,
  },
  option: {
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    flexBasis: 'auto',
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: SPACING.s8,
    paddingVertical: SPACING.s4,
  },
  unselected: {
    borderColor: 'transparent',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
    maxWidth: '100%',
  },
})
