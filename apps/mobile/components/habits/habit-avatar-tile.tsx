import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

type HabitAvatarTileSize = 'sm' | 'md'

interface HabitAvatarTileProps {
  icon: string | null | undefined
  title: string
  size?: HabitAvatarTileSize
}

interface SizeTokens {
  slot: number
  emojiFont: number
}

const SIZES: Record<HabitAvatarTileSize, SizeTokens> = {
  sm: { slot: 40, emojiFont: 18 },
  md: { slot: 52, emojiFont: 26 },
}

/**
 * Mobile habit emoji glyph — no container, just the character. Mirrors the web
 * `apps/web/components/habits/habit-avatar-tile.tsx`. Omitted by the card when
 * the habit has no icon set.
 */
export function HabitAvatarTile({
  icon,
  title,
  size = 'md',
}: Readonly<HabitAvatarTileProps>) {
  const { t } = useTranslation()
  const tokens = SIZES[size]
  const hasIcon = !!(icon && icon.trim().length > 0)
  if (!hasIcon) return null

  const accessibleLabel = `${title} - ${t('habits.emojiPicker.title')}`

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibleLabel}
      style={{
        width: tokens.slot,
        height: tokens.slot,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: tokens.emojiFont,
          includeFontPadding: false,
          textAlign: 'center',
        }}
      >
        {icon}
      </Text>
    </View>
  )
}
