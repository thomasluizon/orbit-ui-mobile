'use server'

import { getAuthHeaders } from '@/lib/auth-api'
import type {
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared'
import { createApiClientError } from '@orbit/shared'

const API_BASE = process.env.API_BASE ?? 'http://localhost:5000'

async function authFetch(path: string, init: RequestInit) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => null)
    throw createApiClientError(res.status, error, `Failed with status ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export async function createGoal(data: CreateGoalRequest): Promise<{ id: string }> {
  return authFetch('/api/goals', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateGoal(goalId: string, data: UpdateGoalRequest): Promise<void> {
  await authFetch(`/api/goals/${goalId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteGoal(goalId: string): Promise<void> {
  await authFetch(`/api/goals/${goalId}`, {
    method: 'DELETE',
  })
}

export async function updateGoalProgress(
  goalId: string,
  data: UpdateGoalProgressRequest,
): Promise<void> {
  await authFetch(`/api/goals/${goalId}/progress`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function updateGoalStatus(
  goalId: string,
  data: UpdateGoalStatusRequest,
): Promise<void> {
  await authFetch(`/api/goals/${goalId}/status`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function reorderGoals(positions: GoalPositionItem[]): Promise<void> {
  await authFetch('/api/goals/reorder', {
    method: 'PUT',
    body: JSON.stringify({ positions }),
  })
}

export async function linkHabitsToGoal(
  goalId: string,
  habitIds: string[],
): Promise<void> {
  await authFetch(`/api/goals/${goalId}/habits`, {
    method: 'PUT',
    body: JSON.stringify({ habitIds }),
  })
}
