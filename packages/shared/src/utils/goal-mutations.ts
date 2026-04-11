import type {
  CreateGoalRequest,
  Goal,
  GoalDetailWithMetrics,
  GoalStatus,
  UpdateGoalRequest,
} from '../types/goal'

export function sortGoalsByPosition(a: Goal, b: Goal): number {
  if (a.position !== b.position) return a.position - b.position
  return a.createdAtUtc.localeCompare(b.createdAtUtc)
}

function computeGoalProgressPercentage(currentValue: number, targetValue: number): number {
  if (targetValue <= 0) return 0
  return Math.min(100, Math.round((currentValue / targetValue) * 1000) / 10)
}

function resolveDefinedValue<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback
}

export function buildTempGoal(
  request: CreateGoalRequest,
  id: string,
  position: number,
): Goal {
  return {
    id,
    title: request.title,
    description: request.description ?? null,
    targetValue: request.targetValue,
    currentValue: 0,
    unit: request.unit,
    type: request.type,
    status: 'Active',
    deadline: request.deadline ?? null,
    position,
    createdAtUtc: new Date().toISOString(),
    completedAtUtc: null,
    progressPercentage: 0,
  }
}

export function nextGoalPosition(goals: Goal[]): number {
  if (goals.length === 0) return 0
  return Math.max(...goals.map((goal) => goal.position)) + 1
}

export function updateGoalListItem(goal: Goal, data: UpdateGoalRequest): Goal {
  return {
    ...goal,
    title: data.title,
    description: resolveDefinedValue(data.description, goal.description),
    targetValue: data.targetValue,
    unit: data.unit,
    deadline: resolveDefinedValue(data.deadline, goal.deadline),
    progressPercentage: computeGoalProgressPercentage(goal.currentValue, data.targetValue),
  }
}

export function updateGoalDetailItem(
  detail: GoalDetailWithMetrics | undefined,
  data: UpdateGoalRequest,
): GoalDetailWithMetrics | undefined {
  if (!detail) return detail

  return {
    goal: {
      ...detail.goal,
      ...updateGoalListItem(detail.goal, data),
    },
    metrics: {
      ...detail.metrics,
      progressPercentage: computeGoalProgressPercentage(detail.goal.currentValue, data.targetValue),
    },
  }
}

export function updateGoalProgressItem(goal: Goal, currentValue: number): Goal {
  return {
    ...goal,
    currentValue,
    progressPercentage: computeGoalProgressPercentage(currentValue, goal.targetValue),
  }
}

export function updateGoalProgressDetail(
  detail: GoalDetailWithMetrics | undefined,
  currentValue: number,
): GoalDetailWithMetrics | undefined {
  if (!detail) return detail

  return {
    goal: {
      ...detail.goal,
      ...updateGoalProgressItem(detail.goal, currentValue),
    },
    metrics: {
      ...detail.metrics,
      progressPercentage: computeGoalProgressPercentage(currentValue, detail.goal.targetValue),
    },
  }
}

export function updateGoalStatusItem(goal: Goal, status: GoalStatus): Goal {
  return {
    ...goal,
    status,
    completedAtUtc: status === 'Completed' ? goal.completedAtUtc ?? new Date().toISOString() : null,
    progressPercentage: status === 'Completed' ? 100 : goal.progressPercentage,
  }
}

export function updateGoalStatusDetail(
  detail: GoalDetailWithMetrics | undefined,
  status: GoalStatus,
): GoalDetailWithMetrics | undefined {
  if (!detail) return detail

  return {
    goal: {
      ...detail.goal,
      ...updateGoalStatusItem(detail.goal, status),
    },
    metrics: {
      ...detail.metrics,
      progressPercentage: status === 'Completed' ? 100 : detail.metrics.progressPercentage,
    },
  }
}
