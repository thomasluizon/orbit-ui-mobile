import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProBadge } from '@/components/ui/pro-badge'

interface ProfileNavCardProps {
  title: string
  hint: string
  onPress: () => void
  proBadge?: boolean
  proBadgeLabel?: string
  rightText?: string
}

/**
 * v8 SettingsRow-style profile navigation entry. Replaces the old card
 * shell with a hairline row. Kept under the same name so existing consumers
 * (profile.tsx) keep working.
 */
export function ProfileNavCard({
  title,
  hint,
  onPress,
  proBadge = false,
  proBadgeLabel,
  rightText,
}: Readonly<ProfileNavCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={rightText ?? hint}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? tokens.bgElev : 'transparent',
          borderBottomColor: tokens.hairline,
        },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: tokens.fg1 }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {proBadge ? (
            <ProBadge alwaysVisible label={proBadgeLabel} style={styles.proBadgeSpacing} />
          ) : null}
        </View>
        <Text
          style={[styles.hint, { color: tokens.fg3 }]}
          numberOfLines={1}
        >
          {rightText ?? hint}
        </Text>
      </View>
      <ChevronRight size={16} color={tokens.fg4} strokeWidth={1.5} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Geist',
    fontSize: 15,
    fontWeight: '400',
    flexShrink: 1,
  },
  hint: {
    fontFamily: 'Geist',
    fontSize: 12,
  },
  proBadgeSpacing: {
    marginLeft: 8,
  },
})
