export interface HabitDetailSummaryInput {
  currentStreak: number
  streakLabel: string
  hasLinkedGoal: boolean
  linkedGoalLabel: string
  checklistChecked: number
  checklistTotal: number
}

/**
 * Builds the habit-detail summary strip text (e.g. "Current 12  ·  Linked goal  ·  3/5").
 * Pure: callers pass already-translated labels. Returns "" when nothing is worth showing,
 * so the consumer can skip rendering the strip entirely.
 */
export function formatHabitDetailSummary({
  currentStreak,
  streakLabel,
  hasLinkedGoal,
  linkedGoalLabel,
  checklistChecked,
  checklistTotal,
}: HabitDetailSummaryInput): string {
  const parts: string[] = []
  if (currentStreak) parts.push(`${streakLabel} ${currentStreak}`)
  if (hasLinkedGoal) parts.push(linkedGoalLabel)
  if (checklistTotal > 0) parts.push(`${checklistChecked}/${checklistTotal}`)
  return parts.join('  ·  ')
}
