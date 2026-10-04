import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

export type AppTokens = ReturnType<typeof createTokensV2>

export function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    warningText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, color: tokens.fg2 },
    retryButton: {
      borderRadius: 999,
      overflow: 'hidden',
      alignSelf: 'flex-start',
      minHeight: TOUCH_TARGET_MIN,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    retryButtonPressed: {
      backgroundColor: tokens.bgHover,
      transform: [{ scale: 0.96 }],
    },
    retryText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg1,
    },
    actions: {
      paddingBottom: 4,
    },
  })
}
