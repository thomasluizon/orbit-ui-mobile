import { useCallback, useEffect, useRef, type RefObject } from "react";
import { BackHandler } from "react-native";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import type { HabitListHandle } from "@/components/habit-list";
import { useUIStore } from "@/stores/ui-store";
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { shouldResetSelectionForViewChange } from "@/lib/habit-selection-state";

interface TodaySelectionInput {
  habitsById: Map<string, NormalizedHabit>;
  habitListRef: RefObject<HabitListHandle | null>;
  habitListAllLoadedIds: Set<string>;
  visibleHabitIds: Set<string>;
  closeControlsMenu: () => void;
}

/**
 * Owns the Today screen's multi-select / bulk-action concern: the bulk
 * mutations, the select-all/deselect handlers, the hardware-back and
 * view-change selection resets, and the derived selection counts. Extracted
 * from TodayScreen unchanged.
 */
export function useTodaySelection({
  habitsById,
  habitListRef,
  habitListAllLoadedIds,
  visibleHabitIds,
  closeControlsMenu,
}: TodaySelectionInput) {
  const activeView = useUIStore((s) => s.activeView);
  const isSelectMode = useUIStore((s) => s.isSelectMode);
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds);
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode);
  const selectAllHabits = useUIStore((s) => s.selectAllHabits);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const previousActiveViewRef = useRef(activeView);

  const bulkActions = useBulkActions({
    selectedHabitIds,
    habitsById,
    habitListRef,
    onSuccess: clearSelection,
  });
  const {
    setShowBulkDeleteConfirm,
    setShowBulkLogConfirm,
    setShowBulkSkipConfirm,
  } = bulkActions;

  const allLoadedIds =
    habitListAllLoadedIds.size > 0 ? habitListAllLoadedIds : visibleHabitIds;

  const allSelected =
    allLoadedIds.size > 0 &&
    Array.from(allLoadedIds).every((id) => selectedHabitIds.has(id));

  const selectedCount = selectedHabitIds.size;

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
    setShowBulkLogConfirm(true);
  }, [selectedHabitIds, setShowBulkLogConfirm]);

  const handleOpenBulkSkip = useCallback(() => {
    if (selectedHabitIds.size === 0) return;
    setShowBulkSkipConfirm(true);
  }, [selectedHabitIds, setShowBulkSkipConfirm]);

  return {
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
