export { buildHabitViewFilters as buildTodayFilters, type HabitViewFiltersInput as TodayFiltersInput } from '@orbit/shared/utils'

export function resolveBulkActionBarEnterShift(selectionMotion: {
  shift: number;
  reducedMotionEnabled: boolean;
}): number {
  return selectionMotion.reducedMotionEnabled
    ? selectionMotion.shift
    : Math.max(12, selectionMotion.shift);
}
