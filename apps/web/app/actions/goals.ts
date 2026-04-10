'use server'

import type {
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function createGoal(data: CreateGoalRequest): Promise<{ id: string }> {
  return serverAuthFetch('/api/goals', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateGoal(goalId: string, data: UpdateGoalRequest): Promise<void> {
  await serverAuthFetch(`/api/goals/${goalId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteGoal(goalId: string): Promise<void> {
  await serverAuthFetch(`/api/goals/${goalId}`, {
    method: 'DELETE',
  })
}

export async function updateGoalProgress(
  goalId: string,
  data: UpdateGoalProgressRequest,
): Promise<void> {
  await serverAuthFetch(`/api/goals/${goalId}/progress`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateGoalStatus(
  goalId: string,
  data: UpdateGoalStatusRequest,
): Promise<void> {
  await serverAuthFetch(`/api/goals/${goalId}/status`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function reorderGoals(positions: GoalPositionItem[]): Promise<void> {
  await serverAuthFetch('/api/goals/reorder', {
    method: 'PUT',
    body: JSON.stringify({ positions }),
  })
}

export async function linkHabitsToGoal(
  goalId: string,
  habitIds: string[],
): Promise<void> {
  await serverAuthFetch(`/api/goals/${goalId}/habits`, {
    method: 'PUT',
    body: JSON.stringify({ habitIds }),
  })
}
