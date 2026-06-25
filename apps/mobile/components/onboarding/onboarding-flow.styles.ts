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
      paddingHorizontal: 20,
      paddingTop: 48,
      paddingBottom: 0,
      minHeight: 56,
    },
    progressLabel: {
      fontFamily: 'Roboto_500Medium',
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
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 28,
    },
    stepWrapper: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
      flexGrow: 1,
      justifyContent: 'center',
      backgroundColor: tokens.bg,
    },
    footer: {
      paddingHorizontal: 28,
      paddingTop: 12,
      paddingBottom: 32,
      gap: 22,
      alignItems: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    footerActions: {
      width: '100%',
      gap: 4,
      alignItems: 'center',
    },
    backButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    backText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
