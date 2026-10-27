import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { StyleSheet, Text, useWindowDimensions } from 'react-native'
import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import * as Primitive from '@rn-primitives/radio-group'
import { SelectionFocusProvider, useSelectionFocusItem } from './selection-focus'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function SegmentOption<TValue extends string>({
  controlDisabled,
  onChange,
  option,
  selected,
  fontScale,
  tokens,
}: Readonly<{
  controlDisabled: boolean
  onChange: (value: TValue) => void
  option: SegmentedControlOption<TValue>
  selected: boolean
  fontScale: number
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

  return (
    <SelectionFocusProvider><Primitive.Root disabled={props.disabled} value={props.value} onValueChange={(value) => {
      const option = props.options.find((candidate) => candidate.value === value && !candidate.disabled)
      if (option && !props.disabled && option.value !== props.value) props.onChange(option.value)
    }}
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
      {props.options.map((option) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          onChange={props.onChange}
          option={option}
          selected={option.value === props.value}
          fontScale={fontScale}
          tokens={tokens}
        />
      ))}
    </Primitive.Root></SelectionFocusProvider>
  )
}

const styles = StyleSheet.create({
  group: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    flexShrink: 0,
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
