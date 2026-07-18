import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

export type EditGoalTokens = ReturnType<typeof createTokensV2>
export type EditGoalStyles = ReturnType<typeof createStyles>

export function createStyles(tokens: EditGoalTokens, bottomInset: number) {
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
    eyebrow: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      color: tokens.fg3,
      textTransform: 'uppercase',
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
