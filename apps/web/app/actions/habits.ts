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
  bulkCreateResponseSchema,
  bulkDeleteResponseSchema,
  bulkLogResultSchema,
  bulkSkipResultSchema,
} from '@orbit/shared'
import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function createHabit(data: CreateHabitRequest): Promise<{ id: string }> {
  return serverAuthFetch(API.habits.create, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function suggestHabitSetup(
  data: HabitSetupSuggestionRequest,
): Promise<HabitSetupSuggestion> {
  return serverAuthFetch(
    API.habits.suggestSetup,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    habitSetupSuggestionSchema,
  )
}

export async function updateHabit(habitId: string, data: UpdateHabitRequest): Promise<void> {
  await serverAuthFetch(API.habits.update(habitId), {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteHabit(habitId: string): Promise<void> {
  await serverAuthFetch(API.habits.delete(habitId), {
    method: 'DELETE',
  })
}

export async function restoreHabit(habitId: string): Promise<void> {
  await serverAuthFetch(API.habits.restore(habitId), {
    method: 'POST',
  })
}

export async function logHabit(
  habitId: string,
  data?: LogHabitRequest,
): Promise<LogHabitResponse> {
  return serverAuthFetch(API.habits.log(habitId), {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
}

export async function skipHabit(
  habitId: string,
  date?: string,
): Promise<void> {
  await serverAuthFetch(API.habits.skip(habitId), {
    method: 'POST',
    body: date ? JSON.stringify({ date }) : undefined,
  })
}

export async function bulkCreateHabits(data: BulkCreateRequest): Promise<BulkCreateResponse> {
  return serverAuthFetch(
    API.habits.bulk,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    bulkCreateResponseSchema,
  )
}

export async function bulkDeleteHabits(habitIds: string[]): Promise<BulkDeleteResponse> {
  return serverAuthFetch(
    API.habits.bulk,
    {
      method: 'DELETE',
      body: JSON.stringify({ habitIds }),
    },
    bulkDeleteResponseSchema,
  )
}

export async function bulkLogHabits(items: BulkLogItemRequest[]): Promise<BulkLogResult> {
  return serverAuthFetch(
    API.habits.bulkLog,
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    },
    bulkLogResultSchema,
  )
}

export async function bulkSkipHabits(items: BulkSkipItemRequest[]): Promise<BulkSkipResult> {
  return serverAuthFetch(
    API.habits.bulkSkip,
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    },
    bulkSkipResultSchema,
  )
}

export async function reorderHabits(data: ReorderHabitsRequest): Promise<void> {
  await serverAuthFetch(API.habits.reorder, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function createSubHabit(
  parentId: string,
  data: CreateSubHabitRequest,
): Promise<void> {
  await serverAuthFetch(API.habits.subHabits(parentId), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function moveHabitParent(
  habitId: string,
  data: MoveHabitParentRequest,
): Promise<void> {
  await serverAuthFetch(API.habits.parent(habitId), {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function duplicateHabit(habitId: string): Promise<void> {
  await serverAuthFetch(API.habits.duplicate(habitId), {
    method: 'POST',
  })
}

export async function updateChecklist(
  habitId: string,
  checklistItems: ChecklistItem[],
): Promise<void> {
  await serverAuthFetch(API.habits.checklist(habitId), {
    method: 'PUT',
    body: JSON.stringify({ checklistItems }),
  })
}

export async function linkGoalsToHabit(
  habitId: string,
  goalIds: string[],
): Promise<void> {
  await serverAuthFetch(API.habits.goals(habitId), {
    method: 'PUT',
    body: JSON.stringify({ goalIds }),
  })
}
