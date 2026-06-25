import { StyleSheet } from 'react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'

export type AppTokens = ReturnType<typeof createTokensV2>
export type NotificationBellStyles = ReturnType<typeof createStyles>

export function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    bellButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellPressed: {
      transform: [{ scale: 0.92 }],
    },
    bellUnreadDot: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      borderWidth: 2,
      borderColor: tokens.bg,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      marginBottom: 4,
    },
    sheetActionBtn: {
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    notifUnread: {
      backgroundColor: tintFromPrimary(tokens, 0.06),
    },
    notifGlyphCircle: {
      width: 42,
      height: 42,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    notifContent: {
      flex: 1,
      minWidth: 0,
    },
    notifTopRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    notifTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
      color: tokens.fg1,
    },
    notifTime: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      flexShrink: 0,
    },
    notifBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 19.6,
      color: tokens.fg3,
      marginTop: 3,
    },
    deleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnPressed: {
      transform: [{ scale: 0.92 }],
      backgroundColor: tokens.bgElev2,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    emptyText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
    },
    listScroll: {
      flex: 1,
    },
    listContent: {
      paddingBottom: 8,
    },
    emptyListContainer: {
      flexGrow: 1,
      justifyContent: 'center',
    },
  })
}
