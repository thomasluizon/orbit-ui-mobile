import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { StyleSheet, Text } from 'react-native'
import type { SegmentedControlOption, SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-group'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function SegmentOption<TValue extends string>({
  controlDisabled,
  index,
  onChange,
  option,
  selected,
  tokens,
}: Readonly<{
  controlDisabled: boolean
  index: number
  onChange: (value: TValue) => void
  option: SegmentedControlOption<TValue>
  selected: boolean
  tokens: ReturnType<typeof createTokensV2>
}>) {
  const disabled = controlDisabled || Boolean(option.disabled)
  const select = () => {
    if (!disabled && !selected) onChange(option.value)
  }
  const { elementRef, onKeyDown, tabIndex } = useRadioGroupItem({
    disabled,
    index,
    onSelect: select,
    selected,
  })
  const keyProps = { onKeyDown }

  return (
    <Pressable
      {...keyProps}
      ref={elementRef}
      tabIndex={tabIndex}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      testID={`segment-${option.value}-${selected ? 'selected' : 'unselected'}-${disabled ? 'disabled' : 'enabled'}`}
      onPress={select}
      style={({ pressed }) => [
        styles.option,
        selected
          ? { backgroundColor: tokens.bgHover, borderColor: tokens.primary }
          : styles.unselected,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text numberOfLines={1} style={[styles.label, { color: selected ? tokens.fg1 : tokens.fg2 }]}>
        {option.label}
      </Text>
    </Pressable>
  )
}

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <RadioGroup
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      testID={`segmented-control-${props.disabled ? 'disabled' : 'enabled'}`}
      style={[
        styles.group,
        { backgroundColor: tokens.bgField, borderColor: tokens.borderControl },
      ]}
    >
      {props.options.map((option, index) => (
        <SegmentOption
          key={option.value}
          controlDisabled={Boolean(props.disabled)}
          index={index}
          onChange={props.onChange}
          option={option}
          selected={option.value === props.value}
          tokens={tokens}
        />
      ))}
    </RadioGroup>
  )
}

const styles = StyleSheet.create({
  group: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    maxWidth: '100%',
    padding: 4,
  },
  disabled: {
    opacity: 0.4,
  },
  option: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 12,
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
  },
})
