'use server'

import type {
  CreateHabitRequest,
  HabitSetupSuggestion,
  HabitSetupSuggestionRequest,
  UpdateHabitRequest,
  LogHabitRequest,
  LogHabitResponse,
  BulkCreateRequest,
  BulkCreateResponse,
  BulkDeleteResponse,
  BulkLogItemRequest,
  BulkLogResult,
  BulkSkipItemRequest,
  BulkSkipResult,
  ReorderHabitsRequest,
  CreateSubHabitRequest,
  MoveHabitParentRequest,
  ChecklistItem,
} from '@orbit/shared'
import {
  habitSetupSuggestionSchema,
  logHabitResponseSchema,
  bulkCreateResponseSchema,
  bulkDeleteResponseSchema,
  bulkLogResultSchema,
  bulkSkipResultSchema,
  createHabitRequestSchema,
  updateHabitRequestSchema,
  validateApiRequest,
} from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { serverAuthMutate } from '@/lib/server-fetch'
import { wrapServerAction, type ServerActionResult } from './action-result'

export async function createHabit(
  data: CreateHabitRequest, intendedAccountId: string | null
): Promise<ServerActionResult<{ id: string }>> {
  return wrapServerAction(() => {
    const request = validateApiRequest(data, createHabitRequestSchema)
    return serverAuthMutate(API.habits.create, {
      method: 'POST',
      body: JSON.stringify(request),
    }, intendedAccountId)
  })
}

export async function suggestHabitSetup(
  data: HabitSetupSuggestionRequest, intendedAccountId: string | null
): Promise<ServerActionResult<HabitSetupSuggestion>> {
  return wrapServerAction(() => serverAuthMutate(
    API.habits.suggestSetup,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }, intendedAccountId,
    habitSetupSuggestionSchema,
  ))
}

export async function updateHabit(
  habitId: string,
  data: UpdateHabitRequest, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => {
    const request = validateApiRequest(data, updateHabitRequestSchema)
    return serverAuthMutate(API.habits.update(habitId), {
      method: 'PUT',
      body: JSON.stringify(request),
    }, intendedAccountId)
  })
}

export async function deleteHabit(habitId: string, intendedAccountId: string | null): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.delete(habitId), {
    method: 'DELETE',
  }, intendedAccountId))
}

export async function restoreHabit(habitId: string, intendedAccountId: string | null): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.restore(habitId), {
    method: 'POST',
  }, intendedAccountId))
}

export async function logHabit(
  habitId: string,
  data: LogHabitRequest | undefined, intendedAccountId: string | null
): Promise<ServerActionResult<LogHabitResponse>> {
  return wrapServerAction(() => serverAuthMutate(
    API.habits.log(habitId),
    {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }, intendedAccountId,
    logHabitResponseSchema,
  ))
}

export async function skipHabit(
  habitId: string,
  date: string | undefined, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.skip(habitId), {
    method: 'POST',
    body: date ? JSON.stringify({ date }) : undefined,
  }, intendedAccountId))
}

export async function bulkCreateHabits(
  data: BulkCreateRequest, intendedAccountId: string | null
): Promise<ServerActionResult<BulkCreateResponse>> {
  return wrapServerAction(() => serverAuthMutate(
    API.habits.bulk,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }, intendedAccountId,
    bulkCreateResponseSchema,
  ))
}

export async function bulkDeleteHabits(
  habitIds: string[], intendedAccountId: string | null
): Promise<ServerActionResult<BulkDeleteResponse>> {
  return wrapServerAction(() => serverAuthMutate(
    API.habits.bulk,
    {
      method: 'DELETE',
      body: JSON.stringify({ habitIds }),
    }, intendedAccountId,
    bulkDeleteResponseSchema,
  ))
}

export async function bulkLogHabits(
  items: BulkLogItemRequest[], intendedAccountId: string | null
): Promise<ServerActionResult<BulkLogResult>> {
  return wrapServerAction(() => serverAuthMutate(
    API.habits.bulkLog,
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    }, intendedAccountId,
    bulkLogResultSchema,
  ))
}

export async function bulkSkipHabits(
  items: BulkSkipItemRequest[], intendedAccountId: string | null
): Promise<ServerActionResult<BulkSkipResult>> {
  return wrapServerAction(() => serverAuthMutate(
    API.habits.bulkSkip,
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    }, intendedAccountId,
    bulkSkipResultSchema,
  ))
}

export async function reorderHabits(
  data: ReorderHabitsRequest, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.reorder, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function createSubHabit(
  parentId: string,
  data: CreateSubHabitRequest, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.subHabits(parentId), {
    method: 'POST',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function moveHabitParent(
  habitId: string,
  data: MoveHabitParentRequest, intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.parent(habitId), {
    method: 'PUT',
    body: JSON.stringify(data),
  }, intendedAccountId))
}

export async function duplicateHabit(habitId: string, intendedAccountId: string | null): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.duplicate(habitId), {
    method: 'POST',
  }, intendedAccountId))
}

export async function updateChecklist(
  habitId: string,
  checklistItems: ChecklistItem[], intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.checklist(habitId), {
    method: 'PUT',
    body: JSON.stringify({ checklistItems }),
  }, intendedAccountId))
}

export async function linkGoalsToHabit(
  habitId: string,
  goalIds: string[], intendedAccountId: string | null
): Promise<ServerActionResult<void>> {
  return wrapServerAction(() => serverAuthMutate(API.habits.goals(habitId), {
    method: 'PUT',
    body: JSON.stringify({ goalIds }),
  }, intendedAccountId))
}
