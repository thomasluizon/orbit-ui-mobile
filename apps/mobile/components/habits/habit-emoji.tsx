import { useMemo } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getHabitInitial } from '@orbit/shared/utils'
import { useAppTheme } from '@/lib/use-app-theme'

type HabitEmojiSize = 'sm' | 'md' | 'lg'

interface HabitEmojiProps {
  icon: string | null | undefined
  title: string
  size?: HabitEmojiSize
  filled?: boolean
  badHabit?: boolean
  overdue?: boolean
  style?: StyleProp<ViewStyle>
}

const SIZE_MAP: Record<HabitEmojiSize, { box: number; radius: number; fontSize: number }> = {
  sm: { box: 40, radius: 12, fontSize: 18 },
  md: { box: 52, radius: 14, fontSize: 22 },
  lg: { box: 64, radius: 16, fontSize: 26 },
}

/**
 * Mobile counterpart to apps/web/components/habits/habit-emoji.tsx. Renders
 * the habit avatar tile: emoji when icon is set, otherwise the first
 * grapheme of the title in the accent color.
 */
export function HabitEmoji({
  icon,
  title,
  size = 'md',
  filled = false,
  badHabit = false,
  overdue = false,
  style,
}: HabitEmojiProps) {
  const { colors } = useAppTheme()
  const { t } = useTranslation()
  const initial = getHabitInitial(title)
  const hasIcon = !!(icon && icon.trim().length > 0)
  const accessibleLabel = hasIcon ? t('habits.emojiPicker.title') : t('habits.form.iconNone')
  const dimensions = SIZE_MAP[size]

  const { backgroundColor, borderColor, textColor } = useMemo(() => {
    if (filled) {
      return {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        textColor: colors.textInverse,
      }
    }
    if (badHabit) {
      return {
        backgroundColor: colors.red500_10,
        borderColor: colors.borderMuted,
        textColor: colors.danger,
      }
    }
    return {
      backgroundColor: colors.primary_15,
      borderColor: overdue ? colors.red500_30 : colors.borderMuted,
      textColor: colors.primary,
    }
  }, [filled, badHabit, overdue, colors])

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${title} - ${accessibleLabel}`}
      style={[
        styles.tile,
        {
          width: dimensions.box,
          height: dimensions.box,
          borderRadius: dimensions.radius,
          backgroundColor,
          borderColor,
        },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: dimensions.fontSize,
          color: textColor,
          textAlign: 'center',
          includeFontPadding: false,
          fontWeight: '600',
        }}
      >
        {hasIcon ? icon : initial}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
})
