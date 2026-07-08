import { useState } from "react";
import type { HabitsFilter } from "@orbit/shared/types/habit";

export interface TodayViewSyncParams {
  currentActiveView: string;
  isSelectMode: boolean;
  pinnedDateStr: string | null;
  filters: HabitsFilter;
  setShowScrollTop: (value: boolean) => void;
  setRenderBulkActionBar: (value: boolean) => void;
  setActiveView: (view: "today") => void;
  setFilters: (filters: HabitsFilter) => void;
}

/**
 * Render-phase view synchronisation for the Today screen (adjusting-state-during-render
 * pattern): resets the scroll-to-top affordance when the view changes, mounts the bulk
 * action bar when entering select mode, pins the "today" view for a deep-linked date, and
 * mirrors the computed filters into the shared store. Mirrors the web `useTodayViewSync`.
 */
export function useTodayViewSync({
  currentActiveView,
  isSelectMode,
  pinnedDateStr,
  filters,
  setShowScrollTop,
  setRenderBulkActionBar,
  setActiveView,
  setFilters,
}: TodayViewSyncParams) {
  const [prevScrollTopView, setPrevScrollTopView] = useState(currentActiveView);
  if (currentActiveView !== prevScrollTopView) {
    setPrevScrollTopView(currentActiveView);
    setShowScrollTop(false);
  }

  const [prevIsSelectMode, setPrevIsSelectMode] = useState(isSelectMode);
  if (isSelectMode !== prevIsSelectMode) {
    setPrevIsSelectMode(isSelectMode);
    if (isSelectMode) setRenderBulkActionBar(true);
  }

  const [previousPinnedDateStr, setPreviousPinnedDateStr] = useState<
    string | null
  >(null);
  if (pinnedDateStr !== previousPinnedDateStr) {
    setPreviousPinnedDateStr(pinnedDateStr);
    if (pinnedDateStr) setActiveView("today");
  }

  const [prevFilters, setPrevFilters] = useState(filters);
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setFilters(filters);
  }
}
