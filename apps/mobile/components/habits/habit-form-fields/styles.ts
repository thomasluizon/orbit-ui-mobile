import { StyleSheet } from "react-native";
import { createTokensV2, radius, tintFromPrimary } from "@/lib/theme";

export type AppTokens = ReturnType<typeof createTokensV2>;

function fgTint(tokens: AppTokens, alpha: number): string {
  const normalized = tokens.fg1.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function createSectionStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 16,
      backgroundColor: tokens.bgField,
      gap: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerLabel: {
      fontFamily: "Rubik_500Medium",
      fontSize: 15,
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
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: tintFromPrimary(tokens, 0.12),
    },
    chipText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 12,
      color: tokens.primary,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.full,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    addButtonText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fg2,
    },
    dropdown: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgSheet,
      padding: 6,
      marginTop: 8,
    },
    dropdownItem: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 10,
    },
    dropdownItemText: {
      fontFamily: "Rubik_400Regular",
      fontSize: 15,
      color: tokens.fg1,
    },
    dropdownItemTextAccent: {
      fontFamily: "Rubik_500Medium",
      fontSize: 15,
      color: tokens.primary,
    },
    customRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    customInput: {
      width: 72,
      backgroundColor: tokens.bgField,
      color: tokens.fg1,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontFamily: "Rubik_400Regular",
      fontSize: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    unitRow: {
      flexDirection: "row",
      gap: 4,
    },
    unitButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.full,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: "transparent",
    },
    unitButtonActive: {
      backgroundColor: tintFromPrimary(tokens, 0.12),
      borderColor: tokens.primary,
    },
    unitButtonText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 12,
      color: tokens.fg3,
    },
    unitButtonTextActive: {
      color: tokens.primary,
    },
    customAddButton: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: tokens.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    limitText: {
      fontFamily: "Rubik_400Regular",
      fontSize: 13,
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
      paddingVertical: 10,
      borderRadius: radius.full,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: "transparent",
      alignItems: "center",
    },
    whenButtonActive: {
      backgroundColor: tintFromPrimary(tokens, 0.12),
      borderColor: tokens.primary,
    },
    whenButtonText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fg3,
    },
    whenButtonTextActive: {
      color: tokens.primary,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    timeAddButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.full,
      backgroundColor: tokens.primary,
    },
    timeAddButtonText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fgOnPrimary,
    },
    timeCancelButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    slipDescription: {
      fontFamily: "Rubik_400Regular",
      fontSize: 13,
      color: tokens.fg3,
      marginLeft: 30,
    },
    disabledSwitch: {
      width: 48,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: tokens.bgElev2,
      opacity: 0.5,
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    disabledThumb: {
      width: 22,
      height: 22,
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
      fontFamily: "Rubik_500Medium",
      fontSize: 14,
      color: tokens.fg2,
    },
    textarea: {
      minHeight: 84,
      textAlignVertical: "top",
    },
    fieldError: {
      fontFamily: "Rubik_400Regular",
      fontSize: 13,
      color: tokens.statusBad,
      marginTop: 2,
    },
    hintText: {
      fontFamily: "Rubik_400Regular",
      fontSize: 13,
      color: tokens.fg3,
    },
    flexibleHint: {
      fontFamily: "Rubik_400Regular",
      fontSize: 13,
      color: tokens.fg3,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 12,
    },
    titleInputWrap: {
      flex: 1,
      minWidth: 0,
    },
    titleInputWithTrailing: {
      paddingRight: 52,
    },
    titleTrailing: {
      position: "absolute",
      right: 8,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    aiSparkButton: {
      width: 38,
      height: 38,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tintFromPrimary(tokens, 0.1),
      borderWidth: 1,
      borderColor: tintFromPrimary(tokens, 0.22),
    },
    emojiWell: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: fgTint(tokens, 0.06),
    },
    emojiWellText: {
      fontSize: 26,
      lineHeight: 32,
    },
    emojiModalBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0, 0, 0, 0.55)",
    },
    emojiModalSheet: {
      maxHeight: "82%",
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      backgroundColor: tokens.bgSheet,
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
      fontFamily: "Rubik_500Medium",
      fontSize: 18,
      color: tokens.fg1,
    },
    emojiPreviewCompact: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bgElev,
    },
    emojiPreviewCompactText: {
      fontSize: 20,
      lineHeight: 25,
    },
    emojiCloseButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: tokens.hairlineStrong,
    },
    emojiSearchInput: {
      minHeight: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      color: tokens.fg1,
      paddingHorizontal: 16,
      fontFamily: "Rubik_400Regular",
      fontSize: 16,
    },
    emojiRemoveButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    emojiRemoveButtonText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fg2,
    },
    emojiCategoryTabs: {
      gap: 8,
      paddingVertical: 2,
    },
    emojiCategoryTab: {
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    emojiCategoryTabActive: {
      backgroundColor: tintFromPrimary(tokens, 0.12),
      borderColor: tokens.primary,
    },
    emojiCategoryTabText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fg3,
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
      fontFamily: "Rubik_500Medium",
      fontSize: 12,
      color: tokens.fg3,
    },
    emojiEmptyText: {
      fontFamily: "Rubik_400Regular",
      fontSize: 14,
      color: tokens.fg3,
      textAlign: "center",
      paddingVertical: 32,
    },
    emojiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    emojiOption: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bgField,
      borderWidth: 2,
      borderColor: "transparent",
    },
    emojiOptionSelected: {
      backgroundColor: tintFromPrimary(tokens, 0.1),
      borderColor: tokens.primary,
    },
    emojiOptionText: {
      fontSize: 20,
      lineHeight: 25,
    },
    frequencyCarouselRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    frequencyScroll: {
      flex: 1,
    },
    frequencySlide: {
      paddingHorizontal: 4,
    },
    frequencyCardCarousel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: tintFromPrimary(tokens, 0.1),
      borderWidth: 1.5,
      borderColor: tokens.primary,
    },
    frequencyArrow: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    frequencyArrowDisabled: {
      opacity: 0.3,
    },
    frequencyDots: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      paddingTop: 10,
    },
    frequencyDot: {
      width: 6,
      height: 6,
      borderRadius: radius.full,
      backgroundColor: tokens.hairlineStrong,
    },
    frequencyDotActive: {
      width: 18,
      backgroundColor: tokens.primary,
    },
    frequencyCardIconWell: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: fgTint(tokens, 0.06),
      flexShrink: 0,
    },
    frequencyCardTexts: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    frequencyCardTitle: {
      fontFamily: "Rubik_500Medium",
      fontSize: 16,
      color: tokens.fg1,
    },
    frequencyCardDesc: {
      fontFamily: "Rubik_400Regular",
      fontSize: 13,
      color: tokens.fg3,
      lineHeight: 19,
    },
    frequencyCardExample: {
      fontFamily: "Rubik_400Regular",
      fontSize: 12,
      color: tokens.fg3,
      lineHeight: 17,
    },
    frequencyRow: {
      flexDirection: "row",
      gap: 12,
    },
    frequencyField: {
      flex: 1,
      gap: 8,
    },
    daysRow: {
      flexDirection: "row",
      gap: 8,
    },
    dayButton: {
      flex: 1,
      height: 42,
      borderRadius: 12,
      backgroundColor: tokens.bgField,
      alignItems: "center",
      justifyContent: "center",
    },
    dayButtonActive: {
      backgroundColor: tokens.primary,
    },
    dayButtonText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 14,
      color: tokens.fg3,
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
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
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
      paddingVertical: 8,
    },
    tagDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    tagChipText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fg2,
    },
    tagAction: {
      paddingHorizontal: 5,
      paddingVertical: 8,
    },
    newTagButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.full,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    newTagButtonText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fg2,
    },
    aiChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.full,
      backgroundColor: tintFromPrimary(tokens, 0.1),
      borderWidth: 1,
      borderColor: tintFromPrimary(tokens, 0.28),
    },
    aiChipText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.primary,
    },
    tagEditSection: {
      gap: 12,
    },
    colorPicker: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    colorDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    colorDotSelected: {
      borderWidth: 2,
      borderColor: tokens.primary,
    },
    tagFormRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    tagFormSave: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.full,
      backgroundColor: tokens.primary,
    },
    tagFormSaveText: {
      fontFamily: "Rubik_500Medium",
      fontSize: 13,
      color: tokens.fgOnPrimary,
    },
    tagFormCancel: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
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
      fontFamily: "Rubik_500Medium",
      fontSize: 14,
      color: tokens.fg2,
      flex: 1,
    },
    moreOptionsBadge: {
      fontFamily: "Rubik_400Regular",
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
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: tokens.fg3,
      alignItems: "center",
      justifyContent: "center",
    },
    customCheckboxChecked: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    checkboxLabel: {
      fontFamily: "Rubik_400Regular",
      fontSize: 14,
      color: tokens.fg1,
    },
  });
}
