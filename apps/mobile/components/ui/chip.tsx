import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2, radius, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ChipProps {
  children: ReactNode
  active?: boolean
  onPress?: () => void
  /** Optional leading slot (e.g. a color dot for `TagChip`). */
  leading?: ReactNode
  /** Accessibility label override. Defaults to the chip text content. */
  accessibilityLabel?: string
}

/** Kit pill chip: bg-elev well with a hairline ring; active fills selection-bg
 *  with a primary ring and primary text. */
export function Chip({
  children,
  active = false,
  onPress,
  leading,
  accessibilityLabel,
}: Readonly<ChipProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => {
        const pressedBackground = pressed ? tokens.bgElev2 : tokens.bgElev
        return [
          styles.chip,
          {
            backgroundColor: active ? tokens.selectionBg : pressedBackground,
            borderColor: active ? tintFromPrimary(tokens, 0.45) : tokens.hairline,
          },
          pressed && !active ? styles.chipPressed : null,
        ]
      }}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text
        style={[styles.label, { color: active ? tokens.primarySoft : tokens.fg2 }]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipPressed: {
    transform: [{ scale: 0.96 }],
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
})
