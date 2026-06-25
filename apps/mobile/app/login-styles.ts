import { StyleSheet } from 'react-native'
import { type AppTokensV2 } from '@/lib/theme'

export function createLoginStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: tokens.bg,
    },
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 24,
    },
    scrollContentCode: {
      paddingBottom: 24,
    },
    scrollContentKeyboard: {
      justifyContent: 'flex-start',
      paddingTop: 24,
      paddingBottom: 24,
    },

    referralBanner: {
      alignSelf: 'stretch',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    referralBannerText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 11,
      color: tokens.fg1,
      letterSpacing: 0.66,
    },

    formColumn: {
      width: '100%',
      maxWidth: 360,
      gap: 18,
    },

    brandingHeader: {
      alignItems: 'center',
      gap: 14,
      paddingBottom: 4,
    },
    titleBlock: {
      alignItems: 'center',
      gap: 6,
    },
    stepTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 26,
      lineHeight: 34,
      letterSpacing: -0.26,
      color: tokens.fg1,
      textAlign: 'center',
    },
    stepSubtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
      textAlign: 'center',
    },

    successText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 20,
      color: tokens.fg2,
      textAlign: 'center',
    },

    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 8,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: tokens.hairline,
    },
    dividerText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },

    legal: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      lineHeight: 18,
      color: tokens.fg3,
      textAlign: 'center',
      marginTop: 8,
    },
    legalLink: {
      textDecorationLine: 'underline',
      color: tokens.fg3,
    },

    codeSentText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
      textAlign: 'center',
    },
    codeSentEmail: {
      color: tokens.fg1,
    },

    resendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingTop: 4,
    },
    changeEmailRow: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    textButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    resendActiveText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
    },
    resendCountdownText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    quietLink: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}

export type LoginStyles = ReturnType<typeof createLoginStyles>
