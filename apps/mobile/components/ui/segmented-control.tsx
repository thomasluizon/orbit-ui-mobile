import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SegmentedControl<TValue extends string>(props: Readonly<SegmentedControlProps<TValue>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      testID={`segmented-control-${props.disabled ? 'disabled' : 'enabled'}`}
      style={[
        styles.group,
        { backgroundColor: tokens.bgField, borderColor: tokens.borderControl },
      ]}
    >
      {props.options.map((option) => {
        const selected = option.value === props.value
        const disabled = props.disabled || option.disabled
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            testID={`segment-${option.value}-${selected ? 'selected' : 'unselected'}-${disabled ? 'disabled' : 'enabled'}`}
            onPress={() => {
              if (!disabled && !selected) props.onChange(option.value)
            }}
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
      })}
    </View>
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
