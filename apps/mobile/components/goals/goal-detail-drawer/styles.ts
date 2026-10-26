import { SPACING } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

export type AppTokens = ReturnType<typeof createTokensV2>

export function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    warningText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, color: tokens.fg2 },
    actions: {
      paddingBottom: SPACING.s4,
    },
  })
}
