import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2, radius } from '@/lib/theme'
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

/** Pill filter chip: active fills bg-elev with fg-1 text; inactive is a transparent hairline-ringed ghost. */
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
      hitSlop={{ top: 7, bottom: 7 }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? tokens.bgElev : 'transparent',
          borderColor: active ? 'transparent' : tokens.hairline,
        },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text
        style={[styles.label, { color: active ? tokens.fg1 : tokens.fg3 }]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: radius.full,
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
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
})
