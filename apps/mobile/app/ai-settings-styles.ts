import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    lockedBlock: {
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    lockedText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
    },
    headerControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    pagingText: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    pageBtn: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageBtnPressed: {
      transform: [{ scale: 0.92 }],
    },
    skelStack: {
      paddingHorizontal: 20,
      gap: 10,
    },
    skelBar: {
      height: 56,
      borderRadius: 16,
    },
    actionChip: {
      flexDirection: 'row',
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionChipPressed: {
      transform: [{ scale: 0.96 }],
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectActionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
    },
    factsList: {
      paddingHorizontal: 20,
      gap: 10,
    },
    factCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 16,
      borderWidth: 1,
    },
    factCardPressed: {
      transform: [{ scale: 0.99 }],
    },
    checkSlot: {
      paddingTop: 2,
    },
    factBody: {
      flex: 1,
      gap: 6,
    },
    categoryPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
    },
    categoryText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10,
      letterSpacing: 0.6,
    },
    factText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 21.75,
    },
    deleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
