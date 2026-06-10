import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
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

/**
 * v8 Linear-tactical chip. NOT an underline — active chips fill with the elevated
 * background and gain a fg-3 inset ring; inactive chips show a hairline-strong ring.
 */
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
      style={[
        styles.chip,
        {
          backgroundColor: active ? tokens.bgElev : 'transparent',
          borderColor: active ? tokens.fg3 : tokens.hairlineStrong,
        },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text
        style={[
          styles.label,
          {
            color: active ? tokens.fg1 : tokens.fg2,
            fontWeight: active ? '600' : '500',
          },
        ]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
  },
})
