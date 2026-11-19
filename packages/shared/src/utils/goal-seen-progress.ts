/** The progress of each goal the last time the person saw the goals list, on this device, for one account. */
export type GoalSeenProgress = Readonly<Record<string, number>>

export const GOAL_SEEN_PROGRESS_STORAGE_KEY = 'orbit_goal_seen_progress'

/** Reads the stored map. A missing or damaged value is an empty map, so no ring sweeps on a guess. */
export function parseGoalSeenProgress(raw: string | null | undefined): GoalSeenProgress {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
  } catch {
    return {}
  }
}

/** The value a ring sweeps from: the last seen progress when it changed since then. Null for a first sight or no change. */
export function goalProgressSweepStart(seen: GoalSeenProgress | null, goalId: string, current: number): number | null {
  const previous = seen?.[goalId]
  return previous === undefined || previous === current ? null : previous
}

/** The map to store after a visit: the progress the list shows now for each goal. */
export function recordGoalSeenProgress(goals: readonly { id: string; progressPercentage: number }[]): GoalSeenProgress {
  return Object.fromEntries(goals.map((goal) => [goal.id, goal.progressPercentage]))
}
