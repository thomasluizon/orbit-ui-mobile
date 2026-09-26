import { useCallback, useEffect, useRef, type RefObject } from "react";
import { BackHandler } from "react-native";
import { getTodayBoundary } from "@orbit/shared/utils";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import type { HabitListHandle } from "@/components/habit-list";
import { useUIStore } from "@/stores/ui-store";
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { useProfile } from "@/hooks/use-profile";
import { shouldResetSelectionForViewChange } from "@/lib/habit-selection-state";

interface TodaySelectionInput {
  selectedDateStr: string;
  today: string;
  habitListRef: RefObject<HabitListHandle | null>;
  habitListAllLoadedIds: Set<string> | null;
  habitsById: Map<string, NormalizedHabit>;
  closeControlsMenu: () => void;
}

const NO_LOADED_HABIT_IDS = new Set<string>();

/**
 * Owns the Today screen's multi-select / bulk-action concern: the bulk
 * mutations, the select-all/deselect handlers, the hardware-back and
 * view-change selection resets, and the derived selection counts. Extracted
 * from TodayScreen unchanged.
 */
export function useTodaySelection({
  selectedDateStr,
  today,
  habitListRef,
  habitListAllLoadedIds,
  habitsById,
  closeControlsMenu,
}: TodaySelectionInput) {
  const { profile } = useProfile();
  const activeView = useUIStore((s) => s.activeView);
  const isSelectMode = useUIStore((s) => s.isSelectMode);
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds);
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode);
  const selectAllHabits = useUIStore((s) => s.selectAllHabits);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const previousActiveViewRef = useRef(activeView);
  const completionReadOnly = getTodayBoundary(selectedDateStr, today) === "read-only";
  const previousSelectedDateRef = useRef(selectedDateStr);

  const bulkActions = useBulkActions({
    selectedHabitIds,
    selectedDateStr,
    completionReadOnly,
    accountTimeZone: profile?.timeZone,
    habitsById,
    habitListRef,
    onSuccess: clearSelection,
    onPartialFailure: selectAllHabits,
  });
  const { setShowBulkDeleteConfirm, confirmBulkLog, confirmBulkSkip } =
    bulkActions;

  const allLoadedIds = habitListAllLoadedIds ?? NO_LOADED_HABIT_IDS;

  const allSelected =
    allLoadedIds.size > 0 &&
    Array.from(allLoadedIds).every((id) => selectedHabitIds.has(id));

  const selectedCount = selectedHabitIds.size;

  useEffect(() => {
    const dateChanged = previousSelectedDateRef.current !== selectedDateStr;
    previousSelectedDateRef.current = selectedDateStr;
    if (!dateChanged) return;
    closeControlsMenu();
    setShowBulkDeleteConfirm(false);
    clearSelection();
  }, [
    clearSelection,
    closeControlsMenu,
    selectedDateStr,
    setShowBulkDeleteConfirm,
  ]);

  useEffect(() => {
    if (
      !shouldResetSelectionForViewChange(
        previousActiveViewRef.current,
        activeView,
      )
    ) {
      return;
    }

    previousActiveViewRef.current = activeView;
    closeControlsMenu();
    if (isSelectMode) clearSelection();
  }, [activeView, clearSelection, closeControlsMenu, isSelectMode]);

  useEffect(() => {
    if (!isSelectMode) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        clearSelection();
        return true;
      },
    );
    return () => subscription.remove();
  }, [clearSelection, isSelectMode]);

  const handleToggleSelectMode = useCallback(() => {
    if (isSelectMode) {
      clearSelection();
    } else {
      toggleSelectMode();
    }
    closeControlsMenu();
  }, [clearSelection, closeControlsMenu, isSelectMode, toggleSelectMode]);

  const handleSelectAll = useCallback(() => {
    selectAllHabits(Array.from(allLoadedIds));
  }, [allLoadedIds, selectAllHabits]);

  const handleDeselectAll = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleOpenBulkDelete = useCallback(() => {
    if (selectedHabitIds.size === 0) return;
    setShowBulkDeleteConfirm(true);
  }, [selectedHabitIds, setShowBulkDeleteConfirm]);

  const handleOpenBulkLog = useCallback(() => {
    if (selectedHabitIds.size === 0) return;
    void confirmBulkLog();
  }, [confirmBulkLog, selectedHabitIds]);

  const handleOpenBulkSkip = useCallback(() => {
    if (selectedHabitIds.size === 0) return;
    void confirmBulkSkip();
  }, [confirmBulkSkip, selectedHabitIds]);

  return {
    completionReadOnly,
    ...bulkActions,
    clearSelection,
    allSelected,
    selectedCount,
    handleToggleSelectMode,
    handleSelectAll,
    handleDeselectAll,
    handleOpenBulkDelete,
    handleOpenBulkLog,
    handleOpenBulkSkip,
  };
}
