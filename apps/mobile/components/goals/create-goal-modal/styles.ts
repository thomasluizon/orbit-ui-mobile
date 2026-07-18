import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

export type CreateGoalTokens = ReturnType<typeof createTokensV2>
export type CreateGoalStyles = ReturnType<typeof createStyles>

export function createStyles(tokens: CreateGoalTokens, bottomInset: number) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    form: {
      paddingTop: 8,
      paddingHorizontal: 20,
      paddingBottom: Math.max(bottomInset, 16) + 24,
      gap: 18,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfField: {
      flex: 1,
    },
    fullField: {
      flex: 1,
    },
    fieldLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg2,
      marginBottom: 8,
    },
    labelOptional: {
      fontFamily: 'Rubik_400Regular',
      color: tokens.fg3,
    },
    fieldError: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.statusOverdueText,
      marginTop: 6,
    },
    typeRow: {
      flexDirection: 'row',
      gap: 10,
    },
    typeOption: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    typeOptionActive: {
      backgroundColor: tokens.primary,
    },
    typeOptionInactive: {
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    typeOptionPressed: {
      transform: [{ scale: 0.98 }],
    },
    typeOptionActivePressed: {
      backgroundColor: tokens.primaryPressed,
    },
    typeOptionInactivePressed: {
      backgroundColor: tokens.bgElev2,
    },
    typeOptionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
    },
    typeCaption: {
      marginTop: 10,
    },
    typeDesc: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      lineHeight: 18,
    },
    typeHint: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      color: tokens.fg3,
      lineHeight: 16,
      marginTop: 4,
    },
    deadlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    deadlinePicker: {
      flex: 1,
    },
    removeDeadlineButton: {
      width: 44,
      height: 44,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.statusOverdueText,
      marginTop: 8,
    },
    addDeadlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      alignSelf: 'flex-start',
    },
    addDeadlineText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 8,
    },
    footerButton: {
      flex: 1,
    },
  })
}
