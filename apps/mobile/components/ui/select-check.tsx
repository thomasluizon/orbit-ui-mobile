import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function RadioGlyph({
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
          : { borderWidth: 2, borderColor: tokens.fg4 },
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

/** Kit Radio: 24px circle — primary fill + white dot when selected, inset 2px fg-4 ring otherwise. */
interface SelectCheckProps {
  selected: boolean
  /** Circle size in px (default 24 per kit spec). */
  size?: number
  onPress?: () => void
  accessibilityLabel?: string
}

export function SelectCheck({
  selected,
  size = 24,
  onPress,
  accessibilityLabel,
}: Readonly<SelectCheckProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? 'Select'}
      accessibilityState={{ checked: selected }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RadioGlyph selected={selected} size={size} tokens={tokens} />
    </Pressable>
  )
}

/** Kit RadioRow: radio · Rubik 17 label · optional 12px color dot, hairline divider. */
interface RadioRowProps {
  label: string
  selected: boolean
  /** Optional trailing 12px color dot. */
  dot?: string
  onPress?: () => void
  divider?: boolean
}

export function RadioRow({
  label,
  selected,
  dot,
  onPress,
  divider = true,
}: Readonly<RadioRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={[
        styles.radioRow,
        {
          borderBottomColor: tokens.hairline,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <RadioGlyph selected={selected} size={24} tokens={tokens} />
      <Text
        style={[styles.radioLabel, { color: tokens.fg1 }]}
        numberOfLines={1}
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
    fontFamily: 'Rubik_400Regular',
    fontSize: 17,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
})
