import { StyleSheet } from 'react-native'
import type { AppTokensV2 } from '@/lib/theme'

export type OnboardingFlowStyles = ReturnType<typeof createStyles>

export function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 48,
      paddingBottom: 0,
      minHeight: 56,
    },
    progressLabel: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 11,
      color: tokens.fg3,
      letterSpacing: 0.44,
      fontVariant: ['tabular-nums'],
    },
    skipButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    skipText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
    },
    stepWrapper: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
      flexGrow: 1,
      justifyContent: 'center',
    },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 32,
      gap: 24,
      alignItems: 'stretch',
    },
    textButtonPressed: {
      transform: [{ scale: 0.96 }],
      opacity: 0.7,
    },
    haveAccountButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    haveAccountText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 13,
      color: tokens.primarySoft,
    },
  })
}
