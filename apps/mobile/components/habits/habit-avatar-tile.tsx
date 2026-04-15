import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getHabitInitial } from '@orbit/shared/utils'
import { useAppTheme } from '@/lib/use-app-theme'

type HabitAvatarTileSize = 'sm' | 'md'

interface HabitAvatarTileProps {
  icon: string | null | undefined
  title: string
  size?: HabitAvatarTileSize
  isCompleted?: boolean
  isBadHabit?: boolean
}

interface SizeTokens {
  inner: number
  emojiFont: number
  initialFont: number
  radius: number
}

const SIZES: Record<HabitAvatarTileSize, SizeTokens> = {
  sm: { inner: 40, emojiFont: 18, initialFont: 16, radius: 12 },
  md: { inner: 52, emojiFont: 22, initialFont: 20, radius: 14 },
}

/**
 * Mobile decorative emoji tile rendered immediately to the right of the log
 * button on every habit card. Mirrors the web
 * `apps/web/components/habits/habit-avatar-tile.tsx`. Purely presentational —
 * taps do nothing (interaction lives in the sibling {@link HabitLogButton}).
 */
export function HabitAvatarTile({
  icon,
  title,
  size = 'md',
  isCompleted = false,
  isBadHabit = false,
}: Readonly<HabitAvatarTileProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const tokens = SIZES[size]
  const initial = getHabitInitial(title)
  const hasIcon = !!(icon && icon.trim().length > 0)
  const innerLabel = hasIcon ? icon : initial

  const { backgroundColor, textColor, borderColor } = useMemo(() => {
    if (isCompleted) {
      return {
        backgroundColor: colors.primary,
        textColor: colors.textInverse,
        borderColor: colors.primary_30,
      }
    }
    if (isBadHabit) {
      return {
        backgroundColor: colors.red500_10,
        textColor: colors.danger,
        borderColor: colors.red500_10,
      }
    }
    return {
      backgroundColor: colors.primary_15,
      textColor: colors.primary,
      borderColor: colors.primary_20,
    }
  }, [isCompleted, isBadHabit, colors])

  const accessibleLabel = hasIcon
    ? `${title} - ${t('habits.emojiPicker.title')}`
    : `${title} - ${t('habits.form.iconNone')}`

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibleLabel}
      style={[
        styles.inner,
        {
          width: tokens.inner,
          height: tokens.inner,
          borderRadius: tokens.radius,
          backgroundColor,
          borderColor,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: hasIcon ? tokens.emojiFont : tokens.initialFont,
          color: textColor,
          fontWeight: '600',
          textAlign: 'center',
          includeFontPadding: false,
          opacity: isCompleted ? 0.92 : 1,
        }}
      >
        {innerLabel}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
})
