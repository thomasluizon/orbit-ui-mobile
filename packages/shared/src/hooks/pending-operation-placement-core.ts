import type { HabitPlacement, PendingOperationItem } from '../types/ai'

export interface PendingOperationPlacementEdit {
  itemId: string
  value: HabitPlacement
}

type PlacementRevision = (
  items: readonly PendingOperationItem[],
  edits?: { itemId: string; values: Record<string, unknown> },
  placement?: PendingOperationPlacementEdit,
) => Promise<boolean>

type PlacementSwitch = (itemId: string, value: HabitPlacement) => Promise<boolean>
type PlacementHook = (items: readonly PendingOperationItem[], revise: PlacementRevision, blocked: boolean) => PlacementSwitch

export function createUsePendingOperationPlacement(useCallback: <Callback extends (...args: never[]) => unknown>(
  callback: Callback, dependencies: readonly unknown[],
) => Callback): PlacementHook {
  return function usePendingOperationPlacement(
    items: readonly PendingOperationItem[], revise: PlacementRevision, blocked: boolean,
  ) {
    return useCallback((itemId: string, value: HabitPlacement): Promise<boolean> => {
      const placement = items.find((item) => item.itemId === itemId)?.placement
      if (blocked || !placement || !placement.alternatives.includes(value)) return Promise.resolve(false)
      return revise(items, undefined, { itemId, value })
    }, [items, revise, blocked])
  }
}
