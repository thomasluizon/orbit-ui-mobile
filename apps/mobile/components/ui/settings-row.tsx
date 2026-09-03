import type { ComponentType, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight, type IconProps } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type IconComponent = ComponentType<IconProps>

interface SettingsRowProps {
  label: string
  /** Secondary line under the label (Geist Sans 14 fg-3). */
  desc?: string
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
  /** Leading Tabler icon, rendered 22/1.8 centered in a 26px slot. */
  icon?: IconComponent
  /** Destructive row: title and icon render in status-bad. */
  danger?: boolean
  /** Slot rendered between the value and the chevron (e.g. Switch, ProTag). */
  children?: ReactNode
  /** Hairline rule below the row; disable when helper text follows. */
  divider?: boolean
}

/**
 * Kit ListRow: flat hairline-separated row used in profile / settings / about.
 * Composed: leading icon/dot · title (+ desc) · value (optional) · trailing slot · chevron.
 */
export function SettingsRow({
  label,
  desc,
  value,
  valueColor,
  accessory = 'chevron',
  onPress,
  mono = false,
  leadingDot,
  icon: LeadingIcon,
  danger = false,
  children,
  divider = true,
}: Readonly<SettingsRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const titleColor = danger ? tokens.statusBad : tokens.fg1

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor:
            pressed && onPress ? tokens.bgHover : 'transparent',
          borderBottomColor: tokens.hairline,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      {LeadingIcon ? (
        <View style={styles.iconSlot}>
          <LeadingIcon size={22} color={titleColor} strokeWidth={1.8} />
        </View>
      ) : null}
      {leadingDot ? (
        <View style={[styles.dot, { backgroundColor: leadingDot }]} />
      ) : null}
      <View style={styles.titleBlock}>
        <Text
          style={[styles.title, { color: titleColor }]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {desc ? (
          <Text style={[styles.desc, { color: tokens.fg3 }]}>{desc}</Text>
        ) : null}
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
          <ChevronRight size={22} color={tokens.fg4} strokeWidth={1.8} />
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontFamily: 'Geist_400Regular',
    fontSize: 18,
    lineHeight: 22.5,
  },
  desc: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 18.9,
  },
  trailingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  value: {
    fontFamily: 'Geist_400Regular',
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
