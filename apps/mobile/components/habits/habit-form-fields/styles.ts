import { StyleSheet } from "react-native";
import { createTokensV2, radius } from "@/lib/theme";

export type AppTokens = ReturnType<typeof createTokensV2>;

export function createSectionStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 16,
      backgroundColor: tokens.bgSunk,
      gap: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: tokens.fg1,
    },
    body: {
      gap: 12,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: tokens.bgElev,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.primary,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    addButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.primary,
    },
    dropdown: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev,
      padding: 4,
      marginTop: 8,
    },
    dropdownItem: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
    },
    dropdownItemText: {
      fontSize: 14,
      color: tokens.fg1,
    },
    customRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    customInput: {
      width: 60,
      backgroundColor: tokens.bgElev,
      color: tokens.fg1,
      borderRadius: radius.xl,
      paddingVertical: 6,
      paddingHorizontal: 12,
      fontSize: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    unitRow: {
      flexDirection: "row",
      gap: 4,
    },
    unitButton: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: radius.xl,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    unitButtonActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    unitButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg2,
    },
    unitButtonTextActive: {
      color: tokens.fgOnPrimary,
    },
    customAddButton: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: tokens.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    limitText: {
      fontSize: 12,
      color: tokens.fg3,
    },
    formBody: {
      gap: 12,
    },
    whenRow: {
      flexDirection: "row",
      gap: 8,
    },
    whenButton: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      alignItems: "center",
    },
    whenButtonActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    whenButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg2,
    },
    whenButtonTextActive: {
      color: tokens.fgOnPrimary,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    timeInput: {
      flex: 1,
      backgroundColor: tokens.bgElev,
      color: tokens.fg1,
      borderRadius: radius.xl,
      paddingVertical: 8,
      paddingHorizontal: 12,
      fontSize: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    timeAddButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: tokens.primary,
    },
    timeAddButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.fgOnPrimary,
    },
    timeCancelButton: {
      padding: 8,
    },
    slipDescription: {
      fontSize: 12,
      color: tokens.fg3,
      marginLeft: 24,
    },
    disabledSwitch: {
      width: 40,
      height: 22,
      borderRadius: radius.full,
      backgroundColor: tokens.bgElev,
      opacity: 0.5,
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    disabledThumb: {
      width: 18,
      height: 18,
      borderRadius: radius.full,
      backgroundColor: tokens.fgOnPrimary,
    },
  });
}

