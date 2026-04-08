import type { Goal } from '../types/goal'
import { sortGoalsByPosition } from './goal-mutations'

export interface NormalizedGoalsData {
  goalsById: Map<string, Goal>
  allGoals: Goal[]
  totalCount: number
  totalPages: number
  currentPage: number
}

export function normalizeGoalQueryData(items: Goal[]): NormalizedGoalsData {
  const goalsById = new Map<string, Goal>()

  for (const goal of items) {
    goalsById.set(goal.id, goal)
  }

  return {
    goalsById,
    allGoals: Array.from(goalsById.values()).sort(sortGoalsByPosition),
    totalCount: items.length,
    totalPages: 1,
    currentPage: 1,
  }
}
