import { SPACING } from '@orbit/shared/theme'
import type { BadgeProps } from '@orbit/shared/contracts/display'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { insetHairlineRing } from '@/components/ui/inset-hairline-ring'

/** A neutral, static chip. Interactive controls use pill geometry instead. */
export function Badge({ variant = 'solid', children }: Readonly<BadgeProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.badge,
        variant === 'solid'
          ? { backgroundColor: tokens.bgWell }
          : { ...insetHairlineRing, outlineColor: tokens.hairlineStrong },
      ]}
      testID={`badge-${variant}`}
    >
      <Text numberOfLines={1} style={[styles.text, { color: variant === 'solid' ? tokens.fg1 : tokens.fg2 }]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: SPACING.s8,
    paddingVertical: SPACING.s4,
  },
  text: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 12,
    includeFontPadding: false,
    letterSpacing: 0.72,
  },
})
