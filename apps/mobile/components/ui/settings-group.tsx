import type { ReactNode } from 'react'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProBadge } from '@/components/ui/pro-badge'

interface SettingsGroupProps {
  children: ReactNode
}

/**
 * Grouped settings card: hairline-bordered surface containing flat
 * SettingsGroupRow children, separated by inset hairlines. One elevated
 * surface per group; rows carry no chrome of their own.
 */
export function SettingsGroup({ children }: Readonly<SettingsGroupProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const items = React.Children.toArray(children).filter(Boolean)

  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: tokens.bgElev,
          borderColor: tokens.hairline,
        },
      ]}
    >
      {items.map((child, index) => (
        <View key={index} collapsable={false}>
          {index > 0 ? (
            <View style={[styles.divider, { backgroundColor: tokens.hairline }]} />
          ) : null}
          {child}
        </View>
      ))}
    </View>
  )
}

interface SettingsGroupRowProps {
  /** Pre-rendered leading icon (e.g. `<Settings size={18} color={tokens.fg3} />`). */
  icon?: ReactNode
  label: string
  /** Optional right-side hint or value text. */
  hint?: string
  /** Optional slot rendered between hint and chevron (toggle, badge). */
  trailing?: ReactNode
  /** Trailing accessory. Defaults to `'chevron'` when `onPress` is set, else `'none'`. */
  accessory?: 'chevron' | 'none'
  onPress?: () => void
  proBadge?: boolean
  proBadgeLabel?: string
}

/** Flat row inside a SettingsGroup. Carries no divider; the group draws them. */
export function SettingsGroupRow({
  icon,
  label,
  hint,
  trailing,
  accessory,
  onPress,
  proBadge = false,
  proBadgeLabel,
}: Readonly<SettingsGroupRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const resolvedAccessory = accessory ?? (onPress ? 'chevron' : 'none')

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress ? { backgroundColor: tokens.bg } : null,
      ]}
    >
      <View style={styles.leadingBlock}>
        {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
        <Text style={[styles.label, { color: tokens.fg1 }]} numberOfLines={1}>
          {label}
        </Text>
        {proBadge ? (
          <ProBadge alwaysVisible label={proBadgeLabel} style={styles.proBadgeSpacing} />
        ) : null}
      </View>
      <View style={styles.trailingBlock}>
        {hint ? (
          <Text style={[styles.hint, { color: tokens.fg3 }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
        {trailing}
        {resolvedAccessory === 'chevron' ? (
          <ChevronRight size={16} color={tokens.fg4} strokeWidth={1.5} />
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  leadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  iconSlot: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    fontFamily: 'Geist',
    fontSize: 15,
    fontWeight: '400',
    flexShrink: 1,
  },
  proBadgeSpacing: {
    marginLeft: 6,
  },
  trailingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  hint: {
    fontFamily: 'Geist',
    fontSize: 13,
    maxWidth: 200,
  },
})
