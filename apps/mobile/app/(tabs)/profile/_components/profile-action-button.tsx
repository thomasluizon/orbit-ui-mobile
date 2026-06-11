import type { ComponentType } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { LucideProps } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type LucideIcon = ComponentType<LucideProps>

interface ProfileActionButtonProps {
  label: string
  onPress: () => void
  /** Leading lucide icon rendered 22/1.8 in the kit ListRow 26px slot. */
  icon?: LucideIcon
  tone?: 'default' | 'primary' | 'danger'
  /** Render a quieter, smaller row (small destructive actions). */
  compact?: boolean
}

/** Kit ListRow action — `tone` colors icon and label (`primary` → accent, `danger` → status-bad); `compact` renders a quieter smaller row. */
export function ProfileActionButton({
  label,
  onPress,
  icon: LeadingIcon,
  tone = 'default',
  compact = false,
}: Readonly<ProfileActionButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const labelColor =
    tone === 'danger'
      ? tokens.statusBad
      : tone === 'primary'
        ? tokens.primary
        : tokens.fg1

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? tokens.bgElev : 'transparent',
          borderBottomColor: tokens.hairline,
        },
      ]}
    >
      {LeadingIcon ? (
        <View style={styles.iconSlot}>
          <LeadingIcon size={22} color={labelColor} strokeWidth={1.8} />
        </View>
      ) : null}
      <Text
        style={[
          compact ? styles.labelCompact : styles.label,
          { color: labelColor },
        ]}
      >
        {label}
      </Text>
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
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
    flexShrink: 0,
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 18,
    lineHeight: 22.5,
  },
  labelCompact: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 15,
    lineHeight: 19,
  },
})
