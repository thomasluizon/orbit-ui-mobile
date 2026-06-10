import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SettingsRowProps {
  label: string
  /** Optional right-side value text. */
  value?: string
  /** Override color for the value text. Defaults to fg3. */
  valueColor?: string
  /** Trailing accessory; `'chevron'` is default, `'none'` hides it. */
  accessory?: 'chevron' | 'none'
  onPress?: () => void
  /** Render the value in mono with tabular nums (counts, dates). */
  mono?: boolean
  /** Small leading dot (status color or scheme swatch). */
  leadingDot?: string
  /** Slot rendered between the value and the chevron (e.g. ProTag, QuietLink). */
  children?: ReactNode
  /** Hairline rule below the row; disable when helper text follows. */
  divider?: boolean
}

/**
 * v8 SettingsRow: hairline-separated row used in profile / streak / about.
 * Composed: leading dot · label · value (optional) · trailing slot · chevron.
 */
export function SettingsRow({
  label,
  value,
  valueColor,
  accessory = 'chevron',
  onPress,
  mono = false,
  leadingDot,
  children,
  divider = true,
}: Readonly<SettingsRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed && onPress ? tokens.bgElev : 'transparent',
          borderBottomColor: tokens.hairline,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <View style={styles.leadingBlock}>
        {leadingDot ? (
          <View
            style={[styles.dot, { backgroundColor: leadingDot }]}
          />
        ) : null}
        <Text
          style={[styles.label, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <View style={styles.trailingBlock}>
        {value ? (
          <Text
            style={[
              mono ? styles.valueMono : styles.value,
              { color: valueColor ?? tokens.fg3 },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {children}
        {accessory === 'chevron' ? (
          <ChevronRight size={16} color={tokens.fg4} strokeWidth={1.5} />
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    flexShrink: 1,
  },
  trailingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  value: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    maxWidth: 220,
  },
  valueMono: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    maxWidth: 220,
  },
})
