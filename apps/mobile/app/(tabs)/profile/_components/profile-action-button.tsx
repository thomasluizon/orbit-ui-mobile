import type { ComponentType } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { IconProps } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type IconComponent = ComponentType<IconProps>

interface ProfileActionButtonProps {
  label: string
  onPress: () => void
  /** Leading Tabler icon rendered 22/1.8 in the kit ListRow 26px slot. */
  icon?: IconComponent
  tone?: 'default' | 'danger'
  /** Draw the bottom hairline divider. Set `false` on the last row so no stray rule renders. */
  showDivider?: boolean
}

/** Kit ListRow action: `tone="danger"` uses the graphic role for its icon and the text role for its label. */
export function ProfileActionButton({
  label,
  onPress,
  icon: LeadingIcon,
  tone = 'default',
  showDivider = true,
}: Readonly<ProfileActionButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const iconColor = tone === 'danger' ? tokens.statusBad : tokens.fg1
  const labelColor = tone === 'danger' ? tokens.statusBadText : tokens.fg1

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
          borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      {LeadingIcon ? (
        <View style={styles.iconSlot}>
          <LeadingIcon size={22} color={iconColor} strokeWidth={1.8} />
        </View>
      ) : null}
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
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
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
    flexShrink: 0,
  },
  label: {
    fontFamily: 'Geist_400Regular',
    fontSize: 18,
    lineHeight: 22.5,
  },
})
