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
      marginTop: 3,
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
      gap: 3,
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
    quietAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 9,
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
    actionPad: {
      paddingHorizontal: 20,
      paddingVertical: 18,
    },
    progressTrack: {
      width: 200,
      height: 8,
      borderRadius: 999,
      overflow: 'hidden',
    },
    progressFill: {
      width: '60%',
      height: '100%',
      borderRadius: 999,
    },
  })
}

export type CalendarSyncStyles = ReturnType<typeof createStyles>
