import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { SegmentedControlProps } from '@orbit/shared/contracts/navigation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SegmentedControl(props: Readonly<SegmentedControlProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      testID="segmented-control"
      style={[
        styles.group,
        { backgroundColor: tokens.bgField, borderColor: tokens.hairline },
        props.disabled ? styles.disabled : null,
      ]}
    >
      {props.options.map((option) => {
        const selected = option.id === props.value
        const disabled = props.disabled || option.disabled
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            testID={`segment-${option.id}`}
            onPress={() => {
              if (!selected) props.onChange(option.id)
            }}
            style={({ pressed }) => [
              styles.option,
              selected
                ? { backgroundColor: tokens.bgElev2, borderColor: tokens.primary }
                : styles.unselected,
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
