import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'

export function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    cardPad: {
      paddingBottom: SPACING.s12,
    },
    connectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: SPACING.s16,
      paddingHorizontal: SPACING.s16,
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
      fontFamily: 'Geist_400Regular',
      fontSize: 17,
      lineHeight: 22.95,
    },
    connectionMeta: {
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      lineHeight: 16.8,
      marginTop: SPACING.s4,
    },
    syncNowRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingTop: SPACING.s16,
      paddingBottom: SPACING.s4,
    },
    reconnectBlock: {
      paddingVertical: SPACING.s12,
      gap: 8,
      alignItems: 'flex-start',
    },
    reconnectTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    reconnectTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      lineHeight: 19.6,
    },
    stateText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 19.6,
      textAlign: 'center',
    },
    stateTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 17,
      lineHeight: 22.95,
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
      paddingVertical: SPACING.s32,
      alignItems: 'center',
      gap: 12,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: SPACING.s12,
      borderRadius: 12,
      minHeight: TOUCH_TARGET_MIN,
    },
    eventBody: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    eventTitle: {
      fontFamily: 'Geist_500Medium',
      fontSize: 17,
    },
    eventMeta: {
      fontFamily: 'GeistMono_400Regular',
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
    importIssue: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
    },
    dismissButton: {
      overflow: 'hidden',
      width: TOUCH_TARGET_MIN,
      height: TOUCH_TARGET_MIN,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    quietAction: {
      overflow: 'hidden',
      minHeight: TOUCH_TARGET_MIN,
      minWidth: TOUCH_TARGET_MIN,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: SPACING.s8,
      paddingHorizontal: SPACING.s16,
    },
    quietActionDim: {
      opacity: 0.6,
      transform: [{ scale: 0.96 }],
    },
    quietActionText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
    },
    quietActionIcon: {
      overflow: 'hidden',
      width: TOUCH_TARGET_MIN,
      height: TOUCH_TARGET_MIN,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionPad: {
      paddingVertical: SPACING.s16,
    },
    pickerStateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: SPACING.s4,
    },
    pickerStateText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 19.6,
    },
    showMoreRow: {
      alignItems: 'center',
      gap: 8,
      paddingTop: SPACING.s12,
    },
    showingCountText: {
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    eventTagText: {
      flexShrink: 1,
      fontFamily: 'Geist_400Regular',
      fontSize: 12,
    },
    errorActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: SPACING.s4,
    },
  })
}

export type CalendarSyncStyles = ReturnType<typeof createStyles>
