import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

export type AppTokens = ReturnType<typeof createTokensV2>

export function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    warningText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, color: tokens.fg2 },
    retryButton: {
      alignSelf: 'flex-start',
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 0,
    },
    retryButtonPressed: {
      opacity: 0.7,
    },
    retryText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    actions: {
      paddingBottom: 4,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 0,
      paddingVertical: 12,
    },
    actionRowPressed: {
      backgroundColor: tokens.bgHover,
    },
    actionRowText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 15,
      color: tokens.fg1,
    },
    actionRowTextDestructive: {
      fontFamily: 'Geist_400Regular',
      fontSize: 15,
      color: tokens.statusBadText,
    },
  })
}
