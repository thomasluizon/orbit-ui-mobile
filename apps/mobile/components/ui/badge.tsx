import type { BadgeProps } from '@orbit/shared/contracts/display'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A neutral, static chip. Interactive controls use pill geometry instead. */
export function Badge({ variant = 'solid', children }: Readonly<BadgeProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.badge,
        variant === 'solid'
          ? { backgroundColor: tokens.fg1 }
          : { borderColor: tokens.hairlineStrong, borderWidth: 1 },
      ]}
      testID={`badge-${variant}`}
    >
      <Text numberOfLines={1} style={[styles.text, { color: variant === 'solid' ? tokens.bg : tokens.fg2 }]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 10.5,
    includeFontPadding: false,
    letterSpacing: 0.63,
    textTransform: 'uppercase',
  },
})
