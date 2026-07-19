import { StyleSheet } from 'react-native'

export function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    cardPad: {
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    connectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    connectionIconSlot: {
      width: 26,
      alignItems: 'center',
      flexShrink: 0,
    },
    connectionBody: {
      flex: 1,
      minWidth: 0,
    },
    connectionTitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 18,
      lineHeight: 22.5,
    },
    connectionMeta: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    syncNowRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 6,
    },
    reconnectBlock: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 8,
      alignItems: 'flex-start',
    },
    reconnectTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    reconnectTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      lineHeight: 19.6,
    },
    stateText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 19.6,
      textAlign: 'center',
    },
    stateTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 18,
      lineHeight: 22.5,
      textAlign: 'center',
    },
    stateGlyphCircle: {
      width: 64,
      height: 64,
      borderRadius: 999,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerBlock: {
      paddingHorizontal: 24,
      paddingVertical: 32,
      alignItems: 'center',
      gap: 14,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    eventBody: {
      flex: 1,
      gap: 4,
    },
    eventTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
    },
    eventMeta: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    eventMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    eventReminders: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    eventDescription: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
    },
    dismissButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    quietAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    quietActionDim: {
      opacity: 0.6,
      transform: [{ scale: 0.96 }],
    },
    quietActionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    quietActionIcon: {
      width: 36,
      height: 36,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionPad: {
      paddingHorizontal: 20,
      paddingVertical: 18,
    },
    pickerStateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 6,
    },
    pickerStateText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 19.6,
    },
    showMoreRow: {
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 14,
    },
    showingCountText: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    eventTagText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
    },
    errorActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 6,
    },
  })
}

export type CalendarSyncStyles = ReturnType<typeof createStyles>