export function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      gap: 32,
    },
    fieldGroup: {
      gap: 8,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: tokens.bgElev,
      color: tokens.fg1,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 16,
      fontSize: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    textarea: {
      minHeight: 60,
      textAlignVertical: "top",
    },
    fieldError: {
      fontSize: 12,
      color: tokens.statusBad,
      marginTop: 2,
    },
    hintText: {
      fontSize: 12,
      color: tokens.fg3,
    },
    flexibleHint: {
      fontSize: 12,
      color: tokens.fg3,
    },
    emojiTrigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev,
      padding: 14,
    },
    emojiPreview: {
      width: 48,
      height: 48,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.bgElev,
    },
    emojiPreviewText: {
      fontSize: 24,
      lineHeight: 30,
    },
    emojiModalBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0, 0, 0, 0.58)",
    },
    emojiModalSheet: {
      maxHeight: "82%",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 24,
      gap: 12,
    },
    emojiModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    emojiModalTitleRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    emojiModalTitle: {
      color: tokens.fg1,
      fontSize: 16,
      fontWeight: "700",
    },
    emojiPreviewCompact: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.bgElev,
    },
    emojiPreviewCompactText: {
      fontSize: 21,
      lineHeight: 26,
    },
    emojiCloseButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bgElev,
    },
    emojiSearchInput: {
      height: 44,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev,
      color: tokens.fg1,
      paddingHorizontal: 14,
      fontSize: 14,
    },
    emojiRemoveButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    emojiRemoveButtonText: {
      fontSize: 12,
      fontWeight: "500",
      color: tokens.fg2,
    },
    emojiCategoryTabs: {
      gap: 8,
      paddingVertical: 2,
    },
    emojiCategoryTab: {
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    emojiCategoryTabActive: {
      backgroundColor: tokens.bgElev,
      borderColor: tokens.primary,
    },
    emojiCategoryTabText: {
      color: tokens.fg2,
      fontSize: 12,
      fontWeight: "600",
    },
    emojiCategoryTabTextActive: {
      color: tokens.primary,
    },
    emojiModalList: {
      maxHeight: 430,
    },
    emojiCategorySection: {
      paddingBottom: 18,
      gap: 8,
    },
    emojiCategoryTitle: {
      color: tokens.fg3,
      fontSize: 12,
      fontWeight: "700",
    },
    emojiEmptyText: {
      color: tokens.fg3,
      textAlign: "center",
      paddingVertical: 32,
      fontSize: 14,
    },
    emojiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    emojiOption: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    emojiOptionSelected: {
      backgroundColor: tokens.bgElev,
      borderColor: tokens.primary,
    },
    emojiOptionText: {
      fontSize: 18,
      lineHeight: 22,
    },
    frequencyCardGrid: {
      flexDirection: "column",
      gap: 6,
    },
    frequencyCard: {
      borderRadius: radius.sm,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    frequencyCardActive: {
      borderColor: tokens.fg3,
      backgroundColor: tokens.bgElev,
    },
    frequencyCardInactive: {
      borderColor: tokens.hairlineStrong,
      backgroundColor: "transparent",
    },
    frequencyCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    frequencyCardBody: {
      marginTop: 6,
      paddingLeft: 28,
    },
    frequencyCardTitle: {
      fontSize: 13,
      flex: 1,
    },
    frequencyCardTitleActive: {
      color: tokens.fg1,
      fontWeight: "600",
    },
    frequencyCardTitleInactive: {
      color: tokens.fg2,
      fontWeight: "500",
    },
    frequencyCardDesc: {
      fontSize: 12,
      color: tokens.fg3,
      lineHeight: 18,
    },
    frequencyCardExample: {
      fontSize: 11,
      color: tokens.fg3,
      lineHeight: 14,
      marginTop: 4,
      fontStyle: "italic",
      opacity: 0.7,
    },
    frequencyRow: {
      flexDirection: "row",
      gap: 12,
    },
    frequencyField: {
      flex: 1,
      gap: 6,
    },
    daysRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    dayButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    dayButtonActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    dayButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg2,
    },
    dayButtonTextActive: {
      color: tokens.fgOnPrimary,
    },
    dueDateRow: {
      flexDirection: "row",
      gap: 12,
    },
    endDateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    endDatePicker: {
      flex: 1,
    },
    removeEndDateButton: {
      padding: 8,
      borderRadius: radius.full,
    },
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    tagChip: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: radius.full,
    },
    tagChipInactive: {
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    tagChipMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 6,
    },
    tagDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    tagChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg2,
    },
    tagAction: {
      paddingHorizontal: 4,
      paddingVertical: 6,
    },
    newTagButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: tokens.hairline,
    },
    newTagButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg3,
    },
    tagEditSection: {
      gap: 12,
    },
    colorPicker: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    colorDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    colorDotSelected: {
      borderWidth: 2,
      borderColor: tokens.fgOnPrimary,
    },
    tagFormRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    tagFormSave: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: tokens.primary,
    },
    tagFormSaveText: {
      fontSize: 12,
      fontWeight: "700",
      color: tokens.fgOnPrimary,
    },
    tagFormCancel: {
      padding: 8,
    },
    moreOptionsDivider: {
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
      paddingTop: 12,
      marginTop: 4,
    },
    moreOptionsButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
    },
    moreOptionsLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: tokens.fg2,
      flex: 1,
    },
    moreOptionsBadge: {
      fontSize: 12,
      color: tokens.primary,
    },
    chevronRotated: {
      transform: [{ rotate: "180deg" }],
    },
    advancedSection: {
      gap: 24,
    },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 4,
    },
    customCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: tokens.hairline,
      alignItems: "center",
      justifyContent: "center",
    },
    customCheckboxChecked: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    checkboxLabel: {
      fontSize: 14,
      color: tokens.fg1,
    },
    unitPicker: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    unitOption: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.xl,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    unitOptionActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    unitOptionText: {
      fontSize: 12,
      fontWeight: "600",
      color: tokens.fg2,
    },
    unitOptionTextActive: {
      color: tokens.fgOnPrimary,
    },
  });
}
