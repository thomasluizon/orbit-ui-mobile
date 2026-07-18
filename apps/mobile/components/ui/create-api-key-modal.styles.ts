import { StyleSheet } from 'react-native'
import type { AppTokensV2 } from '@/lib/theme'
import { fieldWellShellStyle } from './field-ring'

export type ApiKeyModalStyles = ReturnType<typeof createStyles>

export function createStyles(tokens: AppTokensV2, bottomInset: number) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingTop: 8,
      paddingHorizontal: 20,
      paddingBottom: Math.max(bottomInset, 16) + 24,
      gap: 18,
    },
    fieldLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
      marginBottom: 8,
    },
    scopeWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    scopeActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 10,
    },
    quietLink: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      paddingVertical: 8,
    },
    quietLinkStrong: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
      paddingVertical: 8,
    },
    switchRow: {
      ...fieldWellShellStyle(tokens),
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    switchRowLabel: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg1,
      flexShrink: 1,
    },
    monoInput: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    warningText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.statusOverdueText,
    },
    keyWell: {
      position: 'relative',
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingRight: 76,
    },
    copyButton: {
      position: 'absolute',
      top: 10,
      right: 12,
      padding: 4,
      zIndex: 1,
    },
    copyButtonText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    keyText: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 13,
      color: tokens.fg1,
      lineHeight: 21,
      fontVariant: ['tabular-nums'],
    },
    metaLine: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
      letterSpacing: 0.22,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.statusBad,
    },
    footer: {
      flexDirection: 'row',
      gap: 10,
      paddingTop: 8,
    },
    footerButton: {
      flex: 1,
    },
    footerEnd: {
      alignItems: 'flex-end',
      paddingTop: 8,
    },
  })
}
