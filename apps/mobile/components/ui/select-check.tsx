import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useRadioGroupItem } from '@/components/ui/radio-group'

/** Kit Radio glyph (visual only) — for rows that manage their own press target. */
export function RadioGlyph({
  selected,
  size,
  tokens,
}: Readonly<{ selected: boolean; size: number; tokens: AppTokensV2 }>) {
  return (
    <View
      style={[
        styles.glyph,
        { width: size, height: size },
        selected
          ? { backgroundColor: tokens.primary }
          : { borderWidth: 2, borderColor: tokens.trackEmpty },
      ]}
    >
      {selected ? (
        <View
          style={{
            width: Math.round(size * 0.375),
            height: Math.round(size * 0.375),
            borderRadius: 999,
            backgroundColor: tokens.fgOnPrimary,
          }}
        />
      ) : null}
    </View>
  )
}

/** Kit Radio: 24px circle, primary fill + white dot when selected, inset 2px empty track otherwise. */
interface SelectCheckProps {
  selected: boolean
  /** Circle size in px (default 24 per kit spec). */
  size?: number
  onPress?: () => void
  accessibilityLabel?: string
  disabled?: boolean
  habitRowControl?: boolean
}

export function SelectCheck({
  selected,
  size = 24,
  onPress,
  accessibilityLabel,
  disabled = false,
  habitRowControl = false,
}: Readonly<SelectCheckProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? t('common.select')}
      accessibilityState={{ checked: selected, disabled }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: habitRowControl && pressed && !disabled ? tokens.bgHover : 'transparent',
        transform: [{ scale: habitRowControl && pressed && !disabled ? 0.96 : 1 }],
      })}
    >
      <RadioGlyph selected={selected} size={size} tokens={tokens} />
    </Pressable>
  )
}

/** Kit RadioRow: radio · Geist Sans 17 label · optional 12px color dot, hairline divider. */
interface RadioRowProps {
  index: number
  label: string
  selected: boolean
  /** Optional trailing 12px color dot. */
  dot?: string
  onPress?: () => void
  divider?: boolean
  disabled?: boolean
}

export function RadioRow({
  index,
  label,
  selected,
  dot,
  onPress,
  divider = true,
  disabled = false,
}: Readonly<RadioRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { elementRef, ...navigationProps } = useRadioGroupItem({
    disabled,
    index,
    onSelect: onPress,
    selected,
  })
  return (
    <Pressable
      {...navigationProps}
      ref={elementRef}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      style={[
        styles.radioRow,
        {
          borderBottomColor: tokens.hairline,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        },
        disabled ? styles.disabled : null,
      ]}
    >
      <RadioGlyph selected={selected} size={24} tokens={tokens} />
      <Text
        style={[styles.radioLabel, { color: tokens.fg1 }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {dot ? (
        <View style={[styles.colorDot, { backgroundColor: dot }]} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  glyph: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  radioLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Geist_400Regular',
    fontSize: 17,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  disabled: {
    opacity: 0.4,
  },
})
