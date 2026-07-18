import type { ReactNode } from 'react'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProBadge } from '@/components/ui/pro-badge'

interface SettingsGroupProps {
  children: ReactNode
}

/**
 * Grouped settings list: rows sit flat on the canvas (no card surface),
 * separated by full-width hairline dividers drawn by the group.
 */
export function SettingsGroup({ children }: Readonly<SettingsGroupProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const items = React.Children.toArray(children).filter(React.isValidElement)

  return (
    <View>
      {items.map((child, index) => (
        <View key={child.key} collapsable={false}>
          {index > 0 ? (
            <View
              testID="settings-group-separator"
              style={[styles.divider, { backgroundColor: tokens.hairline }]}
            />
          ) : null}
          {child}
        </View>
      ))}
    </View>
  )
}

interface SettingsGroupRowProps {
  /** Pre-rendered leading icon (e.g. `<Settings size={22} color={tokens.fg1} />`). */
  icon?: ReactNode
  label: string
  /** Screen-reader name; defaults to `label` when omitted (e.g. announce plan state on a subscription row). */
  accessibilityLabel?: string
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
  accessibilityLabel,
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
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress ? { backgroundColor: tokens.bgElev } : null,
      ]}
    >
      {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
      <View style={styles.textBlock}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.label, { color: tokens.fg1 }]}
            numberOfLines={2}
          >
            {label}
          </Text>
          {proBadge ? (
            <ProBadge alwaysVisible label={proBadgeLabel} style={styles.proBadgeSpacing} />
          ) : null}
        </View>
        {hint ? (
          <Text style={[styles.hint, { color: tokens.fg3 }]} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailingBlock}>
        {trailing}
        {resolvedAccessory === 'chevron' ? (
          <ChevronRight size={22} color={tokens.fg4} strokeWidth={1.8} />
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 18,
    lineHeight: 22.5,
    flexShrink: 1,
  },
  proBadgeSpacing: {
    marginLeft: 6,
  },
  trailingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  hint: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 18.9,
  },
})
