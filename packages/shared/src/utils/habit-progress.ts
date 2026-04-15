import type { NormalizedHabit } from '../types/habit'

/**
 * Circumference of the avatar progress arc (r=15, 2*pi*r ≈ 94.25).
 * Shared between web (conic-gradient fallback) and mobile (SVG arc) so the
 * "Avatar + Arc" visual reads identically across platforms.
 */
export const HABIT_PROGRESS_RING_CIRCUMFERENCE = 94.25

/**
 * Returns an SVG `stroke-dasharray` value rendering the given progress
 * percentage along a circle of `HABIT_PROGRESS_RING_CIRCUMFERENCE`.
 *
 * `progressPercent` is clamped to 0..100. When `isDoneForRange` is true the
 * arc fills completely regardless of percent (a parent habit's children may
 * not all be ticked but the parent itself is logged for the day).
 */
export function getHabitProgressStrokeDasharray(
  progressPercent: number,
  isDoneForRange: boolean,
): string {
  const clampedPercent = Math.max(0, Math.min(100, progressPercent))
  const filledLength = isDoneForRange
    ? HABIT_PROGRESS_RING_CIRCUMFERENCE
    : (clampedPercent / 100) * HABIT_PROGRESS_RING_CIRCUMFERENCE

  return `${filledLength.toFixed(2)} ${HABIT_PROGRESS_RING_CIRCUMFERENCE}`
}

type ProgressInput = Pick<
  NormalizedHabit,
  | 'isCompleted'
  | 'isLoggedInRange'
  | 'isFlexible'
  | 'flexibleTarget'
  | 'flexibleCompleted'
  | 'frequencyQuantity'
  | 'frequencyUnit'
>

interface ProgressContext {
  hasChildren?: boolean
  childrenDone?: number
  childrenTotal?: number
}

/**
 * Returns the 0..1 fill ratio for the avatar arc.
 *
 * Priority:
 *  1. Completed for the range  -> 1
 *  2. Parent with children     -> childrenDone / childrenTotal
 *  3. Flexible habit           -> flexibleCompleted / flexibleTarget
 *  4. Otherwise                -> 0 (no arc rendered by the consumer)
 */
export function getHabitProgressRatio(
  habit: ProgressInput,
  context: ProgressContext = {},
): number {
  if (habit.isCompleted || habit.isLoggedInRange) return 1

  const { hasChildren, childrenDone = 0, childrenTotal = 0 } = context
  if (hasChildren && childrenTotal > 0) {
    return clamp01(childrenDone / childrenTotal)
  }

  if (habit.isFlexible) {
    const target = habit.flexibleTarget ?? habit.frequencyQuantity ?? 0
    if (target <= 0) return 0
    const done = habit.flexibleCompleted ?? 0
    return clamp01(done / target)
  }

  return 0
}

/**
 * True when the avatar should render a progress arc around it. Parents with
 * children and flexible habits both need an arc; simple habits don't.
 */
export function shouldShowHabitProgressArc(
  habit: ProgressInput,
  context: ProgressContext = {},
): boolean {
  if (habit.isCompleted || habit.isLoggedInRange) return true
  const { hasChildren, childrenTotal = 0 } = context
  if (hasChildren && childrenTotal > 0) return true
  if (habit.isFlexible && (habit.flexibleTarget ?? habit.frequencyQuantity ?? 0) > 0) {
    return true
  }
  return false
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
