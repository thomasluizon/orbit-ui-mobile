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
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function createGoal(
  data: CreateGoalRequest,
): Promise<ServerActionResult<{ id: string }>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.create, {
    method: 'POST',
    body: JSON.stringify(data),
  }))
}

export async function updateGoal(
  goalId: string,
  data: UpdateGoalRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.update(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function deleteGoal(goalId: string): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.delete(goalId), {
    method: 'DELETE',
  }))
}

export async function restoreGoal(goalId: string): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.restore(goalId), {
    method: 'POST',
  }))
}

export async function updateGoalProgress(
  goalId: string,
  data: UpdateGoalProgressRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.progress(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function updateGoalStatus(
  goalId: string,
  data: UpdateGoalStatusRequest,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.status(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  }))
}

export async function reorderGoals(
  positions: GoalPositionItem[],
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.reorder, {
    method: 'PUT',
    body: JSON.stringify({ positions }),
  }))
}

export async function linkHabitsToGoal(
  goalId: string,
  habitIds: string[],
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthFetch(API.goals.habits(goalId), {
    method: 'PUT',
    body: JSON.stringify({ habitIds }),
  }))
}
