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
    // react-doctor-disable-next-line no-prop-callback-in-render -- Deliberate adjusting-state-during-render pattern (mirrors web useTodayViewSync); the prop setter is an idempotent guard (constant value under a change check), so a replayed render is harmless. Moving to an effect would add a flash and break web parity. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    setShowScrollTop(false);
  }

  const [prevIsSelectMode, setPrevIsSelectMode] = useState(isSelectMode);
  if (isSelectMode !== prevIsSelectMode) {
    setPrevIsSelectMode(isSelectMode);
    // react-doctor-disable-next-line no-prop-callback-in-render -- Deliberate adjusting-state-during-render pattern (mirrors web useTodayViewSync); the prop setter is an idempotent guard (constant value under a change check), so a replayed render is harmless. Moving to an effect would add a flash and break web parity. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    if (isSelectMode) setRenderBulkActionBar(true);
  }

  const [previousPinnedDateStr, setPreviousPinnedDateStr] = useState<
    string | null
  >(null);
  if (pinnedDateStr !== previousPinnedDateStr) {
    setPreviousPinnedDateStr(pinnedDateStr);
    // react-doctor-disable-next-line no-prop-callback-in-render -- Deliberate adjusting-state-during-render pattern (mirrors web useTodayViewSync); the prop setter is an idempotent guard (constant value under a change check), so a replayed render is harmless. Moving to an effect would add a flash and break web parity. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    if (pinnedDateStr) setActiveView("today");
  }

  const [prevFilters, setPrevFilters] = useState(filters);
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    // react-doctor-disable-next-line no-prop-callback-in-render -- Deliberate adjusting-state-during-render pattern (mirrors web useTodayViewSync); the prop setter mirrors the just-computed filters under a change check, so a replayed render is harmless. Moving to an effect would add a flash and break web parity. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    setFilters(filters);
  }
}
