'use server'

import type {
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared'
import { serverAuthMutate } from '@/lib/server-fetch'
import { API } from '@orbit/shared/api'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function createGoal(
  data: CreateGoalRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<{ id: string }>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.create, {
    method: 'POST',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateGoal(
  goalId: string,
  data: UpdateGoalRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.update(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function deleteGoal(
  goalId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.delete(goalId), {
    method: 'DELETE',
  }, intendedAccountId))
}

export async function restoreGoal(
  goalId: string,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.restore(goalId), {
    method: 'POST',
  }, intendedAccountId))
}

export async function updateGoalProgress(
  goalId: string,
  data: UpdateGoalProgressRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.progress(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function updateGoalStatus(
  goalId: string,
  data: UpdateGoalStatusRequest,
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.status(goalId), {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function reorderGoals(
  positions: GoalPositionItem[],
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.reorder, {
    method: 'PUT',
    body: JSON.stringify({ positions }),
  }, intendedAccountId))
}

export async function linkHabitsToGoal(
  goalId: string,
  habitIds: string[],
  intendedAccountId: string | null,
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.goals.habits(goalId), {
    method: 'PUT',
    body: JSON.stringify({ habitIds }),
  }, intendedAccountId))
}
