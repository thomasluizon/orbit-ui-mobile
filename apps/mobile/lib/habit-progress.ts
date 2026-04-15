// Mobile re-export for the shared habit-progress utilities. New consumers
// should import from `@orbit/shared/utils` directly; this barrel exists so
// older imports + the local test file keep working.
export {
  HABIT_PROGRESS_RING_CIRCUMFERENCE,
  getHabitProgressRatio,
  getHabitProgressStrokeDasharray,
  shouldShowHabitProgressArc,
} from '@orbit/shared/utils'
