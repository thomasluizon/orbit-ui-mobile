import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal, GoalDetailWithMetrics } from '../types/goal'
import {
  buildTempGoal,
  nextGoalPosition,
  sortGoalsByPosition,
  updateGoalDetailItem,
  updateGoalProgressDetail,
  updateGoalProgressItem,
  updateGoalStatusDetail,
  updateGoalStatusItem,
} from '../utils/goal-mutations'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? 'goal-1',
    title: overrides.title ?? 'Read',
    description: overrides.description ?? null,
    targetValue: overrides.targetValue ?? 10,
    currentValue: overrides.currentValue ?? 2,
    unit: overrides.unit ?? 'books',
    status: overrides.status ?? 'Active',
    deadline: overrides.deadline ?? null,
    position: overrides.position ?? 0,
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00.000Z',
    completedAtUtc: overrides.completedAtUtc ?? null,
    progressPercentage: overrides.progressPercentage ?? 20,
  }
}

function makeDetail(goal: Goal): GoalDetailWithMetrics {
  return {
    goal: {
      ...goal,
      progressHistory: [],
    },
    metrics: {
      progressPercentage: goal.progressPercentage,
      velocityPerDay: 0,
      projectedCompletionDate: null,
      daysToDeadline: null,
      trackingStatus: 'on_track',
      habitAdherence: [],
    },
  }
}

describe('goal mutation utils', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('sorts goals by position then creation time', () => {
    const goals = [
      makeGoal({ id: 'b', position: 1, createdAtUtc: '2025-01-03T00:00:00.000Z' }),
      makeGoal({ id: 'a', position: 0, createdAtUtc: '2025-01-02T00:00:00.000Z' }),
      makeGoal({ id: 'c', position: 1, createdAtUtc: '2025-01-01T00:00:00.000Z' }),
    ]

    expect(goals.sort(sortGoalsByPosition).map((goal) => goal.id)).toEqual(['a', 'c', 'b'])
  })

  it('builds a temporary goal with normalized defaults', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-04-08T12:00:00.000Z'))

    expect(buildTempGoal({
      title: 'Workout',
      targetValue: 4,
      unit: 'sessions',
    }, 'offline-goal-1', 3)).toMatchObject({
      id: 'offline-goal-1',
      title: 'Workout',
      targetValue: 4,
      currentValue: 0,
      unit: 'sessions',
      status: 'Active',
      position: 3,
      progressPercentage: 0,
    })
  })

  it('computes next position and updates goal detail, progress, and status', () => {
    const goal = makeGoal({ currentValue: 2, targetValue: 8, progressPercentage: 25 })
    const detail = makeDetail(goal)

    expect(nextGoalPosition([goal, makeGoal({ id: 'goal-2', position: 4 })])).toBe(5)
    expect(updateGoalProgressItem(goal, 6)).toMatchObject({
      currentValue: 6,
      progressPercentage: 75,
    })
    expect(updateGoalProgressDetail(detail, 6)).toMatchObject({
      goal: { currentValue: 6, progressPercentage: 75 },
      metrics: { progressPercentage: 75 },
    })
    expect(updateGoalDetailItem(detail, {
      title: 'Write',
      targetValue: 20,
      unit: 'pages',
    })).toMatchObject({
      goal: {
        title: 'Write',
        targetValue: 20,
        unit: 'pages',
        progressPercentage: 10,
      },
      metrics: {
        progressPercentage: 10,
      },
    })
  })

  it('marks completed goals with a completion timestamp and 100 percent progress', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-04-08T12:00:00.000Z'))
    const goal = makeGoal({ progressPercentage: 40 })
    const detail = makeDetail(goal)

    expect(updateGoalStatusItem(goal, 'Completed')).toMatchObject({
      status: 'Completed',
      progressPercentage: 100,
      completedAtUtc: '2025-04-08T12:00:00.000Z',
    })
    expect(updateGoalStatusDetail(detail, 'Completed')).toMatchObject({
      goal: { status: 'Completed', progressPercentage: 100 },
      metrics: { progressPercentage: 100 },
    })
  })
})
