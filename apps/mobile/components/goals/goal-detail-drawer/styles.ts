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
      fontFamily: 'GeistMono',
      fontSize: 12,
      fontWeight: '500',
      color: tokens.fg3,
      letterSpacing: 0.48,
      fontVariant: ['tabular-nums'],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    progressBlock: {
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 10,
    },
    progressTrack: {
      height: 5,
      borderRadius: 999,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    progressText: {
      fontFamily: 'GeistMono',
      fontSize: 12,
      color: tokens.fg2,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
    progressPercent: {
      color: tokens.fg3,
    },
    linkAction: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '500',
      color: tokens.fg1,
    },
    progressForm: {
      marginHorizontal: 20,
      marginBottom: 12,
      gap: 12,
      backgroundColor: tokens.bgElev,
      borderRadius: 10,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairline,
    },
    formLabel: {
      fontFamily: 'Geist',
      fontSize: 11,
      fontWeight: '600',
      color: tokens.fg3,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    formInput: {
      backgroundColor: tokens.bg,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairlineStrong,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: tokens.fg1,
      fontFamily: 'Geist',
    },
    progressFormActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 14,
      paddingTop: 4,
    },
    formCancelBtn: {
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    formCancelText: {
      fontFamily: 'Geist',
      fontSize: 14,
      color: tokens.fg3,
    },
    formSaveBtn: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formSaveText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
      color: tokens.fgOnPrimary,
    },
    disabled: {
      opacity: 0.5,
    },
    warningText: {
      paddingHorizontal: 20,
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
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
      fontFamily: 'GeistMono',
      fontSize: 10.5,
      fontWeight: '500',
      letterSpacing: 0.63,
      color: tokens.fg3,
    },
    askAstraBody: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      lineHeight: 20,
      color: tokens.fg2,
    },
    actions: {
      marginTop: 8,
    },
    actionRow: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    actionRowPressed: {
      backgroundColor: tokens.bgElev,
    },
    actionRowText: {
      fontFamily: 'Geist',
      fontSize: 15,
      fontWeight: '400',
      color: tokens.fg1,
    },
    actionRowTextDestructive: {
      fontFamily: 'Geist',
      fontSize: 15,
      fontStyle: 'italic',
      color: tokens.fg3,
    },
  })
}
