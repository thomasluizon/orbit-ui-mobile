'use server'

import type {
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared'
import { serverAuthFetch } from '@/lib/server-fetch'
import { API } from '@orbit/shared/api'

export async function createGoal(data: CreateGoalRequest): Promise<{ id: string }> {
  return serverAuthFetch(API.goals.create, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateGoal(goalId: string, data: UpdateGoalRequest): Promise<void> {
  await serverAuthFetch(API.goals.update(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteGoal(goalId: string): Promise<void> {
  await serverAuthFetch(API.goals.delete(goalId), {
    method: 'DELETE',
  })
}

export async function updateGoalProgress(
  goalId: string,
  data: UpdateGoalProgressRequest,
): Promise<void> {
  await serverAuthFetch(API.goals.progress(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateGoalStatus(
  goalId: string,
  data: UpdateGoalStatusRequest,
): Promise<void> {
  await serverAuthFetch(API.goals.status(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function reorderGoals(positions: GoalPositionItem[]): Promise<void> {
  await serverAuthFetch(API.goals.reorder, {
    method: 'PUT',
    body: JSON.stringify({ positions }),
  })
}

export async function linkHabitsToGoal(
  goalId: string,
  habitIds: string[],
): Promise<void> {
  await serverAuthFetch(API.goals.habits(goalId), {
    method: 'PUT',
    body: JSON.stringify({ habitIds }),
  })
}
