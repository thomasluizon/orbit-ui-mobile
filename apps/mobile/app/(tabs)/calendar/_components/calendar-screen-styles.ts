import { PADDING, SPACING } from '@orbit/shared/theme'
import { StyleSheet } from "react-native"

export function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },

    listFooter: {
      paddingTop: PADDING.sectionGap,
    },

    errorWrap: {
      paddingHorizontal: PADDING.screenGutter,
      paddingBottom: SPACING.s12,
    },
    emptyMonth: {
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: PADDING.screenGutter,
      paddingVertical: SPACING.s16,
    },
    emptyMonthText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24,
    },
    errorCard: {
      alignItems: "center",
      gap: 12,
      paddingVertical: SPACING.s24,
      paddingHorizontal: PADDING.screenGutter,
      borderRadius: 18,
      borderWidth: 1,
    },
    errorText: {
      fontFamily: "Geist_400Regular",
      fontSize: 14,
      textAlign: "center",
    },

    sheetScroll: {
      flex: 1,
    },
    sheetContent: {
      gap: 12,
    },
  })
}
