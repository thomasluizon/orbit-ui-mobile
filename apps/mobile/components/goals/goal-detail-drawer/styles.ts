import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

export type AppTokens = ReturnType<typeof createTokensV2>

export function createStyles(tokens: AppTokens, bottomInset: number) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Math.max(bottomInset, 16) + 24,
    },
    headerLine: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 14,
      fontFamily: 'Roboto_500Medium',
      fontSize: 12,
      color: tokens.fg3,
      letterSpacing: 0.48,
      fontVariant: ['tabular-nums'],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    progressBlock: {
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    ringWrap: {
      alignSelf: 'center',
      width: 180,
      height: 180,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    ringCenter: {
      position: 'absolute',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    ringValue: {
      fontFamily: 'Inter_700Bold',
      fontSize: 40,
      letterSpacing: -0.8,
      lineHeight: 44,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    ringMeta: {
      marginTop: 2,
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      textAlign: 'center',
    },
    progressCta: {
      marginTop: 14,
    },
    progressForm: {
      marginHorizontal: 20,
      marginBottom: 12,
      gap: 14,
    },
    formLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
      marginBottom: 8,
    },
    progressFormActions: {
      flexDirection: 'row',
      gap: 12,
      paddingTop: 2,
    },
    progressFormButton: {
      flex: 1,
    },
    warningText: {
      paddingHorizontal: 20,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.statusOverdueText,
    },
    askAstra: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 34,
      paddingRight: 20,
      paddingTop: 16,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      marginTop: 8,
    },
    askAstraRule: {
      position: 'absolute',
      left: 20,
      top: 20,
      bottom: 28,
      width: 2,
      borderRadius: 1,
    },
    askAstraContent: {
      flex: 1,
    },
    askAstraEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    askAstraEyebrowText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10.5,
      letterSpacing: 0.63,
      color: tokens.fg3,
    },
    askAstraBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg2,
    },
    actions: {
      marginTop: 16,
      paddingBottom: 4,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    actionRowPressed: {
      backgroundColor: tokens.bgElevPressed,
    },
    actionRowText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg1,
    },
    actionRowTextDestructive: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.statusBad,
    },
  })
}
