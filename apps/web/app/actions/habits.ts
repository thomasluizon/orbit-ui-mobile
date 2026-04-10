'use server'

import type {
  CreateHabitRequest,
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
import { serverAuthFetch } from '@/lib/server-fetch'

export async function createHabit(data: CreateHabitRequest): Promise<{ id: string }> {
  return serverAuthFetch('/api/habits', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateHabit(habitId: string, data: UpdateHabitRequest): Promise<void> {
  await serverAuthFetch(`/api/habits/${habitId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteHabit(habitId: string): Promise<void> {
  await serverAuthFetch(`/api/habits/${habitId}`, {
    method: 'DELETE',
  })
}

export async function logHabit(
  habitId: string,
  data?: LogHabitRequest,
): Promise<LogHabitResponse> {
  return serverAuthFetch(`/api/habits/${habitId}/log`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
}

export async function skipHabit(
  habitId: string,
  date?: string,
): Promise<void> {
  await serverAuthFetch(`/api/habits/${habitId}/skip`, {
    method: 'POST',
    body: date ? JSON.stringify({ date }) : undefined,
  })
}

export async function bulkCreateHabits(data: BulkCreateRequest): Promise<BulkCreateResponse> {
  return serverAuthFetch('/api/habits/bulk', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function bulkDeleteHabits(habitIds: string[]): Promise<BulkDeleteResponse> {
  return serverAuthFetch('/api/habits/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ habitIds }),
  })
}

export async function bulkLogHabits(items: BulkLogItemRequest[]): Promise<BulkLogResult> {
  return serverAuthFetch('/api/habits/bulk/log', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export async function bulkSkipHabits(items: BulkSkipItemRequest[]): Promise<BulkSkipResult> {
  return serverAuthFetch('/api/habits/bulk/skip', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export async function reorderHabits(data: ReorderHabitsRequest): Promise<void> {
  await serverAuthFetch('/api/habits/reorder', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function createSubHabit(
  parentId: string,
  data: CreateSubHabitRequest,
): Promise<void> {
  await serverAuthFetch(`/api/habits/${parentId}/sub-habits`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function moveHabitParent(
  habitId: string,
  data: MoveHabitParentRequest,
): Promise<void> {
  await serverAuthFetch(`/api/habits/${habitId}/parent`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function duplicateHabit(habitId: string): Promise<void> {
  await serverAuthFetch(`/api/habits/${habitId}/duplicate`, {
    method: 'POST',
  })
}

export async function updateChecklist(
  habitId: string,
  checklistItems: ChecklistItem[],
): Promise<void> {
  await serverAuthFetch(`/api/habits/${habitId}/checklist`, {
    method: 'PUT',
    body: JSON.stringify({ checklistItems }),
  })
}

export async function linkGoalsToHabit(
  habitId: string,
  goalIds: string[],
): Promise<void> {
  await serverAuthFetch(`/api/habits/${habitId}/goals`, {
    method: 'PUT',
    body: JSON.stringify({ goalIds }),
  })
}
