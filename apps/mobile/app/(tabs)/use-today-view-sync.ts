import { useState } from "react";

export interface TodayViewSyncParams {
  currentActiveView: string;
  isSelectMode: boolean;
  pinnedDateStr: string | null;
  setShowScrollTop: (value: boolean) => void;
  setRenderBulkActionBar: (value: boolean) => void;
  setActiveView: (view: "today") => void;
  closeSearch: () => void;
}

export function useTodayViewSync({
  currentActiveView,
  isSelectMode,
  pinnedDateStr,
  setShowScrollTop,
  setRenderBulkActionBar,
  setActiveView,
  closeSearch,
}: TodayViewSyncParams) {
  const [prevScrollTopView, setPrevScrollTopView] = useState(currentActiveView);
  if (currentActiveView !== prevScrollTopView) {
    setPrevScrollTopView(currentActiveView);
    // react-doctor-disable-next-line no-prop-callback-in-render -- Deliberate adjusting-state-during-render pattern (mirrors web useTodayViewSync); the prop setter is an idempotent guard (constant value under a change check), so a replayed render is harmless. Moving to an effect would add a flash and break web parity. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    setShowScrollTop(false);
    // react-doctor-disable-next-line no-prop-callback-in-render -- Deliberate adjusting-state-during-render pattern (mirrors web useTodayViewSync); the prop setter is an idempotent guard (constant value under a change check), so a replayed render is harmless. Moving to an effect would add a flash and break web parity. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    closeSearch();
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
    // react-doctor-disable-next-line no-prop-callback-in-render -- Deliberate adjusting-state-during-render pattern (mirrors web useTodayViewSync); the prop setter is an idempotent guard (constant value under a change check), so a replayed render is harmless. Moving to an effect would add a flash and break web parity. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    closeSearch();
  }

}
