/** The one date fact the goal detail line states. */
export type GoalDeadlineFact =
  | { kind: 'daysLeft'; days: number }
  | { kind: 'dueToday' }
  | { kind: 'passed'; date: string }

const DAY_MS = 24 * 60 * 60 * 1000

function calendarDay(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
}

/**
 * The date fact of an active goal, counted in calendar days from the account's today (`YYYY-MM-DD`).
 * Null with no deadline, or for a goal that is no longer active, so the line is absent.
 */
export function getGoalDeadlineFact(
  goal: { deadline?: string | null; status: string },
  today: string,
): GoalDeadlineFact | null {
  if (!goal.deadline || goal.status !== 'Active') return null
  const deadlineDay = calendarDay(goal.deadline)
  const todayDay = calendarDay(today)
  if (deadlineDay === null || todayDay === null) return null
  const days = deadlineDay - todayDay
  if (days > 0) return { kind: 'daysLeft', days }
  if (days === 0) return { kind: 'dueToday' }
  return { kind: 'passed', date: goal.deadline.slice(0, 10) }
}
