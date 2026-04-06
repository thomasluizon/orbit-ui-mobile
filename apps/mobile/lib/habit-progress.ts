export const HABIT_PROGRESS_RING_CIRCUMFERENCE = 94.25

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
